import { describe, it, expect, vi } from 'vitest';
import { getSurfaceAtPosition, getInterpolatedSteeringAngle, applyTireFrictionAndBrakes, calculateTireSurfaceGripMultiplier, DRIFT_MAX_STEER_LOCK } from '../tires';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import type { IRapierVehicleController } from '@/types/vehicle';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';

describe('tire and surface physics', () => {
  const mockLevel: LevelData = {
    id: 'level1_island',
    name: 'Island Level',
    terrainBase: {
      width: 300,
      depth: 300,
      subdivisions: 2,
      amplitude: 10,
      frequency: 0.01,
      octaves: 2,
      lacunarity: 2,
      persistence: 0.5,
      seed: 1,
    },
    track: { points: [], width: 10, falloff: 2, targetHeight: 5 },
    heightModifiers: [],
    props: [],
  };

  describe('getSurfaceAtPosition', () => {
    const mockHeightmap: HeightmapData = {
      heights: new Float32Array(9),
      trackMasks: new Float32Array([0, 0, 0, 0, 0.8, 0, 0, 0, 0]),
      cols: 3,
      rows: 3,
      minHeight: 0,
      maxHeight: 10,
    };

    const mockDesertLevel: LevelData = {
      ...mockLevel,
      id: 'level2_desert_canyon',
      name: 'Desert Canyon',
    };

    const mockSwedenLevel: LevelData = {
      ...mockLevel,
      id: 'level3_sweden_snow',
      name: 'Sweden Snow Rally',
    };

    it('returns sand when off track and elevation is below sand threshold', () => {
      expect(getSurfaceAtPosition(-140, -6, -140, mockHeightmap, mockLevel)).toBe('sand');
    });

    it('prioritizes track surface (mud) over low elevation when on track', () => {
      // Center of terrain (0, -6, 0) is on track (mask = 0.8) even at low elevation
      const surface = getSurfaceAtPosition(0, -6, 0, mockHeightmap, mockLevel);
      expect(surface).toBe('mud');
    });

    it('returns mud when position is on track with high mask', () => {
      // Center of terrain (0, 5, 0) maps to center of trackMasks (index 4)
      const surface = getSurfaceAtPosition(0, 5, 0, mockHeightmap, mockLevel);
      expect(surface).toBe('mud');
    });

    it('returns gravel when on track on a desert map', () => {
      const surface = getSurfaceAtPosition(0, 5, 0, mockHeightmap, mockDesertLevel);
      expect(surface).toBe('gravel');
    });

    it('returns sand when off track on a desert map', () => {
      const surface = getSurfaceAtPosition(-140, 15, -140, mockHeightmap, mockDesertLevel);
      expect(surface).toBe('sand');
    });

    it('returns snow when on track on a Sweden snow map', () => {
      const surface = getSurfaceAtPosition(0, 5, 0, mockHeightmap, mockSwedenLevel);
      expect(surface).toBe('snow');
    });

    it('returns snow when off track on a Sweden snow map', () => {
      const surface = getSurfaceAtPosition(-140, 15, -140, mockHeightmap, mockSwedenLevel);
      expect(surface).toBe('snow');
    });

    it('returns grass when off the track at normal elevation on island', () => {
      expect(getSurfaceAtPosition(-140, 5, -140, mockHeightmap, mockLevel)).toBe('grass');
    });
  });

  describe('getInterpolatedSteeringAngle', () => {
    const curve: readonly [number, number][] = [
      [0, Math.PI / 4],   // 45 deg at 0 km/h
      [100, Math.PI / 8], // 22.5 deg at 100 km/h
    ];

    it('clamps to max angle at 0 km/h or below', () => {
      expect(getInterpolatedSteeringAngle(0, curve)).toBeCloseTo(Math.PI / 4);
      expect(getInterpolatedSteeringAngle(-10, curve)).toBeCloseTo(Math.PI / 4);
    });

    it('clamps to min angle at high speed', () => {
      expect(getInterpolatedSteeringAngle(150, curve)).toBeCloseTo(Math.PI / 8);
    });

    it('interpolates smoothly between speed points', () => {
      const midAngle = getInterpolatedSteeringAngle(50, curve);
      expect(midAngle).toBeCloseTo((Math.PI / 4 + Math.PI / 8) / 2);
    });
  });

  describe('applyTireFrictionAndBrakes', () => {
    const createMockController = (): IRapierVehicleController & {
      frictions: number[];
      brakes: number[];
      steerings: number[];
    } => {
      const frictions: number[] = [0, 0, 0, 0];
      const brakes: number[] = [0, 0, 0, 0];
      const steerings: number[] = [0, 0, 0, 0];

      return {
        frictions,
        brakes,
        steerings,
        setWheelFrictionSlip: vi.fn((i, f) => {
          frictions[i] = f;
        }),
        setWheelBrake: vi.fn((i, b) => {
          brakes[i] = b;
        }),
        setWheelSteering: vi.fn((i, s) => {
          steerings[i] = s;
        }),
        setWheelEngineForce: vi.fn(),
        wheelSuspensionLength: vi.fn(),
        wheelChassisConnectionPointCs: vi.fn(),
        wheelSteering: vi.fn(),
      };
    };

    it('applies friction and brakes to all wheels', () => {
      const controller = createMockController();
      const result = applyTireFrictionAndBrakes(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 1, handbrake: false, steering: 0, throttle: 0 },
        50,
        13.8,
        0,
        5,
        0,
        0
      );

      expect(result.grips).toHaveLength(4);
      expect(controller.frictions[0]).toBeGreaterThan(0);
      expect(controller.brakes[0]).toBeGreaterThan(0);
      expect(controller.brakes[1]).toBeGreaterThan(0);
      expect(controller.brakes[2]).toBeGreaterThan(0);
      expect(controller.brakes[3]).toBeGreaterThan(0);
    });

    it('increases rear braking and reduces rear grip during handbrake', () => {
      const controller = createMockController();
      const result = applyTireFrictionAndBrakes(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: true, steering: 0, throttle: 0 },
        50,
        13.8,
        0,
        5,
        0,
        0
      );

      // Handbrake only locks rear wheels (index 2, 3) with robust mechanical lockup impulse
      expect(controller.brakes[0]).toBe(0);
      expect(controller.brakes[1]).toBe(0);
      expect(controller.brakes[2]).toBeGreaterThanOrEqual(160);
      expect(controller.brakes[3]).toBeGreaterThanOrEqual(160);
      // Rear grip reduced for drifting
      expect(result.grips[2]).toBeLessThan(result.grips[0]);
    });

    it('reduces all powered wheel grips synchronously on loose surfaces when throttle is applied (AWD power slide)', () => {
      const controllerWithoutThrottle = createMockController();
      const resultNoThrottle = applyTireFrictionAndBrakes(
        controllerWithoutThrottle,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        -7, // Y < -5.0 -> coastal sand surface
        0,
        0
      );
      const noThrottleGrips = [...resultNoThrottle.grips];

      const controllerWithThrottle = createMockController();
      const resultWithThrottle = applyTireFrictionAndBrakes(
        controllerWithThrottle,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1 },
        40,
        11.1,
        0,
        -7, // Y < -5.0 -> coastal sand surface
        0,
        0
      );

      expect(resultNoThrottle.surface).toBe('sand');
      expect(resultWithThrottle.surface).toBe('sand');
      // In AWD mode, all 4 driven wheels (0, 1, 2, 3) should experience synchronized grip reduction under full throttle
      expect(resultWithThrottle.grips[0]).toBeLessThan(noThrottleGrips[0]);
      expect(resultWithThrottle.grips[1]).toBeLessThan(noThrottleGrips[1]);
      expect(resultWithThrottle.grips[2]).toBeLessThan(noThrottleGrips[2]);
      expect(resultWithThrottle.grips[3]).toBeLessThan(noThrottleGrips[3]);
    });

    it('recovers front wheel grip when driver countersteers during a lateral drift', () => {
      const controllerOversteer = createMockController();
      // Sliding right (slipAngle = 0.5 rad) and steering into slide (+1.0)
      const resultIntoSlide = applyTireFrictionAndBrakes(
        controllerOversteer,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 1.0, throttle: 0 },
        50,
        13.8,
        0,
        5,
        0,
        0.5 // +0.5 rad sliding right
      );
      const intoSlideGrips = [...resultIntoSlide.grips];

      const controllerCountersteer = createMockController();
      // Sliding right (slipAngle = 0.5 rad) and countersteering right (-1.0)
      const resultCountersteer = applyTireFrictionAndBrakes(
        controllerCountersteer,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: -1.0, throttle: 0 },
        50,
        13.8,
        0,
        5,
        0,
        0.5 // +0.5 rad sliding right
      );

      // Countersteering aligns front wheels with velocity vector, maintaining high front tire grip
      expect(resultCountersteer.grips[0]).toBeGreaterThan(intoSlideGrips[0]);
      expect(resultCountersteer.grips[1]).toBeGreaterThan(intoSlideGrips[1]);
    });

    it('induces power oversteer by reducing rear grip more than front grip under throttle on loose surfaces', () => {
      const controller = createMockController();
      const result = applyTireFrictionAndBrakes(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        40,
        11.1,
        0,
        -7, // Sand
        0,
        0
      );

      // Front grip should remain significantly higher than rear grip under throttle for AWD directional stability
      expect(result.grips[0]).toBeGreaterThan(result.grips[2]);
      expect(result.grips[1]).toBeGreaterThan(result.grips[3]);
    });

    it('delivers responsive gymkhana asphalt grip on tarmac with controlled throttle traction modulation', () => {
      const controller = createMockController();
      const mockGymkhanaLevel: LevelData = {
        ...mockLevel,
        id: 'gymkhana_arena',
        name: 'Gymkhana Arena',
      };
      const result = applyTireFrictionAndBrakes(
        controller,
        {
          ...DEFAULT_VEHICLE_CONFIG,
        },
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        50,
        13.8,
        0,
        5, // Tarmac / elevated
        0,
        0,
        undefined,
        mockGymkhanaLevel,
      );

      // On tarmac, asphalt provides responsive front directional authority while allowing controlled rear breakaway
      expect(result.grips[0]).toBeGreaterThan(1.5);
      expect(result.grips[2]).toBeGreaterThan(1.4);
      expect(result.grips[0]).toBeGreaterThan(result.grips[2]);
    });

    it('smoothly reduces tire friction when slip angle exceeds peak slip angle', () => {
      const controllerZeroSlip = createMockController();
      const resultZeroSlip = applyTireFrictionAndBrakes(
        controllerZeroSlip,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        50,
        13.8,
        0,
        -7, // Sand
        0,
        0 // Zero slip
      );
      const zeroSlipGrip = resultZeroSlip.grips[2];

      const controllerHighSlip = createMockController();
      const resultHighSlip = applyTireFrictionAndBrakes(
        controllerHighSlip,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        50,
        13.8,
        0,
        -7, // Sand
        0,
        0.5 // High slip angle > peak
      );
      const highSlipGrip = resultHighSlip.grips[2];

      // Sliding tire has lower friction than gripped tire
      expect(highSlipGrip).toBeLessThan(zeroSlipGrip);
      expect(highSlipGrip).toBeGreaterThan(0.5);
    });

    it('reduces sliding friction under throttle during an active power slide to prevent bogging down', () => {
      const controllerCoasting = createMockController();
      const resultCoasting = applyTireFrictionAndBrakes(
        controllerCoasting,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        50,
        13.8,
        0,
        5, // Tarmac
        0,
        0.35 // Slide angle ~20 deg
      );

      const coastingGrips = [...resultCoasting.grips];

      const controllerPowerSlide = createMockController();
      const resultPowerSlide = applyTireFrictionAndBrakes(
        controllerPowerSlide,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        50,
        13.8,
        0,
        5, // Tarmac
        0,
        0.35 // Slide angle ~20 deg
      );

      // Under throttle in a slide, rear tire friction drops smoothly to sustain momentum without bogging down
      expect(resultPowerSlide.grips[2]).toBeLessThan(coastingGrips[2]);
      // Front wheels maintain directional authority
      expect(resultPowerSlide.grips[0]).toBeGreaterThan(resultPowerSlide.grips[2]);
    });

    it('expands countersteer lock up to DRIFT_MAX_STEER_LOCK during high slip angle power slides', () => {
      const controllerStraight = createMockController();
      // Driving at 80 km/h in straight line: steering limit is base steering curve (~26 deg)
      const resultStraight = applyTireFrictionAndBrakes(
        controllerStraight,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: -1.0, throttle: 1.0 },
        80,
        22.2,
        0,
        5,
        0,
        0 // No slip
      );

      const controllerDrift = createMockController();
      // Driving at 80 km/h in deep slide (slipAngle = 0.4 rad): countersteering expands lock
      const resultDrift = applyTireFrictionAndBrakes(
        controllerDrift,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: -1.0, throttle: 1.0 },
        80,
        22.2,
        0,
        5,
        0,
        0.4 // 0.4 rad (~23 deg) slide to right
      );

      // Countersteer lock should be significantly deeper than straight-line high-speed lock
      expect(Math.abs(resultDrift.steerAngle)).toBeGreaterThan(Math.abs(resultStraight.steerAngle));
      expect(Math.abs(resultDrift.steerAngle)).toBeCloseTo(DRIFT_MAX_STEER_LOCK, 1);
    });

    it('maintains direct driver steering authority without autonomous wheel steering when steering is neutral', () => {
      const controller = createMockController();
      // Sliding to the right (slipAngle = +0.3 rad) with neutral steering (steering = 0)
      const result = applyTireFrictionAndBrakes(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        60,
        16.6,
        0,
        5,
        0,
        0.3 // +0.3 rad slip
      );

      // Front wheel steer angle must strictly remain 0 when driver input is 0 (no autonomous caster intervention)
      expect(result.steerAngle).toBe(0);
    });

    it('modulates brake force and maintains steering authority when ABS is enabled during panic braking', () => {
      const controller = createMockController();
      const result = applyTireFrictionAndBrakes(
        controller,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 1.0, handbrake: false, steering: 1.0, throttle: 0 },
        60,
        16.6,
        0,
        5, // Tarmac
        0,
        0,
        undefined,
        undefined,
        undefined,
        { absEnabled: true }
      );

      // ABS should be active
      expect(result.absActive).toBe(true);
      // Steering angle maintains full authority
      expect(Math.abs(result.steerAngle)).toBeGreaterThan(0.2);
      // Brake calls should be modulated (~82% threshold) rather than raw full 100%
      expect(controller.setWheelBrake).toHaveBeenCalled();
    });

    it('locks wheels and degrades steering authority to 25% when ABS is disabled during panic braking', () => {
      const controllerAbsOff = createMockController();
      const resultAbsOff = applyTireFrictionAndBrakes(
        controllerAbsOff,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 1.0, handbrake: false, steering: 1.0, throttle: 0 },
        60,
        16.6,
        0,
        5, // Tarmac
        0,
        0,
        undefined,
        undefined,
        undefined,
        { absEnabled: false }
      );

      // ABS should not be active
      expect(resultAbsOff.absActive).toBe(false);
      const absOffGrips = [...resultAbsOff.grips];

      const controllerAbsOn = createMockController();
      const resultAbsOn = applyTireFrictionAndBrakes(
        controllerAbsOn,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 1.0, handbrake: false, steering: 1.0, throttle: 0 },
        60,
        16.6,
        0,
        5,
        0,
        0,
        undefined,
        undefined,
        undefined,
        { absEnabled: true }
      );

      // Without ABS, steering authority under lockup drops to 25% of ABS-on steering authority
      expect(Math.abs(resultAbsOff.steerAngle)).toBeLessThan(Math.abs(resultAbsOn.steerAngle) * 0.3);
      // Sliding friction under locked wheels is lower than modulated ABS friction
      expect(absOffGrips[0]).toBeLessThan(resultAbsOn.grips[0]);
    });

    it('reduces driven tire friction due to burnout wheelspin when TCS is disabled under heavy throttle', () => {
      const controllerTcsOff = createMockController();
      const resultTcsOff = applyTireFrictionAndBrakes(
        controllerTcsOff,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        20,
        5.5,
        0,
        5,
        0,
        0,
        undefined,
        undefined,
        undefined,
        { tcsEnabled: false }
      );
      const tcsOffGrips = [...resultTcsOff.grips];

      const controllerTcsOn = createMockController();
      const resultTcsOn = applyTireFrictionAndBrakes(
        controllerTcsOn,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 1.0 },
        20,
        5.5,
        0,
        5,
        0,
        0,
        undefined,
        undefined,
        undefined,
        { tcsEnabled: true }
      );

      expect(tcsOffGrips[0]).toBeLessThan(resultTcsOn.grips[0]);
    });

    it('continuously reduces grip on loose sand while moving even with zero throttle (continuous granular shear)', () => {
      const controllerStationary = createMockController();
      const resultStationary = applyTireFrictionAndBrakes(
        controllerStationary,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        0,
        0,
        0,
        -7, // Sand
        0,
        0
      );

      const stationaryGrips = [...resultStationary.grips];

      const controllerMoving = createMockController();
      const resultMoving = applyTireFrictionAndBrakes(
        controllerMoving,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        -7, // Sand
        0,
        0
      );
      const movingGrips = [...resultMoving.grips];

      // On sand, moving over granular terrain continuously shears the ground, reducing grip even without throttle
      expect(movingGrips[0]).toBeLessThan(stationaryGrips[0]);
      expect(movingGrips[2]).toBeLessThan(stationaryGrips[2]);
      // Sand grip must remain loose and under 1.2 (never glued like asphalt)
      expect(movingGrips[0]).toBeLessThan(1.2);
      expect(movingGrips[2]).toBeLessThan(1.2);
    });

    it('smoothly transitions lateral grip along an analog curve without binary step artifacts', () => {
      const angles = [0, 0.15, 0.30, 0.45, 0.60];
      const grips: number[] = [];

      for (const slip of angles) {
        const ctrl = createMockController();
        const res = applyTireFrictionAndBrakes(
          ctrl,
          DEFAULT_VEHICLE_CONFIG,
          { brake: 0, handbrake: false, steering: 0, throttle: 0 },
          40,
          11.1,
          0,
          -7, // Sand
          0,
          slip
        );
        grips.push(res.grips[2]);
      }

      // Grip should smoothly decrease or remain non-increasing as slip angle deepens
      for (let i = 1; i < grips.length; i++) {
        expect(grips[i]).toBeLessThanOrEqual(grips[i - 1]);
      }

      // The transition from small slip to deep slide must be progressive (no sudden single-step cliff drop)
      const maxSingleStepDrop = Math.max(
        grips[0] - grips[1],
        grips[1] - grips[2],
        grips[2] - grips[3],
        grips[3] - grips[4]
      );
      expect(maxSingleStepDrop).toBeLessThan(0.20);
    });

    it('orders surface traction realistically across tarmac, gravel, and sand', () => {
      const mockGymkhanaLevel: LevelData = {
        ...mockLevel,
        id: 'gymkhana_arena',
        name: 'Gymkhana Arena',
      };

      const ctrlTarmac = createMockController();
      const resTarmac = applyTireFrictionAndBrakes(
        ctrlTarmac,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        10, // Gymkhana elevated plateau = tarmac
        0,
        0,
        undefined,
        mockGymkhanaLevel
      );
      const tarmacGrips = [...resTarmac.grips];

      const ctrlSand = createMockController();
      const resSand = applyTireFrictionAndBrakes(
        ctrlSand,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        -7, // Sand
        0,
        0
      );
      const sandGrips = [...resSand.grips];

      // Tarmac has full grip (> 2.0), while sand is loose and floating (< 1.2)
      expect(tarmacGrips[0]).toBeGreaterThan(2.0);
      expect(sandGrips[0]).toBeLessThan(1.2);
      expect(tarmacGrips[0]).toBeGreaterThan(sandGrips[0]);
    });

    it('applies tire compound multipliers across asphalt, gravel, and snow compounds', () => {
      const mockGymkhanaLevel: LevelData = {
        ...mockLevel,
        id: 'gymkhana_arena',
        name: 'Gymkhana Arena',
      };

      // 1. On Tarmac (Gymkhana): Asphalt tires should have highest grip
      const ctrlAsphaltTarmac = createMockController();
      const resAsphaltTarmac = applyTireFrictionAndBrakes(
        ctrlAsphaltTarmac,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        10, // Tarmac
        0,
        0,
        undefined,
        mockGymkhanaLevel,
        undefined,
        undefined,
        'asphalt',
      );
      const asphaltTarmacGrip = resAsphaltTarmac.grips[0];

      const ctrlGravelTarmac = createMockController();
      const resGravelTarmac = applyTireFrictionAndBrakes(
        ctrlGravelTarmac,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        10, // Tarmac
        0,
        0,
        undefined,
        mockGymkhanaLevel,
        undefined,
        undefined,
        'gravel',
      );
      const gravelTarmacGrip = resGravelTarmac.grips[0];

      const ctrlSnowTarmac = createMockController();
      const resSnowTarmac = applyTireFrictionAndBrakes(
        ctrlSnowTarmac,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        10, // Tarmac
        0,
        0,
        undefined,
        mockGymkhanaLevel,
        undefined,
        undefined,
        'snow',
      );
      const snowTarmacGrip = resSnowTarmac.grips[0];

      // On Tarmac: Asphalt > Gravel > Snow
      expect(asphaltTarmacGrip).toBeGreaterThan(gravelTarmacGrip);
      expect(gravelTarmacGrip).toBeGreaterThan(snowTarmacGrip);

      // 2. On Sand/Loose ground: Gravel compound should outperform Asphalt
      const ctrlAsphaltSand = createMockController();
      const resAsphaltSand = applyTireFrictionAndBrakes(
        ctrlAsphaltSand,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        -7, // Sand
        0,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        'asphalt',
      );
      const asphaltSandGrip = resAsphaltSand.grips[0];

      const ctrlGravelSand = createMockController();
      const resGravelSand = applyTireFrictionAndBrakes(
        ctrlGravelSand,
        DEFAULT_VEHICLE_CONFIG,
        { brake: 0, handbrake: false, steering: 0, throttle: 0 },
        40,
        11.1,
        0,
        -7, // Sand
        0,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        'gravel',
      );
      const gravelSandGrip = resGravelSand.grips[0];

      expect(gravelSandGrip).toBeGreaterThan(asphaltSandGrip);

      // 3. Helper function calculateTireSurfaceGripMultiplier
      expect(calculateTireSurfaceGripMultiplier('asphalt', 'tarmac')).toBe(1.0);
      expect(calculateTireSurfaceGripMultiplier('gravel', 'gravel')).toBe(1.25);
      expect(calculateTireSurfaceGripMultiplier('snow', 'snow')).toBe(1.40);
    });
  });
});

