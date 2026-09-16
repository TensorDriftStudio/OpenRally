import type { RapierRigidBody } from '@react-three/rapier';
import type { VehicleConfig, IRapierVehicleController } from '@/types/vehicle';
import { Vector3, Quaternion } from 'three';
import { clamp } from '@/utils/math';
import { DRIVING_MODEL_BALANCE, type SuspensionBalanceConfig } from '@/config/physicsBalance';

const _localPoint = new Vector3();
const _worldPoint = new Vector3();
const _impulse = new Vector3();
const _bodyPos = new Vector3();
const _bodyQuat = new Quaternion();

const _angvel = new Vector3();
const _localAngvel = new Vector3();
const _pitchTorque = new Vector3();
const _invQuat = new Quaternion();

export function applyAntiRollBars(
  body: RapierRigidBody,
  controller: IRapierVehicleController,
  config: VehicleConfig,
  dt: number,
  balance: SuspensionBalanceConfig = DRIVING_MODEL_BALANCE.suspension,
): void {
  if (!config.suspension) return;

  const pos = body.translation();
  const quat = body.rotation();
  _bodyPos.set(pos.x, pos.y, pos.z);
  _bodyQuat.set(quat.x, quat.y, quat.z, quat.w);

  // Compute local angular velocity for roll and pitch damping
  const angvel = typeof body.angvel === 'function' ? body.angvel() : { x: 0, y: 0, z: 0 };
  _angvel.set(angvel.x, angvel.y, angvel.z);
  _invQuat.copy(_bodyQuat).invert();
  _localAngvel.copy(_angvel).applyQuaternion(_invQuat);

  // Front Axle (Wheels 0 and 1 are FL and FR)
  if (config.suspension.frontAntiRollBarStiffness > 0) {
    applyAxleARB(body, controller, config, 0, 1, config.suspension.frontAntiRollBarStiffness, dt, balance);
  }
  
  // Rear Axle (Wheels 2 and 3 are RL and RR)
  if (config.suspension.rearAntiRollBarStiffness > 0) {
    applyAxleARB(body, controller, config, 2, 3, config.suspension.rearAntiRollBarStiffness, dt, balance);
  }

  // Active longitudinal pitch stabilization (Anti-Squat & Anti-Dive)
  applyPitchStabilization(body, controller, config, dt, balance);
}

/**
 * Applies longitudinal pitch stabilization:
 * - Anti-Squat under acceleration (prevents tail dragging / front lifting)
 * - Anti-Dive under hard braking (prevents front flipping / rear lifting)
 * - Pitch oscillation damping
 */
export function applyPitchStabilization(
  body: RapierRigidBody,
  controller: IRapierVehicleController,
  config: VehicleConfig,
  dt: number,
  balance: SuspensionBalanceConfig = DRIVING_MODEL_BALANCE.suspension,
): void {
  if (config.wheels.length < 4) return;

  const pos = body.translation();
  const quat = body.rotation();
  _bodyPos.set(pos.x, pos.y, pos.z);
  _bodyQuat.set(quat.x, quat.y, quat.z, quat.w);

  // Front vs rear average suspension compression
  const flLength = controller.wheelSuspensionLength(0) ?? config.wheels[0].suspensionRestLength;
  const frLength = controller.wheelSuspensionLength(1) ?? config.wheels[1].suspensionRestLength;
  const rlLength = controller.wheelSuspensionLength(2) ?? config.wheels[2].suspensionRestLength;
  const rrLength = controller.wheelSuspensionLength(3) ?? config.wheels[3].suspensionRestLength;

  const frontAvgRest = (config.wheels[0].suspensionRestLength + config.wheels[1].suspensionRestLength) * 0.5;
  const rearAvgRest = (config.wheels[2].suspensionRestLength + config.wheels[3].suspensionRestLength) * 0.5;

  const frontAvgLen = (flLength + frLength) * 0.5;
  const rearAvgLen = (rlLength + rrLength) * 0.5;

  const frontCompression = frontAvgRest - frontAvgLen;
  const rearCompression = rearAvgRest - rearAvgLen;

  // Compression delta: > 0 means nose is dipping (dive), < 0 means tail is squatting (squat)
  const pitchCompressionDelta = frontCompression - rearCompression;
  
  const mass = typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 150);
  const baseAntiSquatStiffness = config.suspension?.antiSquatStiffness ?? 24.0;

  const suspBalance = balance;

  // In Three.js / Rapier right-handed system (+X Right, +Y Up, +Z Forward):
  // Positive torque around X tilts nose DOWN towards the road.
  // Negative torque around X tilts nose UP towards the sky.
  // When tail squats (pitchCompressionDelta < 0), we need POSITIVE torque to push nose DOWN.
  // When nose dives (pitchCompressionDelta > 0), we need NEGATIVE torque to push nose UP.
  const squatMultiplier = pitchCompressionDelta < 0 ? 2.0 : 1.0;
  // Scaled progressive pitch stiffness with soft saturation:
  // Prevents road bumps, ruts, and berms from jerking the chassis with thousands of N*m torque.
  const pitchStiffness = baseAntiSquatStiffness * mass * suspBalance.antiSquatMassScale * squatMultiplier;
  let pitchRestoringTorque = -pitchCompressionDelta * pitchStiffness;

  // Saturated clamp: limit static anti-dive/anti-squat spring torque to prevent harsh bump kick
  const maxRestoringTorque = mass * suspBalance.maxRestoringPitchTorqueG;
  pitchRestoringTorque = clamp(pitchRestoringTorque, -maxRestoringTorque, maxRestoringTorque);

  // Progressive anti-wheelie clamping:
  // If front suspension has unweighted towards full extension while rear is compressed,
  // apply progressive restoring torque to firmly plant the front wheels down.
  if (frontCompression < 0.05 && rearCompression > 0.02) {
    const unweightedSeverity = Math.min(1.0, Math.max(0, (0.05 - frontCompression) / 0.05));
    pitchRestoringTorque += unweightedSeverity * mass * suspBalance.antiWheeliePitchMultiplier; // Positive torque pushes nose down
  }

  // Angular pitch rate damping (around chassis local X axis)
  // When nose pitches UP, localAngvel.x is negative.
  // -localAngvel.x is positive, applying positive torque to push nose down and oppose pitch-up.
  // Robust pitch velocity damping smoothly absorbs bumps, crests, and landings.
  const angvel = typeof body.angvel === 'function' ? body.angvel() : { x: 0, y: 0, z: 0 };
  _angvel.set(angvel.x, angvel.y, angvel.z);
  _invQuat.copy(_bodyQuat).invert();
  _localAngvel.copy(_angvel).applyQuaternion(_invQuat);
  const pitchDamping = -_localAngvel.x * mass * suspBalance.pitchDampingMassScale;

  // Momentum-bound safety guard: ensure pitch damping impulse never reverses localAngvel.x
  const sizeY = config.chassisSize[1];
  const sizeZ = config.chassisSize[2];
  const iXx = (1 / 12) * mass * (sizeY * sizeY + sizeZ * sizeZ);
  const maxPitchDampImpulse = 0.85 * iXx * Math.abs(_localAngvel.x);
  const clampedPitchDampImpulse = clamp(pitchDamping * dt, -maxPitchDampImpulse, maxPitchDampImpulse);

  // Apply restoring pitch torque in world space
  const totalPitchTorque = pitchRestoringTorque * dt + clampedPitchDampImpulse;
  if (Number.isFinite(totalPitchTorque)) {
    _pitchTorque.set(totalPitchTorque, 0, 0).applyQuaternion(_bodyQuat);
    if (
      Number.isFinite(_pitchTorque.x) &&
      Number.isFinite(_pitchTorque.y) &&
      Number.isFinite(_pitchTorque.z)
    ) {
      body.applyTorqueImpulse(_pitchTorque, true);
    }
  }
}

