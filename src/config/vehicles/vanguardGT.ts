import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_VANGUARD_GT_MODEL_PATH } from '@/config/assets';

/**
 * Vanguard GT-Aero — High-speed aerodynamic GT rally coupe.
 * Extended wheelbase, low drag profile, high-speed stability.
 */
export const VANGUARD_GT_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 155,
  chassisSize: [1.9, 0.6, 4.2],
  weightDistribution: {
    frontBias: 0.54,
    engineOffsetZ: 0.90,
    engineOffsetY: -0.18,
    centerOfMassZ: 0.08,
    centerOfMassY: -0.38,
  },
  engine: {
    maxForce: 440,
    maxSpeed: 280,
  },
  drivetrain: {
    frontBias: 0.42, // 42/58 AWD for exhilarating sports GT dynamics without violent front lift
  },
  brakes: {
    maxForce: 20,
    handbrakeForce: 42,
    frontBias: 0.56,
  },
  suspension: {
    frontAntiRollBarStiffness: 21.0,
    rearAntiRollBarStiffness: 21.0,
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.7],
      [40, Math.PI / 4.3],
      [90, Math.PI / 6.6],
      [150, Math.PI / 10.5],
      [240, Math.PI / 15.5],
    ],
    steeringSpeed: 8.6,
    assists: {
      yawDamping: 0.14,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 25,
  },
  chassisDynamics: {
    maxRollAngle: 0.058, // ~3.3 degrees (stiff GT chassis, flat cornering)
    rollStiffness: 1.35,
    maxPitchDive: 0.042, // ~2.4 degrees
    maxPitchSquat: 0.038, // ~2.2 degrees
    pitchStiffness: 1.30,
    naturalFrequency: 13.5, // rad/s (quick, responsive racecar frequency)
    dampingRatio: 0.92,
    heaveMultiplier: 0.30,
  },
  wheels: [
    {
      // Front-left
      position: [-0.92, -0.2, 1.25],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.2,
      maxSuspensionForce: 15500,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.92, -0.2, 1.25],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 32,
      suspensionDamping: 7.2,
      maxSuspensionForce: 15500,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left (wide rear track)
      position: [-1.02, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 33,
      suspensionDamping: 7.2,
      maxSuspensionForce: 15500,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right (wide rear track)
      position: [1.02, -0.2, -1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 33,
      suspensionDamping: 7.2,
      maxSuspensionForce: 15500,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_VANGUARD_GT: VehiclePreset = {
  id: 'vanguard_gt',
  name: 'Vanguard GT-Aero',
  description: 'Grand touring aerodynamic rally coupe with extended wheelbase high-speed tracking, rear-biased AWD balance, and 280 km/h top end.',
  category: 'sports',
  modelPath: VEHICLE_VANGUARD_GT_MODEL_PATH,
  modelPositionOffset: [0, 0.08, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 9.4,
    acceleration: 8.8,
    handling: 8.9,
    offroad: 7.6,
    driveType: 'AWD',
  },
  config: VANGUARD_GT_VEHICLE_CONFIG,
};
