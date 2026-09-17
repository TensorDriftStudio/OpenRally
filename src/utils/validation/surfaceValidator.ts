import type { SurfaceDefinition } from '@/types/surface';
import type { ValidationResult } from './vehicleValidator';

/**
 * Validates a surface definition object.
 */
export function validateSurfaceDefinition(surface: SurfaceDefinition): ValidationResult {
  const errors: string[] = [];

  if (!surface) {
    return { valid: false, errors: ['SurfaceDefinition is null or undefined'] };
  }

  if (!surface.id || typeof surface.id !== 'string') {
    errors.push('SurfaceDefinition.id is missing or invalid.');
  }
  if (!surface.name || typeof surface.name !== 'string') {
    errors.push('SurfaceDefinition.name is missing or invalid.');
  }

  // Tire model checks
  const tm = surface.tireModel;
  if (!tm) {
    errors.push('SurfaceDefinition.tireModel is missing.');
  } else {
    ['front', 'rear'].forEach((axle) => {
      const grip = axle === 'front' ? tm.front : tm.rear;
      if (!grip) {
        errors.push(`tireModel.${axle} is missing.`);
      } else {
        if (grip.baseGrip <= 0) {
          errors.push(`tireModel.${axle}.baseGrip must be > 0 (currently: ${grip.baseGrip}).`);
        }
        if (grip.slideGrip <= 0) {
          errors.push(`tireModel.${axle}.slideGrip must be > 0 (currently: ${grip.slideGrip}).`);
        }
        if (grip.peakSlipAngle <= 0 || grip.peakSlipAngle > Math.PI / 2) {
          errors.push(`tireModel.${axle}.peakSlipAngle must be between (0, PI/2] (currently: ${grip.peakSlipAngle}).`);
        }
      }
    });
  }

  // Particles checks
  if (surface.particles) {
    if (surface.particles.scale <= 0) {
      errors.push(`particles.scale must be > 0 (currently: ${surface.particles.scale}).`);
    }
    if (surface.particles.lifetime <= 0) {
      errors.push(`particles.lifetime must be > 0 (currently: ${surface.particles.lifetime}).`);
    }
  }

  // Audio checks
  if (surface.audio) {
    if (surface.audio.volumeMultiplier < 0) {
      errors.push(`audio.volumeMultiplier must be >= 0 (currently: ${surface.audio.volumeMultiplier}).`);
    }
    if (surface.audio.basePitch <= 0) {
      errors.push(`audio.basePitch must be > 0 (currently: ${surface.audio.basePitch}).`);
    }
  }

  // Rolling resistance & traction loss checks
  if (surface.rollingResistance !== undefined && surface.rollingResistance < 0) {
    errors.push(`surface.rollingResistance must be >= 0 (currently: ${surface.rollingResistance}).`);
  }
  if (surface.looseSurfaceTractionLoss !== undefined && (surface.looseSurfaceTractionLoss < 0 || surface.looseSurfaceTractionLoss > 1)) {
    errors.push(`surface.looseSurfaceTractionLoss must be between [0, 1] (currently: ${surface.looseSurfaceTractionLoss}).`);
  }
  if (surface.sideFrictionStiffness !== undefined && (surface.sideFrictionStiffness <= 0 || surface.sideFrictionStiffness > 2.5)) {
    errors.push(`surface.sideFrictionStiffness must be between (0, 2.5] (currently: ${surface.sideFrictionStiffness}).`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