function applyAxleARB(
  body: RapierRigidBody,
  controller: IRapierVehicleController,
  config: VehicleConfig,
  leftIndex: number,
  rightIndex: number,
  stiffness: number,
  dt: number,
  balance: SuspensionBalanceConfig = DRIVING_MODEL_BALANCE.suspension,
) {
  // Ground contact verification: skip ARB if both wheels on this axle are airborne
  const leftGrounded = typeof controller.wheelIsInContact === 'function' ? controller.wheelIsInContact(leftIndex) : true;
  const rightGrounded = typeof controller.wheelIsInContact === 'function' ? controller.wheelIsInContact(rightIndex) : true;
  if (!leftGrounded && !rightGrounded) return;

  const leftLength = controller.wheelSuspensionLength(leftIndex);
  const rightLength = controller.wheelSuspensionLength(rightIndex);
  
  if (leftLength == null || rightLength == null) return;

  const leftWheel = config.wheels[leftIndex];
  const rightWheel = config.wheels[rightIndex];
  
  const leftCompression = leftWheel.suspensionRestLength - leftLength;
  const rightCompression = rightWheel.suspensionRestLength - rightLength;
  const compressionDelta = leftCompression - rightCompression;

  // If compression difference is negligible, avoid injecting micro-impulses
  if (Math.abs(compressionDelta) < 1e-4) return;
  
  // Force proportional to difference in compression scaled by vehicle mass
  // If left is more compressed than right, antiRollForce > 0
  const mass = typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 150);
  const springAntiRollForce =
    compressionDelta * stiffness * mass * balance.antiRollBarMassScale;

  // Active roll velocity damping: damps roll oscillation rate around local Z axis
  // Prevents explicit Euler harmonic resonance ("side-to-side bouncing/trampoline effect")
  const rollDampingForce = -_localAngvel.z * mass * (stiffness * 0.10);

  let antiRollForce = springAntiRollForce + rollDampingForce;

  // Saturated clamp: limit peak ARB force to 1.5G equivalent wheel normal force
  const maxArbForce = mass * 9.81 * 1.5;
  antiRollForce = clamp(antiRollForce, -maxArbForce, maxArbForce);
  
  if (Number.isFinite(antiRollForce)) {
    // We want to push the left side UP (positive local Y impulse)
    // and the right side DOWN (negative local Y impulse) to resist the roll.
    applyWheelForce(body, controller, leftIndex, antiRollForce * dt);
    applyWheelForce(body, controller, rightIndex, -antiRollForce * dt);
  }
}

function applyWheelForce(body: RapierRigidBody, controller: IRapierVehicleController, wheelIndex: number, forceY: number) {
  if (!Number.isFinite(forceY) || Math.abs(forceY) < 1e-5) return;
  const conn = controller.wheelChassisConnectionPointCs(wheelIndex);
  if (!conn) return;
  
  _localPoint.set(conn.x, conn.y, conn.z);
  _worldPoint.copy(_localPoint).applyQuaternion(_bodyQuat).add(_bodyPos);
  
  // Apply force along the local Y axis
  _impulse.set(0, forceY, 0).applyQuaternion(_bodyQuat);
  
  if (
    Number.isFinite(_impulse.x) &&
    Number.isFinite(_impulse.y) &&
    Number.isFinite(_impulse.z) &&
    Number.isFinite(_worldPoint.x) &&
    Number.isFinite(_worldPoint.y) &&
    Number.isFinite(_worldPoint.z)
  ) {
    body.applyImpulseAtPoint(_impulse, _worldPoint, true);
  }
}

