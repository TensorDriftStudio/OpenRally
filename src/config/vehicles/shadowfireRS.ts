import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_SHADOWFIRE_RS_MODEL_PATH } from '@/config/assets';

/**
 * Shadowfire RS — Aggressive modern rough-terrain rally machine.
 * Reinforced long-travel suspension, wide track, and ferocious gravel grip.
 */
export const SHADOWFIRE_RS_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 150,
  chassisSize: [1.95, 0.6, 4.0],
  weightDistribution: {
    frontBias: 0.52,
    engineOffsetZ: 0.80,
    engineOffsetY: -0.17,
    centerOfMassZ: 0.06,
    centerOfMassY: -0.36,
  },
  engine: {
    maxForce: 435,
    maxSpeed: 250,
  },
  drivetrain: {
    frontBias: 0.50, // 50/50 symmetrical power delivery
  },
  brakes: {
    maxForce: 19,
    handbrakeForce: 40,
    frontBias: 0.52,
  },
  suspension: {
    frontAntiRollBarStiffness: 18.0,
    rearAntiRollBarStiffness: 20.0,
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.7],
      [40, Math.PI / 4.2],
      [90, Math.PI / 6.4],
      [150, Math.PI / 10.2],
      [240, Math.PI / 15.0],
    ],
    steeringSpeed: 8.8,
    assists: {
      yawDamping: 0.13,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 22,
  },
  wheels: [
    {
      // Front-left
      position: [-1.00, -0.2, 1.26],
      radius: 0.32,
      suspensionRestLength: 0.33,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [1.00, -0.2, 1.26],
      radius: 0.32,
      suspensionRestLength: 0.33,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.99, -0.2, -1.35],
      radius: 0.32,
      suspensionRestLength: 0.33,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.99, -0.2, -1.35],
      radius: 0.32,
      suspensionRestLength: 0.33,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.0,
      maxSuspensionForce: 15500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_SHADOWFIRE_RS: VehiclePreset = {
  id: 'shadowfire_rs',
  name: 'Shadowfire RS',
  description: 'Aggressive modern widebody rally challenger equipped with heavy-duty long-travel suspension, supreme bump absorption, and tenacious rough-gravel grip.',
  category: 'rally',
  modelPath: VEHICLE_SHADOWFIRE_RS_MODEL_PATH,
  modelPositionOffset: [0, 0.10, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.7,
    acceleration: 9.1,
    handling: 8.8,
    offroad: 9.2,
    driveType: 'AWD',
  },
  config: SHADOWFIRE_RS_VEHICLE_CONFIG,
};
