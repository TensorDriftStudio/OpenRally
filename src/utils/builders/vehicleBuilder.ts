import type {
  VehiclePreset,
  VehicleConfig,
  VehicleStats,
  VehicleCategory,
  WheelInfo,
} from '@/types/vehicle';
import type { Vector3Tuple } from 'three';
import { VEHICLE_MODEL_PATH } from '@/config/assets';

/**
 * Standard vehicle archetype names with pre-balanced physics and handling.
 */
export type VehicleArchetype = 'rally' | 'supercar' | 'offroad' | 'drift' | 'buggy';

/**
 * Helper to generate 4 symmetrically balanced wheels.
 * Eliminates coordinate inverted sign errors when creating new vehicles.
 *
 * @param wheelbase - Total length between front and rear axles (Z axis)
 * @param trackWidth - Total width between left and right wheels (X axis)
 * @param heightOffset - Vertical offset relative to chassis center (Y axis, usually negative e.g. -0.2)
 * @param frontOptions - Overrides for front wheels (FL, FR)
 * @param rearOptions - Overrides for rear wheels (RL, RR)
 */
export function createSymmetricWheels(
  wheelbase: number,
  trackWidth: number,
  heightOffset = -0.2,
  frontOptions: Partial<WheelInfo> = {},
  rearOptions: Partial<WheelInfo> = {},
): readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo] {
  const halfWidth = trackWidth / 2;
  const halfBase = wheelbase / 2;

  const defaultFront: WheelInfo = {
    position: [-halfWidth, heightOffset, halfBase],
    radius: 0.35,
    suspensionRestLength: 0.32,
    suspensionTravel: 0.26,
    minSuspensionLength: 0.18,
    suspensionStiffness: 30,
    suspensionDamping: 6.8,
    maxSuspensionForce: 15000,
    steerable: true,
    powered: true,
    ...frontOptions,
  };

  const defaultRear: WheelInfo = {
    position: [-halfWidth, heightOffset, -halfBase],
    radius: 0.35,
    suspensionRestLength: 0.32,
    suspensionTravel: 0.26,
    minSuspensionLength: 0.18,
    suspensionStiffness: 31,
    suspensionDamping: 6.8,
    maxSuspensionForce: 15000,
    steerable: false,
    powered: true,
    ...rearOptions,
  };

  const fl: WheelInfo = { ...defaultFront, position: [-halfWidth, heightOffset, halfBase] };
  const fr: WheelInfo = { ...defaultFront, position: [halfWidth, heightOffset, halfBase] };
  const rl: WheelInfo = { ...defaultRear, position: [-halfWidth, heightOffset, -halfBase] };
  const rr: WheelInfo = { ...defaultRear, position: [halfWidth, heightOffset, -halfBase] };

  return [fl, fr, rl, rr] as const;
}

/**
 * Base configurations for standard archetypes.
 */
