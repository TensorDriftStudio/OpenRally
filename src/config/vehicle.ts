import type { VehicleConfig } from '@/types/vehicle';

// ─── Speed & Movement ───────────────────────────────────────────────
/** Conversion factor: multiply m/s by this to get km/h */
export const MS_TO_KMH = 3.6;

/** Minimum forward speed (m/s) before braking force is applied instead of reverse */
export const BRAKE_SPEED_THRESHOLD = 0.5;

/** Reverse engine force multiplier (fraction of max engine force) */
export const REVERSE_FORCE_MULTIPLIER = 0.8;

// ─── Gearbox (5-speed automatic / manual) ───────────────────────────
export const GEAR_RATIOS = [0, 2.7, 2.3, 1.75, 1.3, 0.95]; // Index is gear (0=N/R, 1..5)
export const SHIFT_UP_SPEEDS = [0, 40, 80, 130, 180, 999]; // Shift to next gear when exceeding these speeds (km/h)
export const SHIFT_DOWN_SPEEDS = [0, 0, 30, 70, 120, 170]; // Shift to previous gear when falling below these speeds (km/h)

/** Maximum speeds (km/h) for each gear before hitting mechanical redline / rev limiter */
export const GEAR_MAX_SPEEDS: readonly number[] = [0, 52, 105, 150, 198, 250];

/** Maximum speed (km/h) in reverse gear */
export const REVERSE_MAX_SPEED = 45;

/** Terrain elevation threshold below which coastal sand friction is applied (ocean surface is at -8.0) */
export const SAND_ELEVATION_THRESHOLD = -5.0;

// ─── Frame Clamping ──────────────────────────────────────────────────
/** Maximum frame delta (seconds) to prevent physics explosion after tab switch */
export const MAX_DELTA = 0.05;

// ─── Chassis Dynamics ────────────────────────────────────────────────
/** Default sprung mass dynamics configuration (body roll, pitch dive/squat, heave) */
export const DEFAULT_CHASSIS_DYNAMICS = {
  maxRollAngle: 0.085, // ~4.9 degrees
  rollStiffness: 1.0,
  maxPitchDive: 0.055, // ~3.1 degrees
  maxPitchSquat: 0.045, // ~2.6 degrees
  pitchStiffness: 1.0,
  naturalFrequency: 10.5, // rad/s (~1.67 Hz)
  dampingRatio: 0.90, // Plush, critically-damped rally suspension
  heaveMultiplier: 0.32, // Smooth heave absorption over rough terrain
} as const;

// ─── Default Vehicle Config ──────────────────────────────────────────
/** Default vehicle configuration — physics parameters for the Stage 1 car */
export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 150,
  chassisSize: [2, 0.6, 4],
  weightDistribution: {
    frontBias: 0.53,
    engineOffsetZ: 0.80,
    engineOffsetY: -0.18,
    centerOfMassZ: 0.08,
    centerOfMassY: -0.36,
  },
  engine: {
    maxForce: 420, // AWD powered
    maxSpeed: 240,
  },
  drivetrain: {
    frontBias: 0.5, // 50/50 AWD
  },
  brakes: {
    maxForce: 18, // Firm and responsive braking with balanced weight transfer
    handbrakeForce: 40,
    frontBias: 0.50, // 50/50 even 4-wheel brake distribution
  },
  suspension: {
    frontAntiRollBarStiffness: 14.0, // Balanced ARB prevents understeer and keeps car level
    rearAntiRollBarStiffness: 15.0,
    antiSquatStiffness: 42.0,
  },
  handling: {
    steeringCurve: [
      [0, Math.PI / 3.75],   // ~48 degrees at 0 km/h
      [40, Math.PI / 4.2],    // ~42.8 degrees at 40 km/h (sharp, responsive rally cornering)
      [90, Math.PI / 6.4],    // ~28 degrees at 90 km/h (agile medium-speed steering)
      [150, Math.PI / 10.0],  // 18 degrees at 150 km/h
      [220, Math.PI / 15.0],  // 12 degrees at 220 km/h
    ],
    steeringSpeed: 8.5, // Crisp, responsive steering input
    assists: {
      yawDamping: 0.12, // Stable, progressive drift control preventing tank-slappers
      driftGripMultiplier: 0.68,
    },
  },
  aerodynamics: {
    downforceFactor: 15, // Smooth high-speed stability without crushing suspension
  },
  chassisDynamics: {
    maxRollAngle: 0.085, // ~4.9 degrees
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
      position: [-0.76, -0.2, 1.45],
      radius: 0.35,
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
      position: [0.76, -0.2, 1.45],
      radius: 0.35,
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
      position: [-0.76, -0.2, -1.4],
      radius: 0.35,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
    {
      // Rear-right
      position: [0.76, -0.2, -1.4],
      radius: 0.35,
      suspensionRestLength: 0.32,
      suspensionTravel: 0.26,
      minSuspensionLength: 0.18,
      suspensionStiffness: 31,
      suspensionDamping: 6.8,
      maxSuspensionForce: 15000,
      steerable: false,
      powered: true,
    },
  ],
};
