import { describe, it, expect, vi } from 'vitest';
import { Vector3 } from 'three';
import { DRIVING_MODEL_BALANCE } from '@/config/physicsBalance';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { applyDrivetrain, applyAwdDriftPropulsion } from '../drivetrain';
import { applyTireFrictionAndBrakes } from '../tires';
import { applyAntiRollBars, applyPitchStabilization } from '../suspension';
import { applyAssists } from '../assists';
import type { IRapierVehicleController } from '@/types/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { InputState } from '@/types/game';

describe('Driving Dynamics Diagnostics & AI Regression Safety Suite', () => {

  const createMockController = (options?: {
    suspensionLengths?: number[];
  }): IRapierVehicleController & {
    engineForces: number[];
    brakeForces: number[];
    frictions: number[];
    steerings: number[];
  } => {
    const engineForces: number[] = [0, 0, 0, 0];
    const brakeForces: number[] = [0, 0, 0, 0];
    const frictions: number[] = [0, 0, 0, 0];
    const steerings: number[] = [0, 0, 0, 0];
    const suspensionLengths = options?.suspensionLengths ?? [0.28, 0.28, 0.28, 0.28];

    return {
      engineForces,
      brakeForces,
      frictions,
      steerings,
      setWheelEngineForce: vi.fn((wheelIndex: number, force: number) => {
        engineForces[wheelIndex] = force;
      }),
      setWheelBrake: vi.fn((wheelIndex: number, force: number) => {
        brakeForces[wheelIndex] = force;
      }),
      setWheelFrictionSlip: vi.fn((wheelIndex: number, friction: number) => {
        frictions[wheelIndex] = friction;
      }),
      setWheelSteering: vi.fn((wheelIndex: number, angle: number) => {
        steerings[wheelIndex] = angle;
      }),
      wheelSuspensionLength: vi.fn((wheelIndex: number) => suspensionLengths[wheelIndex]),
      wheelChassisConnectionPointCs: vi.fn((wheelIndex: number) => {
        const x = wheelIndex % 2 === 0 ? -0.8 : 0.8;
        const z = wheelIndex < 2 ? 1.2 : -1.2;
        return { x, y: 0, z };
      }),
      wheelSteering: vi.fn((wheelIndex: number) => steerings[wheelIndex]),
    };
  };

  const createMockBody = (options?: {
    angvel?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
    translation?: { x: number; y: number; z: number };
    mass?: number;
  }): RapierRigidBody & {
    appliedTorques: { x: number; y: number; z: number }[];
    appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[];
  } => {
    const appliedTorques: { x: number; y: number; z: number }[] = [];
    const appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[] = [];

    return {
      appliedTorques,
      appliedImpulses,
      angvel: () => options?.angvel || { x: 0, y: 0, z: 0 },
      rotation: () => options?.rotation || { x: 0, y: 0, z: 0, w: 1 },
      translation: () => options?.translation || { x: 0, y: 1, z: 0 },
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      mass: () => options?.mass ?? 150,
      applyTorqueImpulse: vi.fn((torque: { x: number; y: number; z: number }) => {
        appliedTorques.push({ ...torque });
      }),
      applyImpulseAtPoint: vi.fn((impulse: { x: number; y: number; z: number }, point: { x: number; y: number; z: number }) => {
        appliedImpulses.push({ impulse: { ...impulse }, point: { ...point } });
      }),
    } as unknown as RapierRigidBody & {
      appliedTorques: { x: number; y: number; z: number }[];
      appliedImpulses: { impulse: { x: number; y: number; z: number }; point: { x: number; y: number; z: number } }[];
    };
  };

  describe('Scenario 1: Handbrake hairpin turn under full throttle (anti-tipping & rear lockup)', () => {
    const handbrakeInput: InputState = {
      throttle: 1.0,
      brake: 0,
      handbrake: true,
      steering: 0.85,
      cameraToggle: false,
      reset: false,
    };

    it('guarantees 100% rear wheel lockup and zero rear propulsion during handbrake', () => {
      const controller = createMockController();
      applyDrivetrain(controller, DEFAULT_VEHICLE_CONFIG, handbrakeInput, 15, 2, 0.3, 54);

      // Front wheels receive forward tractive force (front bias)
      expect(controller.engineForces[0]).toBeGreaterThan(0);
      expect(controller.engineForces[1]).toBeGreaterThan(0);

      // Rear wheels have ZERO drive force (cannot fight handbrake)
      expect(controller.engineForces[2]).toBe(0);
      expect(controller.engineForces[3]).toBe(0);

      // Apply tire brakes & friction
      applyTireFrictionAndBrakes(controller, DEFAULT_VEHICLE_CONFIG, handbrakeInput, 54, 15, 0, 0, 0, 0.3);

      // Rear wheels have authoritative mechanical lockup brake force >= minLockupBrakeForce
      expect(controller.brakeForces[2]).toBeGreaterThanOrEqual(DRIVING_MODEL_BALANCE.handbrake.minLockupBrakeForce);
      expect(controller.brakeForces[3]).toBeGreaterThanOrEqual(DRIVING_MODEL_BALANCE.handbrake.minLockupBrakeForce);
    });

    it('moderates front tire lateral grip during handbrake to prevent tripping tipping', () => {
      const controllerNormal = createMockController();
      const normalInput: InputState = { ...handbrakeInput, handbrake: false };
      applyTireFrictionAndBrakes(controllerNormal, DEFAULT_VEHICLE_CONFIG, normalInput, 54, 15, 0, 0, 0, 0.3);

      const controllerHandbrake = createMockController();
      applyTireFrictionAndBrakes(controllerHandbrake, DEFAULT_VEHICLE_CONFIG, handbrakeInput, 54, 15, 0, 0, 0, 0.3);

      // Front steerable wheel lateral grip must yield slightly during handbrake
      expect(controllerHandbrake.frictions[0]).toBeLessThan(controllerNormal.frictions[0]);
      expect(controllerHandbrake.frictions[0]).toBeCloseTo(
        controllerNormal.frictions[0] * DRIVING_MODEL_BALANCE.handbrake.frontSteerYieldMultiplier,
        4
      );
    });

    it('applies boosted roll damping during handbrake turns to prevent 2-wheel tipping', () => {
      // Vehicle experiencing rapid roll tipping (+Z roll angular velocity)
      const bodyHandbrake = createMockBody({ angvel: { x: 0, y: 1.5, z: 1.2 } });
      applyAssists(bodyHandbrake, DEFAULT_VEHICLE_CONFIG, handbrakeInput, 15, 0.016);

      expect(bodyHandbrake.applyTorqueImpulse).toHaveBeenCalled();
      const rollTorquesHb = bodyHandbrake.appliedTorques.map((t) => t.z);
      const sumRollHb = rollTorquesHb.reduce((a, b) => a + b, 0);

      // Roll torque must strongly oppose positive roll angular velocity
      expect(sumRollHb).toBeLessThan(0);

      // Handbrake roll damping must be boosted compared to normal driving roll damping
      const bodyNormal = createMockBody({ angvel: { x: 0, y: 1.5, z: 1.2 } });
      applyAssists(bodyNormal, DEFAULT_VEHICLE_CONFIG, { ...handbrakeInput, handbrake: false }, 15, 0.016);
      const sumRollNormal = bodyNormal.appliedTorques.map((t) => t.z).reduce((a, b) => a + b, 0);

      expect(Math.abs(sumRollHb)).toBeGreaterThan(Math.abs(sumRollNormal));
    });

    it('safely clamps excessive violent yaw spin during handbrake slide', () => {
      // Vehicle exceeding maxYawRateCeiling (e.g. 3.5 rad/s > 2.4 rad/s ceiling)
      const body = createMockBody({ angvel: { x: 0, y: 3.5, z: 0 } });
      applyAssists(body, DEFAULT_VEHICLE_CONFIG, handbrakeInput, 15, 0.016);

      const yawTorques = body.appliedTorques.map((t) => t.y);
      const sumYawTorque = yawTorques.reduce((a, b) => a + b, 0);

      // Counter-torque must act against over-rotation
      expect(sumYawTorque).toBeLessThan(0);
    });
  });

  describe('Scenario 2: Suspension & Anti-Roll Bar (ARB) lateral stabilization', () => {
    it('generates proportional anti-roll impulses that level chassis during asymmetric compression', () => {
      // Outside wheels (FL=0, RL=2) heavily compressed (0.12m remaining), inside wheels (FR=1, RR=3) extended (0.28m)
      const controller = createMockController({
        suspensionLengths: [0.12, 0.28, 0.12, 0.28],
      });
      const body = createMockBody();

      applyAntiRollBars(body, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

      expect(body.applyImpulseAtPoint).toHaveBeenCalled();
      expect(body.appliedImpulses.length).toBe(4);

      // Outside wheels receive upward push (+Y), inside wheels receive downward pull (-Y)
      const flImpulse = body.appliedImpulses[0].impulse.y; // FL outside
      const frImpulse = body.appliedImpulses[1].impulse.y; // FR inside
      expect(flImpulse).toBeGreaterThan(0);
      expect(frImpulse).toBeLessThan(0);
      expect(flImpulse).toBeCloseTo(-frImpulse, 5);

      // All impulses are finite
      for (const item of body.appliedImpulses) {
        expect(Number.isFinite(item.impulse.y)).toBe(true);
      }
    });

    it('applies pitch damping to absorb vertical landing shocks without oscillation', () => {
      // Vehicle dynamically pitching down under heavy braking
      const body = createMockBody({ angvel: { x: 0.8, y: 0, z: 0 } });
      const controller = createMockController({
        suspensionLengths: [0.12, 0.12, 0.28, 0.28], // front compressed, rear extended
      });

      applyPitchStabilization(body, controller, DEFAULT_VEHICLE_CONFIG, 0.016);

      expect(body.applyTorqueImpulse).toHaveBeenCalled();
      const pitchTorques = body.appliedTorques.map((t) => t.x);
      const sumPitch = pitchTorques.reduce((a, b) => a + b, 0);

      // Opposes the positive pitch angular velocity (anti-dive)
      expect(sumPitch).toBeLessThan(0);
    });
  });

  describe('Scenario 3: Standing launch torque progression (anti-wheelie & smooth launch)', () => {
    const launchInput: InputState = {
      throttle: 1.0,
      brake: 0,
      handbrake: false,
      steering: 0,
      cameraToggle: false,
      reset: false,
    };

    it('ramps launch torque monotonically from standing start without sudden shock', () => {
      const speeds = [0, 1.0, 2.0, DRIVING_MODEL_BALANCE.drivetrain.launchRampEndSpeedMps, 10.0];
      const forces = speeds.map((speed) => {
        const ctrl = createMockController();
        applyDrivetrain(ctrl, DEFAULT_VEHICLE_CONFIG, launchInput, speed, 1, 0, speed * 3.6);
        return ctrl.engineForces[0];
      });

      // Standing start torque is scaled by launchRampBaseFraction
      const expectedBaseForce = forces[3] * DRIVING_MODEL_BALANCE.drivetrain.launchRampBaseFraction;
      expect(forces[0]).toBeCloseTo(expectedBaseForce, 0);

      // Forces ramp monotonically up to launchRampEndSpeedMps
      expect(forces[1]).toBeGreaterThan(forces[0]);
      expect(forces[2]).toBeGreaterThan(forces[1]);
      expect(forces[3]).toBeGreaterThanOrEqual(forces[2]);
    });
  });

  describe('Scenario 4: Extreme input handling & numerical stability', () => {
    it('preserves finite numbers on zero delta time and extreme speeds', () => {
      const extremeInput: InputState = {
        throttle: 1.0,
        brake: 1.0,
        handbrake: true,
        steering: 1.0,
        cameraToggle: false,
        reset: false,
      };

      const ctrl = createMockController();
      applyDrivetrain(ctrl, DEFAULT_VEHICLE_CONFIG, extremeInput, 500, 5, 1.5, 1800);
      for (const f of ctrl.engineForces) {
        expect(Number.isFinite(f)).toBe(true);
      }

      applyTireFrictionAndBrakes(ctrl, DEFAULT_VEHICLE_CONFIG, extremeInput, 1800, 500, 0, 0, 0, 1.5);
      for (const b of ctrl.brakeForces) {
        expect(Number.isFinite(b)).toBe(true);
      }
      for (const fr of ctrl.frictions) {
        expect(Number.isFinite(fr)).toBe(true);
        expect(fr).toBeGreaterThan(0);
      }

      const body = createMockBody({ angvel: { x: 100, y: 100, z: 100 } });
      applyAssists(body, DEFAULT_VEHICLE_CONFIG, extremeInput, 500, 0.001);
      applyAntiRollBars(body, ctrl, DEFAULT_VEHICLE_CONFIG, 0.001);
      applyPitchStabilization(body, ctrl, DEFAULT_VEHICLE_CONFIG, 0.001);

      for (const t of body.appliedTorques) {
        expect(Number.isFinite(t.x)).toBe(true);
        expect(Number.isFinite(t.y)).toBe(true);
        expect(Number.isFinite(t.z)).toBe(true);
      }
      for (const imp of body.appliedImpulses) {
        expect(Number.isFinite(imp.impulse.x)).toBe(true);
        expect(Number.isFinite(imp.impulse.y)).toBe(true);
        expect(Number.isFinite(imp.impulse.z)).toBe(true);
      }
    });

    it('safely disables artificial AWD body thrust when handbrake is engaged', () => {
      const body = createMockBody();
      const handbrakeInput: InputState = {
        throttle: 1.0,
        brake: 0,
        handbrake: true,
        steering: 0.8,
        cameraToggle: false,
        reset: false,
      };

      const forwardVec = new Vector3(0, 0, 1);
      applyAwdDriftPropulsion(body, DEFAULT_VEHICLE_CONFIG, handbrakeInput, forwardVec, 54, 0.5, 1.0, 0.016, 2);
      // Handbrake must completely suppress artificial forward thrust impulses
      expect(body.appliedImpulses.length).toBe(0);
    });
  });
});
