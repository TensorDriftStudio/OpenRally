import { Vector3, Quaternion, type Object3D } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import type { IRapierVehicleController, VehicleConfig } from '@/types/vehicle';
import { DEFAULT_CHASSIS_DYNAMICS } from '@/config/vehicle';
import { clamp } from '@/utils/math';

// ─── Module-level Scratchpads (Zero-GC execution in hot useFrame loop) ─
const _bodyQuat = new Quaternion();
const _invQuat = new Quaternion();
const _angvel = new Vector3();
const _localAngvel = new Vector3();

/**
 * Mutable state container tracking the sprung mass chassis dynamics.
 * Pre-allocated to avoid any garbage collection in the animation loop.
 */
export interface ChassisDynamicsState {
  roll: number;
  rollVelocity: number;
  pitch: number;
  pitchVelocity: number;
  heave: number;
  heaveVelocity: number;
  prevForwardSpeed: number;
  isInitialized: boolean;
}

/**
 * Creates a fresh, zeroed chassis dynamics state container.
 */
export function createChassisDynamicsState(): ChassisDynamicsState {
  return {
    roll: 0,
    rollVelocity: 0,
    pitch: 0,
    pitchVelocity: 0,
    heave: 0,
    heaveVelocity: 0,
    prevForwardSpeed: 0,
    isInitialized: false,
  };
}

/**
 * Resets the visual chassis transforms and physical sprung mass state cleanly.
 */
export function resetChassisDynamics(
  visualObj: Object3D | null,
  state: ChassisDynamicsState,
): void {
  state.roll = 0;
  state.rollVelocity = 0;
  state.pitch = 0;
  state.pitchVelocity = 0;
  state.heave = 0;
  state.heaveVelocity = 0;
  state.prevForwardSpeed = 0;
  state.isInitialized = false;

  if (visualObj) {
    visualObj.position.y = 0;
    visualObj.rotation.x = 0;
    visualObj.rotation.z = 0;
  }
}

/**
 * Numerically stable 2nd-order damped harmonic oscillator (mass-spring-damper).
 * Uses substep semi-implicit Euler integration for unconditional stability and zero overshoot explosion.
 *
 * Equation of motion: d²x/dt² + 2*zeta*omega*dx/dt + omega²*(x - target) = 0
 *
 * @param current - Current value (angle or displacement)
 * @param velocity - Current rate of change (rad/s or m/s)
 * @param target - Target equilibrium value
 * @param naturalFrequency - Resonant frequency in rad/s (omega_n)
 * @param dampingRatio - Damping ratio zeta (0.7 - 0.9 = realistic automotive suspension)
 * @param dt - Delta time in seconds
 * @param maxVelocity - Safety clamp on velocity
 */
export function updateDampedSpring(
  current: number,
  velocity: number,
  target: number,
  naturalFrequency: number,
  dampingRatio: number,
  dt: number,
  maxVelocity: number = 25.0,
): [number, number] {
  const safeDt = Math.max(0.0001, Math.min(dt, 0.05));
  // 2 substeps provide rock-solid integration even under low framerates
  const subDt = safeDt * 0.5;
  const omegaSq = naturalFrequency * naturalFrequency;
  const twoZetaOmega = 2 * dampingRatio * naturalFrequency;

  let cur = current;
  let vel = velocity;

  for (let i = 0; i < 2; i++) {
    const error = cur - target;
    const accel = -omegaSq * error - twoZetaOmega * vel;
    vel += accel * subDt;
    vel = clamp(vel, -maxVelocity, maxVelocity);
    cur += vel * subDt;
  }

  return [cur, vel];
}

/**
 * Updates the visual chassis transform with physically-plausible sprung mass dynamics:
 * 1. Body Roll: Lateral acceleration (centrifugal G-force in corners) + differential left/right suspension load.
 * 2. Pitch Dive/Squat: Longitudinal acceleration (braking dive and throttle squat) + front/rear suspension load.
 * 3. Heave: Vertical chassis compression over road bumps and jump crests.
 *
 * Directly drives `visualObj.rotation.z` (roll), `visualObj.rotation.x` (pitch), and `visualObj.position.y` (heave).
 */
