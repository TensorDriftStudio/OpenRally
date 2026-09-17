import { describe, it, expect, vi } from 'vitest';
import { applyAssists } from '../assists';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';
import type { InputState } from '@/types/game';

describe('assists physics', () => {
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
    throttle: 1,
    brake: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  };

  it('applies stabilizing torque impulse when car experiences unintended yaw rotation off-throttle', () => {
    // Car spinning around Y axis with 0 steering input and 0 throttle
    const body = createMockBody({ angvel: { x: 0, y: 2.0, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, throttle: 0 }, 20, 0.016);

    expect(body.applyTorqueImpulse).toHaveBeenCalled();
    expect(body.appliedTorques.length).toBeGreaterThan(0);
    // Opposes the positive angular velocity
    expect(body.appliedTorques[0].y).toBeLessThan(0);
  });

  it('allows natural power sliding under throttle without aggressive neutral yaw fighting', () => {
    // Car sliding at moderate yaw rate under active throttle
    const body = createMockBody({ angvel: { x: 0, y: 1.5, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, throttle: 1 }, 20, 0.016);

    // Yaw torques should not forcefully clamp the slide
    const yawTorques = body.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    expect(sumYaw).toBe(0);
  });

  it('does not apply restrictive yaw torque when handbrake is held (allowing drift/spins)', () => {
    const body = createMockBody({ angvel: { x: 0, y: 2.0, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, handbrake: true }, 20, 0.016);

    // Should not apply yaw damping when handbraking
    const yawTorques = body.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    expect(sumYaw).toBe(0);
  });

  it('applies agile turn-in torque assisting corner entry when steering is applied', () => {
    // Car moving forward at 15 m/s with left steering (+0.8) and minimal angular velocity
    const body = createMockBody({ angvel: { x: 0, y: 0, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, steering: 0.8 }, 15, 0.016);

    expect(body.applyTorqueImpulse).toHaveBeenCalled();
    const yawTorques = body.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    // Should apply positive torque in the direction of left steering
    expect(sumYaw).toBeGreaterThan(0);
  });

  it('applies authoritative countersteer torque when steering opposes active yaw rotation', () => {
    // Car rotating clockwise / right (angvel.y = -1.8) and driver countersteers left (+0.9)
    const body = createMockBody({ angvel: { x: 0, y: -1.8, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, steering: 0.9 }, 15, 0.016);

    expect(body.applyTorqueImpulse).toHaveBeenCalled();
    const yawTorques = body.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    // Countersteer should generate strong positive torque to catch the slide
    expect(sumYaw).toBeGreaterThan(0);
  });

  it('applies strong anti-wheelie restoring torque when throttle is applied with nose pitching up', () => {
    // Car dynamically pitching nose up (negative angular velocity around local X axis) under full throttle
    const body = createMockBody({ angvel: { x: -0.6, y: 0, z: 0 } });

    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, throttle: 1 }, 10, 0.016);

    expect(body.applyTorqueImpulse).toHaveBeenCalled();
    const pitchTorques = body.appliedTorques.map((t) => t.x);
    const sumPitch = pitchTorques.reduce((a, b) => a + b, 0);
    // Positive torque around X pulls the nose back down
    expect(sumPitch).toBeGreaterThan(0);
  });

  it('does not apply false anti-wheelie pitch torque when vehicle climbs an uphill slope with steady pitch', () => {
    // Car resting or climbing a steep uphill slope (inclined orientation) with zero angular pitch velocity
    const q = { x: -0.15, y: 0, z: 0, w: 0.988 };
    const body = createMockBody({ rotation: q, angvel: { x: 0, y: 0, z: 0 } });

    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, throttle: 1 }, 15, 0.016);

    const pitchTorques = body.appliedTorques.map((t) => t.x);
    const sumPitch = pitchTorques.reduce((a, b) => a + b, 0);
    // Zero false pitch torque applied, preventing severe slope-induced oscillations and chatter
    expect(sumPitch).toBe(0);
  });

  it('prevents snap-oversteer kicks when vehicle recovers from high yaw rotation in same direction as steering', () => {
    // Car rotating right/clockwise (angvel.y = 1.2 rad/s) and driver steering right (+0.8)
    // Anti-snap architecture suppresses artificial turnInTorque kick and applies damping
    const body = createMockBody({ angvel: { x: 0, y: 1.2, z: 0 } });
    applyAssists(body, DEFAULT_VEHICLE_CONFIG, { ...baseInput, steering: 0.8 }, 15, 0.016);

    const yawTorques = body.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    // Yaw torque opposes rotation (< 0) rather than kicking it further (> 0), eliminating tank-slappers
    expect(sumYaw).toBeLessThan(0);
  });

  it('disables artificial yaw torque when ESP is disabled in settings', () => {
    // Car spinning around Y axis with 0 steering input and 0 throttle
    const bodyEspOff = createMockBody({ angvel: { x: 0, y: 2.0, z: 0 } });
    const resultEspOff = applyAssists(
      bodyEspOff,
      DEFAULT_VEHICLE_CONFIG,
      { ...baseInput, throttle: 0 },
      20,
      0.016,
      undefined,
      { espEnabled: false }
    );

    expect(resultEspOff.espActive).toBe(false);
    const yawTorquesOff = bodyEspOff.appliedTorques.map((t) => t.y);
    const sumYawOff = yawTorquesOff.reduce((a, b) => a + b, 0);
    // When ESP is off, no yaw stabilization torque is applied at all
    expect(sumYawOff).toBe(0);

    const bodyEspOn = createMockBody({ angvel: { x: 0, y: 2.0, z: 0 } });
    const resultEspOn = applyAssists(
      bodyEspOn,
      DEFAULT_VEHICLE_CONFIG,
      { ...baseInput, throttle: 0 },
      20,
      0.016,
      undefined,
      { espEnabled: true }
    );

    expect(resultEspOn.espActive).toBe(true);
    const yawTorquesOn = bodyEspOn.appliedTorques.map((t) => t.y);
    const sumYawOn = yawTorquesOn.reduce((a, b) => a + b, 0);
    // When ESP is on, stabilizing yaw torque opposes the spin
    expect(sumYawOn).toBeLessThan(0);
  });

  it('attenuates yaw damping when driver performs a rapid Scandinavian flick', () => {
    // Car rotating in the direction of steering at high yaw velocity (e.g. 1.2 rad/s)
    const bodySteady = createMockBody({ angvel: { x: 0, y: 1.2, z: 0 } });
    // Steady steering (prevSteering = 0.8, current steering = 0.8) -> full damping
    applyAssists(
      bodySteady,
      DEFAULT_VEHICLE_CONFIG,
      { ...baseInput, steering: 0.8 },
      15,
      0.016,
      undefined,
      { espEnabled: true },
      0.8,
    );

    const bodyFlick = createMockBody({ angvel: { x: 0, y: 1.2, z: 0 } });
    // Rapid steering flick (prevSteering = 0, current steering = 0.8 in 0.016s) -> attenuated damping
    applyAssists(
      bodyFlick,
      DEFAULT_VEHICLE_CONFIG,
      { ...baseInput, steering: 0.8 },
      15,
      0.016,
      undefined,
      { espEnabled: true },
      0,
    );

    const steadyYawTorque = Math.abs(bodySteady.appliedTorques.map((t) => t.y).reduce((a, b) => a + b, 0));
    const flickYawTorque = Math.abs(bodyFlick.appliedTorques.map((t) => t.y).reduce((a, b) => a + b, 0));

    // Rapid flick attenuates damping torque so driver can initiate rotation into the turn
    expect(flickYawTorque).toBeLessThan(steadyYawTorque);
  });

  it('prohibits forward turn-in yaw assistance when vehicle is reversing', () => {
    const bodyReverse = createMockBody({ angvel: { x: 0, y: 0, z: 0 } });
    applyAssists(
      bodyReverse,
      DEFAULT_VEHICLE_CONFIG,
      { ...baseInput, steering: 0.8 },
      -5.0, // Moving in reverse at -5 m/s
      0.016,
      undefined,
      { espEnabled: true },
      0,
    );

    // No forward turn-in impulse should be applied
    const yawTorques = bodyReverse.appliedTorques.map((t) => t.y);
    const sumYaw = yawTorques.reduce((a, b) => a + b, 0);
    expect(sumYaw).toBe(0);
  });
});
