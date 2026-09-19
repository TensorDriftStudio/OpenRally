import { describe, it, expect, vi } from 'vitest';
import { Vector3 } from 'three';
import { applyDrivetrain, applyAwdDriftPropulsion } from '../drivetrain';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { DRIVING_MODEL_BALANCE } from '@/config/physicsBalance';
import type { IRapierVehicleController } from '@/types/vehicle';
import type { RapierRigidBody } from '@react-three/rapier';

describe('drivetrain physics', () => {
  const createMockController = (): IRapierVehicleController & { forces: number[] } => {
    const forces: number[] = [0, 0, 0, 0];
    return {
      forces,
      setWheelEngineForce: vi.fn((wheelIndex: number, force: number) => {
        forces[wheelIndex] = force;
      }),
      setWheelBrake: vi.fn(),
      setWheelSteering: vi.fn(),
      setWheelFrictionSlip: vi.fn(),
      wheelSuspensionLength: vi.fn(),
      wheelChassisConnectionPointCs: vi.fn(),
      wheelSteering: vi.fn(),
    };
  };

  it('applies positive engine force to powered wheels when throttle > 0', () => {
    const controller = createMockController();
    applyDrivetrain(
      controller,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      10,
      1 // 1st gear
    );

    // All 4 wheels are powered in AWD default config
    expect(controller.setWheelEngineForce).toHaveBeenCalledTimes(4);
    expect(controller.forces[0]).toBeGreaterThan(0);
    expect(controller.forces[1]).toBeGreaterThan(0);
    expect(controller.forces[2]).toBeGreaterThan(0);
    expect(controller.forces[3]).toBeGreaterThan(0);
  });

  it('applies negative engine force when reversing at low speed with brake pressed', () => {
    const controller = createMockController();
    applyDrivetrain(
      controller,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 0, brake: 1 },
      0, // Low speed -> triggers reverse
      -1
    );

    expect(controller.forces[0]).toBeLessThan(0);
    expect(controller.forces[1]).toBeLessThan(0);
    expect(controller.forces[2]).toBeLessThan(0);
    expect(controller.forces[3]).toBeLessThan(0);
  });

  it('delivers 50/50 locked torque split across front and rear axles in reverse gear', () => {
    const controller = createMockController();
    applyDrivetrain(
      controller,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 0, brake: 1 },
      0,
      -1
    );

    // In reverse, activeFrontBias = 0.50 and activeRearBias = 0.50
    // Each of the 2 front wheels gets 25%, each of the 2 rear wheels gets 25%
    expect(controller.forces[0]).toBeCloseTo(controller.forces[2], 2);
    expect(controller.forces[1]).toBeCloseTo(controller.forces[3], 2);
  });

  it('applies reverse drive via throttle when in manual transmission mode', () => {
    const controller = createMockController();
    applyDrivetrain(
      controller,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      -2.0,
      -1,
      0,
      7.2,
      1.0,
      DRIVING_MODEL_BALANCE.drivetrain,
      undefined,
      undefined,
      0,
      1 / 60,
      { isManual: true }
    );

    // Throttle drives reverse in manual mode
    expect(controller.forces[0]).toBeLessThan(0);
    expect(controller.forces[1]).toBeLessThan(0);
    expect(controller.forces[2]).toBeLessThan(0);
    expect(controller.forces[3]).toBeLessThan(0);
  });

  it('sets 0 engine force when braking at high forward speed', () => {
    const controller = createMockController();
    applyDrivetrain(
      controller,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 0, brake: 1 },
      20, // Moving forward -> braking, not reverse engine force
      2
    );

    expect(controller.forces[0]).toBe(0);
    expect(controller.forces[1]).toBe(0);
    expect(controller.forces[2]).toBe(0);
    expect(controller.forces[3]).toBe(0);
  });

  it('progressively ramps launch torque in 1st gear from dead stop to avoid launch wheelie shock', () => {
    const standStillController = createMockController();
    applyDrivetrain(
      standStillController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      0, // 0 km/h standing start
      1  // 1st gear
    );

    const rollingController = createMockController();
    applyDrivetrain(
      rollingController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      5.0, // rolling at ~18 km/h
      1
    );

    // Full rolling power is higher than dead-stop launch power
    expect(rollingController.forces[0]).toBeGreaterThan(standStillController.forces[0]);
    expect(standStillController.forces[0]).toBeGreaterThan(0);
  });

  it('moderates rear wheel drive torque when front suspension is unweighted to prevent wheelie', () => {
    const normalController = createMockController();
    // Front suspension compressed normally (0.24m with rest 0.32m)
    normalController.wheelSuspensionLength = vi.fn(() => 0.24);

    applyDrivetrain(
      normalController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      5.0,
      1
    );

    const liftingController = createMockController();
    // Front wheels unweighted / at full rebound (0.32m with rest 0.32m)
    liftingController.wheelSuspensionLength = vi.fn(() => 0.32);

    applyDrivetrain(
      liftingController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0 },
      5.0,
      1
    );

    // Rear wheel forces (wheels 2 and 3) should be moderated when front wheels are lifting
    expect(liftingController.forces[2]).toBeLessThan(normalController.forces[2]);
    expect(liftingController.forces[3]).toBeLessThan(normalController.forces[3]);
    // Front wheels maintain pull
    expect(liftingController.forces[0]).toBe(normalController.forces[0]);
  });

  it('boosts engine force during steering under throttle to overcome cornering tire scrub', () => {
    const straightController = createMockController();
    applyDrivetrain(
      straightController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0, steering: 0 },
      15,
      2
    );

    const corneringController = createMockController();
    applyDrivetrain(
      corneringController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0, steering: 0.8 },
      15,
      2
    );

    // Forces during cornering should be higher than straight line to maintain exit power
    expect(corneringController.forces[0]).toBeGreaterThan(straightController.forces[0]);
    expect(corneringController.forces[2]).toBeGreaterThan(straightController.forces[2]);
  });

  it('boosts AWD engine force during high-angle drifts to maintain speed and momentum', () => {
    const straightController = createMockController();
    applyDrivetrain(
      straightController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0, steering: 0 },
      15,
      2,
      0 // No slip
    );

    const driftingController = createMockController();
    applyDrivetrain(
      driftingController,
      DEFAULT_VEHICLE_CONFIG,
      { throttle: 1, brake: 0, steering: 0 },
      15,
      2,
      Math.PI / 6 // 30 degrees slip angle
    );

    // Forces during high slip drift should be significantly boosted to retain kinetic energy
    expect(driftingController.forces[0]).toBeGreaterThan(straightController.forces[0]);
    expect(driftingController.forces[2]).toBeGreaterThan(straightController.forces[2]);
  });

  describe('applyAwdDriftPropulsion', () => {
    it('applies directional tractive impulse along forward vector when power-sliding under throttle', () => {
      const appliedImpulses: { x: number; y: number; z: number }[] = [];
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn((impulse: { x: number; y: number; z: number }) => {
          appliedImpulses.push({ ...impulse });
        }),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0.5 },
        forwardVec,
        50, // 50 km/h in 2nd gear
        Math.PI / 6, // 30 deg slip
        1.0,
        0.016,
        2 // 2nd gear
      );

      expect(mockBody.applyImpulse).toHaveBeenCalled();
      expect(appliedImpulses.length).toBe(1);
      expect(appliedImpulses[0].z).toBeGreaterThan(0);
    });

    it('does not apply drift propulsion when throttle is zero or slip angle is near zero', () => {
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn(),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      // Zero throttle
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 0, steering: 0 },
        forwardVec,
        60,
        Math.PI / 6,
        1.0,
        0.016,
        2
      );
      expect(mockBody.applyImpulse).not.toHaveBeenCalled();

      // Zero slip
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0 },
        forwardVec,
        60,
        0,
        1.0,
        0.016,
        2
      );
      expect(mockBody.applyImpulse).not.toHaveBeenCalled();
    });

    it('applies pure forward tractive impulse along vehicle heading without artificial sideways shove', () => {
      const appliedImpulses: { x: number; y: number; z: number }[] = [];
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn((impulse: { x: number; y: number; z: number }) => {
          appliedImpulses.push({ ...impulse });
        }),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      const rightVec = new Vector3(1, 0, 0);
      const steerAngle = -Math.PI / 6; // -30 deg countersteer
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: -1.0 },
        forwardVec,
        50,
        Math.PI / 6,
        1.0,
        0.016,
        2,
        rightVec,
        steerAngle
      );

      expect(mockBody.applyImpulse).toHaveBeenCalled();
      expect(appliedImpulses.length).toBe(1);
      // Forward thrust present
      expect(appliedImpulses[0].z).toBeGreaterThan(0);
      // Zero lateral push: ensures vehicle drifts naturally without external sideways shoving
      expect(appliedImpulses[0].x).toBe(0);
    });

    it('vectors front tractive pull through steered wheels when driftSteeredPullRatio is configured', () => {
      const appliedImpulses: { x: number; y: number; z: number }[] = [];
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn((impulse: { x: number; y: number; z: number }) => {
          appliedImpulses.push({ ...impulse });
        }),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      const rightVec = new Vector3(1, 0, 0);
      const steerAngle = -Math.PI / 6; // -30 deg countersteer
      const steeredBalance = {
        ...DRIVING_MODEL_BALANCE,
        drivetrain: {
          ...DRIVING_MODEL_BALANCE.drivetrain,
          driftSteeredPullRatio: 0.45,
        },
      };

      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: -1.0 },
        forwardVec,
        50,
        Math.PI / 6,
        1.0,
        0.016,
        2,
        rightVec,
        steerAngle,
        steeredBalance
      );

      expect(mockBody.applyImpulse).toHaveBeenCalled();
      expect(appliedImpulses.length).toBe(1);
      expect(appliedImpulses[0].z).toBeGreaterThan(0);
      // Steered pull vectors negative X (towards countersteer direction)
      expect(appliedImpulses[0].x).toBeLessThan(0);
    });

    it('governs drift propulsion around target equilibrium speed (75 km/h) allowing realistic high-speed speed bleed', () => {
      const slowBody = { mass: () => 150, applyImpulse: vi.fn() } as unknown as RapierRigidBody;
      const forwardVec = new Vector3(0, 0, 1);

      // At 60 km/h (below 75 km/h target): full AWD propulsion is delivered to sustain drift
      applyAwdDriftPropulsion(
        slowBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0.5 },
        forwardVec,
        60,
        Math.PI / 6,
        1.0,
        0.016,
        2
      );
      expect(slowBody.applyImpulse).toHaveBeenCalled();

      // At 100 km/h (above 95 km/h cutoff): propulsion drops to 0 to let tire scrub realistically bleed speed
      const fastBody = { mass: () => 150, applyImpulse: vi.fn() } as unknown as RapierRigidBody;
      applyAwdDriftPropulsion(
        fastBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0.5 },
        forwardVec,
        100,
        Math.PI / 6,
        1.0,
        0.016,
        2
      );
      expect(fastBody.applyImpulse).not.toHaveBeenCalled();
    });

    it('cuts engine force when hitting mechanical gear speed limits (rev limiter)', () => {
      const controllerUnderLimit = createMockController();
      applyDrivetrain(
        controllerUnderLimit,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        10, // ~36 km/h in 1st gear
        1,
        0,
        36
      );
      expect(controllerUnderLimit.forces[0]).toBeGreaterThan(0);

      const controllerOverLimit = createMockController();
      applyDrivetrain(
        controllerOverLimit,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        15, // ~54 km/h in 1st gear (exceeds 52 km/h limit)
        1,
        0,
        54
      );
      // Rev limiter cuts engine force to 0 in straight-line driving without slip
      expect(controllerOverLimit.forces[0]).toBe(0);
      expect(controllerOverLimit.forces[2]).toBe(0);
    });

    it('preserves an 85% engine force floor during active drift slides even when exceeding nominal gear speed', () => {
      const driftingOverLimitController = createMockController();
      applyDrivetrain(
        driftingOverLimitController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        16, // ~58 km/h in 1st gear (exceeds 52 km/h limit)
        1,
        Math.PI / 6, // 30 degrees slip angle (active drift)
        58
      );

      // In a slide under full throttle, engine maintains robust torque to keep wheels spinning
      expect(driftingOverLimitController.forces[0]).toBeGreaterThan(0);
      expect(driftingOverLimitController.forces[2]).toBeGreaterThan(0);
    });

    it('maintains continuous AWD drift propulsion across mid-to-high speeds without premature cut-off', () => {
      const appliedImpulses: { x: number; y: number; z: number }[] = [];
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn((impulse: { x: number; y: number; z: number }) => {
          appliedImpulses.push({ ...impulse });
        }),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      // Drifting at 90 km/h in 2nd gear (near 95 km/h redline)
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0.5 },
        forwardVec,
        90,
        Math.PI / 6,
        1.0,
        0.016,
        2
      );

      expect(mockBody.applyImpulse).toHaveBeenCalled();
      expect(appliedImpulses[0].z).toBeGreaterThan(0);
    });

    it('suppresses AWD body drift propulsion when handbrake is engaged', () => {
      const mockBody = {
        mass: () => 150,
        applyImpulse: vi.fn(),
      } as unknown as RapierRigidBody;

      const forwardVec = new Vector3(0, 0, 1);
      applyAwdDriftPropulsion(
        mockBody,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, steering: 0.5, handbrake: true },
        forwardVec,
        60,
        Math.PI / 6,
        1.0,
        0.016,
        2
      );

      expect(mockBody.applyImpulse).not.toHaveBeenCalled();
    });

    it('cuts engine force to 0 on rear wheels while powering front wheels when handbrake is engaged with throttle', () => {
      const controller = createMockController();
      applyDrivetrain(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0, handbrake: true },
        10,
        1
      );

      // Front wheels (0, 1) receive full front pull
      expect(controller.forces[0]).toBeGreaterThan(0);
      expect(controller.forces[1]).toBeGreaterThan(0);
      // Rear wheels (2, 3) receive EXACTLY 0 engine force so handbrake is not overpowered
      expect(controller.forces[2]).toBe(0);
      expect(controller.forces[3]).toBe(0);
    });

    it('modulates and cuts throttle power when TCS is enabled under heavy slip', () => {
      const controllerTcsOn = createMockController();
      const resultTcsOn = applyDrivetrain(
        controllerTcsOn,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        20,
        2,
        Math.PI / 3, // ~60 degrees slip angle (high wheel slip)
        70,
        1.0,
        undefined,
        { tcsEnabled: true }
      );

      expect(resultTcsOn.tcsActive).toBe(true);

      const controllerTcsOff = createMockController();
      const resultTcsOff = applyDrivetrain(
        controllerTcsOff,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        20,
        2,
        Math.PI / 3,
        70,
        1.0,
        undefined,
        { tcsEnabled: false }
      );

      expect(resultTcsOff.tcsActive).toBe(false);
      // Engine force with TCS active must be lower than with TCS disabled (power cut to regain traction)
      expect(controllerTcsOn.forces[0]).toBeLessThan(controllerTcsOff.forces[0]);
    });

    it('preserves rally momentum on loose surfaces (snow, gravel) by moderating TCS cut', () => {
      const tarmacController = createMockController();
      applyDrivetrain(
        tarmacController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        20,
        2,
        Math.PI / 4, // 45 degrees slide
        60,
        1.0,
        undefined,
        { tcsEnabled: true },
        'tarmac',
      );

      const snowController = createMockController();
      applyDrivetrain(
        snowController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        20,
        2,
        Math.PI / 4,
        60,
        1.0,
        undefined,
        { tcsEnabled: true },
        'snow',
      );

      // Snow TCS keeps at least 85% power, while tarmac TCS cuts down to 35%
      expect(snowController.forces[0]).toBeGreaterThan(tarmacController.forces[0] * 1.5);
    });

    it('unleashes 100% full launch torque when TCS is disabled from standing start', () => {
      const controllerTcsOn = createMockController();
      applyDrivetrain(
        controllerTcsOn,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        0, // 0 km/h dead stop
        1,
        0,
        0,
        1.0,
        undefined,
        { tcsEnabled: true }
      );

      const controllerTcsOff = createMockController();
      applyDrivetrain(
        controllerTcsOff,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        0,
        1,
        0,
        0,
        1.0,
        undefined,
        { tcsEnabled: false }
      );

      // With TCS OFF, full unattenuated 100% torque is delivered at launch (burnout)
      expect(controllerTcsOff.forces[0]).toBeGreaterThan(controllerTcsOn.forces[0]);
    });
  });

  describe('DCCD Active Torque Split & Rear Spool Lock', () => {
    it('modulates torque distribution to front wheels (up to 48%) when entering a throttle drift to pull car forward', () => {
      const straightController = createMockController();
      // Straight-line driving (slip = 0)
      const resStraight = applyDrivetrain(
        straightController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        15,
        2,
        0, // No slip
        54,
        1.0,
      );

      const driftController = createMockController();
      // Drift power slide (slip = 0.40 rad)
      const resDrift = applyDrivetrain(
        driftController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        15,
        2,
        0.40, // High slip
        54,
        1.0,
      );

      // In straight-line, front bias is 35%. In drift, front bias increases towards 48% to pull car out of the turn
      const straightFrontRatio = straightController.forces[0] / (straightController.forces[0] + straightController.forces[2]);
      const driftFrontRatio = driftController.forces[0] / (driftController.forces[0] + driftController.forces[2]);

      expect(driftFrontRatio).toBeGreaterThan(straightFrontRatio);
      expect(resDrift.nextDriftIntensity).toBeGreaterThan(resStraight.nextDriftIntensity);
    });

    it('smoothly decays drift intensity over time via hold buffer when exiting slide', () => {
      const controller = createMockController();
      // Previous frame had high filtered drift intensity = 0.90, but slip dropped to 0
      const res = applyDrivetrain(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0 },
        15,
        2,
        0, // Slip stopped
        54,
        1.0,
        undefined,
        undefined,
        undefined,
        0.90, // filteredDriftIntensity
        0.016, // dt
      );

      // Decays progressively rather than dropping immediately to 0
      expect(res.nextDriftIntensity).toBeLessThan(0.90);
      expect(res.nextDriftIntensity).toBeGreaterThan(0.70);
    });

    it('delivers authentic Group B torque surge under lateral slip while keeping straight line torque calibrated', () => {
      const straightController = createMockController();
      applyDrivetrain(
        straightController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0, steering: 0 },
        15,
        2,
        0, // Straight line (0 slip)
        54
      );

      const driftController = createMockController();
      applyDrivetrain(
        driftController,
        DEFAULT_VEHICLE_CONFIG,
        { throttle: 1, brake: 0, steering: 0.8 },
        15,
        2,
        0.45, // Active drift (approx 26 deg slip)
        54
      );

      // Total wheel force during slide is significantly elevated to overcome tire scrub drag
      const straightTotalForce = straightController.forces.reduce((a, b) => a + b, 0);
      const driftTotalForce = driftController.forces.reduce((a, b) => a + b, 0);

      expect(driftTotalForce).toBeGreaterThan(straightTotalForce * 1.5);
    });
  });
});
