import type { VehicleConfig, IRapierVehicleController, SurfaceType } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import {
  GEAR_RATIOS,
  GEAR_MAX_SPEEDS,
  REVERSE_MAX_SPEED,
  BRAKE_SPEED_THRESHOLD,
  REVERSE_FORCE_MULTIPLIER,
} from '@/config/vehicle';
import { DRIVING_MODEL_BALANCE, type DrivetrainBalanceConfig, type DrivingModelBalance } from '@/config/physicsBalance';

const _thrustImpulse = new Vector3();

/**
 * Calculates and applies engine forces, AWD torque distribution, launch ramping,
 * and per-gear mechanical rev limiter governors across all driven wheels.
 */
export function applyDrivetrain(
  controller: IRapierVehicleController,
  config: VehicleConfig,
  input: Pick<InputState, 'throttle' | 'brake'> & { steering?: number; handbrake?: boolean },
  forwardSpeed: number,
  currentGear: number,
  slipAngle?: number,
  speedKmh?: number,
  powerMultiplier: number = 1.0,
  balance: DrivetrainBalanceConfig = DRIVING_MODEL_BALANCE.drivetrain,
  assists?: { tcsEnabled?: boolean },
  surface?: SurfaceType,
  filteredDriftIntensity?: number,
  dt: number = 1 / 60,
): { tcsActive: boolean; nextDriftIntensity: number } {
  const dtBalance = balance;
  const gearRatio = currentGear > 0 && currentGear < GEAR_RATIOS.length ? GEAR_RATIOS[currentGear] : 1;
  const steerAmount = input.steering ? Math.abs(input.steering) : 0;
  const absSlip = slipAngle !== undefined ? Math.abs(slipAngle) : 0;
  const slipAmount = Math.min(1.0, absSlip / (Math.PI / 4));
  const effectiveSpeedKmh = speedKmh !== undefined ? speedKmh : Math.abs(forwardSpeed) * 3.6;
  const isDriftingOrSpinning = absSlip > 0.10;
  const tcsEnabled = assists?.tcsEnabled ?? false;
  let tcsActive = false;

  // DCCD Chassis Drift Intensity with Smooth Hold Buffer:
  // Evaluates smoothstep drift engagement and decays smoothly between transitions
  const rawDriftIntensity = absSlip > 0.15
    ? Math.min(1.0, Math.max(0, (absSlip - 0.15) / 0.30))
    : 0;
  const smoothedDriftIntensity = rawDriftIntensity * rawDriftIntensity * (3.0 - 2.0 * rawDriftIntensity);
  const decayRate = dtBalance.dccdIntensityDecayRate ?? 4.0;
  const currentIntensity = filteredDriftIntensity ?? 0;
  const nextDriftIntensity = Math.max(smoothedDriftIntensity, currentIntensity - decayRate * dt);

  // Mechanical Rev Limiter & Speed Governor per gear:
  // In straight-line driving without slip (e.g. manual mode redline or top speed test),
  // revLimiterGovernor cuts power to 0 to prevent exceeding gear limits.
  // During active power slides and drifts (absSlip > 0.10), preserve an 85% power floor
  // so the engine maintains continuous high-torque wheelspin when flooring the throttle.
  let revLimiterGovernor = 1.0;
  const minGovernorFloor = isDriftingOrSpinning ? 0.85 : 0.0;

  if (currentGear > 0 && currentGear < GEAR_MAX_SPEEDS.length) {
    const maxSpeedForGear = GEAR_MAX_SPEEDS[currentGear];
    if (effectiveSpeedKmh >= maxSpeedForGear) {
      // Hard rev limiter cut when reaching gear top speed (with power floor during drift)
      revLimiterGovernor = minGovernorFloor;
    } else if (effectiveSpeedKmh > maxSpeedForGear * 0.90) {
      // Progressive power reduction in the last 10% before redline
      const progressiveCut = (maxSpeedForGear - effectiveSpeedKmh) / (maxSpeedForGear * 0.10);
      revLimiterGovernor = Math.max(minGovernorFloor, progressiveCut);
    }
  } else if (currentGear === -1) {
    if (effectiveSpeedKmh >= REVERSE_MAX_SPEED) {
      revLimiterGovernor = 0.0;
    } else if (effectiveSpeedKmh > REVERSE_MAX_SPEED * 0.88) {
      revLimiterGovernor = Math.max(0, (REVERSE_MAX_SPEED - effectiveSpeedKmh) / (REVERSE_MAX_SPEED * 0.12));
    }
  }

  const isHandbrakeActive = Boolean(input.handbrake);

  // Continuous Symmetrical AWD Differential & Drift Power Compensation:
  // When cornering or sliding under throttle, overcome lateral tire scrub drag
  // and deliver robust continuous 4-wheel pull so the car powers dynamically through slides.
  // When handbrake is active, disable extra drift power boost so front axle doesn't over-torque and flip
  const driftPowerBoost = isHandbrakeActive
    ? 1.0
    : (1.0 + steerAmount * dtBalance.driftBoostSteerWeight + slipAmount * dtBalance.driftBoostSlipWeight);

  // Progressive launch torque delivery in 1st gear from dead stop:
  // Smoothly ramps torque over 0 -> launchRampEndSpeedMps to prevent violent launch wheelie shock
  const speedAbs = Math.abs(forwardSpeed);
  const launchRamp = currentGear === 1 && speedAbs < dtBalance.launchRampEndSpeedMps
    ? dtBalance.launchRampBaseFraction + (1.0 - dtBalance.launchRampBaseFraction) * (speedAbs / dtBalance.launchRampEndSpeedMps)
    : 1.0;

  // 2nd Gear Rally Attack Torque Punch:
  // In 2nd gear (30–80 km/h), maintain peak rally turbo spool and mid-range torque delivery
  const gearTorquePunch = currentGear === 2 ? dtBalance.gear2TorquePunch : 1.0;

  // Anti-wheelie power transfer:
  // If front wheels start unweighting (suspension expanding towards full rebound),
  // simulate active center differential / traction control by moderating rear wheel torque
  let frontUnweightedRatio = 0;
  if (typeof controller.wheelSuspensionLength === 'function' && config.wheels.length >= 2) {
    const fl = controller.wheelSuspensionLength(0);
    const fr = controller.wheelSuspensionLength(1);
    if (fl !== undefined && fr !== undefined && fl !== null && fr !== null) {
      const flComp = config.wheels[0].suspensionRestLength - fl;
      const frComp = config.wheels[1].suspensionRestLength - fr;
      const avgFrontComp = (flComp + frComp) * 0.5;
      if (avgFrontComp < dtBalance.frontUnweightedDampingThreshold) {
        frontUnweightedRatio = Math.min(1.0, Math.max(0, (dtBalance.frontUnweightedDampingThreshold - avgFrontComp) / 0.05));
      }
    }
  }

  // DCCD Dynamic Torque Split:
  // Baseline front bias in straight line / grip driving (35% front / 65% rear for sharp oversteer initiation),
  // transferring power forward (up to 48% front) during throttle drift to pull the car through the turn.
  const baseFrontBias = dtBalance.dccdMinFrontBias ?? config.drivetrain.frontBias;
  const driftFrontBias = dtBalance.dccdDriftFrontBias ?? 0.48;
  const throttleInput = input.throttle ?? 0;
  const activeFrontBias = baseFrontBias + (driftFrontBias - baseFrontBias) * (nextDriftIntensity * Math.min(1.0, throttleInput * 1.2));
  const activeRearBias = 1.0 - activeFrontBias;

  for (let i = 0; i < config.wheels.length; i++) {
    const wheel = config.wheels[i];
    if (wheel.powered) {
      // Rally Hydraulic Handbrake Center-Differential Disconnect:
      // In rally cars (WRC / Rallycross), pulling the handbrake disengages the rear axle
      // from the center differential and locks the rear calipers.
      // The engine MUST NOT deliver tractive torque to the locked rear wheels.
      if (isHandbrakeActive && !wheel.steerable) {
        controller.setWheelEngineForce(i, 0);
        continue;
      }

      let engineForce = 0;
      
      // Front steerable wheels deliver balanced front-wheel drive traction under handbrake
      const baseTorqueMultiplier = wheel.steerable ? (activeFrontBias * 2) : (activeRearBias * 2);

      // Rear spool lock: equalize rear wheel torque delivery during throttle slides to prevent inside-wheel spin
      const rearSpoolFactor = (!wheel.steerable && nextDriftIntensity > 0.10 && throttleInput > 0.10)
        ? (dtBalance.rearSpoolLockRatio ?? 0.85)
        : 1.0;

      const torqueMultiplier = wheel.steerable
        ? baseTorqueMultiplier
        : (baseTorqueMultiplier * (1.0 - frontUnweightedRatio * 0.70) * rearSpoolFactor);

      let tcsMultiplier = 1.0;
      if (tcsEnabled && !isHandbrakeActive && input.throttle > 0.20) {
        // 1. Low-speed launch wheelspin regulation:
        // Modulates torque so driven wheels do not spin out of control at low speeds
        if (speedAbs < 8.0 && currentGear === 1) {
          tcsMultiplier = 0.72;
          tcsActive = true;
        } else if (absSlip > 0.12) {
          // 2. Cornering / lateral wheelspin regulation:
          // In turns, cuts engine power to stop driven wheels breaking traction.
          // In rally mode on loose surfaces (snow, gravel, sand, mud), continuous wheelspin is essential
          // to maintain tractive momentum, so TCS only moderates power slightly (down to 85%) rather than choking engine to 35%.
          const isLoose = surface === 'snow' || surface === 'gravel' || surface === 'sand' || surface === 'mud';
          const excessSlip = Math.min(1.0, (absSlip - 0.10) / 0.25);
          if (isLoose) {
            tcsMultiplier = Math.max(0.85, 1.0 - excessSlip * 0.15);
          } else {
            tcsMultiplier = Math.max(0.35, 1.0 - excessSlip * 0.65);
          }
          tcsActive = tcsMultiplier < 0.98;
        }
      }

      if (currentGear === 0) {
        // Neutral: zero tractive drive force to wheels (engine revs freely in neutral)
        engineForce = 0;
      } else if (currentGear === -1) {
        // Reverse gear: Throttle powers car backward; in automatic mode, Brake also powers reverse
        const revDrive = input.throttle > 0 ? input.throttle : (input.brake > 0 && forwardSpeed < BRAKE_SPEED_THRESHOLD ? input.brake : 0);
        if (revDrive > 0) {
          engineForce = -config.engine.maxForce * revDrive * REVERSE_FORCE_MULTIPLIER * baseTorqueMultiplier * revLimiterGovernor * powerMultiplier;
        }
      } else if (input.throttle > 0) {
        engineForce = config.engine.maxForce * input.throttle * gearRatio * torqueMultiplier * driftPowerBoost * launchRamp * gearTorquePunch * revLimiterGovernor * powerMultiplier * tcsMultiplier;
      } else if (input.brake > 0 && forwardSpeed > BRAKE_SPEED_THRESHOLD) {
        // Braking when moving forward
        engineForce = 0;
      } else if (input.brake > 0) {
        // Auto reverse trigger when stopped
        engineForce = -config.engine.maxForce * input.brake * REVERSE_FORCE_MULTIPLIER * baseTorqueMultiplier * revLimiterGovernor * powerMultiplier;
      }
      const safeEngineForce = Number.isFinite(engineForce) ? engineForce : 0;
      controller.setWheelEngineForce(i, safeEngineForce);
    } else {
      controller.setWheelEngineForce(i, 0);
    }
  }

  return { tcsActive, nextDriftIntensity };
}

