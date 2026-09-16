import { describe, it, expect } from 'vitest';
import { validateVehicleConfig } from '@/utils/validation/vehicleValidator';
import { validateLevelData } from '@/utils/validation/levelValidator';
import { validateSurfaceDefinition } from '@/utils/validation/surfaceValidator';
import { validateDrivingModelBalance } from '@/utils/validation/physicsBalanceValidator';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { LEVEL1_DATA } from '@/config/level1';
import { SURFACE_REGISTRY } from '@/config/surfaceRegistry';
import { DRIVING_MODEL_BALANCE, type DrivingModelBalance } from '@/config/physicsBalance';

describe('Runtime Validators', () => {
  describe('validateVehicleConfig', () => {
    it('passes on valid vehicle config', () => {
      const res = validateVehicleConfig(DEFAULT_VEHICLE_CONFIG);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('catches invalid chassis mass and negative dimensions', () => {
      const badConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        chassisMass: -10,
        chassisSize: [0, -1, 4] as [number, number, number],
      };
      const res = validateVehicleConfig(badConfig);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('chassisMass'))).toBe(true);
      expect(res.errors.some((e) => e.includes('chassisSize'))).toBe(true);
    });

    it('catches incorrect wheel count', () => {
      const badWheelsConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        wheels: [DEFAULT_VEHICLE_CONFIG.wheels[0], DEFAULT_VEHICLE_CONFIG.wheels[1]],
      };
      // @ts-expect-error test runtime rejection of invalid wheel count
      const res = validateVehicleConfig(badWheelsConfig);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('wheels count'))).toBe(true);
    });

    it('catches non-monotonic steering curve', () => {
      const badCurveConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        handling: {
          ...DEFAULT_VEHICLE_CONFIG.handling,
          steeringCurve: [
            [100, 0.2],
            [50, 0.4],
          ] as readonly [number, number][],
        },
      };
      const res = validateVehicleConfig(badCurveConfig);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('sorted strictly ascending'))).toBe(true);
    });

    it('catches invalid weightDistribution parameters', () => {
      const badWeightConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        weightDistribution: {
          frontBias: 1.5, // > 1.0 invalid
          engineOffsetZ: NaN,
          centerOfMassZ: NaN,
        },
      };
      const res = validateVehicleConfig(badWeightConfig);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('weightDistribution.frontBias'))).toBe(true);
      expect(res.errors.some((e) => e.includes('weightDistribution.engineOffsetZ'))).toBe(true);
      expect(res.errors.some((e) => e.includes('weightDistribution.centerOfMassZ'))).toBe(true);
    });
  });

  describe('validateLevelData', () => {
    it('passes on valid LevelData', () => {
      const res = validateLevelData(LEVEL1_DATA);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('catches invalid track points count', () => {
      const badTrackLevel = {
        ...LEVEL1_DATA,
        track: {
          ...LEVEL1_DATA.track,
          points: [{ x: 0, z: 0 }],
        },
      };
      const res = validateLevelData(badTrackLevel);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('at least 3 points'))).toBe(true);
    });
  });

  describe('validateSurfaceDefinition', () => {
    it('passes on valid surface definition', () => {
      const res = validateSurfaceDefinition(SURFACE_REGISTRY.mud);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('catches invalid grip values', () => {
      const badSurface = {
        ...SURFACE_REGISTRY.grass,
        tireModel: {
          front: { baseGrip: -1, peakSlipAngle: 0.3, slideGrip: 1.0 },
          rear: { baseGrip: 2.0, peakSlipAngle: 0.3, slideGrip: 1.0 },
        },
      };
      const res = validateSurfaceDefinition(badSurface);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('baseGrip must be > 0'))).toBe(true);
    });

    it('catches invalid rolling resistance and looseSurfaceTractionLoss', () => {
      const badPropsSurface = {
        ...SURFACE_REGISTRY.sand,
        rollingResistance: -0.05,
        looseSurfaceTractionLoss: 1.5,
      };
      const res = validateSurfaceDefinition(badPropsSurface);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('rollingResistance must be >= 0'))).toBe(true);
      expect(res.errors.some((e) => e.includes('looseSurfaceTractionLoss must be between [0, 1]'))).toBe(true);
    });
  });

  describe('validateDrivingModelBalance', () => {
    it('passes on default DRIVING_MODEL_BALANCE', () => {
      const res = validateDrivingModelBalance(DRIVING_MODEL_BALANCE);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects null or non-object balance profile', () => {
      const resNull = validateDrivingModelBalance(null as unknown as DrivingModelBalance);
      expect(resNull.valid).toBe(false);
      expect(resNull.errors.length).toBeGreaterThan(0);

      const resString = validateDrivingModelBalance('invalid' as unknown as DrivingModelBalance);
      expect(resString.valid).toBe(false);
    });

    it('catches invalid handbrake values and types', () => {
      const badBalance = {
        ...DRIVING_MODEL_BALANCE,
        handbrake: {
          ...DRIVING_MODEL_BALANCE.handbrake,
          minLockupBrakeForce: -10,
          rearLockupImpulseMultiplier: 0,
          frontSteerYieldMultiplier: 2.5,
          disableAwdPropulsion: 'yes',
        },
      };
      const res = validateDrivingModelBalance(badBalance as unknown as DrivingModelBalance);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('minLockupBrakeForce'))).toBe(true);
      expect(res.errors.some((e) => e.includes('rearLockupImpulseMultiplier'))).toBe(true);
      expect(res.errors.some((e) => e.includes('frontSteerYieldMultiplier'))).toBe(true);
      expect(res.errors.some((e) => e.includes('disableAwdPropulsion'))).toBe(true);
    });

    it('catches invalid suspension mass scales and NaNs', () => {
      const badBalance = {
        ...DRIVING_MODEL_BALANCE,
        suspension: {
          ...DRIVING_MODEL_BALANCE.suspension,
          antiRollBarMassScale: -0.1,
          pitchDampingMassScale: NaN,
          maxRestoringPitchTorqueG: 0,
        },
      };
      const res = validateDrivingModelBalance(badBalance);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('antiRollBarMassScale'))).toBe(true);
      expect(res.errors.some((e) => e.includes('pitchDampingMassScale'))).toBe(true);
      expect(res.errors.some((e) => e.includes('maxRestoringPitchTorqueG'))).toBe(true);
    });

    it('catches invalid drivetrain launch parameters', () => {
      const badBalance = {
        ...DRIVING_MODEL_BALANCE,
        drivetrain: {
          ...DRIVING_MODEL_BALANCE.drivetrain,
          launchRampBaseFraction: 1.5,
          launchRampEndSpeedMps: -2,
        },
      };
      const res = validateDrivingModelBalance(badBalance);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('launchRampBaseFraction'))).toBe(true);
      expect(res.errors.some((e) => e.includes('launchRampEndSpeedMps'))).toBe(true);
    });

    it('catches invalid assists deadzone and pitch damping', () => {
      const badBalance = {
        ...DRIVING_MODEL_BALANCE,
        assists: {
          ...DRIVING_MODEL_BALANCE.assists,
          steerAssistDeadzone: 0.5,
          pitchDampingThrottleUp: -1,
        },
      };
      const res = validateDrivingModelBalance(badBalance);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('steerAssistDeadzone'))).toBe(true);
      expect(res.errors.some((e) => e.includes('pitchDampingThrottleUp'))).toBe(true);
    });

    it('catches invalid tire friction drops and slip angles', () => {
      const badBalance = {
        ...DRIVING_MODEL_BALANCE,
        tires: {
          ...DRIVING_MODEL_BALANCE.tires,
          minPowerSlideSlipAngle: -0.1,
          wheelspinFrictionDropRear: 1.2,
        },
      };
      const res = validateDrivingModelBalance(badBalance);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('minPowerSlideSlipAngle'))).toBe(true);
      expect(res.errors.some((e) => e.includes('wheelspinFrictionDropRear'))).toBe(true);
    });
  });
});
