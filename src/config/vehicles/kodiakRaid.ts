import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_KODIAK_RAID_MODEL_PATH } from '@/config/assets';

/**
 * Kodiak Raid Pro — Heavy-duty cross-country raid powerhouse.
 * Massive suspension travel, indestructible off-road clearance, and unrelenting low-end torque.
 */
export const KODIAK_RAID_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 175,
  chassisSize: [2.0, 0.65, 4.1],
  weightDistribution: {
    frontBias: 0.52,
    engineOffsetZ: 0.85,
    engineOffsetY: -0.15,
    centerOfMassZ: 0.05,
    centerOfMassY: -0.34,
  },
  engine: {
    maxForce: 465, // Robust low-end crawler and hillclimbing torque
    maxSpeed: 185,
    turboBoostMultiplier: 1.05,
    boostThresholdRpm: 3200,
    turboSpoolRate: 2.5,
  },
  drivetrain: {
    frontBias: 0.50, // Permanent locked 50/50 AWD
  },
  brakes: {
    maxForce: 22,
    handbrakeForce: 42,
    frontBias: 0.65,
  },
  suspension: {
    frontAntiRollBarStiffness: 16.0, // Softer ARB allows independent wheel articulation on boulders/ruts
    rearAntiRollBarStiffness: 17.0,
    antiSquatStiffness: 42.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 5.2],    // ~34.6° at 0 km/h (heavy raid 4x4 steering)
      [30, Math.PI / 8.0],   // ~22.5° at 30 km/h
      [60, Math.PI / 13.0],  // ~13.8° at 60 km/h
      [90, Math.PI / 19.0],  // ~9.5° at 90 km/h
      [140, Math.PI / 28.5], // ~6.3° at 140 km/h
      [240, Math.PI / 42.0], // ~4.3° at 240 km/h
    ],
    steeringSpeed: 8.2,
    assists: {
      yawDamping: 0.16,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 16,
    dragCoefficient: 0.65, // Tall, boxy, high ground clearance
    frontalArea: 2.6,
    dragMultiplier: 1.2,
  },
  chassisDynamics: {
    maxRollAngle: 0.115, // ~6.6 degrees (dramatic off-road trophy raid body lean)
    rollStiffness: 0.82,
    maxPitchDive: 0.075, // ~4.3 degrees (deep nose dive on steep descents and braking)
    maxPitchSquat: 0.065, // ~3.7 degrees
    pitchStiffness: 0.85,
    naturalFrequency: 9.5, // rad/s (slower, softer trophy truck oscillation)
    dampingRatio: 0.88,
    heaveMultiplier: 0.38,
  },
  wheels: [
    {
      // Front-left
      position: [-0.94, -0.15, 1.27],
      radius: 0.34,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 26,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.94, -0.15, 1.27],
      radius: 0.34,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 26,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.95, -0.15, -1.39],
      radius: 0.34,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 27,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.95, -0.15, -1.39],
      radius: 0.34,
      suspensionRestLength: 0.38,
      suspensionTravel: 0.32,
      minSuspensionLength: 0.22,
      suspensionStiffness: 27,
      suspensionDamping: 7.8,
      maxSuspensionForce: 16000,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_KODIAK_RAID: VehiclePreset = {
  id: 'kodiak_raid',
  name: 'Kodiak Raid Pro',
  description: 'Armored cross-country raid titan engineered to conquer extreme desert dunes, deep mud ruts, and massive high-flying jumps without flinching.',
  category: 'offroad',
  modelPath: VEHICLE_KODIAK_RAID_MODEL_PATH,
  modelPositionOffset: [0, 0.13, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 7.8,
    acceleration: 8.6,
    handling: 8.0,
    offroad: 9.8,
    driveType: 'AWD',
  },
  config: KODIAK_RAID_VEHICLE_CONFIG,
};