/**
 * Applies active AWD directional tractive propulsion during power slides.
 * Overcomes Rapier's isotropic Coulomb friction circle clamping on sliding wheels,
 * ensuring all 4 driven wheels deliver authentic forward momentum and throttle pull.
 */
export function applyAwdDriftPropulsion(
  body: RapierRigidBody,
  config: VehicleConfig,
  input: Pick<InputState, 'throttle' | 'steering'> & { handbrake?: boolean },
  forwardVector: Vector3,
  speedKmh: number,
  slipAngle: number,
  groundedRatio: number,
  dt: number,
  currentGear: number = 1,
  _rightVector?: Vector3,
  _steerAngle: number = 0,
  balance: DrivingModelBalance = DRIVING_MODEL_BALANCE,
  _assists?: { espEnabled?: boolean },
): void {
  // Do not engage AWD body propulsion while handbrake is actively locked, off throttle, or airborne
  if ((input.handbrake && balance.handbrake.disableAwdPropulsion) || input.throttle <= 0.05 || groundedRatio <= 0.3) return;

  const absSlip = Math.abs(slipAngle);
  // Only engage during an active drift slide (slip angle > 7.5 deg), never in regular clean cornering
  if (absSlip < 0.13) return;

  const dtBalance = balance.drivetrain;
  const targetDriftSpeed = dtBalance.driftTargetSpeedKmh ?? 75;

  // Slip engagement factor: smoothly ramps up as vehicle enters drift
  const slipFactor = Math.min(1.0, (absSlip - 0.10) / 0.20);

  // Speed equilibrium governor:
  // At speeds below targetDriftSpeed (~75 km/h), delivers full tractive support so the car sustains drift speed.
  // At speeds above targetDriftSpeed (75–95 km/h), smoothly fades to 0, allowing natural tire scrub
  // to realistically bleed speed down towards the ~75 km/h equilibrium.
  let speedGovernor = 1.0;
  if (speedKmh > targetDriftSpeed) {
    speedGovernor = Math.max(0, 1.0 - (speedKmh - targetDriftSpeed) / 20.0);
  }

  const gearRatio = currentGear > 0 && currentGear < GEAR_RATIOS.length ? GEAR_RATIOS[currentGear] : 1.0;
  const driftPropulsionMultiplier = dtBalance.driftPropulsionMultiplier ?? 1.15;

  const thrustMagnitude =
    config.engine.maxForce *
    driftPropulsionMultiplier *
    gearRatio *
    input.throttle *
    slipFactor *
    speedGovernor *
    groundedRatio *
    dt;

  if (Number.isFinite(thrustMagnitude) && thrustMagnitude > 0) {
    const steeredRatio = Math.max(0, Math.min(1.0, dtBalance.driftSteeredPullRatio ?? 0));
    if (steeredRatio > 0 && _rightVector) {
      // Steered front axle pull: vectors tractive thrust through steered front wheels towards exit
      const cosS = Math.cos(_steerAngle);
      const sinS = Math.sin(_steerAngle);
      _thrustImpulse.copy(forwardVector).multiplyScalar((1.0 - steeredRatio) * thrustMagnitude);
      _thrustImpulse.addScaledVector(forwardVector, steeredRatio * thrustMagnitude * cosS);
      _thrustImpulse.addScaledVector(_rightVector, steeredRatio * thrustMagnitude * sinS);
    } else {
      _thrustImpulse.copy(forwardVector).multiplyScalar(thrustMagnitude);
    }

    if (
      Number.isFinite(_thrustImpulse.x) &&
      Number.isFinite(_thrustImpulse.y) &&
      Number.isFinite(_thrustImpulse.z)
    ) {
      body.applyImpulse(_thrustImpulse, true);
    }
  }
}
