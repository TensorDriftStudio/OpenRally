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
    maxSpeed: 235,
  },
  drivetrain: {
    frontBias: 0.50, // Permanent locked 50/50 AWD
  },
  brakes: {
    maxForce: 22,
    handbrakeForce: 42,
    frontBias: 0.55,
  },
  suspension: {
    frontAntiRollBarStiffness: 16.0, // Softer ARB allows independent wheel articulation on boulders/ruts
    rearAntiRollBarStiffness: 17.0,
    antiSquatStiffness: 42.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.7],
      [40, Math.PI / 4.3],
      [90, Math.PI / 6.5],
      [150, Math.PI / 10.5],
      [240, Math.PI / 15.5],
    ],
    steeringSpeed: 8.2,
    assists: {
      yawDamping: 0.16,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 16,
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