export function updateChassisDynamics(
  visualObj: Object3D | null,
  controller: IRapierVehicleController,
  body: RapierRigidBody,
  config: VehicleConfig,
  state: ChassisDynamicsState,
  forwardSpeed: number,
  dt: number,
): void {
  if (!visualObj || dt <= 0 || config.wheels.length < 4) return;

  const dynConfig = config.chassisDynamics ?? DEFAULT_CHASSIS_DYNAMICS;
  const maxRoll = dynConfig.maxRollAngle ?? DEFAULT_CHASSIS_DYNAMICS.maxRollAngle;
  const rollStiffness = Math.max(0.2, dynConfig.rollStiffness ?? DEFAULT_CHASSIS_DYNAMICS.rollStiffness);
  const maxPitchDive = dynConfig.maxPitchDive ?? DEFAULT_CHASSIS_DYNAMICS.maxPitchDive;
  const maxPitchSquat = dynConfig.maxPitchSquat ?? DEFAULT_CHASSIS_DYNAMICS.maxPitchSquat;
  const pitchStiffness = Math.max(0.2, dynConfig.pitchStiffness ?? DEFAULT_CHASSIS_DYNAMICS.pitchStiffness);
  const naturalFreq = dynConfig.naturalFrequency ?? DEFAULT_CHASSIS_DYNAMICS.naturalFrequency;
  const dampingRatio = dynConfig.dampingRatio ?? DEFAULT_CHASSIS_DYNAMICS.dampingRatio;
  const heaveMultiplier = dynConfig.heaveMultiplier ?? DEFAULT_CHASSIS_DYNAMICS.heaveMultiplier;

  // ─── 1. SUSPENSION COMPRESSION FROM RAPIER RAYCAST WHEELS ────────────
  // Wheels: 0=FL, 1=FR, 2=RL, 3=RR
  const l0 = controller.wheelSuspensionLength(0) ?? config.wheels[0].suspensionRestLength;
  const l1 = controller.wheelSuspensionLength(1) ?? config.wheels[1].suspensionRestLength;
  const l2 = controller.wheelSuspensionLength(2) ?? config.wheels[2].suspensionRestLength;
  const l3 = controller.wheelSuspensionLength(3) ?? config.wheels[3].suspensionRestLength;

  const c0 = config.wheels[0].suspensionRestLength - l0;
  const c1 = config.wheels[1].suspensionRestLength - l1;
  const c2 = config.wheels[2].suspensionRestLength - l2;
  const c3 = config.wheels[3].suspensionRestLength - l3;

  const safeC0 = Number.isFinite(c0) ? c0 : 0;
  const safeC1 = Number.isFinite(c1) ? c1 : 0;
  const safeC2 = Number.isFinite(c2) ? c2 : 0;
  const safeC3 = Number.isFinite(c3) ? c3 : 0;

  const compLeft = (safeC0 + safeC2) * 0.5;
  const compRight = (safeC1 + safeC3) * 0.5;
  const compFront = (safeC0 + safeC1) * 0.5;
  const compRear = (safeC2 + safeC3) * 0.5;
  const compAvg = (safeC0 + safeC1 + safeC2 + safeC3) * 0.25;

  // Wheelbase & Track Width
  const trackWidth = Math.max(
    1.2,
    (Math.abs(config.wheels[1].position[0] - config.wheels[0].position[0]) +
      Math.abs(config.wheels[3].position[0] - config.wheels[2].position[0])) *
      0.5,
  );
  const wheelbase = Math.max(
    1.5,
    Math.abs(config.wheels[0].position[2] - config.wheels[2].position[2]),
  );

  // Geometric angles from actual wheel suspension displacement
  // When outer suspension compresses (e.g. left side in a right turn), body leans to the outside
  const suspRoll = -(compLeft - compRight) / trackWidth;
  const suspPitch = (compFront - compRear) / wheelbase;

  // ─── 2. LATERAL INERTIA & CENTRIFUGAL BODY ROLL ─────────────────────
  // Transform world angular velocity into chassis-local coordinates
  const angvel = typeof body.angvel === 'function' ? body.angvel() : { x: 0, y: 0, z: 0 };
  const rot = typeof body.rotation === 'function' ? body.rotation() : { x: 0, y: 0, z: 0, w: 1 };

  _bodyQuat.set(rot.x, rot.y, rot.z, rot.w);
  _invQuat.copy(_bodyQuat).invert();
  _angvel.set(angvel.x, angvel.y, angvel.z);
  _localAngvel.copy(_angvel).applyQuaternion(_invQuat);

  // Local yaw rate around chassis +Y axis
  const yawRate = Number.isFinite(_localAngvel.y) ? _localAngvel.y : 0;

  // Lateral centripetal acceleration: a_lat = v_forward * omega_yaw (m/s²)
  const safeForwardSpeed = Number.isFinite(forwardSpeed) ? forwardSpeed : 0;
  const latAccel = safeForwardSpeed * yawRate;
  const latG = latAccel / 9.81;

  // Centrifugal force pushes the sprung mass towards the outside of the turn:
  // - Right turn (yawRate < 0, latG < 0): body rolls to the outside (LEFT).
  // - Left turn (yawRate > 0, latG > 0): body rolls to the outside (RIGHT).
  const rollG = latG * (0.075 / rollStiffness);

  // Combined target roll: blend geometric suspension difference + centrifugal inertia
  const targetRoll = clamp(suspRoll * 0.45 + rollG * 0.55, -maxRoll, maxRoll);

  // ─── 3. LONGITUDINAL INERTIA & PITCH (DIVE & SQUAT) ──────────────────
  const safeDt = Math.max(0.0001, Math.min(dt, 0.05));
  if (!state.isInitialized) {
    state.prevForwardSpeed = safeForwardSpeed;
    state.isInitialized = true;
  }

  const rawLonAccel = (safeForwardSpeed - state.prevForwardSpeed) / safeDt;
  state.prevForwardSpeed = safeForwardSpeed;
  const lonAccel = clamp(rawLonAccel, -16.0, 12.0); // Clamped to realistic automotive limits
  const lonG = lonAccel / 9.81;

  // When braking: lonAccel < 0 -> lonG < 0 -> nose dives down.
  // In Three.js, positive rotation around +X tilts nose (+Z) downwards.
  // Thus pitchG = -lonG * coefficient gives positive pitch (dive) on braking!
  const pitchG = -lonG * (0.048 / pitchStiffness);

  const targetPitch = clamp(
    suspPitch * 0.45 + pitchG * 0.55,
    -maxPitchSquat,
    maxPitchDive,
  );

  // ─── 4. VERTICAL CHASSIS HEAVE (BUMPS & LANDINGS) ───────────────────
  // Heave tracks dynamic compression relative to static curb-weight sag (~28% of rest length).
  // This prevents the visual car body from sinking into the wheels at static resting ride height.
  const avgRestLength =
    (config.wheels[0].suspensionRestLength +
      config.wheels[1].suspensionRestLength +
      config.wheels[2].suspensionRestLength +
      config.wheels[3].suspensionRestLength) *
    0.25;
  const staticSag = avgRestLength * 0.28;
  const dynamicComp = compAvg - staticSag;
  const targetHeave = clamp(-dynamicComp * heaveMultiplier, -0.022, 0.030);

  // ─── 5. INTEGRATE 2ND-ORDER DAMPED SPRINGS ──────────────────────────
  const [newRoll, newRollVel] = updateDampedSpring(
    state.roll,
    state.rollVelocity,
    targetRoll,
    naturalFreq,
    dampingRatio,
    safeDt,
  );

  const [newPitch, newPitchVel] = updateDampedSpring(
    state.pitch,
    state.pitchVelocity,
    targetPitch,
    naturalFreq * 1.15, // Pitch typically has slightly higher resonant frequency
    dampingRatio + 0.05,
    safeDt,
  );

  const [newHeave, newHeaveVel] = updateDampedSpring(
    state.heave,
    state.heaveVelocity,
    targetHeave,
    naturalFreq * 1.30,
    dampingRatio + 0.10,
    safeDt,
  );

  state.roll = Number.isFinite(newRoll) ? newRoll : 0;
  state.rollVelocity = Number.isFinite(newRollVel) ? newRollVel : 0;
  state.pitch = Number.isFinite(newPitch) ? newPitch : 0;
  state.pitchVelocity = Number.isFinite(newPitchVel) ? newPitchVel : 0;
  state.heave = Number.isFinite(newHeave) ? newHeave : 0;
  state.heaveVelocity = Number.isFinite(newHeaveVel) ? newHeaveVel : 0;

  // ─── 6. APPLY TO VISUAL CHASSIS OBJECT ──────────────────────────────
  visualObj.position.y = state.heave;
  visualObj.rotation.x = state.pitch;
  visualObj.rotation.z = state.roll;
}
