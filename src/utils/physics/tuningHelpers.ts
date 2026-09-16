import type {
  VehicleConfig,
  WheelInfo,
  SuspensionConfig,
  BrakesConfig,
  WeightDistributionConfig,
} from '@/types/vehicle';

/**
 * Physical corner masses on front and rear axles.
 */
export interface CornerMasses {
  readonly frontCornerMass: number;
  readonly rearCornerMass: number;
  readonly totalMass: number;
  readonly frontBias: number;
}

/**
 * Calculates corner mass (sprung mass per wheel) based on vehicle mass and weight distribution.
 */
export function calculateCornerMasses(
  chassisMass: number,
  weightDistribution?: WeightDistributionConfig,
): CornerMasses {
  const frontBias = weightDistribution?.frontBias ?? 0.52;
  const frontCornerMass = (chassisMass * frontBias) * 0.5;
  const rearCornerMass = (chassisMass * (1 - frontBias)) * 0.5;
  return {
    frontCornerMass,
    rearCornerMass,
    totalMass: chassisMass,
    frontBias,
  };
}

/**
 * Reference corner mass for normalized Rapier suspension scaling (37.5 kg = 150 kg / 4).
 */
export const RAPIER_REF_CORNER_MASS = 37.5;

/**
 * Calculates critical damping coefficient for Rapier raycast suspension:
 * c_crit = 2 * sqrt(stiffness * (cornerMass / RAPIER_REF_CORNER_MASS)).
 * At zeta = 1.0 (critical damping), the suspension returns to rest without oscillating.
 */
export function calculateCriticalDamping(stiffness: number, cornerMass: number): number {
  if (stiffness <= 0 || cornerMass <= 0) return 0;
  const massRatio = cornerMass / RAPIER_REF_CORNER_MASS;
  return Number((2 * Math.sqrt(stiffness * massRatio)).toFixed(2));
}

/**
 * Calculates suspension damping coefficient given a desired damping ratio zeta:
 * damping = zeta * c_crit.
 * Recommended automotive damping ratios:
 * - Rally: 0.60 - 0.85 (slight underdamping for rapid wheel compliance over gravel/ruts)
 * - Track / Supercar: 0.70 - 0.95 (firm control over high-speed body heave)
 * - Offroad: 0.65 - 0.85 (soft bump absorption with progressive rebound)
 */
export function calculateDamping(
  stiffness: number,
  cornerMass: number,
  dampingRatio = 0.75,
): number {
  const crit = calculateCriticalDamping(stiffness, cornerMass);
  return Number(parseFloat((crit * dampingRatio).toFixed(2)));
}

/**
 * Calculates the natural bounce frequency fn of the suspension in Hertz (Hz):
 * fn = (1 / (2 * PI)) * sqrt(stiffness * 80 / cornerMass).
 * Typical automotive targets:
 * - Offroad / Buggy: 1.4 - 1.8 Hz
 * - Rally: 1.8 - 2.4 Hz
 * - Sports / GT: 2.2 - 2.8 Hz
 */
export function calculateNaturalFrequencyHz(stiffness: number, cornerMass: number): number {
  if (stiffness <= 0 || cornerMass <= 0) return 0;
  // Scaled for Rapier raycast suspension spring constant (80 rad^2/s^2 per 30 stiffness at 37.5kg)
  const omega = Math.sqrt((stiffness * 100) / cornerMass);
  return Number(parseFloat((omega / (2 * Math.PI)).toFixed(2)));
}

/**
 * Calculates required spring stiffness k to achieve a target natural bounce frequency fn.
 */
export function calculateStiffnessForFrequency(
  targetFrequencyHz: number,
  cornerMass: number,
): number {
  if (targetFrequencyHz <= 0 || cornerMass <= 0) return 0;
  const omega = targetFrequencyHz * 2 * Math.PI;
  return Number(parseFloat(((omega * omega * cornerMass) / 100).toFixed(1)));
}

