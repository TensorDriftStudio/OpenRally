import type { VehicleConfig, VehiclePreset } from '@/types/vehicle';
import { resolveVehicleBalance } from '@/config/physicsBalance';
import { validateDrivingModelBalance } from './physicsBalanceValidator';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates a vehicle physics configuration object.
 * Returns detailed error messages if any physical parameter is out of expected bounds.
 */
export function validateVehicleConfig(config: VehicleConfig): ValidationResult {
  const errors: string[] = [];

  if (!config) {
    return { valid: false, errors: ['VehicleConfig is null or undefined'] };
  }

  // Chassis checks
  if (typeof config.chassisMass !== 'number' || config.chassisMass <= 0) {
    errors.push(`Invalid chassisMass: ${config.chassisMass}. Must be positive number.`);
  }

  if (!config.chassisSize || config.chassisSize.length !== 3 || config.chassisSize.some((dim) => dim <= 0)) {
    errors.push(`Invalid chassisSize: [${config.chassisSize?.join(', ')}]. Must be [width, height, length] with positive dimensions.`);
  }

  // Engine checks
  if (!config.engine || config.engine.maxForce <= 0) {
    errors.push(`Invalid engine.maxForce: ${config.engine?.maxForce}. Must be > 0.`);
  }
  if (!config.engine || config.engine.maxSpeed <= 0) {
    errors.push(`Invalid engine.maxSpeed: ${config.engine?.maxSpeed}. Must be > 0.`);
  }
  if (config.engine?.turboBoostMultiplier !== undefined && (typeof config.engine.turboBoostMultiplier !== 'number' || config.engine.turboBoostMultiplier < 1.0)) {
    errors.push(`Invalid engine.turboBoostMultiplier: ${config.engine.turboBoostMultiplier}. Must be >= 1.0.`);
  }
  if (config.engine?.boostThresholdRpm !== undefined && (typeof config.engine.boostThresholdRpm !== 'number' || config.engine.boostThresholdRpm <= 0)) {
    errors.push(`Invalid engine.boostThresholdRpm: ${config.engine.boostThresholdRpm}. Must be > 0.`);
  }
  if (config.engine?.turboSpoolRate !== undefined && (typeof config.engine.turboSpoolRate !== 'number' || config.engine.turboSpoolRate <= 0)) {
    errors.push(`Invalid engine.turboSpoolRate: ${config.engine.turboSpoolRate}. Must be > 0.`);
  }

  // Aerodynamics checks
  if (!config.aerodynamics || typeof config.aerodynamics.downforceFactor !== 'number' || config.aerodynamics.downforceFactor < 0) {
    errors.push(`Invalid aerodynamics.downforceFactor: ${config.aerodynamics?.downforceFactor}. Must be >= 0.`);
  }
  if (config.aerodynamics?.dragCoefficient !== undefined && (typeof config.aerodynamics.dragCoefficient !== 'number' || config.aerodynamics.dragCoefficient <= 0)) {
    errors.push(`Invalid aerodynamics.dragCoefficient: ${config.aerodynamics.dragCoefficient}. Must be > 0.`);
  }
  if (config.aerodynamics?.frontalArea !== undefined && (typeof config.aerodynamics.frontalArea !== 'number' || config.aerodynamics.frontalArea <= 0)) {
    errors.push(`Invalid aerodynamics.frontalArea: ${config.aerodynamics.frontalArea}. Must be > 0.`);
  }
  if (config.aerodynamics?.dragMultiplier !== undefined && (typeof config.aerodynamics.dragMultiplier !== 'number' || config.aerodynamics.dragMultiplier < 0)) {
    errors.push(`Invalid aerodynamics.dragMultiplier: ${config.aerodynamics.dragMultiplier}. Must be >= 0.`);
  }

  // Drivetrain checks
  if (!config.drivetrain || config.drivetrain.frontBias < 0 || config.drivetrain.frontBias > 1) {
    errors.push(`Invalid drivetrain.frontBias: ${config.drivetrain?.frontBias}. Must be between 0.0 and 1.0.`);
  }

  // Brakes checks
  if (!config.brakes || config.brakes.maxForce <= 0) {
    errors.push(`Invalid brakes.maxForce: ${config.brakes?.maxForce}. Must be > 0.`);
  }
  if (!config.brakes || config.brakes.handbrakeForce <= 0) {
    errors.push(`Invalid brakes.handbrakeForce: ${config.brakes?.handbrakeForce}. Must be > 0.`);
  }
  if (!config.brakes || config.brakes.frontBias < 0 || config.brakes.frontBias > 1) {
    errors.push(`Invalid brakes.frontBias: ${config.brakes?.frontBias}. Must be between 0.0 and 1.0.`);
  }

  // Suspension checks
  if (!config.suspension || config.suspension.frontAntiRollBarStiffness < 0) {
    errors.push(`Invalid suspension.frontAntiRollBarStiffness. Must be >= 0.`);
  }
  if (!config.suspension || config.suspension.rearAntiRollBarStiffness < 0) {
    errors.push(`Invalid suspension.rearAntiRollBarStiffness. Must be >= 0.`);
  }
  if (config.suspension && config.suspension.antiSquatStiffness !== undefined && config.suspension.antiSquatStiffness < 0) {
    errors.push(`Invalid suspension.antiSquatStiffness: ${config.suspension.antiSquatStiffness}. Must be >= 0.`);
  }

  // Weight distribution checks (optional)
  if (config.weightDistribution) {
    if (typeof config.weightDistribution.frontBias !== 'number' || config.weightDistribution.frontBias <= 0 || config.weightDistribution.frontBias >= 1) {
      errors.push(`Invalid weightDistribution.frontBias: ${config.weightDistribution.frontBias}. Must be between 0.0 and 1.0.`);
    }
    if (typeof config.weightDistribution.engineOffsetZ !== 'number' || isNaN(config.weightDistribution.engineOffsetZ)) {
      errors.push(`Invalid weightDistribution.engineOffsetZ. Must be a valid number.`);
    }
    if (config.weightDistribution.engineOffsetY !== undefined && (typeof config.weightDistribution.engineOffsetY !== 'number' || isNaN(config.weightDistribution.engineOffsetY))) {
      errors.push(`Invalid weightDistribution.engineOffsetY. Must be a valid number.`);
    }
    if (config.weightDistribution.centerOfMassZ !== undefined && (typeof config.weightDistribution.centerOfMassZ !== 'number' || isNaN(config.weightDistribution.centerOfMassZ))) {
      errors.push(`Invalid weightDistribution.centerOfMassZ. Must be a valid number.`);
    }
  }

  // Handling & Steering checks
  if (!config.handling || !Array.isArray(config.handling.steeringCurve) || config.handling.steeringCurve.length < 2) {
    errors.push('handling.steeringCurve must be an array with at least 2 [speedKmh, maxSteerAngleRad] points.');
  } else {
    // Check speed monotonicity
    for (let i = 0; i < config.handling.steeringCurve.length - 1; i++) {
      if (config.handling.steeringCurve[i][0] >= config.handling.steeringCurve[i + 1][0]) {
        errors.push(`handling.steeringCurve points must be sorted strictly ascending by speed (index ${i} vs ${i + 1}).`);
      }
    }
  }

  if (!config.handling || config.handling.steeringSpeed <= 0) {
    errors.push(`Invalid handling.steeringSpeed: ${config.handling?.steeringSpeed}. Must be > 0.`);
  }

  // Wheels checks
  if (!config.wheels || config.wheels.length !== 4) {
    errors.push(`Invalid wheels count: ${config.wheels?.length ?? 0}. Exactly 4 wheels (FL, FR, RL, RR) are required.`);
  } else {
    config.wheels.forEach((wheel, idx) => {
      const name = ['FL (0)', 'FR (1)', 'RL (2)', 'RR (3)'][idx] || `Wheel ${idx}`;
      if (!wheel.position || wheel.position.length !== 3) {
        errors.push(`${name}: position must be a 3-element tuple [x, y, z].`);
      }
      if (typeof wheel.radius !== 'number' || wheel.radius <= 0) {
        errors.push(`${name}: radius must be > 0.`);
      }
      if (typeof wheel.suspensionRestLength !== 'number' || wheel.suspensionRestLength <= 0) {
        errors.push(`${name}: suspensionRestLength must be > 0.`);
      }
      if (typeof wheel.suspensionTravel !== 'number' || wheel.suspensionTravel <= 0) {
        errors.push(`${name}: suspensionTravel must be > 0.`);
      }
      if (typeof wheel.suspensionStiffness !== 'number' || wheel.suspensionStiffness <= 0) {
        errors.push(`${name}: suspensionStiffness must be > 0.`);
      }
      if (typeof wheel.suspensionDamping !== 'number' || wheel.suspensionDamping <= 0) {
        errors.push(`${name}: suspensionDamping must be > 0.`);
      }
      if (
        wheel.minSuspensionLength != null &&
        (typeof wheel.minSuspensionLength !== 'number' ||
          wheel.minSuspensionLength <= 0 ||
          wheel.minSuspensionLength >= wheel.suspensionRestLength)
      ) {
        errors.push(`${name}: minSuspensionLength must be > 0 and < suspensionRestLength.`);
      }
    });
  }

  // Balance overrides checks (optional)
  if (config.balanceOverrides) {
    const resolved = resolveVehicleBalance(config);
    const balanceVal = validateDrivingModelBalance(resolved);
    if (!balanceVal.valid) {
      errors.push(...balanceVal.errors.map((e) => `balanceOverrides: ${e}`));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a vehicle preset metadata and physical configuration.
 */
export function validateVehiclePreset(preset: VehiclePreset): ValidationResult {
  const errors: string[] = [];

  if (!preset.id || typeof preset.id !== 'string') {
    errors.push('VehiclePreset.id is missing or not a string.');
  }
  if (!preset.name || typeof preset.name !== 'string') {
    errors.push('VehiclePreset.name is missing or not a string.');
  }
  if (!preset.modelPath || typeof preset.modelPath !== 'string') {
    errors.push('VehiclePreset.modelPath is missing or not a string.');
  }

  const configValidation = validateVehicleConfig(preset.config);
  if (!configValidation.valid) {
    errors.push(...configValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
