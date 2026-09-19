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
    maxSpeed: 230,
    turboBoostMultiplier: 1.18,
    boostThresholdRpm: 3800,
    turboSpoolRate: 3.4,
  },
  drivetrain: {
    frontBias: 0.50, // 50/50 symmetrical power delivery
  },
  brakes: {
    maxForce: 19,
    handbrakeForce: 40,
    frontBias: 0.65,
  },
  suspension: {
    frontAntiRollBarStiffness: 18.0,
    rearAntiRollBarStiffness: 20.0,
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 5.2],    // ~34.6° at 0 km/h (agile track rotation)
      [30, Math.PI / 8.0],   // ~22.5° at 30 km/h
      [60, Math.PI / 12.8],  // ~14.1° at 60 km/h
      [90, Math.PI / 18.5],  // ~9.7° at 90 km/h
      [140, Math.PI / 28.0], // ~6.4° at 140 km/h
      [240, Math.PI / 42.0], // ~4.3° at 240 km/h
    ],
    steeringSpeed: 8.8,
    assists: {
      yawDamping: 0.13,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 22,
    dragCoefficient: 0.50,
    frontalArea: 2.0,
    dragMultiplier: 1.0,
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
