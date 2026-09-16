import { describe, it, expect, vi } from 'vitest';
import { applyAntiRollBars, applyPitchStabilization } from '../suspension';
import { applyAssists } from '../assists';
import { DEFAULT_VEHICLE_CONFIG, MAX_DELTA } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { IRapierVehicleController } from '@/types/vehicle';

describe('Substep Physics Stability & Low-FPS Anti-Wobble Invariants', () => {
  const createMockBody = (options?: {
    mass?: number;
    translation?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
    angvel?: { x: number; y: number; z: number };
    linvel?: { x: number; y: number; z: number };
  }) => {
    const appliedImpulses: {
      impulse: { x: number; y: number; z: number };
      point: { x: number; y: number; z: number };
    }[] = [];
    const appliedTorques: { x: number; y: number; z: number }[] = [];

    const mock = {
      appliedImpulses,
      appliedTorques,
      mass: () => options?.mass ?? 1400,
      translation: () => options?.translation || { x: 0, y: 1, z: 0 },
      rotation: () => options?.rotation || { x: 0, y: 0, z: 0, w: 1 },
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      linvel: () => options?.linvel || { x: 0, y: 0, z: 0 },
      applyImpulseAtPoint: vi.fn(
        (
          impulse: { x: number; y: number; z: number },
          point: { x: number; y: number; z: number },
        ) => {
          appliedImpulses.push({ impulse: { ...impulse }, point: { ...point } });
        },
      ),
      applyTorqueImpulse: vi.fn((torque: { x: number; y: number; z: number }) => {
        appliedTorques.push({ ...torque });
      }),
    };

    return mock as unknown as RapierRigidBody & {
      appliedImpulses: typeof appliedImpulses;
      appliedTorques: typeof appliedTorques;
    };
  };

  const createMockController = (
    suspensionLengths: number[],
    inContact: boolean[] = [true, true, true, true],
  ): IRapierVehicleController => {
    return {
      wheelSuspensionLength: (i: number) => suspensionLengths[i] ?? 0.32,
      wheelIsInContact: (i: number) => inContact[i] ?? true,
      wheelChassisConnectionPointCs: (i: number) => ({
        x: i % 2 === 0 ? -0.8 : 0.8,
        y: -0.2,
        z: i < 2 ? 1.4 : -1.3,
      }),
      setWheelEngineForce: vi.fn(),
      setWheelBrake: vi.fn(),
      setWheelSteering: vi.fn(),
      setWheelFrictionSlip: vi.fn(),
      updateVehicle: vi.fn(),
    } as unknown as IRapierVehicleController;
  };

  it('skips anti-roll bar impulses when both axle wheels are airborne (prevents mid-air wobble)', () => {
    const body = createMockBody();
    // Both front wheels airborne, both rear wheels in contact
    const controller = createMockController(
      [0.20, 0.32, 0.20, 0.32],
      [false, false, true, true],
    );

    applyAntiRollBars(body, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

    // Only the rear axle (2 wheels) should receive ARB impulses; front axle is skipped
    expect(body.appliedImpulses.length).toBe(2);
  });

  it('skips anti-roll bar impulses entirely when all wheels are airborne', () => {
    const body = createMockBody();
    const controller = createMockController(
      [0.15, 0.35, 0.15, 0.35],
      [false, false, false, false],
    );

    applyAntiRollBars(body, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

    expect(body.appliedImpulses.length).toBe(0);
  });

  it('clamps ARB forces to maximum physical saturation under extreme lean (prevents catapulting)', () => {
    const body = createMockBody({ mass: 1200 });
    // Extreme suspension disparity (bottomed out left, hyper-extended right)
    const controller = createMockController([0.01, 0.50, 0.01, 0.50]);

    applyAntiRollBars(body, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

    // Max ARB force is clamped to mass * 9.81 * 1.5 = 1200 * 9.81 * 1.5 = 17658 N
    // Impulse = force * dt = 17658 * 0.016 = ~282.5 N*s
    const maxAllowedImpulse = 1200 * 9.81 * 1.5 * 0.016 + 1.0;

    for (const applied of body.appliedImpulses) {
      expect(Math.abs(applied.impulse.y)).toBeLessThanOrEqual(maxAllowedImpulse);
    }
  });

  it('incorporates roll velocity damping to prevent undamped side-to-side spring oscillations', () => {
    // Case 1: Body rolling clockwise (positive local angvel Z)
    const bodyRollingCW = createMockBody({
      angvel: { x: 0, y: 0, z: 2.5 },
      mass: 1400,
    });
    // Case 2: Body with identical suspension deflection but zero roll velocity
    const bodyStatic = createMockBody({
      angvel: { x: 0, y: 0, z: 0 },
      mass: 1400,
    });

    // Left compressed (0.22m), right extended (0.32m)
    const controller = createMockController([0.22, 0.32, 0.22, 0.32]);

    applyAntiRollBars(bodyRollingCW, controller, DEFAULT_VEHICLE_CONFIG, 0.016);
    applyAntiRollBars(bodyStatic, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

    // The rolling body should have a different net ARB impulse due to roll damping opposing roll velocity
    const impulseCW = bodyRollingCW.appliedImpulses[0].impulse.y;
    const impulseStatic = bodyStatic.appliedImpulses[0].impulse.y;

    expect(impulseCW).not.toEqual(impulseStatic);
    expect(Number.isFinite(impulseCW)).toBe(true);
  });

  it('enforces momentum bounds on pitch stabilization torque to prevent oscillation flip', () => {
    const body = createMockBody({
      mass: 1400,
      angvel: { x: 3.0, y: 0, z: 0 }, // Significant pitch velocity
    });
    const controller = createMockController([0.22, 0.22, 0.22, 0.22]);

    // High delta time scenario (e.g. 50ms stutter)
    applyPitchStabilization(body, controller, DEFAULT_VEHICLE_CONFIG, 0.05);

    expect(body.appliedTorques.length).toBe(1);
    const appliedPitchTorque = body.appliedTorques[0].x;

    // Must oppose pitch velocity (negative)
    expect(appliedPitchTorque).toBeLessThan(0);

    // Moment of inertia approx I_pitch = 1400 * (1.8^2 + 4.2^2) / 12 = ~2436 kg*m^2
    // Maximum safe impulse = 0.85 * I * |pitchRate| = 0.85 * 2436 * 3.0 = ~6211 N*m*s
    const maxSafeTorqueImpulse = 0.85 * (1400 * (1.8 * 1.8 + 4.2 * 4.2) / 12) * 3.0;
    expect(Math.abs(appliedPitchTorque)).toBeLessThanOrEqual(maxSafeTorqueImpulse + 0.01);
  });

  it('enforces momentum bounds in assists preventing numerical reversal on large deltas', () => {
    const body = createMockBody({
      mass: 1400,
      angvel: { x: 1.5, y: -2.0, z: 1.8 },
    });
    const baseInput = {
      steering: 0,
      throttle: 0,
      brake: 0,
      handbrake: false,
      cameraToggle: false,
      reset: false,
    };

    // Large delta time stutter
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, baseInput, 20, 0.05);

    expect(body.appliedTorques.length).toBe(1);
    const torque = body.appliedTorques[0];

    // Torque must strictly oppose each angular velocity axis
    expect(Math.sign(torque.x)).toBe(-Math.sign(1.5));
    expect(Math.sign(torque.z)).toBe(-Math.sign(1.8));

    // Torque magnitudes must be finite and bounded
    expect(Number.isFinite(torque.x)).toBe(true);
    expect(Number.isFinite(torque.y)).toBe(true);
    expect(Number.isFinite(torque.z)).toBe(true);
  });

  it('verifies MAX_DELTA prevents time accumulator spiral-of-death during heavy CPU stalls', () => {
    // When game stutters for 500ms, MAX_DELTA caps the step to 50ms (at most 3 Rapier substeps at 1/60s)
    const stutterDelta = 0.50; // 500ms freeze
    const clampedDelta = Math.max(0.001, Math.min(stutterDelta, MAX_DELTA));

    expect(clampedDelta).toBe(MAX_DELTA);
    expect(clampedDelta).toBeLessThanOrEqual(0.05);

    const maxSubstepsAt60Hz = Math.ceil(clampedDelta / (1 / 60));
    expect(maxSubstepsAt60Hz).toBeLessThanOrEqual(3);
  });
});
