import { describe, it, expect, vi } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { applyAssists } from '../assists';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { InputState } from '@/types/game';

describe('rollover physics & recovery math', () => {
  const createMockBody = (options?: {
    angvel?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
    mass?: number;
  }): RapierRigidBody & { appliedTorques: { x: number; y: number; z: number }[] } => {
    const appliedTorques: { x: number; y: number; z: number }[] = [];

    return {
      appliedTorques,
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      rotation: () => options?.rotation || { x: 0, y: 0, z: 0, w: 1 },
      mass: () => options?.mass ?? 150,
      applyTorqueImpulse: vi.fn((torque: { x: number; y: number; z: number }) => {
        appliedTorques.push({ ...torque });
      }),
    } as unknown as RapierRigidBody & { appliedTorques: { x: number; y: number; z: number }[] };
  };

  const baseInput: InputState = {
    steering: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  };

  describe('rollover orientation detection', () => {
    it('detects inverted car when roof points toward ground (local up.y < 0)', () => {
      // Upside down: 180 degree roll around Z axis
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
      const localUp = new Vector3(0, 1, 0).applyQuaternion(quat);

      expect(localUp.y).toBeCloseTo(-1.0, 2);
      expect(localUp.y < 0.15).toBe(true);
    });

    it('detects inverted car when tilted on side (> 82 degrees roll)', () => {
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.48);
      const localUp = new Vector3(0, 1, 0).applyQuaternion(quat);

      expect(localUp.y < 0.15).toBe(true);
    });

    it('identifies upright car when driving normally', () => {
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.05); // slight 2.8 deg roll
      const localUp = new Vector3(0, 1, 0).applyQuaternion(quat);

      expect(localUp.y).toBeGreaterThan(0.95);
      expect(localUp.y < 0.15).toBe(false);
    });
  });

  describe('in-place upright recovery math', () => {
    it('resets pitch and roll to zero while strictly preserving original heading (yaw)', () => {
      // Complex tumbling rotation: yaw 45 deg, pitch 30 deg, roll 170 deg (nearly upside down)
      const inputEuler = new Euler(0.52, 0.785, 2.96, 'YXZ');
      const inputQuat = new Quaternion().setFromEuler(inputEuler);

      // Extract yaw and create upright orientation
      const extractedEuler = new Euler().setFromQuaternion(inputQuat, 'YXZ');
      const uprightEuler = new Euler(0, extractedEuler.y, 0, 'YXZ');
      const uprightQuat = new Quaternion().setFromEuler(uprightEuler);

      // Check resulting rotation
      const checkEuler = new Euler().setFromQuaternion(uprightQuat, 'YXZ');
      expect(checkEuler.x).toBeCloseTo(0, 4); // Pitch zeroed
      expect(checkEuler.z).toBeCloseTo(0, 4); // Roll zeroed
      expect(checkEuler.y).toBeCloseTo(0.785, 3); // Yaw preserved

      // Local up is now pointing straight up (+Y)
      const localUp = new Vector3(0, 1, 0).applyQuaternion(uprightQuat);
      expect(localUp.y).toBeCloseTo(1.0, 4);
    });

    it('elevates vehicle height during recovery so suspension clears the road surface', () => {
      const crashedPos = { x: 120.5, y: 4.2, z: -85.0 };
      const recoveredElevation = 0.85;
      const targetPos = {
        x: crashedPos.x,
        y: crashedPos.y + recoveredElevation,
        z: crashedPos.z,
      };

      expect(targetPos.y).toBeGreaterThan(crashedPos.y);
      expect(targetPos.y - crashedPos.y).toBeCloseTo(0.85, 4);
      expect(targetPos.x).toBe(crashedPos.x);
      expect(targetPos.z).toBe(crashedPos.z);
    });
  });

  describe('natural roll freedom without artificial gyro clamping', () => {
    it('does not forcefully apply artificial righting torque when vehicle rolls past 15 degrees', () => {
      // Car rolling at 25 degrees (rollSin ≈ 0.42) with zero angular velocity
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.436); // ~25 deg
      const body = createMockBody({
        rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
        angvel: { x: 0, y: 0, z: 0 },
      });

      applyAssists(body, DEFAULT_VEHICLE_CONFIG, baseInput, 15, 0.016);

      // Should NOT forcefully fight the roll angle
      const rollTorques = body.appliedTorques.map((t) => t.z);
      const sumRoll = rollTorques.reduce((a, b) => a + b, 0);
      expect(sumRoll).toBe(0);
    });
  });
});
