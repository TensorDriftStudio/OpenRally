import { describe, it, expect } from 'vitest';
import { diagnoseVehicleHandling } from '../vehicleDiagnostics';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { VEHICLE_REGISTRY } from '@/config/vehicleRegistry';
import type { VehicleConfig } from '@/types/vehicle';

describe('vehicleDiagnostics — AI Handling Quality & Safety Auditor', () => {
  it('evaluates DEFAULT_VEHICLE_CONFIG with optimal or safe status and valid metrics', () => {
    const report = diagnoseVehicleHandling(DEFAULT_VEHICLE_CONFIG);
    expect(report.metrics.totalMass).toBe(DEFAULT_VEHICLE_CONFIG.chassisMass);
    expect(report.metrics.frontBounceFrequencyHz).toBeGreaterThan(0.8);
    expect(report.metrics.topSpeedKmh).toBe(DEFAULT_VEHICLE_CONFIG.engine.maxSpeed);
    expect(report.status).not.toBe('critical');
  });

  it('detects dangerously underdamped suspension and provides suggested values', () => {
    const bouncyConfig: VehicleConfig = {
      ...DEFAULT_VEHICLE_CONFIG,
      wheels: DEFAULT_VEHICLE_CONFIG.wheels.map((w) => ({
        ...w,
        suspensionStiffness: 40,
        suspensionDamping: 0.5, // Dangerously underdamped
      })) as unknown as typeof DEFAULT_VEHICLE_CONFIG.wheels,
    };

    const report = diagnoseVehicleHandling(bouncyConfig);
    expect(report.status).toBe('critical');
    const finding = report.findings.find((f) => f.code === 'SUSPENSION_FRONT_UNDERDAMPED');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('critical');
    expect(finding?.suggestedValue).toBeGreaterThan(6.0);
    expect(finding?.suggestedValue).toBeLessThan(15.0);
  });

  it('detects weak handbrake force relative to chassis mass', () => {
    const heavyWeakHandbrake: VehicleConfig = {
      ...DEFAULT_VEHICLE_CONFIG,
      chassisMass: 250, // Very heavy vehicle
      brakes: {
        ...DEFAULT_VEHICLE_CONFIG.brakes,
        handbrakeForce: 10, // Too weak to lock wheels
      },
    };

    const report = diagnoseVehicleHandling(heavyWeakHandbrake);
    const finding = report.findings.find((f) => f.code === 'WEAK_HANDBRAKE_LOCKUP');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('critical');
    expect(finding?.suggestedValue).toBeGreaterThanOrEqual(38);
  });

  it('detects severe rear ARB bias promoting snap-oversteer', () => {
    const snapOversteerConfig: VehicleConfig = {
      ...DEFAULT_VEHICLE_CONFIG,
      suspension: {
        frontAntiRollBarStiffness: 6.0,
        rearAntiRollBarStiffness: 28.0, // Ratio = 6/28 = 0.21 < 0.55
      },
    };

    const report = diagnoseVehicleHandling(snapOversteerConfig);
    const finding = report.findings.find((f) => f.code === 'SNAP_OVERSTEER_REAR_ARB_BIAS');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
  });

  it('audits all 7 registered vehicles in the game without critical failures', () => {
    for (const [id, preset] of Object.entries(VEHICLE_REGISTRY)) {
      const report = diagnoseVehicleHandling(preset.config);
      // None of the official championship cars should have critical physics flaws
      expect(report.status, `Vehicle ${id} must not have critical diagnostics errors`).not.toBe('critical');
      expect(report.metrics.frontCornerMass).toBeGreaterThan(0);
      expect(report.metrics.rearCornerMass).toBeGreaterThan(0);
    }
  });
});