export const ARCHETYPE_CONFIGS: Record<VehicleArchetype, VehicleConfig> = {
  rally: {
    chassisMass: 140,
    chassisSize: [2.0, 0.6, 4.0],
    weightDistribution: { frontBias: 0.53, engineOffsetZ: 0.80, engineOffsetY: -0.18, centerOfMassZ: 0.08 },
    engine: { maxForce: 450, maxSpeed: 250 },
    drivetrain: { frontBias: 0.5 }, // 50/50 AWD
    brakes: { maxForce: 25, handbrakeForce: 42, frontBias: 0.6 },
    suspension: { frontAntiRollBarStiffness: 15.0, rearAntiRollBarStiffness: 10.0, antiSquatStiffness: 32.0 },
    handling: {
      steeringCurve: [
        [0, Math.PI / 4],
        [60, Math.PI / 6],
        [140, Math.PI / 10],
        [240, Math.PI / 18],
      ],
      steeringSpeed: 8.0,
      assists: { yawDamping: 0.1, driftGripMultiplier: 0.68 },
    },
    aerodynamics: { downforceFactor: 15 },
    wheels: createSymmetricWheels(2.8, 1.6, -0.2, {
      suspensionStiffness: 30,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
    }),
  },
  supercar: {
    chassisMass: 125,
    chassisSize: [2.0, 0.5, 4.3],
    weightDistribution: { frontBias: 0.44, engineOffsetZ: -0.20, engineOffsetY: -0.18, centerOfMassZ: -0.02 },
    engine: { maxForce: 540, maxSpeed: 300 },
    drivetrain: { frontBias: 0.2 }, // 20/80 rear-biased AWD
    brakes: { maxForce: 30, handbrakeForce: 45, frontBias: 0.65 },
    suspension: { frontAntiRollBarStiffness: 22.0, rearAntiRollBarStiffness: 18.0, antiSquatStiffness: 35.0 },
    handling: {
      steeringCurve: [
        [0, Math.PI / 4.2],
        [80, Math.PI / 7],
        [180, Math.PI / 14],
        [300, Math.PI / 24],
      ],
      steeringSpeed: 7.5,
      assists: { yawDamping: 0.08, driftGripMultiplier: 0.70 },
    },
    aerodynamics: { downforceFactor: 24 },
    wheels: createSymmetricWheels(2.9, 1.7, -0.15, {
      suspensionStiffness: 42,
      suspensionTravel: 0.18,
      suspensionRestLength: 0.25,
      minSuspensionLength: 0.16,
    }, {
      suspensionStiffness: 44,
      suspensionTravel: 0.18,
      suspensionRestLength: 0.25,
      minSuspensionLength: 0.16,
    }),
  },
  offroad: {
    chassisMass: 180,
    chassisSize: [2.2, 0.7, 4.3],
    weightDistribution: { frontBias: 0.53, engineOffsetZ: 0.75, engineOffsetY: -0.18, centerOfMassZ: 0.08 },
    engine: { maxForce: 520, maxSpeed: 210 },
    drivetrain: { frontBias: 0.5 },
    brakes: { maxForce: 25, handbrakeForce: 40, frontBias: 0.55 },
    suspension: { frontAntiRollBarStiffness: 12.0, rearAntiRollBarStiffness: 9.0, antiSquatStiffness: 30.0 },
    handling: {
      steeringCurve: [
        [0, Math.PI / 4],
        [50, Math.PI / 6],
        [120, Math.PI / 9],
        [200, Math.PI / 14],
      ],
      steeringSpeed: 5.5,
      assists: { yawDamping: 0.15, driftGripMultiplier: 0.68 },
    },
    aerodynamics: { downforceFactor: 10 },
    wheels: createSymmetricWheels(2.9, 1.75, -0.22, {
      radius: 0.38,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 26,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
    }, {
      radius: 0.38,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 27,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
    }),
  },
  drift: {
    chassisMass: 130,
    chassisSize: [1.95, 0.55, 4.1],
    weightDistribution: { frontBias: 0.52, engineOffsetZ: 0.70, engineOffsetY: -0.18, centerOfMassZ: 0.06 },
    engine: { maxForce: 490, maxSpeed: 260 },
    drivetrain: { frontBias: 0.0 }, // 100% RWD
    brakes: { maxForce: 22, handbrakeForce: 48, frontBias: 0.7 },
    suspension: { frontAntiRollBarStiffness: 20.0, rearAntiRollBarStiffness: 12.0, antiSquatStiffness: 34.0 },
    handling: {
      steeringCurve: [
        [0, Math.PI / 3.5], // Extra large steering angle for drift angle
        [70, Math.PI / 5],
        [150, Math.PI / 9],
        [250, Math.PI / 16],
      ],
      steeringSpeed: 9.0,
      assists: { yawDamping: 0.04, driftGripMultiplier: 0.65 },
    },
    aerodynamics: { downforceFactor: 12 },
    wheels: createSymmetricWheels(2.7, 1.65, -0.18, {
      powered: false, // unpowered front
      steerable: true,
      suspensionStiffness: 38,
      suspensionTravel: 0.22,
      minSuspensionLength: 0.18,
    }, {
      powered: true,
      steerable: false,
      suspensionStiffness: 36,
      suspensionTravel: 0.22,
      minSuspensionLength: 0.18,
    }),
  },
  buggy: {
    chassisMass: 110,
    chassisSize: [1.9, 0.6, 3.6],
    weightDistribution: { frontBias: 0.48, engineOffsetZ: 0.30, engineOffsetY: -0.18, centerOfMassZ: 0.02 },
    engine: { maxForce: 420, maxSpeed: 220 },
    drivetrain: { frontBias: 0.4 },
    brakes: { maxForce: 20, handbrakeForce: 38, frontBias: 0.55 },
    suspension: { frontAntiRollBarStiffness: 10.0, rearAntiRollBarStiffness: 8.0, antiSquatStiffness: 28.0 },
    handling: {
      steeringCurve: [
        [0, Math.PI / 3.8],
        [50, Math.PI / 5.5],
        [120, Math.PI / 8.5],
        [200, Math.PI / 14],
      ],
      steeringSpeed: 8.5,
      assists: { yawDamping: 0.12, driftGripMultiplier: 0.68 },
    },
    aerodynamics: { downforceFactor: 8 },
    wheels: createSymmetricWheels(2.4, 1.65, -0.25, {
      radius: 0.36,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.15,
      minSuspensionLength: 0.21,
      suspensionStiffness: 32,
      maxSuspensionForce: 18000,
    }, {
      radius: 0.36,
      suspensionRestLength: 0.36,
      suspensionTravel: 0.15,
      minSuspensionLength: 0.21,
      suspensionStiffness: 34,
      maxSuspensionForce: 18000,
    }),
  },
};

