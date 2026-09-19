import type { RapierRigidBody } from '@react-three/rapier';
import type { VehicleConfig } from '@/types/vehicle';
import { Vector3, Quaternion } from 'three';
import { clamp } from '@/utils/math';

/**
 * Natural physiological threshold ceilings for realistic rally car angular velocities.
 * Beyond these limits, angular velocity spikes are caused by rigid-body collision impulses
 * (e.g. hitting trees, rock walls, or barriers) that otherwise lead to unnatural pinwheel spinning,
 * backflips, or roof-bounce tumbling.
 */
export const MAX_NATURAL_YAW_RATE = 2.8;   // rad/s (~160 deg/s) - maximum aggressive Scandinavian flick / hairpin spin
export const MAX_NATURAL_PITCH_RATE = 2.0; // rad/s (~115 deg/s) - maximum crest leap / landing pitch rate
export const MAX_GROUNDED_LOOP_PITCH_RATE = 6.5; // rad/s (~372 deg/s) - maximum kinematic curvature pitch rate on loops and compression dips
export const MAX_NATURAL_ROLL_RATE = 2.2;  // rad/s (~126 deg/s) - maximum curb strike / weight-transfer roll rate

/**
 * Exponential relaxation rate (s^-1) for dissipating collision-induced rotational spikes.
 * Dissipates ~75% of violent collision spin within 80ms while preserving physical momentum continuity.
 */
export const COLLISION_DISSIPATION_DECAY_RATE = 18.0;

// Reusable Three.js scratch instances at module scope — strictly zero GC allocations in hot simulation steps
const _angvel = new Vector3();
const _localAngvel = new Vector3();
const _bodyQuat = new Quaternion();
const _invQuat = new Quaternion();
const _localImpulse = new Vector3();
const _worldImpulse = new Vector3();

export interface CollisionGovernorOptions {
  readonly isGrounded?: boolean;
  readonly forwardSpeed?: number;
}

export interface CollisionGovernorResult {
  readonly active: boolean;
  readonly excessYaw: number;
  readonly excessPitch: number;
  readonly excessRoll: number;
  readonly impulse: { readonly x: number; readonly y: number; readonly z: number };
}

const _inactiveResult: CollisionGovernorResult = {
  active: false,
  excessYaw: 0,
  excessPitch: 0,
  excessRoll: 0,
  impulse: { x: 0, y: 0, z: 0 },
};

/**
 * 3-Axis Collision Angular Governor.
 *
 * Catches and rapidly dissipates unnatural rotational kinetic energy spikes injected by
 * rigid-body collisions with obstacles (trees, rocks, barriers).
 *
 * Operates in local chassis coordinates to independently govern pitch, yaw, and roll:
 * - Pitch spikes (nose catapult / backflip)
 * - Yaw spikes (spinning like a top / pinwheel)
 * - Roll spikes (barrel rolls)
 *
 * Uses exponential momentum relaxation:
 *   ΔL_axis = -excess_axis * I_axis * (1 - e^(-18 * dt))
 * Guaranteed to never reverse angular velocity sign, strictly eliminating rebound oscillations.
 */
export function applyCollisionAngularGovernor(
  body: RapierRigidBody,
  config: VehicleConfig,
  dt: number,
  options?: CollisionGovernorOptions,
): CollisionGovernorResult {
  if (dt <= 0 || !body) return _inactiveResult;

  const angvel = typeof body.angvel === 'function' ? body.angvel() : null;
  if (!angvel || !Number.isFinite(angvel.x) || !Number.isFinite(angvel.y) || !Number.isFinite(angvel.z)) {
    return _inactiveResult;
  }

  const rot = typeof body.rotation === 'function' ? body.rotation() : null;
  if (!rot || !Number.isFinite(rot.x) || !Number.isFinite(rot.y) || !Number.isFinite(rot.z) || !Number.isFinite(rot.w)) {
    return _inactiveResult;
  }

  _angvel.set(angvel.x, angvel.y, angvel.z);
  _bodyQuat.set(rot.x, rot.y, rot.z, rot.w);

  // Transform world angular velocity to chassis local coordinate frame
  _invQuat.copy(_bodyQuat).invert();
  _localAngvel.copy(_angvel).applyQuaternion(_invQuat);

  const localX = _localAngvel.x;
  const localY = _localAngvel.y;
  const localZ = _localAngvel.z;

  const absPitch = Math.abs(localX);
  const absYaw = Math.abs(localY);
  const absRoll = Math.abs(localZ);

  const isHighSpeed = options?.forwardSpeed != null && Math.abs(options.forwardSpeed) > 10.0;
  const maxPitchRate = options?.isGrounded || isHighSpeed ? MAX_GROUNDED_LOOP_PITCH_RATE : MAX_NATURAL_PITCH_RATE;

  // Fast path: normal driving within natural rally dynamics envelope
  if (absPitch <= maxPitchRate && absYaw <= MAX_NATURAL_YAW_RATE && absRoll <= MAX_NATURAL_ROLL_RATE) {
    return _inactiveResult;
  }

  // Moments of inertia approximation for cuboid chassis (I = 1/12 * m * (dim1^2 + dim2^2))
  const mass = typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 1350);
  const sizeX = config.chassisSize[0];
  const sizeY = config.chassisSize[1];
  const sizeZ = config.chassisSize[2];

  const iXx = (1 / 12) * mass * (sizeY * sizeY + sizeZ * sizeZ);
  const iYy = (1 / 12) * mass * (sizeX * sizeX + sizeZ * sizeZ);
  const iZz = (1 / 12) * mass * (sizeX * sizeX + sizeY * sizeY);

  // Stable exponential relaxation factor bounded in [0, 0.85] to guarantee zero sign reversal
  const decayFactor = 1 - Math.exp(-COLLISION_DISSIPATION_DECAY_RATE * dt);
  const safeFactor = clamp(decayFactor, 0, 0.85);

  let impulseX = 0;
  let impulseY = 0;
  let impulseZ = 0;

  let excessPitch = 0;
  if (absPitch > maxPitchRate) {
    excessPitch = localX > 0 ? localX - maxPitchRate : localX + maxPitchRate;
    impulseX = -excessPitch * iXx * safeFactor;
  }

  let excessYaw = 0;
  if (absYaw > MAX_NATURAL_YAW_RATE) {
    excessYaw = localY > 0 ? localY - MAX_NATURAL_YAW_RATE : localY + MAX_NATURAL_YAW_RATE;
    impulseY = -excessYaw * iYy * safeFactor;
  }

  let excessRoll = 0;
  if (absRoll > MAX_NATURAL_ROLL_RATE) {
    excessRoll = localZ > 0 ? localZ - MAX_NATURAL_ROLL_RATE : localZ + MAX_NATURAL_ROLL_RATE;
    impulseZ = -excessRoll * iZz * safeFactor;
  }

  _localImpulse.set(impulseX, impulseY, impulseZ);
  _worldImpulse.copy(_localImpulse).applyQuaternion(_bodyQuat);

  if (
    Number.isFinite(_worldImpulse.x) &&
    Number.isFinite(_worldImpulse.y) &&
    Number.isFinite(_worldImpulse.z)
  ) {
    body.applyTorqueImpulse(_worldImpulse, true);
  }

  return {
    active: true,
    excessYaw,
    excessPitch,
    excessRoll,
    impulse: { x: impulseX, y: impulseY, z: impulseZ },
  };
}
