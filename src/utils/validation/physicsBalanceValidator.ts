import type { DrivingModelBalance } from '@/config/physicsBalance';
import type { ValidationResult } from './vehicleValidator';

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Validates a DrivingModelBalance configuration profile.
 * Ensures numerical sanity, safe ranges, and prevents NaN or Infinity
 * from corrupting the physics engine during automated or AI tuning.
 */
export function validateDrivingModelBalance(balance: DrivingModelBalance): ValidationResult {
  const errors: string[] = [];

  if (!balance || typeof balance !== 'object') {
    return { valid: false, errors: ['DrivingModelBalance must be a valid non-null object.'] };
  }

  // --- 1. Handbrake ---
  const hb = balance.handbrake;
  if (!hb) {
    errors.push('DrivingModelBalance.handbrake section is missing.');
  } else {
    if (!isFiniteNumber(hb.minLockupBrakeForce) || hb.minLockupBrakeForce <= 0) {
      errors.push(`handbrake.minLockupBrakeForce must be a positive finite number (got: ${hb.minLockupBrakeForce}).`);
    }
    if (!isFiniteNumber(hb.rearLockupImpulseMultiplier) || hb.rearLockupImpulseMultiplier <= 0) {
      errors.push(`handbrake.rearLockupImpulseMultiplier must be > 0 (got: ${hb.rearLockupImpulseMultiplier}).`);
    }
    if (!isFiniteNumber(hb.frontSteerYieldMultiplier) || hb.frontSteerYieldMultiplier <= 0 || hb.frontSteerYieldMultiplier > 2.0) {
      errors.push(`handbrake.frontSteerYieldMultiplier must be between (0, 2.0] (got: ${hb.frontSteerYieldMultiplier}).`);
    }
    if (typeof hb.disableAwdPropulsion !== 'boolean') {
      errors.push('handbrake.disableAwdPropulsion must be a boolean.');
    }
    if (!isFiniteNumber(hb.rollDampingBoost) || hb.rollDampingBoost < 0) {
      errors.push(`handbrake.rollDampingBoost must be >= 0 (got: ${hb.rollDampingBoost}).`);
    }
    if (!isFiniteNumber(hb.maxYawRateCeiling) || hb.maxYawRateCeiling <= 0) {
      errors.push(`handbrake.maxYawRateCeiling must be > 0 (got: ${hb.maxYawRateCeiling}).`);
    }
    if (!isFiniteNumber(hb.yawExcessDampingGain) || hb.yawExcessDampingGain < 0) {
      errors.push(`handbrake.yawExcessDampingGain must be >= 0 (got: ${hb.yawExcessDampingGain}).`);
    }
  }

  // --- 2. Suspension ---
  const susp = balance.suspension;
  if (!susp) {
    errors.push('DrivingModelBalance.suspension section is missing.');
  } else {
    if (!isFiniteNumber(susp.antiRollBarMassScale) || susp.antiRollBarMassScale < 0) {
      errors.push(`suspension.antiRollBarMassScale must be >= 0 (got: ${susp.antiRollBarMassScale}).`);
    }
    if (!isFiniteNumber(susp.antiSquatMassScale) || susp.antiSquatMassScale < 0) {
      errors.push(`suspension.antiSquatMassScale must be >= 0 (got: ${susp.antiSquatMassScale}).`);
    }
    if (!isFiniteNumber(susp.pitchDampingMassScale) || susp.pitchDampingMassScale < 0) {
      errors.push(`suspension.pitchDampingMassScale must be >= 0 (got: ${susp.pitchDampingMassScale}).`);
    }
    if (!isFiniteNumber(susp.maxRestoringPitchTorqueG) || susp.maxRestoringPitchTorqueG <= 0) {
      errors.push(`suspension.maxRestoringPitchTorqueG must be > 0 (got: ${susp.maxRestoringPitchTorqueG}).`);
    }
    if (!isFiniteNumber(susp.antiWheeliePitchMultiplier) || susp.antiWheeliePitchMultiplier < 0) {
      errors.push(`suspension.antiWheeliePitchMultiplier must be >= 0 (got: ${susp.antiWheeliePitchMultiplier}).`);
    }
  }

  // --- 3. Drivetrain ---
  const dt = balance.drivetrain;
  if (!dt) {
    errors.push('DrivingModelBalance.drivetrain section is missing.');
  } else {
    if (!isFiniteNumber(dt.launchRampEndSpeedMps) || dt.launchRampEndSpeedMps <= 0) {
      errors.push(`drivetrain.launchRampEndSpeedMps must be > 0 (got: ${dt.launchRampEndSpeedMps}).`);
    }
    if (!isFiniteNumber(dt.launchRampBaseFraction) || dt.launchRampBaseFraction <= 0 || dt.launchRampBaseFraction > 1.0) {
      errors.push(`drivetrain.launchRampBaseFraction must be between (0, 1.0] (got: ${dt.launchRampBaseFraction}).`);
    }
    if (!isFiniteNumber(dt.gear2TorquePunch) || dt.gear2TorquePunch <= 0) {
      errors.push(`drivetrain.gear2TorquePunch must be > 0 (got: ${dt.gear2TorquePunch}).`);
    }
    if (!isFiniteNumber(dt.driftBoostSteerWeight) || dt.driftBoostSteerWeight < 0) {
      errors.push(`drivetrain.driftBoostSteerWeight must be >= 0 (got: ${dt.driftBoostSteerWeight}).`);
    }
    if (!isFiniteNumber(dt.driftBoostSlipWeight) || dt.driftBoostSlipWeight < 0) {
      errors.push(`drivetrain.driftBoostSlipWeight must be >= 0 (got: ${dt.driftBoostSlipWeight}).`);
    }
    if (!isFiniteNumber(dt.frontUnweightedDampingThreshold) || dt.frontUnweightedDampingThreshold <= 0) {
      errors.push(`drivetrain.frontUnweightedDampingThreshold must be > 0 (got: ${dt.frontUnweightedDampingThreshold}).`);
    }
    if (!isFiniteNumber(dt.driftPropulsionMultiplier) || dt.driftPropulsionMultiplier <= 0) {
      errors.push(`drivetrain.driftPropulsionMultiplier must be > 0 (got: ${dt.driftPropulsionMultiplier}).`);
    }
    if (!isFiniteNumber(dt.driftSteeredPullRatio) || dt.driftSteeredPullRatio < 0 || dt.driftSteeredPullRatio > 1.0) {
      errors.push(`drivetrain.driftSteeredPullRatio must be between [0, 1.0] (got: ${dt.driftSteeredPullRatio}).`);
    }
    if (!isFiniteNumber(dt.driftTargetSpeedKmh) || dt.driftTargetSpeedKmh < 30 || dt.driftTargetSpeedKmh > 180) {
      errors.push(`drivetrain.driftTargetSpeedKmh must be between [30, 180] (got: ${dt.driftTargetSpeedKmh}).`);
    }
    if (!isFiniteNumber(dt.dccdMinFrontBias) || dt.dccdMinFrontBias < 0.10 || dt.dccdMinFrontBias > 0.90) {
      errors.push(`drivetrain.dccdMinFrontBias must be between [0.10, 0.90] (got: ${dt.dccdMinFrontBias}).`);
    }
    if (!isFiniteNumber(dt.dccdDriftFrontBias) || dt.dccdDriftFrontBias < 0.10 || dt.dccdDriftFrontBias > 0.90) {
      errors.push(`drivetrain.dccdDriftFrontBias must be between [0.10, 0.90] (got: ${dt.dccdDriftFrontBias}).`);
    }
    if (!isFiniteNumber(dt.dccdIntensityDecayRate) || dt.dccdIntensityDecayRate <= 0) {
      errors.push(`drivetrain.dccdIntensityDecayRate must be > 0 (got: ${dt.dccdIntensityDecayRate}).`);
    }
    if (!isFiniteNumber(dt.rearSpoolLockRatio) || dt.rearSpoolLockRatio < 0 || dt.rearSpoolLockRatio > 1.0) {
      errors.push(`drivetrain.rearSpoolLockRatio must be between [0, 1.0] (got: ${dt.rearSpoolLockRatio}).`);
    }
    if (dt.driveForceScale !== undefined && (!isFiniteNumber(dt.driveForceScale) || dt.driveForceScale <= 0 || dt.driveForceScale > 2.0)) {
      errors.push(`drivetrain.driveForceScale must be between (0, 2.0] (got: ${dt.driveForceScale}).`);
    }
    if (dt.turboSpoolRate !== undefined && (!isFiniteNumber(dt.turboSpoolRate) || dt.turboSpoolRate <= 0)) {
      errors.push(`drivetrain.turboSpoolRate must be > 0 (got: ${dt.turboSpoolRate}).`);
    }
    if (dt.offBoostTorqueFloor !== undefined && (!isFiniteNumber(dt.offBoostTorqueFloor) || dt.offBoostTorqueFloor <= 0 || dt.offBoostTorqueFloor > 1.0)) {
      errors.push(`drivetrain.offBoostTorqueFloor must be between (0, 1.0] (got: ${dt.offBoostTorqueFloor}).`);
    }
    if (dt.aeroDragScale !== undefined && (!isFiniteNumber(dt.aeroDragScale) || dt.aeroDragScale < 0)) {
      errors.push(`drivetrain.aeroDragScale must be >= 0 (got: ${dt.aeroDragScale}).`);
    }
    if (dt.reverseGearRatio !== undefined && (!isFiniteNumber(dt.reverseGearRatio) || dt.reverseGearRatio < 1.0 || dt.reverseGearRatio > 4.0)) {
      errors.push(`drivetrain.reverseGearRatio must be between [1.0, 4.0] (got: ${dt.reverseGearRatio}).`);
    }
    if (dt.reverseLaunchRampFraction !== undefined && (!isFiniteNumber(dt.reverseLaunchRampFraction) || dt.reverseLaunchRampFraction <= 0 || dt.reverseLaunchRampFraction > 1.0)) {
      errors.push(`drivetrain.reverseLaunchRampFraction must be between (0, 1.0] (got: ${dt.reverseLaunchRampFraction}).`);
    }
  }

  // --- 4. Assists ---
  const ast = balance.assists;
  if (!ast) {
    errors.push('DrivingModelBalance.assists section is missing.');
  } else {
    if (!isFiniteNumber(ast.turnInTorqueGain) || ast.turnInTorqueGain < 0) {
      errors.push(`assists.turnInTorqueGain must be >= 0 (got: ${ast.turnInTorqueGain}).`);
    }
    if (!isFiniteNumber(ast.countersteerDampingBase) || ast.countersteerDampingBase < 0) {
      errors.push(`assists.countersteerDampingBase must be >= 0 (got: ${ast.countersteerDampingBase}).`);
    }
    if (!isFiniteNumber(ast.rollDampingNormal) || ast.rollDampingNormal < 0) {
      errors.push(`assists.rollDampingNormal must be >= 0 (got: ${ast.rollDampingNormal}).`);
    }
    if (!isFiniteNumber(ast.steerAssistDeadzone) || ast.steerAssistDeadzone < 0 || ast.steerAssistDeadzone > 0.2) {
      errors.push(`assists.steerAssistDeadzone must be between [0, 0.2] (got: ${ast.steerAssistDeadzone}).`);
    }
    if (!isFiniteNumber(ast.pitchDampingThrottleUp) || ast.pitchDampingThrottleUp < 0) {
      errors.push(`assists.pitchDampingThrottleUp must be >= 0 (got: ${ast.pitchDampingThrottleUp}).`);
    }
    if (!isFiniteNumber(ast.pitchDampingNormal) || ast.pitchDampingNormal < 0) {
      errors.push(`assists.pitchDampingNormal must be >= 0 (got: ${ast.pitchDampingNormal}).`);
    }
    if (!isFiniteNumber(ast.virtualCasterAuthority) || ast.virtualCasterAuthority < 0 || ast.virtualCasterAuthority > 1.0) {
      errors.push(`assists.virtualCasterAuthority must be between [0, 1.0] (got: ${ast.virtualCasterAuthority}).`);
    }
    if (!isFiniteNumber(ast.virtualCasterMinSlipAngle) || ast.virtualCasterMinSlipAngle <= 0 || ast.virtualCasterMinSlipAngle > Math.PI / 4) {
      errors.push(`assists.virtualCasterMinSlipAngle must be between (0, PI/4] (got: ${ast.virtualCasterMinSlipAngle}).`);
    }
    if (!isFiniteNumber(ast.flickAttenuationGain) || ast.flickAttenuationGain < 0 || ast.flickAttenuationGain > 1.0) {
      errors.push(`assists.flickAttenuationGain must be between [0, 1.0] (got: ${ast.flickAttenuationGain}).`);
    }
    if (!isFiniteNumber(ast.autoCounterSteerBias) || ast.autoCounterSteerBias < 0 || ast.autoCounterSteerBias > 1.0) {
      errors.push(`assists.autoCounterSteerBias must be between [0, 1.0] (got: ${ast.autoCounterSteerBias}).`);
    }
  }

  // --- 5. Tires ---
  const tr = balance.tires;
  if (!tr) {
    errors.push('DrivingModelBalance.tires section is missing.');
  } else {
    if (!isFiniteNumber(tr.minPowerSlideSlipAngle) || tr.minPowerSlideSlipAngle <= 0 || tr.minPowerSlideSlipAngle > Math.PI / 2) {
      errors.push(`tires.minPowerSlideSlipAngle must be between (0, PI/2] (got: ${tr.minPowerSlideSlipAngle}).`);
    }
    if (!isFiniteNumber(tr.wheelspinFrictionDropFront) || tr.wheelspinFrictionDropFront < 0 || tr.wheelspinFrictionDropFront >= 1.0) {
      errors.push(`tires.wheelspinFrictionDropFront must be between [0, 1.0) (got: ${tr.wheelspinFrictionDropFront}).`);
    }
    if (!isFiniteNumber(tr.wheelspinFrictionDropRear) || tr.wheelspinFrictionDropRear < 0 || tr.wheelspinFrictionDropRear >= 1.0) {
      errors.push(`tires.wheelspinFrictionDropRear must be between [0, 1.0) (got: ${tr.wheelspinFrictionDropRear}).`);
    }
    if (!isFiniteNumber(tr.looseSurfaceFrontWeight) || tr.looseSurfaceFrontWeight < 0) {
      errors.push(`tires.looseSurfaceFrontWeight must be >= 0 (got: ${tr.looseSurfaceFrontWeight}).`);
    }
    if (!isFiniteNumber(tr.looseSurfaceRearWeight) || tr.looseSurfaceRearWeight < 0) {
      errors.push(`tires.looseSurfaceRearWeight must be >= 0 (got: ${tr.looseSurfaceRearWeight}).`);
    }
    if (!isFiniteNumber(tr.looseSurfaceGripFloor) || tr.looseSurfaceGripFloor <= 0 || tr.looseSurfaceGripFloor > 1.0) {
      errors.push(`tires.looseSurfaceGripFloor must be between (0, 1.0] (got: ${tr.looseSurfaceGripFloor}).`);
    }
    if (!isFiniteNumber(tr.looseSurfaceShearScale) || tr.looseSurfaceShearScale < 0 || tr.looseSurfaceShearScale > 1.0) {
      errors.push(`tires.looseSurfaceShearScale must be between [0, 1.0] (got: ${tr.looseSurfaceShearScale}).`);
    }
    if (!isFiniteNumber(tr.loadSensitivityFactor) || tr.loadSensitivityFactor < 0 || tr.loadSensitivityFactor > 0.50) {
      errors.push(`tires.loadSensitivityFactor must be between [0, 0.50] (got: ${tr.loadSensitivityFactor}).`);
    }
    if (!isFiniteNumber(tr.frictionEllipseCoupling) || tr.frictionEllipseCoupling < 0 || tr.frictionEllipseCoupling > 1.0) {
      errors.push(`tires.frictionEllipseCoupling must be between [0, 1.0] (got: ${tr.frictionEllipseCoupling}).`);
    }
    if (!isFiniteNumber(tr.rearOversteerLateralBias) || tr.rearOversteerLateralBias <= 0 || tr.rearOversteerLateralBias > 1.5) {
      errors.push(`tires.rearOversteerLateralBias must be between (0, 1.5] (got: ${tr.rearOversteerLateralBias}).`);
    }
    if (!isFiniteNumber(tr.lowSpeedViscousBlend) || tr.lowSpeedViscousBlend <= 0 || tr.lowSpeedViscousBlend > 10.0) {
      errors.push(`tires.lowSpeedViscousBlend must be between (0, 10.0] (got: ${tr.lowSpeedViscousBlend}).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
