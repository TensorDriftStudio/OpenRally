import type { VehicleConfig } from '@/types/vehicle';
import { resolveVehicleBalance, type DrivingModelBalance } from '@/config/physicsBalance';
import {
  calculateCornerMasses,
  calculateNaturalFrequencyHz,
  calculateDampingRatio,
  calculateDamping,
} from './tuningHelpers';

export type DiagnosticSeverity = 'info' | 'warning' | 'critical';

export interface DiagnosticFinding {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly parameterPath: string;
  readonly currentValue: unknown;
  readonly suggestedValue?: unknown;
  readonly explanation: string;
}

export interface VehicleHandlingMetrics {
  readonly totalMass: number;
  readonly frontCornerMass: number;
  readonly rearCornerMass: number;
  readonly frontBounceFrequencyHz: number;
  readonly rearBounceFrequencyHz: number;
  readonly frontDampingRatio: number;
  readonly rearDampingRatio: number;
  readonly handbrakeToMassRatio: number;
  readonly arbFrontToRearRatio: number;
  readonly topSpeedKmh: number;
  readonly topSpeedSteerAngleDeg: number;
}

export interface VehicleHandlingDiagnosticReport {
  readonly status: 'optimal' | 'warning' | 'critical';
  readonly metrics: VehicleHandlingMetrics;
  readonly findings: readonly DiagnosticFinding[];
  readonly summary: string;
}

/**
 * Performs comprehensive static and physical analysis of a VehicleConfig and effective balance.
 * Returns actionable diagnostic findings, physical metrics, and recommended values for AI agents.
 */
