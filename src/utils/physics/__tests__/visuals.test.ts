import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import { syncWheelVisuals } from '@/utils/physics/visuals';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { IRapierVehicleController } from '@/types/vehicle';

describe('syncWheelVisuals', () => {
  const createMockController = (contacts: boolean[]): IRapierVehicleController => ({
    setWheelEngineForce: vi.fn(),
    setWheelBrake: vi.fn(),
    setWheelSteering: vi.fn(),
    setWheelFrictionSlip: vi.fn(),
    wheelChassisConnectionPointCs: () => ({ x: 0.8, y: -0.1, z: 1.2 }),
    wheelSuspensionLength: () => 0.3,
    wheelSteering: () => 0.15,
    wheelIsInContact: (i: number) => contacts[i] ?? false,
  });

  it('sets wheelObj.userData.isGrounded = true when wheelIsInContact returns true', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      obj.add(new Object3D());
      return obj;
    });

    const wheelRefs = { current: wheels };
    const controller = createMockController([true, true, true, true]);

    syncWheelVisuals(controller, wheelRefs, DEFAULT_VEHICLE_CONFIG, 10, 1 / 60, 2000, 2);

    expect(wheels[0].userData.isGrounded).toBe(true);
    expect(wheels[1].userData.isGrounded).toBe(true);
    expect(wheels[0].rotation.y).toBeCloseTo(0.15);
  });

  it('sets wheelObj.userData.isGrounded = false when wheelIsInContact returns false (airborne)', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      obj.add(new Object3D());
      return obj;
    });

    const wheelRefs = { current: wheels };
    const controller = createMockController([false, false, false, false]);

    syncWheelVisuals(controller, wheelRefs, DEFAULT_VEHICLE_CONFIG, 10, 1 / 60, 4000, 3);

    expect(wheels[0].userData.isGrounded).toBe(false);
    expect(wheels[1].userData.isGrounded).toBe(false);
  });

  it('correctly tracks partial airborne state (one wheel lifted)', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      obj.add(new Object3D());
      return obj;
    });

    const wheelRefs = { current: wheels };
    const controller = createMockController([true, false, true, true]);

    syncWheelVisuals(controller, wheelRefs, DEFAULT_VEHICLE_CONFIG, 10, 1 / 60, 3000, 2);

    expect(wheels[0].userData.isGrounded).toBe(true);
    expect(wheels[1].userData.isGrounded).toBe(false);
  });

  it('clamps visual suspension length to minSuspensionLength on severe landing impact so wheels do not penetrate car body', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      obj.add(new Object3D());
      return obj;
    });

    const wheelRefs = { current: wheels };
    // Simulate physics engine returning severe compression (0.01m) on hard jump landing
    const collapsedController: IRapierVehicleController = {
      setWheelEngineForce: vi.fn(),
      setWheelBrake: vi.fn(),
      setWheelSteering: vi.fn(),
      setWheelFrictionSlip: vi.fn(),
      wheelChassisConnectionPointCs: () => ({ x: 0.88, y: -0.20, z: 1.38 }),
      wheelSuspensionLength: () => 0.01,
      wheelSteering: () => 0,
      wheelIsInContact: () => true,
    };

    syncWheelVisuals(collapsedController, wheelRefs, DEFAULT_VEHICLE_CONFIG, 0, 1 / 60, 1000, 1);

    const expectedMinSuspension = DEFAULT_VEHICLE_CONFIG.wheels[0].minSuspensionLength ?? 0.19;
    // wheelObj.position.y = connection.y - safeSuspension
    expect(wheels[0].position.y).toBeCloseTo(-0.20 - expectedMinSuspension, 3);
    // Wheel must NEVER penetrate up to raw 0.01m (-0.21m)
    expect(wheels[0].position.y).toBeLessThanOrEqual(-0.20 - expectedMinSuspension);
  });

  it('locks visual rotation of rear wheels when handbrake is engaged', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      const mesh = new Object3D();
      mesh.rotateX = vi.fn();
      obj.add(mesh);
      return obj;
    });

    const wheelRefs = { current: wheels };
    const controller = createMockController([true, true, true, true]);

    // Car sliding at 20 m/s with handbrake engaged
    syncWheelVisuals(
      controller,
      wheelRefs,
      DEFAULT_VEHICLE_CONFIG,
      20,
      1 / 60,
      3000,
      2,
      { handbrake: true, throttle: 0 }
    );

    // Front wheels (0, 1) rotate with vehicle ground speed
    const frontRotateXSpy = vi.mocked(wheels[0].children[0].rotateX);
    expect(frontRotateXSpy.mock.calls[0][0]).toBeGreaterThan(0);

    // Rear wheels (2, 3) are locked by handbrake: rotateX called with 0
    expect(wheels[2].children[0].rotateX).toHaveBeenCalledWith(0);
    expect(wheels[3].children[0].rotateX).toHaveBeenCalledWith(0);
  });
});
