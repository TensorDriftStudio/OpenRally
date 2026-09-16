import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion } from 'three';
import type { VehicleConfig } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import { clamp } from '@/utils/math';
import { DRIVING_MODEL_BALANCE, type DrivingModelBalance } from '@/config/physicsBalance';

const _bodyQuat = new Quaternion();
const _invBodyQuat = new Quaternion();
const _worldAngVel = new Vector3();
const _localAngVel = new Vector3();
const _localTorque = new Vector3();
const _worldTorque = new Vector3();

export function applyAssists(
  body: RapierRigidBody, 
  config: VehicleConfig, 
  input: InputState,
  forwardSpeed: number,
  dt: number,
  balance: DrivingModelBalance = DRIVING_MODEL_BALANCE,
  assists?: { espEnabled?: boolean },
): { espActive: boolean } {
  const angvel = body.angvel();
  const rot = body.rotation();

  _bodyQuat.set(rot.x, rot.y, rot.z, rot.w);
  _invBodyQuat.copy(_bodyQuat).invert();

  // Local angular velocity
  _worldAngVel.set(angvel.x, angvel.y, angvel.z);
  _localAngVel.copy(_worldAngVel).applyQuaternion(_invBodyQuat);

  let localTorqueX = 0;
  let localTorqueY = 0;
  let localTorqueZ = 0;

  const mass = typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 150);
  const assistsBalance = balance.assists;
  const hbBalance = balance.handbrake;
  const espEnabled = assists?.espEnabled ?? true;

  // 1. Agile Turn-In & Yaw Stability Assist (around local Y axis)
  // When handbrake is pressed, allow completely free rotation for handbrake slides.
  // When ESP is disabled, zero artificial yaw torques are applied, giving raw physics yaw control.
  if (espEnabled && !input.handbrake) {
    const absSpeed = Math.abs(forwardSpeed);

    if (Math.abs(input.steering) > assistsBalance.steerAssistDeadzone && absSpeed > 1.5) {
      const isCounterSteering =
        Math.sign(input.steering) !== Math.sign(_localAngVel.y) && Math.abs(_localAngVel.y) > 0.25;

      if (isCounterSteering) {
        // Countersteer Yaw Damping (Anti-Bounce / Anti-Rebound):
        // Damps the active slide yaw rotation proportionally to the driver's countersteer input.
        // Because this is purely a damping force (-_localAngVel.y), it decays smoothly to ZERO
        // as the car straightens out. It never applies artificial additive torque that overshoots
        // and violently bounces the car in the opposite direction ("opposite snap rebound").
        const counterDamping = assistsBalance.countersteerDampingBase + Math.abs(input.steering) * 0.50;
        localTorqueY -= _localAngVel.y * counterDamping * config.handling.assists.yawDamping * mass * dt * 4.2;
      } else {
        // Progressive Turn-In Assistance (sharp corner entry from straight line)
        // Active at initial turn-in when yaw velocity is below 0.65 rad/s (~37 deg/s)
        if (Math.abs(_localAngVel.y) < 0.65) {
          const speedRamp = Math.min(1.0, absSpeed / 8.0);
          const entryRamp = 1.0 - Math.abs(_localAngVel.y) / 0.65;
          const turnInTorque = input.steering * speedRamp * entryRamp * assistsBalance.turnInTorqueGain * mass * dt;
          localTorqueY += turnInTorque;
        }

        // Dynamic yaw rate ceiling based on steering & speed
        // Moderate maximum yaw rate ceiling to 2.2 rad/s (~126 deg/s) to catch snap oversteer early
        const targetYawRate = input.steering * Math.min(2.2, (absSpeed / 12.0) + 1.2);
        const excessYaw = _localAngVel.y - targetYawRate;

        // Authoritative ESP yaw stabilization: damp over-rotation beyond target yaw rate to prevent spins
        if (Math.sign(_localAngVel.y) === Math.sign(input.steering) && Math.abs(_localAngVel.y) > Math.abs(targetYawRate) + 0.15) {
          localTorqueY -= excessYaw * Math.max(0.24, config.handling.assists.yawDamping * 2.2) * mass * dt * 2.5;
        }

        // Anti-snap yaw damping when rotating in the direction of steering at high yaw velocity (>= 0.65 rad/s)
        if (Math.abs(_localAngVel.y) >= 0.65 && Math.sign(_localAngVel.y) === Math.sign(input.steering)) {
          const excessAng = _localAngVel.y - Math.sign(_localAngVel.y) * 0.65;
          localTorqueY -= excessAng * config.handling.assists.yawDamping * mass * dt * 1.2;
        }
      }
    } else {
      // Centered / neutral steering — active ESP straight-line stabilization
      const isPowerSliding = input.throttle > 0.15 && Math.abs(_localAngVel.y) < 1.8;
      if (!isPowerSliding && Math.abs(_localAngVel.y) > 0.2) {
        localTorqueY -= _localAngVel.y * Math.max(0.18, config.handling.assists.yawDamping * 2.0) * mass * dt * 1.5;
      }
    }
  } else {
    // Handbrake Active: allow responsive handbrake flick rotation and deliberate slides,
    // while softly damping excessive violent snap-spins (|yaw| > maxYawRateCeiling)
    // so pulling the handbrake does not cause the vehicle to violently whip into an uncontrollable spin.
    if (Math.abs(_localAngVel.y) > hbBalance.maxYawRateCeiling) {
      const excessSpin = Math.sign(_localAngVel.y) * (Math.abs(_localAngVel.y) - hbBalance.maxYawRateCeiling);
      localTorqueY -= excessSpin * mass * dt * hbBalance.yawExcessDampingGain;
    }
  }

  // 2. Pitch Stabilization (damps nose-dive & suppresses dynamic wheelie oscillations)
  // Operates on pitch angular velocity around chassis local X axis.
  // Slope-invariant: zero false torque when resting or climbing steep dunes and hills.
  if (Math.abs(_localAngVel.x) > 0.04) {
    const isUnderThrottle = input.throttle > 0.1;
    const isPitchingUp = _localAngVel.x < -0.04;
    const dampMultiplier = isUnderThrottle && isPitchingUp 
      ? assistsBalance.pitchDampingThrottleUp 
      : assistsBalance.pitchDampingNormal;
    localTorqueX = -_localAngVel.x * dampMultiplier * mass * dt;
  }

  // 3. Dynamic Roll Damping
  // Damps rapid roll tipping and prevents two-wheel rollovers during aggressive cornering & handbrake turns,
  // while preserving zero artificial torque on static hill/dune slopes and allowing physical aerial stunts
  if (Math.abs(_localAngVel.z) > 0.08) {
    const rollDampingMultiplier = input.handbrake 
      ? hbBalance.rollDampingBoost 
      : assistsBalance.rollDampingNormal;
    localTorqueZ = -_localAngVel.z * rollDampingMultiplier * mass * dt;
  }

  // Momentum-bound safety guards: ensure damping impulses never exceed 85% of current
  // angular momentum to unconditionally prevent sign reversals and side-to-side wobble
  const sizeX = config.chassisSize[0];
  const sizeY = config.chassisSize[1];
  const sizeZ = config.chassisSize[2];
  const iXx = (1 / 12) * mass * (sizeY * sizeY + sizeZ * sizeZ);
  const iYy = (1 / 12) * mass * (sizeX * sizeX + sizeZ * sizeZ);
  const iZz = (1 / 12) * mass * (sizeX * sizeX + sizeY * sizeY);

  if (localTorqueX !== 0 && Math.abs(_localAngVel.x) > 0.01) {
    if (Math.sign(localTorqueX) !== Math.sign(_localAngVel.x)) {
      const maxImpulseX = 0.85 * iXx * Math.abs(_localAngVel.x);
      localTorqueX = clamp(localTorqueX, -maxImpulseX, maxImpulseX);
    }
  }

  if (localTorqueZ !== 0 && Math.abs(_localAngVel.z) > 0.01) {
    if (Math.sign(localTorqueZ) !== Math.sign(_localAngVel.z)) {
      const maxImpulseZ = 0.85 * iZz * Math.abs(_localAngVel.z);
      localTorqueZ = clamp(localTorqueZ, -maxImpulseZ, maxImpulseZ);
    }
  }

  if (localTorqueY !== 0 && Math.abs(_localAngVel.y) > 0.01) {
    if (Math.sign(localTorqueY) !== Math.sign(_localAngVel.y)) {
      const maxImpulseY = 0.90 * iYy * Math.abs(_localAngVel.y);
      localTorqueY = clamp(localTorqueY, -maxImpulseY, maxImpulseY);
    }
  }

  if (localTorqueX !== 0 || localTorqueY !== 0 || localTorqueZ !== 0) {
    _localTorque.set(localTorqueX, localTorqueY, localTorqueZ);
    _worldTorque.copy(_localTorque).applyQuaternion(_bodyQuat);
    if (
      Number.isFinite(_worldTorque.x) &&
      Number.isFinite(_worldTorque.y) &&
      Number.isFinite(_worldTorque.z)
    ) {
      body.applyTorqueImpulse(_worldTorque, true);
    }
  }

  const espActive = espEnabled && Math.abs(localTorqueY) > 0.001;
  return { espActive };
}

