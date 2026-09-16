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
    maxSpeed: 255,
  },
  drivetrain: {
    frontBias: 0.48, // 48/52 Rear-biased AWD for nimble throttle steering
  },
  brakes: {
    maxForce: 18,
    handbrakeForce: 40,
    frontBias: 0.50, // Balanced 50/50 brake distribution preventing nose-dive
  },
  suspension: {
    frontAntiRollBarStiffness: 18.0,
    rearAntiRollBarStiffness: 20.0, // Stiffer rear ARB eliminates understeer
    antiSquatStiffness: 44.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.6],
      [40, Math.PI / 4.1],
      [90, Math.PI / 6.3],
      [150, Math.PI / 10.0],
      [240, Math.PI / 15.0],
    ],
    steeringSpeed: 8.8,
    assists: {
      yawDamping: 0.14,
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 21,
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
