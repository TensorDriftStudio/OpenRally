import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_PHANTOM_B_MODEL_PATH } from '@/config/assets';

/**
 * Phantom B-Spec — Mid-engine lightweight Group B prototype.
 * High-revving turbo, responsive throttle steering, and nimble chassis.
 */
export const PHANTOM_B_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 140,
  chassisSize: [1.9, 0.6, 4.0],
  weightDistribution: {
    frontBias: 0.50, // Mid-engine 50/50 balance
    engineOffsetZ: 0.20,
    engineOffsetY: -0.16,
    centerOfMassZ: 0.04,
    centerOfMassY: -0.36,
  },
  engine: {
    maxForce: 440,
    maxSpeed: 275,
  },
  drivetrain: {
    frontBias: 0.48, // 48/52 Rear-biased AWD
  },
  brakes: {
    maxForce: 19,
    handbrakeForce: 42,
    frontBias: 0.52,
  },
  suspension: {
    frontAntiRollBarStiffness: 19.0,
    rearAntiRollBarStiffness: 22.0,
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.6],
      [40, Math.PI / 4.1],
      [90, Math.PI / 6.2],
      [150, Math.PI / 9.8],
      [240, Math.PI / 14.5],
    ],
    steeringSpeed: 9.0,
    assists: {
      yawDamping: 0.13,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 24,
  },
  wheels: [
    {
      // Front-left
      position: [-0.89, -0.2, 1.36],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.89, -0.2, 1.36],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.89, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.89, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_PHANTOM_B: VehiclePreset = {
  id: 'apex_phantom_b',
  name: 'Phantom B-Spec',
  description: 'Ultra-lightweight mid-engine Group B prototype engineered for extreme acceleration, razor-sharp transient response, and high-rpm rally racing.',
  category: 'rally',
  modelPath: VEHICLE_PHANTOM_B_MODEL_PATH,
  modelPositionOffset: [0, 0.065, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 9.1,
    acceleration: 9.4,
    handling: 9.2,
    offroad: 8.6,
    driveType: 'AWD',
  },
  config: PHANTOM_B_VEHICLE_CONFIG,
};
