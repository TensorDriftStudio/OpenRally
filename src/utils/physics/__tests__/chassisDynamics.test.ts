import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import {
  createChassisDynamicsState,
  resetChassisDynamics,
  updateDampedSpring,
  updateChassisDynamics,
} from '../chassisDynamics';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { IRapierVehicleController } from '@/types/vehicle';

describe('chassisDynamics (Sprung Mass Body Roll, Pitch & Heave)', () => {
  const createMockBody = (options?: {
    angvel?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
  }): RapierRigidBody => {
    return {
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      rotation: () => options?.rotation || { x: 0, y: 0, z: 0, w: 1 },
      translation: () => ({ x: 0, y: 1, z: 0 }),
      linvel: () => ({ x: 0, y: 0, z: 0 }),
    } as unknown as RapierRigidBody;
  };

  const createMockController = (suspensionLengths?: number[]): IRapierVehicleController => {
    const defaultLengths = [0.32, 0.32, 0.32, 0.32];
    const lengths = suspensionLengths ?? defaultLengths;
    return {
      wheelSuspensionLength: (i: number) => lengths[i] ?? 0.32,
      wheelChassisConnectionPointCs: vi.fn(),
      setWheelEngineForce: vi.fn(),
      setWheelBrake: vi.fn(),
      setWheelSteering: vi.fn(),
      setWheelFrictionSlip: vi.fn(),
      updateVehicle: vi.fn(),
    } as unknown as IRapierVehicleController;
  };

  it('creates an uninitialized zeroed state container', () => {
    const state = createChassisDynamicsState();
    expect(state.roll).toBe(0);
    expect(state.rollVelocity).toBe(0);
    expect(state.pitch).toBe(0);
    expect(state.pitchVelocity).toBe(0);
    expect(state.heave).toBe(0);
    expect(state.heaveVelocity).toBe(0);
    expect(state.isInitialized).toBe(false);
  });

  it('resets state and visual object transforms cleanly', () => {
    const state = createChassisDynamicsState();
    state.roll = 0.05;
    state.pitch = -0.03;
    state.heave = -0.02;
    state.isInitialized = true;

    const visualObj = new Object3D();
    visualObj.rotation.z = 0.05;
    visualObj.rotation.x = -0.03;
    visualObj.position.y = -0.02;

    resetChassisDynamics(visualObj, state);

    expect(state.roll).toBe(0);
    expect(state.pitch).toBe(0);
    expect(state.heave).toBe(0);
    expect(state.isInitialized).toBe(false);
    expect(visualObj.rotation.z).toBe(0);
    expect(visualObj.rotation.x).toBe(0);
    expect(visualObj.position.y).toBe(0);
  });

  describe('updateDampedSpring', () => {
    it('smoothly converges towards target without exploding', () => {
      let current = 0;
      let velocity = 0;
      const target = 0.08;
      const omegaN = 11.0;
      const zeta = 0.8;
      const dt = 1 / 60;

      for (let i = 0; i < 60; i++) {
        const [nextVal, nextVel] = updateDampedSpring(current, velocity, target, omegaN, zeta, dt);
        current = nextVal;
        velocity = nextVel;
      }

      expect(current).toBeCloseTo(target, 2);
      expect(Number.isFinite(current)).toBe(true);
      expect(Number.isFinite(velocity)).toBe(true);
    });

    it('safely handles zero or negative delta times without NaN', () => {
      const [val, vel] = updateDampedSpring(0, 0, 0.05, 11.0, 0.8, 0);
      expect(Number.isFinite(val)).toBe(true);
      expect(Number.isFinite(vel)).toBe(true);
    });
  });

  describe('updateChassisDynamics cornering body roll', () => {
    it('rolls body to the left (negative rotation.z) in a right turn', () => {
      const visualObj = new Object3D();
      const state = createChassisDynamicsState();
      // Turning right: negative yaw velocity around +Y
      const body = createMockBody({ angvel: { x: 0, y: -0.6, z: 0 } });
      const controller = createMockController();
      const forwardSpeed = 20; // 72 km/h
      const dt = 1 / 60;

      for (let i = 0; i < 25; i++) {
        updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, forwardSpeed, dt);
      }

      // Roll must be negative (leaning towards left / outside of right turn)
      expect(visualObj.rotation.z).toBeLessThan(-0.01);
      expect(visualObj.rotation.z).toBeGreaterThanOrEqual(
        -(DEFAULT_VEHICLE_CONFIG.chassisDynamics?.maxRollAngle ?? 0.085) - 0.01,
      );
    });

    it('rolls body to the right (positive rotation.z) in a left turn', () => {
      const visualObj = new Object3D();
      const state = createChassisDynamicsState();
      // Turning left: positive yaw velocity around +Y
      const body = createMockBody({ angvel: { x: 0, y: 0.6, z: 0 } });
      const controller = createMockController();
      const forwardSpeed = 20; // 72 km/h
      const dt = 1 / 60;

      for (let i = 0; i < 25; i++) {
        updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, forwardSpeed, dt);
      }

      // Roll must be positive (leaning towards right / outside of left turn)
      expect(visualObj.rotation.z).toBeGreaterThan(0.01);
      expect(visualObj.rotation.z).toBeLessThanOrEqual(
        (DEFAULT_VEHICLE_CONFIG.chassisDynamics?.maxRollAngle ?? 0.085) + 0.01,
      );
    });
  });

  describe('updateChassisDynamics pitch dive and squat', () => {
    it('causes nose to dive down (positive rotation.x) under hard braking', () => {
      const visualObj = new Object3D();
      const state = createChassisDynamicsState();
      const body = createMockBody();
      const controller = createMockController();
      const dt = 1 / 60;

      // Initialize at 25 m/s
      updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, 25, dt);

      // Decelerate rapidly (braking from 25 to 15 m/s)
      let speed = 25;
      for (let i = 0; i < 15; i++) {
        speed -= 0.6;
        updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, speed, dt);
      }

      // In Three.js, positive rotation.x tilts nose (+Z) downwards
      expect(visualObj.rotation.x).toBeGreaterThan(0.01);
    });

    it('causes rear to squat (negative rotation.x) under hard launch/acceleration', () => {
      const visualObj = new Object3D();
      const state = createChassisDynamicsState();
      const body = createMockBody();
      const controller = createMockController();
      const dt = 1 / 60;

      // Initialize at standstill
      updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, 0, dt);

      // Rapidly accelerate forward
      let speed = 0;
      for (let i = 0; i < 15; i++) {
        speed += 0.8;
        updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, speed, dt);
      }

      // Negative rotation.x tilts nose (+Z) upwards (rear squat)
      expect(visualObj.rotation.x).toBeLessThan(-0.01);
    });
  });

  describe('updateChassisDynamics suspension heave', () => {
    it('drops chassis position.y downwards when all 4 wheels compress', () => {
      const visualObj = new Object3D();
      const state = createChassisDynamicsState();
      const body = createMockBody();
      // Compressed suspension: 0.15m (rest length is 0.32m)
      const controller = createMockController([0.15, 0.15, 0.15, 0.15]);
      const dt = 1 / 60;

      for (let i = 0; i < 20; i++) {
        updateChassisDynamics(visualObj, controller, body, DEFAULT_VEHICLE_CONFIG, state, 15, dt);
      }

      expect(visualObj.position.y).toBeLessThan(-0.01);
    });
  });

  it('gracefully ignores null visualObj without throwing', () => {
    const state = createChassisDynamicsState();
    const body = createMockBody();
    const controller = createMockController();

    expect(() => {
      updateChassisDynamics(null, controller, body, DEFAULT_VEHICLE_CONFIG, state, 15, 1 / 60);
    }).not.toThrow();
  });
});
