import type { VehicleConfig, IRapierVehicleController } from '@/types/vehicle';
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
const _steeredThrust = new Vector3();

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
): { tcsActive: boolean } {
  const dtBalance = balance;
  const gearRatio = currentGear > 0 && currentGear < GEAR_RATIOS.length ? GEAR_RATIOS[currentGear] : 1;
  const steerAmount = input.steering ? Math.abs(input.steering) : 0;
  const absSlip = slipAngle !== undefined ? Math.abs(slipAngle) : 0;
  const slipAmount = Math.min(1.0, absSlip / (Math.PI / 4));
  const effectiveSpeedKmh = speedKmh !== undefined ? speedKmh : Math.abs(forwardSpeed) * 3.6;
  const isDriftingOrSpinning = absSlip > 0.10;
  const tcsEnabled = assists?.tcsEnabled ?? false;
  let tcsActive = false;

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
      
      const frontBias = config.drivetrain.frontBias;
      const rearBias = 1.0 - frontBias;
      // Front steerable wheels deliver balanced front-wheel drive traction under handbrake
      const baseTorqueMultiplier = wheel.steerable ? (frontBias * 2) : (rearBias * 2);

      const torqueMultiplier = wheel.steerable
        ? baseTorqueMultiplier
        : (baseTorqueMultiplier * (1.0 - frontUnweightedRatio * 0.70));

      let tcsMultiplier = 1.0;
      if (tcsEnabled && !isHandbrakeActive && input.throttle > 0.20) {
        // 1. Low-speed launch wheelspin regulation:
        // Modulates torque so driven wheels do not spin out of control at low speeds
        if (speedAbs < 8.0 && currentGear === 1) {
          tcsMultiplier = 0.72;
          tcsActive = true;
        } else if (absSlip > 0.12) {
          // 2. Cornering / lateral wheelspin cut:
          // In turns, cuts engine power by up to 65% to stop the driven wheels breaking traction
          const excessSlip = Math.min(1.0, (absSlip - 0.10) / 0.25);
          tcsMultiplier = Math.max(0.35, 1.0 - excessSlip * 0.65);
          tcsActive = true;
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

  return { tcsActive };
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
  rightVector?: Vector3,
  steerAngle: number = 0,
  balance: DrivingModelBalance = DRIVING_MODEL_BALANCE,
  assists?: { espEnabled?: boolean },
): void {
  // Do not engage AWD body propulsion while handbrake is actively locked
  if ((input.handbrake && balance.handbrake.disableAwdPropulsion) || input.throttle <= 0.05 || groundedRatio <= 0) return;

  const espEnabled = assists?.espEnabled ?? true;
  const isCountersteer = input.steering !== undefined && (input.steering * slipAngle < -0.005);

  // When ESP is disabled: only engage forward AWD propulsion if the driver is actively countersteering.
  // If the driver throws the car into a slide without countersteering, do not artificially push the car forward
  // or straighten it out — let physical yaw momentum take over and spin out naturally!
  if (!espEnabled && !isCountersteer) return;

  const absSlip = Math.abs(slipAngle);
  // Only engage during an actual drift (slip angle > 12.6 deg), never in regular clean cornering
  if (absSlip < 0.22) return;

  const gearRatio = currentGear > 0 && currentGear < GEAR_RATIOS.length ? GEAR_RATIOS[currentGear] : 1.0;
  // Speed headroom: scale governor relative to vehicle max speed rather than per-gear ratio limit
  // to ensure continuous AWD tractive pull throughout mid-speed and high-speed drifts
  const maxVehicleSpeed = config.engine.maxSpeed || 240;
  const speedGovernor = Math.max(0, 1.0 - speedKmh / (maxVehicleSpeed * 1.05));

  // Slip engagement factor: ramps up as vehicle enters drift
  const slipFactor = Math.min(1.0, (absSlip - 0.20) / 0.25);
  
  // AWD directional propulsion impulse:
  // Delivers balanced forward throttle thrust to counteract lateral tire scrub friction,
  // sustaining drift momentum so the vehicle maintains speed without sliding uncontrollably.
  const driftPropulsionMultiplier = 0.85;
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
    if (rightVector && Math.abs(steerAngle) > 0.001) {
      // Decompose AWD propulsion:
      // When countersteering to power out of a drift (input.steering opposes slipAngle),
      // allocate 38% of thrust along steered front wheels to pull the vehicle out of the slide.
      // When drifting neutrally or turning into the corner, allocate 18% along steered wheels.
      const isCountersteer = input.steering !== undefined && (input.steering * slipAngle < -0.005);
      const steerThrustRatio = isCountersteer ? 0.38 : 0.18;
      const forwardThrustRatio = 1.0 - steerThrustRatio;

      // In Three.js vehicle coordinates: steerAngle < 0 steers right (+X).
      const cosSteer = Math.cos(steerAngle);
      const sinSteer = Math.sin(steerAngle);
      _steeredThrust
        .copy(forwardVector)
        .multiplyScalar(cosSteer)
        .addScaledVector(rightVector, -sinSteer);

      _thrustImpulse
        .copy(forwardVector)
        .multiplyScalar(thrustMagnitude * forwardThrustRatio)
        .addScaledVector(_steeredThrust, thrustMagnitude * steerThrustRatio);
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