export function diagnoseVehicleHandling(
  config: VehicleConfig,
  customBalance?: DrivingModelBalance,
): VehicleHandlingDiagnosticReport {
  const findings: DiagnosticFinding[] = [];
  const balance = customBalance ?? resolveVehicleBalance(config);

  const mass = config.chassisMass;
  const cornerMasses = calculateCornerMasses(mass, config.weightDistribution);
  const wheels = config.wheels;

  const [fl, , rl] = wheels;

  // 1. Suspension Natural Frequency Checks
  const frontFreqHz = calculateNaturalFrequencyHz(fl.suspensionStiffness, cornerMasses.frontCornerMass);
  const rearFreqHz = calculateNaturalFrequencyHz(rl.suspensionStiffness, cornerMasses.rearCornerMass);

  if (frontFreqHz < 1.05) {
    findings.push({
      code: 'SUSPENSION_FRONT_TOO_SOFT',
      severity: 'warning',
      message: `Front suspension frequency is too low (${frontFreqHz} Hz < 1.05 Hz). Chassis will bottom out easily.`,
      parameterPath: 'wheels[0..1].suspensionStiffness',
      currentValue: fl.suspensionStiffness,
      suggestedValue: Math.round(fl.suspensionStiffness * 1.3),
      explanation: 'Low front bounce frequency leads to severe nose-scraping and sluggish turn-in.',
    });
  } else if (frontFreqHz > 3.8) {
    findings.push({
      code: 'SUSPENSION_FRONT_TOO_STIFF',
      severity: 'warning',
      message: `Front suspension frequency is excessively high (${frontFreqHz} Hz > 3.8 Hz). Car will skate over bumps.`,
      parameterPath: 'wheels[0..1].suspensionStiffness',
      currentValue: fl.suspensionStiffness,
      suggestedValue: Math.round(fl.suspensionStiffness * 0.75),
      explanation: 'Extremely stiff front springs cause harsh tire chatter and sudden loss of front traction.',
    });
  }

  // 2. Damping Ratio Checks (zeta)
  const frontZeta = calculateDampingRatio(fl.suspensionStiffness, fl.suspensionDamping, cornerMasses.frontCornerMass);
  const rearZeta = calculateDampingRatio(rl.suspensionStiffness, rl.suspensionDamping, cornerMasses.rearCornerMass);

  if (frontZeta < 0.40) {
    const idealDamp = calculateDamping(fl.suspensionStiffness, cornerMasses.frontCornerMass, 0.75);
    findings.push({
      code: 'SUSPENSION_FRONT_UNDERDAMPED',
      severity: 'critical',
      message: `Front suspension is heavily underdamped (zeta = ${frontZeta} < 0.40). Car will bounce like a basketball on landings.`,
      parameterPath: 'wheels[0..1].suspensionDamping',
      currentValue: fl.suspensionDamping,
      suggestedValue: idealDamp,
      explanation: 'Underdamped suspension leads to persistent pitch oscillations after jumps and braking.',
    });
  } else if (frontZeta > 1.40) {
    const idealDamp = calculateDamping(fl.suspensionStiffness, cornerMasses.frontCornerMass, 0.85);
    findings.push({
      code: 'SUSPENSION_FRONT_OVERDAMPED',
      severity: 'warning',
      message: `Front suspension is overdamped (zeta = ${frontZeta} > 1.40). Ride will feel rigid and pack down over repetitive ruts.`,
      parameterPath: 'wheels[0..1].suspensionDamping',
      currentValue: fl.suspensionDamping,
      suggestedValue: idealDamp,
      explanation: 'Overdamped dampers do not allow springs to rebound in time, packing down the chassis into the bump stops.',
    });
  }

  if (rearZeta < 0.40) {
    const idealDamp = calculateDamping(rl.suspensionStiffness, cornerMasses.rearCornerMass, 0.75);
    findings.push({
      code: 'SUSPENSION_REAR_UNDERDAMPED',
      severity: 'critical',
      message: `Rear suspension is heavily underdamped (zeta = ${rearZeta} < 0.40). Rear will buck upward over jumps and launch ramps.`,
      parameterPath: 'wheels[2..3].suspensionDamping',
      currentValue: rl.suspensionDamping,
      suggestedValue: idealDamp,
      explanation: 'Underdamped rear suspension causes kangaroo-hopping and violent launch wheelies.',
    });
  }

  // 3. Anti-Roll Bar (ARB) Balance Checks
  const frontArb = config.suspension?.frontAntiRollBarStiffness ?? 0;
  const rearArb = config.suspension?.rearAntiRollBarStiffness ?? 0;
  const arbRatio = rearArb > 0 ? Number((frontArb / rearArb).toFixed(2)) : 1.0;

  if (frontArb > 0 && rearArb > 0) {
    if (arbRatio < 0.55) {
      findings.push({
        code: 'SNAP_OVERSTEER_REAR_ARB_BIAS',
        severity: 'warning',
        message: `Rear ARB is excessively stiff relative to front (front/rear ratio: ${arbRatio} < 0.55). High risk of snap oversteer on corner entry.`,
        parameterPath: 'suspension.rearAntiRollBarStiffness',
        currentValue: rearArb,
        suggestedValue: Number((frontArb * 1.15).toFixed(1)),
        explanation: 'A disproportionately stiff rear anti-roll bar causes the inside rear tire to lift and outside tire to break away abruptly.',
      });
    } else if (arbRatio > 2.20) {
      findings.push({
        code: 'HEAVY_UNDERSTEER_FRONT_ARB_BIAS',
        severity: 'info',
        message: `Front ARB is heavily dominant (front/rear ratio: ${arbRatio} > 2.20). Vehicle may resist turning in at speed.`,
        parameterPath: 'suspension.frontAntiRollBarStiffness',
        currentValue: frontArb,
        suggestedValue: Number((rearArb * 1.25).toFixed(1)),
        explanation: 'Very stiff front ARB resists chassis roll by overloading front tires, causing plow-understeer.',
      });
    }
  }

  // 4. Handbrake Mechanical Lockup Check
  const hbForce = config.brakes.handbrakeForce;
  const hbRatio = Number((hbForce / mass).toFixed(3));
  const effectiveLockForce = Math.max(hbForce * balance.handbrake.rearLockupImpulseMultiplier, balance.handbrake.minLockupBrakeForce);

  if (hbForce < 20 || effectiveLockForce < 120) {
    findings.push({
      code: 'WEAK_HANDBRAKE_LOCKUP',
      severity: 'critical',
      message: `Handbrake force is too weak for chassis mass (${hbForce} N on ${mass} kg). Rear wheels may fail to lock on asphalt.`,
      parameterPath: 'brakes.handbrakeForce',
      currentValue: hbForce,
      suggestedValue: Math.max(38, Math.round(mass * 0.28)),
      explanation: 'Handbrake must authoritatively overpower tire surface friction to initiate clean rally pivots.',
    });
  }

  // 5. Steering Curve at Top Speed Check
  const topSpeed = config.engine.maxSpeed;
  const steeringCurve = config.handling.steeringCurve;
  const lastCurvePoint = steeringCurve[steeringCurve.length - 1];
  const topSpeedSteerRad = lastCurvePoint ? lastCurvePoint[1] : Math.PI / 18;
  const topSpeedSteerDeg = Number(((topSpeedSteerRad * 180) / Math.PI).toFixed(1));

  if (topSpeedSteerDeg > 18.0 && topSpeed > 180) {
    findings.push({
      code: 'TWITCHY_HIGH_SPEED_STEERING',
      severity: 'warning',
      message: `Steering lock at top speed is very wide (${topSpeedSteerDeg}° at ${lastCurvePoint[0]} km/h). Car may twitch or roll at 200+ km/h.`,
      parameterPath: 'handling.steeringCurve',
      currentValue: topSpeedSteerDeg,
      suggestedValue: 'Math.PI / 18 (~10 deg)',
      explanation: 'High-speed cornering requires tighter steering angle saturation to prevent violent rollover G forces.',
    });
  }

  // 6. Overall Status Determination
  const hasCritical = findings.some((f) => f.severity === 'critical');
  const hasWarning = findings.some((f) => f.severity === 'warning');
  const status: 'optimal' | 'warning' | 'critical' = hasCritical ? 'critical' : hasWarning ? 'warning' : 'optimal';

  const summary =
    status === 'optimal'
      ? 'Vehicle handling parameters are harmoniously balanced and physically sound.'
      : status === 'warning'
        ? `Vehicle handling has ${findings.length} advisory finding(s) that could improve feel or prevent edge-case handling flaws.`
        : `Vehicle handling has critical stability hazard(s) requiring immediate adjustment before simulation.`;

  return {
    status,
    metrics: {
      totalMass: mass,
      frontCornerMass: cornerMasses.frontCornerMass,
      rearCornerMass: cornerMasses.rearCornerMass,
      frontBounceFrequencyHz: frontFreqHz,
      rearBounceFrequencyHz: rearFreqHz,
      frontDampingRatio: frontZeta,
      rearDampingRatio: rearZeta,
      handbrakeToMassRatio: hbRatio,
      arbFrontToRearRatio: arbRatio,
      topSpeedKmh: topSpeed,
      topSpeedSteerAngleDeg: topSpeedSteerDeg,
    },
    findings,
    summary,
  };
}
