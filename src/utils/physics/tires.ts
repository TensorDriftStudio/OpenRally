import type { VehicleConfig, IRapierVehicleController, SurfaceType, TireType } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';
import { BRAKE_SPEED_THRESHOLD, SAND_ELEVATION_THRESHOLD } from '@/config/vehicle';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';
import { getTireDefinition, DEFAULT_TIRE_TYPE } from '@/config/tireRegistry';
import { DRIVING_MODEL_BALANCE, type DrivingModelBalance } from '@/config/physicsBalance';

export type { SurfaceType, TireType };

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
  const driftExpansion = Math.min(1.0, Math.max(0, (Math.abs(slipAngle) - 0.05) / 0.35));
  const effectiveSteerLimit = isCountersteer
    ? baseSteerLimit + (DRIFT_MAX_STEER_LOCK - baseSteerLimit) * driftExpansion
    : baseSteerLimit;
  const steerAngle = input.steering * effectiveSteerLimit;

  const hbBalance = balance.handbrake;
  const tireBalance = balance.tires;

  const isBraking = input.brake > 0.05 && forwardSpeed > BRAKE_SPEED_THRESHOLD;
  const isHeavyBrake = input.brake > 0.45;
  const isWheelLockup = isBraking && isHeavyBrake && !absEnabled;

  if (isBraking && isHeavyBrake && absEnabled) {
    absActive = true;
  }

  for (let i = 0; i < config.wheels.length; i++) {
    const wheel = config.wheels[i];

    // Braking
    let brakeForce = 0;
    if (isBraking) {
      // Brake Bias
      const frontBias = config.brakes.frontBias;
      const rearBias = 1.0 - frontBias;
      // Multiplier ensures the total braking power remains consistent
      const brakeMultiplier = wheel.steerable ? (frontBias * 2) : (rearBias * 2);
      const rawForce = config.brakes.maxForce * input.brake * brakeMultiplier;
      // When ABS is active, modulate brake force right at threshold to prevent full wheel lock
      brakeForce = absActive ? rawForce * 0.88 : rawForce;
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
      const continuousShear = effectiveLooseLoss * 0.35 * speedRamp;
      const throttleChurn = (throttle > 0.10 && wheel.powered)
        ? effectiveLooseLoss * 0.65 * throttle
        : 0;
      const totalLooseLoss = continuousShear + throttleChurn;
      const axleTractionLoss = wheel.steerable
        ? (totalLooseLoss * tireBalance.looseSurfaceFrontWeight)
        : (totalLooseLoss * tireBalance.looseSurfaceRearWeight);
      currentFriction *= Math.max(0.40, 1.0 - axleTractionLoss);
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

    // Dynamic power-slide wheelspin friction relaxation:
    // When wheels are spinning under throttle during a slide, dynamic kinetic friction drops,
    // allowing smooth, sustained, controllable drifts rather than violently bogging down.
    if (throttle > 0.15 && Math.abs(slipAngle) > tireBalance.minPowerSlideSlipAngle && wheel.powered) {
      const slideIntensity = Math.min(1.0, (Math.abs(slipAngle) - tireBalance.minPowerSlideSlipAngle) / 0.35);
      const throttleSpin = throttle * slideIntensity;
      // Front wheels retain directional bite, while rear wheels break away
      const wheelspinFrictionDrop = wheel.steerable
        ? (throttleSpin * tireBalance.wheelspinFrictionDropFront)
        : (throttleSpin * tireBalance.wheelspinFrictionDropRear);
      currentFriction *= Math.max(0.60, 1.0 - wheelspinFrictionDrop);
    }

    // TCS OFF Wheelspin: When Traction Control is disabled, flooring throttle at low-to-mid speeds
    // causes driven wheels to spin aggressively (burnout / wheelspin slip), reducing tractive grip
    // and letting the car fish-tail and power-slide freely.
    if (!tcsEnabled && throttle > 0.45 && wheel.powered && speedKmh < 65) {
      currentFriction *= 0.65;
    }

    // ESP OFF Breakaway: When Stability Control is disabled, un-countersteered slides allow
    // the rear tires to break away freely, enabling authentic oversteer spinouts (loops).
    if (!espEnabled && !wheel.steerable && Math.abs(slipAngle) > 0.18 && !isCountersteer) {
      currentFriction *= 0.70;
    }

    // Wheel lockup without ABS:
    // When ABS is disabled and brakes are slammed, wheels lock up completely into a flat skid.
    // Tractive friction drops down to kinetic rubber skid level, and steerable front wheels
    // lose almost all lateral grip (severe understeer plow straight ahead).
    if (isWheelLockup) {
      currentFriction = Math.min(currentFriction, effectiveSlideGrip * 0.50);
      if (wheel.steerable) {
        currentFriction *= 0.30;
      }
    }

    const appliedSteerAngle = isWheelLockup ? steerAngle * 0.08 : steerAngle;
    const safeFriction = Number.isFinite(currentFriction) ? Math.max(0, currentFriction) : 1.0;
    const safeBrake = Number.isFinite(brakeForce) ? Math.max(0, brakeForce) : 0;
    const safeSteer = Number.isFinite(appliedSteerAngle) ? appliedSteerAngle : 0;

    controller.setWheelFrictionSlip(i, safeFriction);
    controller.setWheelBrake(i, safeBrake);
    _gripsBuffer[i] = safeFriction;

    // Steering
    if (wheel.steerable) {
      controller.setWheelSteering(i, safeSteer);
    }
  }
  
  const finalSteerAngle = isWheelLockup ? steerAngle * 0.08 : steerAngle;
  return {
    grips: _gripsBuffer,
    surface,
    steerAngle: Number.isFinite(finalSteerAngle) ? finalSteerAngle : 0,
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

