import { describe, it, expect, vi } from 'vitest';
import {
  applyCollisionAngularGovernor,
  MAX_NATURAL_YAW_RATE,
  MAX_NATURAL_PITCH_RATE,
  MAX_GROUNDED_LOOP_PITCH_RATE,
  MAX_NATURAL_ROLL_RATE,
} from '../collisionGovernor';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';

describe('Collision Angular Governor', () => {
  const createMockBody = (options?: {
    rotation?: { x: number; y: number; z: number; w: number };
    angvel?: { x: number; y: number; z: number };
    mass?: number;
  }) => {
    const appliedTorques: { x: number; y: number; z: number }[] = [];

    const body = {
      translation: () => ({ x: 0, y: 1, z: 0 }),
      rotation: () => options?.rotation || { x: 0, y: 0, z: 0, w: 1 },
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      mass: () => options?.mass || 1350,
      applyTorqueImpulse: vi.fn((torque: { x: number; y: number; z: number }) => {
        appliedTorques.push({ ...torque });
      }),
      appliedTorques,
    } as unknown as RapierRigidBody & { appliedTorques: { x: number; y: number; z: number }[] };

    return body;
  };

  it('remains inactive during normal rally driving within natural angular velocity limits', () => {
    // Aggressive drift: 2.2 rad/s yaw, 1.2 rad/s pitch, 1.5 rad/s roll
    const body = createMockBody({
      angvel: { x: 1.2, y: 2.2, z: 1.5 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(false);
    expect(body.applyTorqueImpulse).not.toHaveBeenCalled();
  });

  it('catches and dissipates violent yaw spin spikes after obstacle collisions', () => {
    // Vehicle strikes obstacle corner and spins at 12.0 rad/s (~687 deg/s)
    const body = createMockBody({
      angvel: { x: 0, y: 12.0, z: 0 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(true);
    expect(result.excessYaw).toBeCloseTo(12.0 - MAX_NATURAL_YAW_RATE, 2);
    expect(body.applyTorqueImpulse).toHaveBeenCalledTimes(1);
    // Applied torque impulse on Y must oppose positive spin (negative Y)
    expect(body.appliedTorques[0].y).toBeLessThan(0);
    expect(body.appliedTorques[0].x).toBe(0);
    expect(body.appliedTorques[0].z).toBe(0);
  });

  it('catches negative yaw spin spikes and applies counteracting positive torque', () => {
    const body = createMockBody({
      angvel: { x: 0, y: -10.0, z: 0 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(true);
    expect(result.excessYaw).toBeCloseTo(-10.0 + MAX_NATURAL_YAW_RATE, 2);
    expect(body.appliedTorques[0].y).toBeGreaterThan(0);
  });

  it('damps violent pitch spikes (nose catapult) to prevent backflips', () => {
    // 8.0 rad/s pitch spike around X
    const body = createMockBody({
      angvel: { x: 8.0, y: 0, z: 0 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(true);
    expect(result.excessPitch).toBeCloseTo(8.0 - MAX_NATURAL_PITCH_RATE, 2);
    expect(body.appliedTorques[0].x).toBeLessThan(0);
  });

  it('damps violent roll spikes to prevent multi-barrel-roll tumbling', () => {
    // -9.0 rad/s roll spike around Z
    const body = createMockBody({
      angvel: { x: 0, y: 0, z: -9.0 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(true);
    expect(result.excessRoll).toBeCloseTo(-9.0 + MAX_NATURAL_ROLL_RATE, 2);
    expect(body.appliedTorques[0].z).toBeGreaterThan(0);
  });

  it('transforms local torque impulses correctly when vehicle is rotated in world space', () => {
    // Vehicle rotated 90 degrees around Y (yaw = Math.PI / 2)
    // Local forward (+Z) is now facing world (+X)
    // Local pitch (+X) is now facing world (-Z)
    const sinHalf = Math.sin(Math.PI / 4);
    const cosHalf = Math.cos(Math.PI / 4);
    const body = createMockBody({
      rotation: { x: 0, y: sinHalf, z: 0, w: cosHalf },
      // Spin around world Y at 10.0 rad/s
      angvel: { x: 0, y: 10.0, z: 0 },
    });

    const result = applyCollisionAngularGovernor(body, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(result.active).toBe(true);
    expect(body.applyTorqueImpulse).toHaveBeenCalledTimes(1);
    expect(body.appliedTorques[0].y).toBeLessThan(0);
  });

  it('permits higher natural pitch rates up to 6.5 rad/s when vehicle is grounded on curved surfaces/loops', () => {
    // 3.8 rad/s natural pitch rate while traversing a 9.5m loop at 130 km/h
    const bodyGrounded = createMockBody({
      angvel: { x: 3.8, y: 0, z: 0 },
    });

    const resultGrounded = applyCollisionAngularGovernor(bodyGrounded, DEFAULT_VEHICLE_CONFIG, 0.016, {
      isGrounded: true,
    });
    expect(resultGrounded.active).toBe(false);
    expect(bodyGrounded.applyTorqueImpulse).not.toHaveBeenCalled();

    // The same 3.8 rad/s pitch rate when airborne triggers the governor to prevent airborne backflips
    const bodyAirborne = createMockBody({
      angvel: { x: 3.8, y: 0, z: 0 },
    });
    const resultAirborne = applyCollisionAngularGovernor(bodyAirborne, DEFAULT_VEHICLE_CONFIG, 0.016, {
      isGrounded: false,
    });
    expect(resultAirborne.active).toBe(true);
    expect(resultAirborne.excessPitch).toBeCloseTo(3.8 - MAX_NATURAL_PITCH_RATE, 2);
    expect(bodyAirborne.appliedTorques[0].x).toBeLessThan(0);

    // Violent obstacle collision (10.0 rad/s) is still caught even when wheels touch ground
    const bodyCrash = createMockBody({
      angvel: { x: 10.0, y: 0, z: 0 },
    });
    const resultCrash = applyCollisionAngularGovernor(bodyCrash, DEFAULT_VEHICLE_CONFIG, 0.016, {
      isGrounded: true,
    });
    expect(resultCrash.active).toBe(true);
    expect(resultCrash.excessPitch).toBeCloseTo(10.0 - MAX_GROUNDED_LOOP_PITCH_RATE, 2);
    expect(bodyCrash.appliedTorques[0].x).toBeLessThan(0);

    // High-speed loop traversal (3.8 rad/s at 30 m/s) is permitted even during momentary ground contact loss
    const bodyLoopHighSpeed = createMockBody({
      angvel: { x: 3.8, y: 0, z: 0 },
    });
    const resultLoop = applyCollisionAngularGovernor(bodyLoopHighSpeed, DEFAULT_VEHICLE_CONFIG, 0.016, {
      isGrounded: false,
      forwardSpeed: 30.0,
    });
    expect(resultLoop.active).toBe(false);
    expect(bodyLoopHighSpeed.applyTorqueImpulse).not.toHaveBeenCalled();
  });

  it('handles invalid or non-finite inputs gracefully without throwing', () => {
    const bodyNaN = createMockBody({
      angvel: { x: NaN, y: 0, z: 0 },
    });
    expect(applyCollisionAngularGovernor(bodyNaN, DEFAULT_VEHICLE_CONFIG, 0.016).active).toBe(false);

    const bodyZeroDt = createMockBody({
      angvel: { x: 10, y: 0, z: 0 },
    });
    expect(applyCollisionAngularGovernor(bodyZeroDt, DEFAULT_VEHICLE_CONFIG, 0).active).toBe(false);
  });
});
