import type { VehicleConfig, IRapierVehicleController, SurfaceType, TireType } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';
import { BRAKE_SPEED_THRESHOLD, REVERSE_TRANSITION_SPEED, SAND_ELEVATION_THRESHOLD } from '@/config/vehicle';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';
import { getTireDefinition, DEFAULT_TIRE_TYPE } from '@/config/tireRegistry';
import { DRIVING_MODEL_BALANCE, type DrivingModelBalance } from '@/config/physicsBalance';
import { clamp } from '@/utils/math';

export type { SurfaceType, TireType };

export interface TireFrictionOptions {
  readonly forwardY?: number;
  readonly currentGear?: number;
  readonly isManual?: boolean;
}

/**
 * Determines the surface type under a given world position.
 */
export function getSurfaceAtPosition(
  x: number,
  y: number,
  z: number,
  heightmapData?: HeightmapData,
  levelData?: LevelData,
): SurfaceType {
  const levelId = levelData?.id?.toLowerCase() ?? '';
  const isDesert = levelId.includes('desert');
  const isSnow = levelId.includes('sweden') || levelId.includes('snow') || levelId.includes('winter');
  const isGymkhana = levelId.includes('gymkhana');

  // 1. Prepared track circuit takes precedence over underlying terrain elevation
  if (heightmapData && levelData) {
    const { trackMasks, cols, rows } = heightmapData;
    const mapWidth = levelData.terrainBase.width;
    const mapDepth = levelData.terrainBase.depth;

    const nx = (x + mapWidth / 2) / mapWidth;
    const nz = (z + mapDepth / 2) / mapDepth;
    const col = Math.floor(nx * (cols - 1));
    const row = Math.floor(nz * (rows - 1));

    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      const mask = trackMasks[row * cols + col];
      if (mask > 0.35) {
        if (isSnow) return 'snow';
        if (isGymkhana) return 'tarmac';
        return isDesert ? 'gravel' : 'mud';
      }
    }
  }

  // 2. Off-track terrain handling:
  // Snow maps are snow everywhere
  if (isSnow) {
    return 'snow';
  }

  // Desert maps are sandy dunes everywhere off-track
  if (isDesert) {
    return 'sand';
  }

  // Gymkhana arena plateau is smooth asphalt/tarmac
  if (isGymkhana) {
    if (y >= 6.0) return 'tarmac';
    if (y < SAND_ELEVATION_THRESHOLD) return 'sand';
    return 'tarmac';
  }

  // Low elevation near the water level is coastal sand/beach
  if (y < SAND_ELEVATION_THRESHOLD) {
    return 'sand';
  }

  // Off the muddy track, driving on grass/dirt
  return 'grass';
}

export function getInterpolatedSteeringAngle(speedKmh: number, curve: readonly [number, number][]): number {
  if (!curve || curve.length === 0) return 0;
  if (speedKmh <= curve[0][0]) return curve[0][1];
  if (speedKmh >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];

  for (let i = 0; i < curve.length - 1; i++) {
    if (speedKmh >= curve[i][0] && speedKmh <= curve[i + 1][0]) {
      const t = (speedKmh - curve[i][0]) / (curve[i + 1][0] - curve[i][0]);
      return curve[i][1] + t * (curve[i + 1][1] - curve[i][1]);
    }
  }
  return curve[0][1];
}

/**
 * Maximum physical steering lock available during active countersteer in a drift (~36 degrees).
 * Provides generous countersteer authority while avoiding abrupt tire bite that flips direction.
 */
export const DRIFT_MAX_STEER_LOCK = Math.PI / 5.0;

// Preallocated reusable grips array to avoid per-frame GC pressure
const _gripsBuffer: number[] = [0, 0, 0, 0];