/**
 * Calculates current damping ratio zeta = damping / c_crit.
 */
export function calculateDampingRatio(
  stiffness: number,
  damping: number,
  cornerMass: number,
): number {
  const crit = calculateCriticalDamping(stiffness, cornerMass);
  if (crit <= 0) return 0;
  return Number(parseFloat((damping / crit).toFixed(3)));
}

/**
 * Options for mass-adaptive suspension scaling.
 */
export interface TuneSuspensionOptions {
  readonly frontBias?: number;
  readonly targetFrequencyFrontHz?: number;
  readonly targetFrequencyRearHz?: number;
  readonly dampingRatio?: number;
}

/**
 * Automatically recalibrates all 4 wheels' suspension stiffness and damping
 * to match a new chassis mass while preserving ideal physical bounce frequencies and damping ratios.
 * 
 * Perfect for AI agents when modifying vehicle mass or building new vehicle presets.
 */
export function tuneSuspensionForMass(
  wheels: readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo],
  newChassisMass: number,
  options?: TuneSuspensionOptions,
): readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo] {
  const frontBias = options?.frontBias ?? 0.52;
  const targetFrontHz = options?.targetFrequencyFrontHz ?? 2.1;
  const targetRearHz = options?.targetFrequencyRearHz ?? 2.25; // Slightly stiffer rear prevents pitch squat
  const dampingRatio = options?.dampingRatio ?? 0.82;

  const frontCornerMass = (newChassisMass * frontBias) * 0.5;
  const rearCornerMass = (newChassisMass * (1 - frontBias)) * 0.5;

  const frontStiffness = calculateStiffnessForFrequency(targetFrontHz, frontCornerMass);
  const rearStiffness = calculateStiffnessForFrequency(targetRearHz, rearCornerMass);

  const frontDamping = calculateDamping(frontStiffness, frontCornerMass, dampingRatio);
  const rearDamping = calculateDamping(rearStiffness, rearCornerMass, dampingRatio);

  return wheels.map((wheel, idx) => {
    const isFront = idx < 2;
    const stiffness = isFront ? frontStiffness : rearStiffness;
    const damping = isFront ? frontDamping : rearDamping;

    return {
      ...wheel,
      suspensionStiffness: stiffness,
      suspensionDamping: damping,
      suspensionCompression: Number(parseFloat((damping * 0.75).toFixed(2))),
      suspensionRelaxation: Number(parseFloat((damping * 1.15).toFixed(2))),
      maxSuspensionForce: Math.max(12000, Math.round(newChassisMass * 9.81 * 8.5)),
    };
  }) as unknown as readonly [WheelInfo, WheelInfo, WheelInfo, WheelInfo];
}

/**
 * Calculates balanced braking forces and bias for a given vehicle mass and max speed.
 */
export function tuneBrakesForMass(
  mass: number,
  maxSpeedKmh: number,
  frontBias = 0.55,
): BrakesConfig {
  // Service brakes sized for ~1.1G deceleration at normal tire grip
  const baseDecelForce = mass * 0.15;
  const speedScale = Math.max(1.0, maxSpeedKmh / 220);
  const maxForce = Number(parseFloat((baseDecelForce * speedScale).toFixed(1)));

  // Handbrake sized to authoritatively lock rear wheels (28% of mass baseline)
  const handbrakeForce = Number(parseFloat((mass * 0.28).toFixed(1)));

  return {
    maxForce: Math.max(15, maxForce),
    handbrakeForce: Math.max(35, handbrakeForce),
    frontBias,
  };
}

/**
 * Calculates balanced Anti-Roll Bar (ARB) stiffnesses and longitudinal pitch anti-squat.
 * 
 * @param mass - Vehicle chassis mass
 * @param frontBias - Front axle weight fraction (e.g. 0.52)
 * @param handlingProfile - Balance target: 'neutral' | 'oversteer_drift' | 'understeer_safe'
 */
