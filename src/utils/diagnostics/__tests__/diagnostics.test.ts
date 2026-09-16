import { describe, it, expect } from 'vitest';
import {
  runGameDiagnostics,
  assertGameIntegrity,
  validateVehicleRegistryIntegrity,
  validateLevelRegistryIntegrity,
  validateSurfaceRegistryIntegrity,
  validatePhysicsBalanceIntegrity,
} from '@/utils/diagnostics';

describe('Game Diagnostics & Integrity Suite', () => {
  it('validates vehicle registry without errors', () => {
    const report = validateVehicleRegistryIntegrity();
    expect(report.errors).toHaveLength(0);
  });

  it('validates level registry without errors', () => {
    const report = validateLevelRegistryIntegrity();
    expect(report.errors).toHaveLength(0);
  });

  it('validates surface registry without errors', () => {
    const report = validateSurfaceRegistryIntegrity();
    expect(report.errors).toHaveLength(0);
  });

  it('validates physics balance without errors', () => {
    const report = validatePhysicsBalanceIntegrity();
    expect(report.errors).toHaveLength(0);
  });

  it('runs complete game diagnostics with 100% validity', () => {
    const report = runGameDiagnostics();
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.summary.vehiclesCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.levelsCount).toBeGreaterThanOrEqual(3);
    expect(report.summary.surfacesCount).toBeGreaterThanOrEqual(6);
  });

  it('assertGameIntegrity succeeds without throwing', () => {
    expect(() => assertGameIntegrity()).not.toThrow();
  });
});