export function applyTireFrictionAndBrakes(
  controller: IRapierVehicleController,
  config: VehicleConfig,
  input: Pick<InputState, 'brake' | 'handbrake' | 'steering'> & { throttle?: number },
  speedKmh: number,
  forwardSpeed: number,
  posX: number,
  posY: number,
  posZ: number,
  slipAngle: number,
  heightmapData?: HeightmapData,
  levelData?: LevelData,
  balance: DrivingModelBalance = DRIVING_MODEL_BALANCE,
  assists?: { absEnabled?: boolean; tcsEnabled?: boolean; espEnabled?: boolean },
  tireType: TireType = DEFAULT_TIRE_TYPE,
  options?: TireFrictionOptions,
): { grips: number[]; surface: SurfaceType; steerAngle: number; absActive: boolean; tireType: TireType } {
  const surface = getSurfaceAtPosition(posX, posY, posZ, heightmapData, levelData);
  const surfaceDef = getSurfaceDefinition(surface);
  const tireModel = surfaceDef.tireModel;
  const tireDef = getTireDefinition(tireType);
  const tireGripMultiplier = tireDef.surfaceGripMultipliers[surface] ?? 1.0;
  const looseTractionMultiplier = tireDef.looseTractionLossMultiplier ?? 1.0;

  // Ensure buffer matches wheel count
  if (_gripsBuffer.length !== config.wheels.length) {
    _gripsBuffer.length = config.wheels.length;
  }

  const throttle = input.throttle ?? 0;
  const absEnabled = assists?.absEnabled ?? true;
  const tcsEnabled = assists?.tcsEnabled ?? true;
  const espEnabled = assists?.espEnabled ?? true;
  let absActive = false;

  const baseSteerLimit = getInterpolatedSteeringAngle(speedKmh, config.handling.steeringCurve);
  const isCountersteer = Math.abs(slipAngle) > 0.05 && (input.steering * slipAngle < -0.005);
  const driftExpansion = Math.min(1.0, Math.max(0, (Math.abs(slipAngle) - 0.05) / 0.28));
  const effectiveSteerLimit = isCountersteer
    ? baseSteerLimit + (DRIFT_MAX_STEER_LOCK - baseSteerLimit) * driftExpansion
    : baseSteerLimit;
  const rawSteerAngle = input.steering * effectiveSteerLimit;

  // Virtual Caster & Dynamic Countersteer Assist:
  // In real vehicles, mechanical caster and pneumatic trail naturally align the front wheels
  // with the velocity vector when sliding. On keyboard and gamepad, the driver lacks physical force-feedback
  // rack alignment. Virtual caster dynamically blends the steered angle toward the ground velocity vector
  // (-slipAngle) during active slides, enabling smooth, intuitive throttle drifting without sudden spinouts.
  const assistsBalance = balance.assists;
  const isEspEnabled = assists?.espEnabled ?? true;
  let steerAngle = rawSteerAngle;
  if (Math.abs(input.steering) < 0.001) {
    steerAngle = 0;
  } else if (
    isEspEnabled &&
    forwardSpeed > 2.0 &&
    isCountersteer &&
    assistsBalance.virtualCasterAuthority > 0
  ) {
    const slideIntensity = Math.min(1.0, (Math.abs(slipAngle) - assistsBalance.virtualCasterMinSlipAngle) / 0.35);
    const selfAlignSteer = Math.max(-DRIFT_MAX_STEER_LOCK, Math.min(DRIFT_MAX_STEER_LOCK, -slipAngle));

    // Assist partial countersteer inputs towards the self-aligning angle;
    // as the driver reaches full lock (|input.steering| -> 1.0), authority yields to full rack lock!
    const partialInputFactor = Math.max(0, 1.0 - Math.abs(input.steering));
    const assistBlend = assistsBalance.virtualCasterAuthority * slideIntensity * partialInputFactor;
    steerAngle = rawSteerAngle * (1.0 - assistBlend) + selfAlignSteer * assistBlend;
  }

  const hbBalance = balance.handbrake;
  const tireBalance = balance.tires;

  // Reverse Throttle vs Mechanical Braking:
  // In Manual Mode: input.brake is strictly mechanical brake, input.throttle is engine drive
  // In Automatic Mode:
  // - When in reverse gear (-1) and stopped or rolling backward, input.brake functions as reverse throttle.
  // - When moving backward in reverse gear, input.throttle serves as the mechanical brake to halt reverse motion.
  // - In forward gears or neutral, input.brake is always a mechanical brake.
  const isManual = options?.isManual ?? false;
  const isStuntIntent = Boolean(input.handbrake) || (Math.abs(input.steering) > 0.65);
  const isUphill = (options?.forwardY ?? 0) > 0.05;

  const isReverseThrottle = !isManual && options?.currentGear === -1 && input.brake > 0.05 && input.brake >= throttle && forwardSpeed <= 0.1;
  const isReverseBrake =
    !isManual &&
    options?.currentGear === -1 &&
    throttle > 0.05 &&
    throttle > input.brake &&
    forwardSpeed < -REVERSE_TRANSITION_SPEED &&
    !isStuntIntent &&
    !isUphill;
  const isForwardBrake = input.brake > 0.05 && !isReverseThrottle && (forwardSpeed > BRAKE_SPEED_THRESHOLD || Math.abs(forwardSpeed) > BRAKE_SPEED_THRESHOLD || options?.currentGear !== -1);
  const isBraking = isForwardBrake || isReverseBrake;
  const effectiveBrakeInput = isReverseBrake ? throttle : input.brake;
  const isHeavyBrake = effectiveBrakeInput > 0.45;
  const isWheelLockup = isBraking && isHeavyBrake && !absEnabled;

  if (isBraking && isHeavyBrake && absEnabled) {
    absActive = true;
  }

  const sideStiffness = surfaceDef.sideFrictionStiffness ?? 1.0;

  for (let i = 0; i < config.wheels.length; i++) {
    const wheel = config.wheels[i];

    // Braking
    let brakeForce = 0;
    if (isBraking) {
      // Dynamic Downhill EBD (Electronic Brakeforce Distribution):
      // On downhills (forwardY < 0), weight shifts forward onto the front axle.
      // Proactively bias braking towards the front wheels (up to 80%) to prevent
      // unweighted rear wheels from locking up and sending the car into an uncontrollable spin.
      const forwardY = options?.forwardY ?? 0;
      const downhillShift = Math.max(0, -forwardY) * 0.28;
      const frontBias = clamp(config.brakes.frontBias + downhillShift, 0.50, 0.80);
      const rearBias = 1.0 - frontBias;
      // Multiplier ensures the total braking power remains consistent
      const brakeMultiplier = wheel.steerable ? (frontBias * 2) : (rearBias * 2);
      const rawForce = config.brakes.maxForce * effectiveBrakeInput * brakeMultiplier;
      // When ABS is active, modulate brake force right at threshold to prevent full wheel lock.
      // Rear wheels are modulated with higher slip tolerance (0.48 vs 0.88) to keep unweighted rear rolling.
      const absModulation = wheel.steerable ? 0.88 : 0.48;
      brakeForce = absActive ? rawForce * absModulation : rawForce;
    }

    // Calculate local slip angle relative to wheel heading:
    // In Three.js right-handed coordinates: +X is right, +Y is up, +Z is forward.
    // When the car slides to the right, slipAngle = atan2(Vx, Vz) > 0.
    // When the driver steers right, input.steering < 0, so steerAngle < 0 (pointing towards +X).
    // The relative slip angle between the wheel heading and the ground velocity vector is (slipAngle + steerAngle).
    // Countersteering thus directly reduces the front wheel slip angle to 0, recovering full steering authority!
    const localSlipAngle = wheel.steerable ? Math.abs(slipAngle + steerAngle) : Math.abs(slipAngle);

    // Base friction with smooth progressive Pacejka-lite slip curve:
    const gripCurve = wheel.steerable ? tireModel.front : tireModel.rear;
    const peakAngle = gripCurve.peakSlipAngle;

    // Apply active tire compound grip multiplier
    const effectiveBaseGrip = gripCurve.baseGrip * tireGripMultiplier;
    const effectiveSlideGrip = gripCurve.slideGrip * tireGripMultiplier;

    // Progressive slip curve (Pacejka-lite):
    // Eliminates binary "glued vs slide" behavior by providing an analog transition.
    // When localSlipAngle exceeds slipBreakThreshold (~12°), grip begins a smooth cubic drop towards slideGrip.
    let currentFriction: number;
    const slipBreakThreshold = peakAngle * 0.45;
    const slipRange = Math.PI / 4.5;

    if (localSlipAngle > slipBreakThreshold) {
      const overSlip = Math.min(1.0, (localSlipAngle - slipBreakThreshold) / slipRange);
      const smoothDrop = overSlip * overSlip * (3.0 - 2.0 * overSlip);
      currentFriction = effectiveBaseGrip - (effectiveBaseGrip - effectiveSlideGrip) * smoothDrop;
    } else {
      currentFriction = effectiveBaseGrip;
    }

    // Continuous loose surface granular shearing and dynamic throttle churn:
    // On loose terrain (sand, gravel, mud, snow), ground particles yield continuously under rolling tires.
    // There is continuous micro-slip while moving (speedKmh > 1.0) so the vehicle never feels unnaturally
    // glued to the ground, and throttle churn adds realistic power-slide wheelspin.
    // Scaled by tire compound looseTractionLossMultiplier (gravel tires reduce slip loss, asphalt slicks suffer).
    if (surfaceDef.looseSurfaceTractionLoss && speedKmh > 1.0) {
      const speedRamp = Math.min(1.0, speedKmh / 20.0);
      const effectiveLooseLoss = surfaceDef.looseSurfaceTractionLoss * looseTractionMultiplier;
      const continuousShear = effectiveLooseLoss * tireBalance.looseSurfaceShearScale * speedRamp;
      const throttleChurn = (throttle > 0.10 && wheel.powered)
        ? effectiveLooseLoss * (1.0 - tireBalance.looseSurfaceShearScale) * throttle
        : 0;
      const totalLooseLoss = continuousShear + throttleChurn;
      const axleTractionLoss = wheel.steerable
        ? (totalLooseLoss * tireBalance.looseSurfaceFrontWeight)
        : (totalLooseLoss * tireBalance.looseSurfaceRearWeight);
      currentFriction *= Math.max(tireBalance.looseSurfaceGripFloor, 1.0 - axleTractionLoss);
    }

    // Handbrake — drift assist grip multiplier and guaranteed rear mechanical lockup
    if (input.handbrake && !wheel.steerable) {
      brakeForce = Math.max(
        config.brakes.handbrakeForce * hbBalance.rearLockupImpulseMultiplier,
        hbBalance.minLockupBrakeForce,
      );
      currentFriction *= config.handling.assists.driftGripMultiplier;
    }

    if (input.handbrake && wheel.steerable) {
      // Front steerable wheels yield slightly during handbrake turns to prevent tripping tipping
      currentFriction *= hbBalance.frontSteerYieldMultiplier;
    }

    // Normal Load Sensitivity (De-gressive Friction with Vertical Load Fz):
    // Heavily loaded outside tires during hard cornering experience a slightly reduced friction coefficient,
    // creating authentic progressive breakaway, while inside unweighted tires gain relative grip.
    if (tireBalance.loadSensitivityFactor > 0 && typeof controller.wheelSuspensionLength === 'function') {
      const restLen = wheel.suspensionRestLength;
      const currentLen = controller.wheelSuspensionLength(i) ?? restLen;
      const compression = Math.max(0, restLen - currentLen);
      const cornerMass = (config.chassisMass || 1250) / Math.max(1, config.wheels.length);
      const nominalFz = cornerMass * 9.81;
      const dynamicFz = nominalFz + compression * wheel.suspensionStiffness;
      const loadDelta = (dynamicFz - nominalFz) / Math.max(1.0, nominalFz);
      const muLoad = 1.0 - tireBalance.loadSensitivityFactor * loadDelta;
      currentFriction *= Math.max(0.75, Math.min(1.25, muLoad));
    }

    // Rear Oversteer Lateral Bias during active throttle slides:
    // Enhances controllable yaw rotation under throttle oversteer
    if (!wheel.steerable && throttle > 0.15 && Math.abs(slipAngle) > 0.10) {
      const rearOversteerBias = tireBalance.rearOversteerLateralBias ?? 0.94;
      currentFriction *= rearOversteerBias;
    }

    let wheelSideStiffness = sideStiffness;

    // Friction Ellipse Coupling:
    // When a wheel delivers heavy braking or high-power wheelspin, its available lateral cornering stiffness
    // reduces following the traction circle envelope.
    if (tireBalance.frictionEllipseCoupling > 0) {
      const maxBrake = config.brakes.maxForce || 1.0;
      const brakeDemand = isBraking ? Math.min(1.0, brakeForce / maxBrake) : 0;
      const throttleDemand = (throttle > 0.35 && wheel.powered && Math.abs(slipAngle) > 0.12)
        ? Math.min(1.0, throttle * 1.1)
        : 0;
      const longDemand = Math.min(1.0, brakeDemand + throttleDemand);
      if (longDemand > 0.10) {
        const couplingFactor = tireBalance.frictionEllipseCoupling * longDemand;
        const ellipseScale = Math.sqrt(Math.max(0.20, 1.0 - couplingFactor * couplingFactor));
        wheelSideStiffness *= ellipseScale;
      }
    }

    // Throttle Wheelspin Burns Away Lateral Resistance (Fy Relaxation / Kinetic Drift Melt):
    // When wheels are burning rubber under throttle in a slide, kinetic friction causes lateral resistance (Fy)
    // to collapse down to 22% - 28%! This eliminates the multi-thousand Newton lateral brake,
    // allowing the vehicle to sustain or accelerate speed through endless powerslides!
    if (throttle > 0.10 && wheel.powered) {
      const slipAmount = Math.min(1.0, Math.abs(slipAngle) / 0.35);
      const throttleSpin = throttle * (0.60 + 0.40 * slipAmount);
      const lateralDecay = wheel.steerable
        ? (1.0 - throttleSpin * 0.50)
        : (1.0 - throttleSpin * 0.78);
      wheelSideStiffness *= Math.max(wheel.steerable ? 0.35 : 0.22, lateralDecay);
    }

    // Low-Speed Standstill Restoring Damping:
    // Below lowSpeedViscousBlend threshold when stationary without inputs,
    // quells solver micro-jitter and prevents downhill creep on terrain slopes.
    const speedAbs = Math.abs(forwardSpeed);
    if (speedAbs < (tireBalance.lowSpeedViscousBlend ?? 1.2) && throttle < 0.05 && !input.handbrake) {
      const stopBlend = 1.0 - (speedAbs / (tireBalance.lowSpeedViscousBlend ?? 1.2));
      currentFriction = currentFriction * (1.0 - stopBlend * 0.30) + (effectiveBaseGrip * 1.20) * (stopBlend * 0.30);
      wheelSideStiffness = Math.max(wheelSideStiffness, 1.0 + stopBlend * 0.35);
    }

    // TCS OFF Wheelspin Lateral Relaxation: When Traction Control is disabled, flooring throttle at low-to-mid speeds
    // allows driven wheels to break away laterally and fish-tail freely, without reducing forward tractive grip (wheelFrictionSlip)
    // so the car maintains driving power at ~75 km/h.
    if (!tcsEnabled && throttle > 0.45 && wheel.powered && speedKmh < 65) {
      wheelSideStiffness *= 0.72;
    }

    // ESP OFF Breakaway: When Stability Control is disabled, un-countersteered slides allow
    // the rear tires to break away laterally, enabling authentic oversteer spinouts (loops).
    if (!espEnabled && !wheel.steerable && Math.abs(slipAngle) > 0.18 && !isCountersteer) {
      wheelSideStiffness *= 0.75;
    }

    // Wheel lockup without ABS:
    // When ABS is disabled and brakes are slammed, wheels lock up completely into a flat skid.
    // Tractive friction drops down to kinetic rubber skid level, and steerable front wheels
    // lose almost all lateral grip (severe understeer plow straight ahead).
    if (isWheelLockup) {
      currentFriction = Math.min(currentFriction, effectiveSlideGrip * 0.50);
      if (wheel.steerable) {
        currentFriction *= 0.30;
        wheelSideStiffness *= 0.25;
      }
    }

    const appliedSteerAngle = steerAngle;
    const safeFriction = Number.isFinite(currentFriction) ? Math.max(0, currentFriction) : 1.0;
    const safeBrake = Number.isFinite(brakeForce) ? Math.max(0, brakeForce) : 0;
    const safeSteer = Number.isFinite(appliedSteerAngle) ? appliedSteerAngle : 0;

    controller.setWheelFrictionSlip(i, safeFriction);
    controller.setWheelBrake(i, safeBrake);
    _gripsBuffer[i] = safeFriction;

    if (typeof controller.setWheelSideFrictionStiffness === 'function') {
      controller.setWheelSideFrictionStiffness(i, wheelSideStiffness);
    }

    // Steering
    if (wheel.steerable) {
      controller.setWheelSteering(i, safeSteer);
    }
  }
  
  return {
    grips: _gripsBuffer,
    surface,
    steerAngle: Number.isFinite(steerAngle) ? steerAngle : 0,
    absActive,
    tireType: tireDef.id,
  };
}

/**
 * Calculates the compound grip multiplier for a specific tire type on a surface.
 */
export function calculateTireSurfaceGripMultiplier(tireType: TireType, surface: SurfaceType): number {
  const tireDef = getTireDefinition(tireType);
  return tireDef.surfaceGripMultipliers[surface] ?? 1.0;
}