export function tuneAntiRollBars(
  mass: number,
  frontBias = 0.52,
  handlingProfile: 'neutral' | 'oversteer_drift' | 'understeer_safe' = 'neutral',
): SuspensionConfig {
  const baseScale = mass * 0.11;

  let frontScale = baseScale;
  let rearScale = baseScale;

  if (handlingProfile === 'oversteer_drift') {
    // Stiffer rear ARB increases rear lateral weight transfer, inducing tail-out rotation
    frontScale *= 0.90;
    rearScale *= 1.25;
  } else if (handlingProfile === 'understeer_safe') {
    // Stiffer front ARB keeps rear tires firmly planted
    frontScale *= 1.25;
    rearScale *= 0.85;
  } else {
    // Neutral: slight front bias matching mass distribution
    frontScale *= (frontBias / 0.50);
    rearScale *= ((1 - frontBias) / 0.50);
  }

  return {
    frontAntiRollBarStiffness: Number(parseFloat(frontScale.toFixed(1))),
    rearAntiRollBarStiffness: Number(parseFloat(rearScale.toFixed(1))),
    antiSquatStiffness: Number(parseFloat((mass * 0.24).toFixed(1))),
  };
}

/**
 * Preset handling tune profiles for AI agents.
 */
export type HandlingTuneProfile = 'agile_drift' | 'planted_grip' | 'soft_offroad' | 'balanced_rally';

/**
 * Applies a comprehensive handling profile transformation to an existing VehicleConfig.
 */
export function applyHandlingProfile(
  config: VehicleConfig,
  profile: HandlingTuneProfile,
): VehicleConfig {
  const mass = config.chassisMass;
  const frontBias = config.weightDistribution?.frontBias ?? 0.52;

  switch (profile) {
    case 'agile_drift': {
      const arb = tuneAntiRollBars(mass, frontBias, 'oversteer_drift');
      return {
        ...config,
        drivetrain: { frontBias: 0.35 }, // Rear-biased AWD
        suspension: arb,
        handling: {
          ...config.handling,
          steeringSpeed: Math.max(8.5, config.handling.steeringSpeed),
          assists: {
            yawDamping: 0.08,
            driftGripMultiplier: 0.65,
          },
        },
      };
    }
    case 'planted_grip': {
      const arb = tuneAntiRollBars(mass, frontBias, 'understeer_safe');
      return {
        ...config,
        drivetrain: { frontBias: 0.50 }, // 50/50 AWD
        suspension: arb,
        handling: {
          ...config.handling,
          steeringSpeed: 7.5,
          assists: {
            yawDamping: 0.15,
            driftGripMultiplier: 0.72,
          },
        },
        aerodynamics: {
          downforceFactor: Math.max(22, config.aerodynamics.downforceFactor * 1.3),
        },
      };
    }
    case 'soft_offroad': {
      const tunedWheels = tuneSuspensionForMass(config.wheels, mass, {
        frontBias,
        targetFrequencyFrontHz: 1.6,
        targetFrequencyRearHz: 1.7,
        dampingRatio: 0.78,
      });
      const arb = tuneAntiRollBars(mass, frontBias, 'neutral');
      return {
        ...config,
        wheels: tunedWheels,
        suspension: {
          frontAntiRollBarStiffness: arb.frontAntiRollBarStiffness * 0.75,
          rearAntiRollBarStiffness: arb.rearAntiRollBarStiffness * 0.75,
          antiSquatStiffness: arb.antiSquatStiffness * 0.85,
        },
        handling: {
          ...config.handling,
          assists: {
            yawDamping: 0.14,
            driftGripMultiplier: 0.68,
          },
        },
      };
    }
    case 'balanced_rally':
    default: {
      const arb = tuneAntiRollBars(mass, frontBias, 'neutral');
      return {
        ...config,
        drivetrain: { frontBias: 0.48 },
        suspension: arb,
        handling: {
          ...config.handling,
          assists: {
            yawDamping: 0.11,
            driftGripMultiplier: 0.68,
          },
        },
      };
    }
  }
}
