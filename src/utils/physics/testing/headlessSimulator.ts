import { Vector3, Quaternion, Euler } from 'three';
import type { VehicleConfig, IRapierVehicleController } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import { resolveVehicleBalance, type DrivingModelBalance } from '@/config/physicsBalance';
import { updateGearbox } from '../powertrain';
import { applyDrivetrain, applyAwdDriftPropulsion } from '../drivetrain';
import { applyTireFrictionAndBrakes } from '../tires';
import { applyAntiRollBars, applyPitchStabilization } from '../suspension';
import { applyAssists } from '../assists';
import { applyAerodynamics } from '../aerodynamics';
import type { RapierRigidBody } from '@react-three/rapier';

/**
 * Lightweight mock physics body state for headless simulation.
 */
export interface SimulatedBodyState {
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  angularVelocity: Vector3;
  mass: number;
}

/**
 * Creates a mock Rapier controller connected to the simulated body state.
 */
export function createHeadlessVehicleEnvironment(config: VehicleConfig) {
  const position = new Vector3(0, 0.5, 0);
  const velocity = new Vector3(0, 0, 0);
  const rotation = new Quaternion();
  const angularVelocity = new Vector3(0, 0, 0);
  const mass = config.chassisMass;

  const engineForces: number[] = [0, 0, 0, 0];
  const brakeForces: number[] = [0, 0, 0, 0];
  const frictions: number[] = [1, 1, 1, 1];
  const steerings: number[] = [0, 0, 0, 0];
  const suspensionLengths = config.wheels.map((w) => w.suspensionRestLength);
  const wheelContacts = [true, true, true, true];

  const appliedImpulses: { impulse: Vector3; point?: Vector3 }[] = [];
  const appliedTorques: Vector3[] = [];

  const mockController: IRapierVehicleController = {
    setWheelEngineForce: (idx, f) => { engineForces[idx] = f; },
    setWheelBrake: (idx, b) => { brakeForces[idx] = b; },
    setWheelFrictionSlip: (idx, fr) => { frictions[idx] = fr; },
    setWheelSteering: (idx, s) => { steerings[idx] = s; },
    wheelSuspensionLength: (idx) => suspensionLengths[idx],
    wheelChassisConnectionPointCs: (idx) => {
      const w = config.wheels[idx];
      return { x: w.position[0], y: w.position[1], z: w.position[2] };
    },
    wheelSteering: (idx) => steerings[idx],
    wheelIsInContact: (idx) => wheelContacts[idx],
  };

  const mockBody = {
    translation: () => ({ x: position.x, y: position.y, z: position.z }),
    rotation: () => ({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
    linvel: () => ({ x: velocity.x, y: velocity.y, z: velocity.z }),
    angvel: () => ({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z }),
    mass: () => mass,
    setLinvel: (v: { x: number; y: number; z: number }) => { velocity.set(v.x, v.y, v.z); },
    setAngvel: (v: { x: number; y: number; z: number }) => { angularVelocity.set(v.x, v.y, v.z); },
    setTranslation: (p: { x: number; y: number; z: number }) => { position.set(p.x, p.y, p.z); },
    setRotation: (r: { x: number; y: number; z: number; w: number }) => { rotation.set(r.x, r.y, r.z, r.w); },
    applyImpulse: (imp: { x: number; y: number; z: number }) => {
      appliedImpulses.push({ impulse: new Vector3(imp.x, imp.y, imp.z) });
      velocity.x += imp.x / mass;
      velocity.y += imp.y / mass;
      velocity.z += imp.z / mass;
    },
    applyImpulseAtPoint: (imp: { x: number; y: number; z: number }, pt: { x: number; y: number; z: number }) => {
      appliedImpulses.push({
        impulse: new Vector3(imp.x, imp.y, imp.z),
        point: new Vector3(pt.x, pt.y, pt.z),
      });
      velocity.x += imp.x / mass;
      velocity.y += imp.y / mass;
      velocity.z += imp.z / mass;
    },
    applyTorqueImpulse: (t: { x: number; y: number; z: number }) => {
      appliedTorques.push(new Vector3(t.x, t.y, t.z));
      angularVelocity.x += t.x / (mass * 0.5);
      angularVelocity.y += t.y / (mass * 0.5);
      angularVelocity.z += t.z / (mass * 0.5);
    },
  } as unknown as RapierRigidBody;

  return {
    mockBody,
    mockController,
    state: {
      position,
      velocity,
      rotation,
      angularVelocity,
      mass,
      engineForces,
      brakeForces,
      frictions,
      steerings,
      suspensionLengths,
      wheelContacts,
      appliedImpulses,
      appliedTorques,
    },
  };
}

/**
 * Advances the headless simulation by one timestep dt.
 */
export function stepHeadlessSimulation(
  env: ReturnType<typeof createHeadlessVehicleEnvironment>,
  config: VehicleConfig,
  input: InputState,
  dt: number,
  currentGear: number,
  balance?: DrivingModelBalance,
): { currentGear: number; speedKmh: number; forwardSpeed: number; slipAngle: number } {
  const activeBalance = balance ?? resolveVehicleBalance(config);
  const { mockBody, mockController, state } = env;

  const forward = new Vector3(0, 0, 1).applyQuaternion(state.rotation);
  const right = new Vector3(1, 0, 0).applyQuaternion(state.rotation);

  const forwardSpeed = state.velocity.dot(forward);
  const lateralSpeed = state.velocity.dot(right);
  const groundSpeed = Math.hypot(forwardSpeed, lateralSpeed);
  const speedKmh = groundSpeed * 3.6;

  let slipAngle = 0;
  if (Math.abs(forwardSpeed) > 1.0) {
    slipAngle = Math.atan2(lateralSpeed, forwardSpeed);
  }

  // Automatic Gearbox Step
  const newGear = updateGearbox(speedKmh, forwardSpeed, input, currentGear, false, { slipAngle });

  // 1. Drivetrain
  applyDrivetrain(mockController, config, input, forwardSpeed, newGear, slipAngle, speedKmh, 1.0, activeBalance.drivetrain);

  // 2. Tires and Brakes
  const { steerAngle } = applyTireFrictionAndBrakes(
    mockController,
    config,
    input,
    speedKmh,
    forwardSpeed,
    state.position.x,
    state.position.y,
    state.position.z,
    slipAngle,
    undefined,
    undefined,
    activeBalance,
  );

  // 3. Assists & Suspension ARB
  applyAssists(mockBody, config, input, forwardSpeed, dt, activeBalance);
  applyAntiRollBars(mockBody, mockController, config, dt, activeBalance.suspension);
  applyPitchStabilization(mockBody, mockController, config, dt, activeBalance.suspension);

  // 4. Aerodynamics
  applyAerodynamics(mockBody, config, forwardSpeed, state.velocity, state.position.y, dt);

  // 5. AWD Drift Propulsion
  applyAwdDriftPropulsion(mockBody, config, input, forward, speedKmh, slipAngle, 1.0, dt, newGear, right, steerAngle, activeBalance);

  // Integrate forward acceleration onto velocity (simulated Rapier ground traction & tire braking)
  const totalDriveForce = state.engineForces.reduce((a, b) => a + b, 0);
  const totalBrakeForce = state.brakeForces.reduce((a, b) => a + b, 0);

  const avgGrip = state.frictions.reduce((a, b) => a + b, 0) / Math.max(1, state.frictions.length);
  const maxBrakeDecel = Math.max(8.0, avgGrip * 9.81 * 0.85);
  const requestedBrakeDecel = (totalBrakeForce * 22) / state.mass;
  const effectiveBrakeDecel = Math.min(requestedBrakeDecel, maxBrakeDecel);

  const driveAccel = totalDriveForce / state.mass;
  const netAccel = driveAccel - (Math.abs(forwardSpeed) > 0.05 ? Math.sign(forwardSpeed) * effectiveBrakeDecel : 0);

  if (Math.abs(forwardSpeed) > 0.05 || input.throttle > 0) {
    state.velocity.addScaledVector(forward, netAccel * dt);
  }

  // Steered lateral force creates vehicle yaw torque
  if (Math.abs(forwardSpeed) > 1.0 && Math.abs(steerAngle) > 0.01) {
    const frontGrip = (state.frictions[0] + state.frictions[1]) * 0.5;
    const latForce = Math.sin(steerAngle) * frontGrip * state.mass * 9.81 * 0.35;
    state.angularVelocity.y += (latForce * 1.3 / (state.mass * 0.5)) * dt;
  }

  // Handbrake slide pivot: locked rear tires allow front steering to rapidly whip vehicle heading
  if (input.handbrake && Math.abs(input.steering) > 0.1 && Math.abs(forwardSpeed) > 3.0) {
    const pivotKick = Math.sign(steerAngle) * (Math.abs(forwardSpeed) / 10.0) * 4.0;
    state.angularVelocity.y += pivotKick * dt;
  }

  // Integrate positions & rotations
  state.position.addScaledVector(state.velocity, dt);

  const euler = new Euler().setFromQuaternion(state.rotation, 'YXZ');
  euler.x += state.angularVelocity.x * dt;
  euler.y += state.angularVelocity.y * dt;
  euler.z += state.angularVelocity.z * dt;
  state.rotation.setFromEuler(euler);

  // Decay angular velocity (friction/air resistance)
  state.angularVelocity.multiplyScalar(Math.max(0, 1 - 2.5 * dt));

  return { currentGear: newGear, speedKmh, forwardSpeed, slipAngle };
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDARDIZED BENCHMARK MANEUVERS FOR AI
// ─────────────────────────────────────────────────────────────────────────────

export interface AccelerationBenchmarkResult {
  readonly timeTo100Kmh: number;
  readonly distanceM: number;
  readonly maxWheeliePitchDeg: number;
  readonly finalGear: number;
  readonly completed: boolean;
}

/**
 * Benchmarks 0-100 km/h standing start launch performance and front axle stability.
 */
export function runAccelerationBenchmark(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
  maxTimeSec = 8.0,
): AccelerationBenchmarkResult {
  const env = createHeadlessVehicleEnvironment(config);
  const balance = customBalance ?? resolveVehicleBalance(config);
  const dt = 1 / 60;
  let time = 0;
  let gear = 1;
  let maxPitchDeg = 0;
  let timeTo100 = 0;
  let completed = false;

  const throttleInput: InputState = {
    throttle: 1.0,
    brake: 0,
    steering: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  };

  const euler = new Euler();

  while (time < maxTimeSec) {
    const res = stepHeadlessSimulation(env, config, throttleInput, dt, gear, balance);
    gear = res.currentGear;
    time += dt;

    euler.setFromQuaternion(env.state.rotation, 'YXZ');
    const pitchDeg = Math.abs((euler.x * 180) / Math.PI);
    if (pitchDeg > maxPitchDeg) maxPitchDeg = pitchDeg;

    if (res.speedKmh >= 100 && !completed) {
      timeTo100 = Number(time.toFixed(2));
      completed = true;
      break;
    }
  }

  return {
    timeTo100Kmh: completed ? timeTo100 : Number(time.toFixed(2)),
    distanceM: Number(env.state.position.length().toFixed(1)),
    maxWheeliePitchDeg: Number(maxPitchDeg.toFixed(1)),
    finalGear: gear,
    completed,
  };
}

export interface BrakingBenchmarkResult {
  readonly brakingDistanceM: number;
  readonly timeToStopSec: number;
  readonly maxDivePitchDeg: number;
  readonly initialSpeedKmh: number;
}

/**
 * Benchmarks 100-0 km/h emergency straight-line braking distance and anti-dive stability.
 */
export function runBrakingBenchmark(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
): BrakingBenchmarkResult {
  const env = createHeadlessVehicleEnvironment(config);
  const balance = customBalance ?? resolveVehicleBalance(config);
  const dt = 1 / 60;
  const initialSpeedMps = 100 / 3.6; // 27.78 m/s
  env.state.velocity.set(0, 0, initialSpeedMps);

  const brakeInput: InputState = {
    throttle: 0,
    brake: 1.0,
    steering: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  };

  let time = 0;
  let maxDiveDeg = 0;
  const startPos = env.state.position.z;
  const euler = new Euler();

  while (time < 6.0) {
    const res = stepHeadlessSimulation(env, config, brakeInput, dt, 3, balance);
    time += dt;

    euler.setFromQuaternion(env.state.rotation, 'YXZ');
    const pitchDeg = Math.abs((euler.x * 180) / Math.PI);
    if (pitchDeg > maxDiveDeg) maxDiveDeg = pitchDeg;

    if (res.speedKmh <= 1.0) {
      break;
    }
  }

  const distance = Math.abs(env.state.position.z - startPos);

  return {
    brakingDistanceM: Number(distance.toFixed(1)),
    timeToStopSec: Number(time.toFixed(2)),
    maxDivePitchDeg: Number(maxDiveDeg.toFixed(1)),
    initialSpeedKmh: 100,
  };
}

export interface SlalomBenchmarkResult {
  readonly maxRollAngleDeg: number;
  readonly didRollOver: boolean;
  readonly lateralSpeedMax: number;
  readonly completed: boolean;
}

/**
 * Benchmarks high-speed (75 km/h) alternating slalom cornering for body roll and rollover stability.
 */
export function runSlalomBenchmark(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
): SlalomBenchmarkResult {
  const env = createHeadlessVehicleEnvironment(config);
  const balance = customBalance ?? resolveVehicleBalance(config);
  const dt = 1 / 60;
  env.state.velocity.set(0, 0, 75 / 3.6);

  let time = 0;
  let maxRollDeg = 0;
  let maxLatSpeed = 0;
  let didRollOver = false;
  const euler = new Euler();

  while (time < 3.0) {
    // 1.5 Hz alternating steering input
    const steer = Math.sin(time * Math.PI * 3.0);
    const slalomInput: InputState = {
      throttle: 0.6,
      brake: 0,
      steering: steer,
      handbrake: false,
      cameraToggle: false,
      reset: false,
    };

    const res = stepHeadlessSimulation(env, config, slalomInput, dt, 3, balance);
    time += dt;

    euler.setFromQuaternion(env.state.rotation, 'YXZ');
    const rollDeg = Math.abs((euler.z * 180) / Math.PI);
    if (rollDeg > maxRollDeg) maxRollDeg = rollDeg;
    if (rollDeg > 45.0) didRollOver = true;

    const latSpeed = Math.abs(res.forwardSpeed);
    if (latSpeed > maxLatSpeed) maxLatSpeed = latSpeed;
  }

  return {
    maxRollAngleDeg: Number(maxRollDeg.toFixed(1)),
    didRollOver,
    lateralSpeedMax: Number(maxLatSpeed.toFixed(1)),
    completed: true,
  };
}

export interface HandbrakeFlickBenchmarkResult {
  readonly didLockRearCalipers: boolean;
  readonly rearBrakeForce: number;
  readonly maxRollAngleDeg: number;
  readonly didRollOver: boolean;
  readonly peakYawRateRadSec: number;
}

/**
 * Benchmarks aggressive 65 km/h handbrake initiation (flick turn) for rear lockup & anti-tipping.
 */
export function runHandbrakeFlickBenchmark(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
): HandbrakeFlickBenchmarkResult {
  const env = createHeadlessVehicleEnvironment(config);
  const balance = customBalance ?? resolveVehicleBalance(config);
  const dt = 1 / 60;
  env.state.velocity.set(0, 0, 65 / 3.6);

  const hbInput: InputState = {
    throttle: 1.0, // Full throttle during handbrake to test anti-fight logic
    brake: 0,
    steering: 0.85,
    handbrake: true,
    cameraToggle: false,
    reset: false,
  };

  let time = 0;
  let maxRollDeg = 0;
  let peakYaw = 0;
  let didRollOver = false;
  const euler = new Euler();

  while (time < 1.5) {
    stepHeadlessSimulation(env, config, hbInput, dt, 2, balance);
    time += dt;

    euler.setFromQuaternion(env.state.rotation, 'YXZ');
    const rollDeg = Math.abs((euler.z * 180) / Math.PI);
    if (rollDeg > maxRollDeg) maxRollDeg = rollDeg;
    if (rollDeg > 40.0) didRollOver = true;

    const yawRate = Math.abs(env.state.angularVelocity.y);
    if (yawRate > peakYaw) peakYaw = yawRate;
  }

  const rearBrake = env.state.brakeForces[2];
  const didLockRearCalipers = rearBrake >= balance.handbrake.minLockupBrakeForce;

  return {
    didLockRearCalipers,
    rearBrakeForce: Math.round(rearBrake),
    maxRollAngleDeg: Number(maxRollDeg.toFixed(1)),
    didRollOver,
    peakYawRateRadSec: Number(peakYaw.toFixed(2)),
  };
}

export interface VehicleHandlingScorecard {
  readonly vehicleMass: number;
  readonly acceleration: AccelerationBenchmarkResult;
  readonly braking: BrakingBenchmarkResult;
  readonly slalom: SlalomBenchmarkResult;
  readonly handbrakeFlick: HandbrakeFlickBenchmarkResult;
  readonly passedAllSafetyGates: boolean;
}

/**
 * Runs the complete standard AI Maneuver Benchmark Suite on any vehicle configuration.
 * Gives instant quantitative pass/fail feedback on vehicle handling stability.
 */
export function runFullVehicleBenchmark(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
): VehicleHandlingScorecard {
  const balance = customBalance ?? resolveVehicleBalance(config);
  const accel = runAccelerationBenchmark(config, balance);
  const braking = runBrakingBenchmark(config, balance);
  const slalom = runSlalomBenchmark(config, balance);
  const handbrake = runHandbrakeFlickBenchmark(config, balance);

  const passedAllSafetyGates =
    !slalom.didRollOver &&
    !handbrake.didRollOver &&
    handbrake.didLockRearCalipers &&
    accel.maxWheeliePitchDeg < 25.0 &&
    braking.maxDivePitchDeg < 20.0;

  return {
    vehicleMass: config.chassisMass,
    acceleration: accel,
    braking,
    slalom,
    handbrakeFlick: handbrake,
    passedAllSafetyGates,
  };
}
