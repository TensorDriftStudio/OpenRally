import type { VehiclePreset, VehicleConfig } from '@/types/vehicle';
import { VEHICLE_ZEPHYR_WR4_MODEL_PATH } from '@/config/assets';

/**
 * Zephyr WR-4 — Iconic symmetrical AWD gravel champion.
 * Unrivaled chassis balance, progressive sliding, and benchmark rally reliability.
 */
export const ZEPHYR_WR4_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 148,
  chassisSize: [1.9, 0.6, 4.0],
  weightDistribution: {
    frontBias: 0.53, // 53% front engine mass creates natural rally balance without excessive nose heaviness
    engineOffsetZ: 0.85,
    engineOffsetY: -0.18,
    centerOfMassZ: 0.08, // +0.08m forward offset (~53/47 weight distribution)
    centerOfMassY: -0.36,
  },
  engine: {
    maxForce: 425,
    maxSpeed: 225,
    turboBoostMultiplier: 1.10,
    boostThresholdRpm: 3800,
    turboSpoolRate: 3.2,
  },
  drivetrain: {
    frontBias: 0.48, // 48/52 Rear-biased AWD for nimble throttle steering
  },
  brakes: {
    maxForce: 18,
    handbrakeForce: 40,
    frontBias: 0.65, // Balanced front-biased brake distribution preventing rear lockup
  },
  suspension: {
    frontAntiRollBarStiffness: 18.0,
    rearAntiRollBarStiffness: 20.0, // Stiffer rear ARB eliminates understeer
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 5.0],    // ~36.0° at 0 km/h (agile rally hairpin rotation)
      [30, Math.PI / 7.8],   // ~23.1° at 30 km/h
      [60, Math.PI / 12.5],  // ~14.4° at 60 km/h
      [90, Math.PI / 18.0],  // ~10.0° at 90 km/h
      [140, Math.PI / 27.0], // ~6.7° at 140 km/h
      [240, Math.PI / 40.0], // ~4.5° at 240 km/h
    ],
    steeringSpeed: 8.8,
    assists: {
      yawDamping: 0.14,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 21,
    dragCoefficient: 0.48,
    frontalArea: 2.0,
    dragMultiplier: 1.0,
  },
  chassisDynamics: {
    maxRollAngle: 0.088, // ~5.0 degrees (classic balanced rally body roll)
    rollStiffness: 1.0,
    maxPitchDive: 0.055, // ~3.1 degrees
    maxPitchSquat: 0.045, // ~2.6 degrees
    pitchStiffness: 1.0,
    naturalFrequency: 10.5,
    dampingRatio: 0.90,
    heaveMultiplier: 0.32,
  },
  wheels: [
    {
      // Front-left
      position: [-0.88, -0.2, 1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 30,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: true,
      powered: true,
    },
    {
      // Front-right
      position: [0.88, -0.2, 1.38],
      radius: 0.32,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 30,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: true,
      powered: true,
    },
    {
      // Rear-left
      position: [-0.89, -0.2, -1.23],
      radius: 0.32,
      suspensionRestLength: 0.31,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.89, -0.2, -1.23],
      radius: 0.32,
      suspensionRestLength: 0.31,
      suspensionTravel: 0.25,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
  ],
};

export const VEHICLE_ZEPHYR_WR4: VehiclePreset = {
  id: 'zephyr_wr4',
  name: 'Zephyr WR-4',
  description: 'The golden standard of rally championships. Featuring symmetrical all-wheel drive, telepathic turn-in, and exceptionally controllable four-wheel drifts on loose surfaces.',
  category: 'rally',
  modelPath: VEHICLE_ZEPHYR_WR4_MODEL_PATH,
  modelPositionOffset: [0, 0.065, 0.0],
  modelScale: [4.5, 4.5, 4.5],
  stats: {
    topSpeed: 8.5,
    acceleration: 8.8,
    handling: 9.3,
    offroad: 9.0,
    driveType: 'AWD',
  },
  config: ZEPHYR_WR4_VEHICLE_CONFIG,
};