/**
 * Options for creating a vehicle preset.
 */
export interface CreateVehicleOptions {
  /** Unique vehicle ID */
  readonly id: string;
  /** Display name shown in UI */
  readonly name: string;
  /** Description / bio */
  readonly description: string;
  /** UI Category */
  readonly category?: VehicleCategory;
  /** Base physics archetype to inherit from (defaults to 'rally') */
  readonly archetype?: VehicleArchetype;
  /** 3D model asset path */
  readonly modelPath?: string;
  /** Optional custom wheel model path */
  readonly wheelModelPath?: string;
  /** Visual scale */
  readonly modelScale?: Vector3Tuple;
  /** Visual offset */
  readonly modelPositionOffset?: Vector3Tuple;
  /** Visual rotation offset */
  readonly modelRotationOffset?: Vector3Tuple;
  /** Optional optimized GLB path */
  readonly optimizedModelPath?: string;
  /** UI Stats override (1-10) */
  readonly stats?: Partial<VehicleStats>;
  /** Specific physics configuration overrides */
  readonly config?: Partial<Omit<VehicleConfig, 'wheels'>> & {
    wheels?: readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo];
  };
}

/**
 * Factory function to create a complete, type-safe VehiclePreset from a base archetype.
 * Allows AI agents to define vehicles in just a few lines with guaranteed physical stability.
 */
export function createVehiclePreset(options: CreateVehicleOptions): VehiclePreset {
  const archetype = options.archetype ?? 'rally';
  const baseConfig = ARCHETYPE_CONFIGS[archetype];

  const category: VehicleCategory =
    options.category ?? (archetype === 'offroad' || archetype === 'buggy' ? 'offroad' : archetype === 'supercar' ? 'sports' : 'rally');

  const defaultStats: VehicleStats = {
    topSpeed: archetype === 'supercar' ? 9.5 : archetype === 'rally' ? 7.5 : archetype === 'offroad' ? 6.5 : 8.0,
    acceleration: archetype === 'supercar' ? 9.0 : archetype === 'rally' ? 8.0 : archetype === 'buggy' ? 8.5 : 7.5,
    handling: archetype === 'drift' ? 9.5 : archetype === 'supercar' ? 9.0 : archetype === 'rally' ? 8.5 : 6.5,
    offroad: archetype === 'offroad' ? 10.0 : archetype === 'buggy' ? 9.0 : archetype === 'rally' ? 8.0 : 4.0,
    driveType: baseConfig.drivetrain.frontBias === 0 ? 'RWD' : baseConfig.drivetrain.frontBias === 1 ? 'FWD' : 'AWD',
  };

  const finalConfig: VehicleConfig = {
    chassisMass: options.config?.chassisMass ?? baseConfig.chassisMass,
    chassisSize: options.config?.chassisSize ?? baseConfig.chassisSize,
    weightDistribution: options.config?.weightDistribution ?? (baseConfig.weightDistribution ? { ...baseConfig.weightDistribution } : undefined),
    engine: { ...baseConfig.engine, ...options.config?.engine },
    drivetrain: { ...baseConfig.drivetrain, ...options.config?.drivetrain },
    brakes: { ...baseConfig.brakes, ...options.config?.brakes },
    suspension: { ...baseConfig.suspension, ...options.config?.suspension },
    handling: {
      ...baseConfig.handling,
      ...options.config?.handling,
      assists: {
        ...baseConfig.handling.assists,
        ...options.config?.handling?.assists,
      },
    },
    aerodynamics: { ...baseConfig.aerodynamics, ...options.config?.aerodynamics },
    wheels: options.config?.wheels ?? baseConfig.wheels,
  };

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    category,
    modelPath: options.modelPath ?? VEHICLE_MODEL_PATH,
    wheelModelPath: options.wheelModelPath,
    modelScale: options.modelScale ?? [4.5, 4.5, 4.5],
    modelPositionOffset: options.modelPositionOffset ?? [0, 0.2, 0.1],
    modelRotationOffset: options.modelRotationOffset,
    optimizedModelPath: options.optimizedModelPath,
    stats: { ...defaultStats, ...options.stats },
    config: finalConfig,
  };
}
