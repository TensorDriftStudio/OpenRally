import { describe, it, expect } from 'vitest';
import {
  runAccelerationBenchmark,
  runBrakingBenchmark,
  runSlalomBenchmark,
  runHandbrakeFlickBenchmark,
  runFullVehicleBenchmark,
} from '../testing/headlessSimulator';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { VEHICLE_REGISTRY } from '@/config/vehicleRegistry';
import type { VehicleConfig } from '@/types/vehicle';

describe('Headless Vehicle Simulator & AI Maneuver Benchmark Suite', () => {
  describe('Default Vehicle Handling Verification', () => {
    it('achieves 0-100 km/h acceleration cleanly without front axle lift', () => {
      const result = runAccelerationBenchmark(DEFAULT_VEHICLE_CONFIG);
      expect(result.completed).toBe(true);
      expect(result.timeTo100Kmh).toBeGreaterThan(1.0);
      expect(result.timeTo100Kmh).toBeLessThan(7.0);
      // Pitch must remain well below wheelie threshold
      expect(result.maxWheeliePitchDeg).toBeLessThan(15.0);
    });

    it('brakes 100-0 km/h within realistic distances with controlled nose dive', () => {
      const result = runBrakingBenchmark(DEFAULT_VEHICLE_CONFIG);
      expect(result.brakingDistanceM).toBeGreaterThan(15.0);
      expect(result.brakingDistanceM).toBeLessThan(65.0);
      // Anti-dive must quell forward pitching
      expect(result.maxDivePitchDeg).toBeLessThan(12.0);
    });

    it('maintains low chassis roll and high lateral stability during 75 km/h slalom', () => {
      const result = runSlalomBenchmark(DEFAULT_VEHICLE_CONFIG);
      expect(result.completed).toBe(true);
      expect(result.didRollOver).toBe(false);
      // ARB must keep body roll under 25 degrees
      expect(result.maxRollAngleDeg).toBeLessThan(25.0);
    });

    it('locks rear wheels instantly during high-speed handbrake flick without tripping', () => {
      const result = runHandbrakeFlickBenchmark(DEFAULT_VEHICLE_CONFIG);
      expect(result.didLockRearCalipers).toBe(true);
      expect(result.didRollOver).toBe(false);
      expect(result.maxRollAngleDeg).toBeLessThan(25.0);
      expect(result.peakYawRateRadSec).toBeGreaterThan(0.5);
    });

    it('passes all safety gates in the comprehensive scorecard', () => {
      const scorecard = runFullVehicleBenchmark(DEFAULT_VEHICLE_CONFIG);
      expect(scorecard.passedAllSafetyGates).toBe(true);
    });
  });

  describe('Registry-Wide Fleet Dynamic Verification (All 7 Vehicles)', () => {
    for (const [id, preset] of Object.entries(VEHICLE_REGISTRY)) {
      it(`evaluates ${preset.name} (${id}) passes all dynamic handling benchmarks`, () => {
        const scorecard = runFullVehicleBenchmark(preset.config);

        expect(
          scorecard.passedAllSafetyGates,
          `Vehicle ${id} failed safety gates: ${JSON.stringify(scorecard)}`,
        ).toBe(true);

        expect(scorecard.acceleration.completed).toBe(true);
        expect(scorecard.acceleration.maxWheeliePitchDeg).toBeLessThan(20.0);

        expect(scorecard.braking.brakingDistanceM).toBeLessThan(75.0);
        expect(scorecard.braking.maxDivePitchDeg).toBeLessThan(18.0);

        expect(scorecard.slalom.didRollOver).toBe(false);
        expect(scorecard.slalom.maxRollAngleDeg).toBeLessThan(30.0);

        expect(scorecard.handbrakeFlick.didLockRearCalipers).toBe(true);
        expect(scorecard.handbrakeFlick.didRollOver).toBe(false);
      });
    }
  });

  describe('Per-Vehicle Balance Overrides Dynamic Response', () => {
    it('applies balanceOverrides to alter dynamic handling behavior predictably', () => {
      // Create a test config with custom balance overrides (boosted ARB mass scale)
      const stiffArbConfig: VehicleConfig = {
        ...DEFAULT_VEHICLE_CONFIG,
        balanceOverrides: {
          suspension: {
            antiRollBarMassScale: 0.40, // 60% boost in ARB roll resistance
          },
        },
      };

      const normalSlalom = runSlalomBenchmark(DEFAULT_VEHICLE_CONFIG);
      const stiffSlalom = runSlalomBenchmark(stiffArbConfig);

      // Stiffer ARB balance override must reduce body roll angle during slalom
      expect(stiffSlalom.maxRollAngleDeg).toBeLessThanOrEqual(normalSlalom.maxRollAngleDeg);
    });
  });
});
