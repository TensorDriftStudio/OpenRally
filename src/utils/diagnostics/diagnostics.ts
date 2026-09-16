import { VEHICLE_REGISTRY, DEFAULT_VEHICLE_ID } from '@/config/vehicleRegistry';
import { LEVEL_REGISTRY, DEFAULT_LEVEL_ID } from '@/config/levelRegistry';
import { SURFACE_REGISTRY } from '@/config/surfaceRegistry';
import { DRIVING_MODEL_BALANCE } from '@/config/physicsBalance';
import { validateVehiclePreset } from '@/utils/validation/vehicleValidator';
import { validateLevelPreset } from '@/utils/validation/levelValidator';
import { validateSurfaceDefinition } from '@/utils/validation/surfaceValidator';
import { validateDrivingModelBalance } from '@/utils/validation/physicsBalanceValidator';

export interface DiagnosticsReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: {
    readonly vehiclesCount: number;
    readonly levelsCount: number;
    readonly surfacesCount: number;
  };
}

/**
 * Validates all registered vehicles in the vehicle registry.
 */
export function validateVehicleRegistryIntegrity(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const vehicleIds = Object.keys(VEHICLE_REGISTRY);

  if (vehicleIds.length === 0) {
    errors.push('VEHICLE_REGISTRY is empty.');
    return { errors, warnings };
  }

  if (!VEHICLE_REGISTRY[DEFAULT_VEHICLE_ID]) {
    errors.push(`DEFAULT_VEHICLE_ID "${DEFAULT_VEHICLE_ID}" does not exist in VEHICLE_REGISTRY.`);
  }

  for (const [id, preset] of Object.entries(VEHICLE_REGISTRY)) {
    if (preset.id !== id) {
      errors.push(`Vehicle registry key "${id}" does not match preset.id "${preset.id}".`);
    }

    const validation = validateVehiclePreset(preset);
    if (!validation.valid) {
      errors.push(...validation.errors.map((e) => `[Vehicle: ${id}] ${e}`));
    }

    // Symmetry check for wheels
    const wheels = preset.config.wheels;
    if (wheels && wheels.length === 4) {
      const [fl, fr, rl, rr] = wheels;
      if (Math.abs(fl.position[0] + fr.position[0]) > 0.05) {
        warnings.push(`[Vehicle: ${id}] Front wheels FL and FR are not symmetric along X axis.`);
      }
      if (Math.abs(rl.position[0] + rr.position[0]) > 0.05) {
        warnings.push(`[Vehicle: ${id}] Rear wheels RL and RR are not symmetric along X axis.`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validates all registered levels in the level registry.
 */
export function validateLevelRegistryIntegrity(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const levelIds = Object.keys(LEVEL_REGISTRY);

  if (levelIds.length === 0) {
    errors.push('LEVEL_REGISTRY is empty.');
    return { errors, warnings };
  }

  if (!LEVEL_REGISTRY[DEFAULT_LEVEL_ID]) {
    errors.push(`DEFAULT_LEVEL_ID "${DEFAULT_LEVEL_ID}" does not exist in LEVEL_REGISTRY.`);
  }

  for (const [id, preset] of Object.entries(LEVEL_REGISTRY)) {
    if (preset.id !== id) {
      errors.push(`Level registry key "${id}" does not match preset.id "${preset.id}".`);
    }

    const validation = validateLevelPreset(preset);
    if (!validation.valid) {
      errors.push(...validation.errors.map((e) => `[Level: ${id}] ${e}`));
    }

    // Check spawn elevation vs fall reset bounds
    if (preset.spawnPosition[1] <= preset.fallResetY) {
      errors.push(
        `[Level: ${id}] spawnPosition.y (${preset.spawnPosition[1]}) must be greater than fallResetY (${preset.fallResetY}) to avoid instant respawn loops.`,
      );
    }

    // Check track boundaries within terrain width & depth
    const halfWidth = preset.data.terrainBase.width / 2;
    const halfDepth = preset.data.terrainBase.depth / 2;

    for (let i = 0; i < preset.data.track.points.length; i++) {
      const pt = preset.data.track.points[i];
      if (Math.abs(pt.x) > halfWidth || Math.abs(pt.z) > halfDepth) {
        errors.push(
          `[Level: ${id}] Track point index ${i} [${pt.x}, ${pt.z}] exceeds terrain bounds [±${halfWidth}, ±${halfDepth}].`,
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validates all registered surfaces in the surface registry.
 */
export function validateSurfaceRegistryIntegrity(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const surfaceKeys = Object.keys(SURFACE_REGISTRY);

  if (surfaceKeys.length === 0) {
    errors.push('SURFACE_REGISTRY is empty.');
    return { errors, warnings };
  }

  for (const [key, surface] of Object.entries(SURFACE_REGISTRY)) {
    if (surface.id !== key) {
      errors.push(`Surface registry key "${key}" does not match surface.id "${surface.id}".`);
    }

    const validation = validateSurfaceDefinition(surface);
    if (!validation.valid) {
      errors.push(...validation.errors.map((e) => `[Surface: ${key}] ${e}`));
    }
  }

  return { errors, warnings };
}

/**
 * Validates the global driving model balance configuration.
 */
export function validatePhysicsBalanceIntegrity(): { errors: string[]; warnings: string[] } {
  const validation = validateDrivingModelBalance(DRIVING_MODEL_BALANCE);
  return {
    errors: validation.valid ? [] : validation.errors.map((e) => `[PhysicsBalance] ${e}`),
    warnings: [],
  };
}

/**
 * Runs a comprehensive project-wide sanity check across all registries and assets.
 */
export function runGameDiagnostics(): DiagnosticsReport {
  const vehicleDiag = validateVehicleRegistryIntegrity();
  const levelDiag = validateLevelRegistryIntegrity();
  const surfaceDiag = validateSurfaceRegistryIntegrity();
  const balanceDiag = validatePhysicsBalanceIntegrity();

  const errors = [
    ...vehicleDiag.errors,
    ...levelDiag.errors,
    ...surfaceDiag.errors,
    ...balanceDiag.errors,
  ];
  const warnings = [
    ...vehicleDiag.warnings,
    ...levelDiag.warnings,
    ...surfaceDiag.warnings,
    ...balanceDiag.warnings,
  ];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      vehiclesCount: Object.keys(VEHICLE_REGISTRY).length,
      levelsCount: Object.keys(LEVEL_REGISTRY).length,
      surfacesCount: Object.keys(SURFACE_REGISTRY).length,
    },
  };
}

/**
 * Asserts full game integrity. Throws descriptive error if any registry check fails.
 */
export function assertGameIntegrity(): void {
  const report = runGameDiagnostics();
  if (!report.valid) {
    throw new Error(
      `OpenRally Game Integrity Check Failed with ${report.errors.length} error(s):\n` +
        report.errors.map((e) => `  - ${e}`).join('\n'),
    );
  }
}
