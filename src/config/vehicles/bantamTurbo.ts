import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_BANTAM_TURBO_MODEL_PATH } from '@/config/assets';

/**
 * Bantam Turbo Maxi — Mid-engine widebody pocket rocket.
 * Ultra-short wheelbase, aggressive turn-in, and instantaneous pendulum drifts.
 */
export const BANTAM_TURBO_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 135,
  chassisSize: [1.9, 0.6, 3.8],
  weightDistribution: {
    frontBias: 0.49, // Mid-engine balanced weight concentration
    engineOffsetZ: 0.15,
    engineOffsetY: -0.16,
    centerOfMassZ: 0.04,
    centerOfMassY: -0.36,
  },
  engine: {
    maxForce: 405,
    maxSpeed: 210,
    turboBoostMultiplier: 1.15,
    boostThresholdRpm: 4000,
    turboSpoolRate: 3.4,
  },
  drivetrain: {
    frontBias: 0.46, // 46/54 rear-biased AWD for snappy Scandinavian flicks without violent wheelies
  },
  brakes: {
    maxForce: 18,
    handbrakeForce: 40,
    frontBias: 0.65,
  },
  suspension: {
    frontAntiRollBarStiffness: 17.0,
    rearAntiRollBarStiffness: 22.0,
    antiSquatStiffness: 42.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 4.8],    // ~37.5° at 0 km/h (ultra-nimble pocket rocket)
      [30, Math.PI / 7.5],   // ~24.0° at 30 km/h
      [60, Math.PI / 12.0],  // ~15.0° at 60 km/h
      [90, Math.PI / 17.5],  // ~10.3° at 90 km/h
      [140, Math.PI / 26.0], // ~6.9° at 140 km/h
      [240, Math.PI / 38.0], // ~4.7° at 240 km/h
    ],
    steeringSpeed: 9.0, // Lightning quick steering response
    assists: {
      yawDamping: 0.10,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 18,
    dragCoefficient: 0.46,
    frontalArea: 1.85,
    dragMultiplier: 1.0,
  },
  wheels: [
    {
      // Front-left
      position: [-0.96, -0.2, 1.32],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 29,
      suspensionDamping: 6.8,
      maxSuspensionForce: 14000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.96, -0.2, 1.32],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 29,
      suspensionDamping: 6.8,
      maxSuspensionForce: 14000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left (widebody rear axle aligned with flared arches)
      position: [-1.02, -0.2, -1.52],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 30,
      suspensionDamping: 6.8,
      maxSuspensionForce: 14000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right (widebody rear axle aligned with flared arches)
      position: [1.02, -0.2, -1.52],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 30,
      suspensionDamping: 6.8,
      maxSuspensionForce: 14000,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_BANTAM_TURBO: VehiclePreset = {
  id: 'bantam_turbo',
  name: 'Bantam Turbo Maxi',
  description: 'Widebody mid-engine hot hatch legend engineered for nimble hairpin mastery, explosive corner exit traction, and effortless oversteer drifts.',
  category: 'rally',
  modelPath: VEHICLE_BANTAM_TURBO_MODEL_PATH,
  modelPositionOffset: [0, 0.12, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.2,
    acceleration: 8.9,
    handling: 9.6,
    offroad: 8.0,
    driveType: 'AWD',
  },
  config: BANTAM_TURBO_VEHICLE_CONFIG,
};
