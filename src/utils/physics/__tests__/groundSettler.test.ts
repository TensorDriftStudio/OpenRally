import { describe, it, expect } from 'vitest';
import { calculateGroundedVehicleTransform } from '../groundSettler';
import { getAvailableVehicles } from '@/config/vehicleRegistry';
import { getAvailableLevels } from '@/config/levelRegistry';
import { compileTerrain, getInterpolatedHeight } from '@/utils/terrainCompiler';

describe('calculateGroundedVehicleTransform', () => {
  const vehicles = getAvailableVehicles();
  const levels = getAvailableLevels();

  it('contains all 7 vehicles and all 5 levels', () => {
    expect(vehicles).toHaveLength(7);
    expect(levels).toHaveLength(5);
  });

  it('determines grounded transform for all 7 vehicles across all 5 levels with tires touching ground', () => {
    for (const level of levels) {
      const heightmapData = compileTerrain(level.data);
      const groundAtSpawn = getInterpolatedHeight(
        level.spawnPosition[0],
        level.spawnPosition[2],
        heightmapData.heights,
        heightmapData.rows,
        heightmapData.cols,
        level.data.terrainBase.width,
        level.data.terrainBase.depth,
      );

      for (const vehicle of vehicles) {
        const result = calculateGroundedVehicleTransform(
          level.spawnPosition,
          level.spawnRotationY,
          vehicle.config,
          heightmapData,
          level.data,
        );

        // Position checks
        expect(Number.isFinite(result.position[0])).toBe(true);
        expect(Number.isFinite(result.position[1])).toBe(true);
        expect(Number.isFinite(result.position[2])).toBe(true);
        expect(result.position[0]).toBeCloseTo(level.spawnPosition[0], 2);
        expect(result.position[2]).toBeCloseTo(level.spawnPosition[2], 2);

        // Chassis Y must sit resting height above the ground (between 0.55m and 1.05m above terrain)
        // Never floating at 9.5m (1.5m above ground)!
        const elevationAboveGround = result.position[1] - groundAtSpawn;
        expect(elevationAboveGround).toBeGreaterThanOrEqual(0.55);
        expect(elevationAboveGround).toBeLessThanOrEqual(1.05);

        // Rotation quaternion must be valid normalized quaternion
        expect(Number.isFinite(result.rotation[0])).toBe(true);
        expect(Number.isFinite(result.rotation[1])).toBe(true);
        expect(Number.isFinite(result.rotation[2])).toBe(true);
        expect(Number.isFinite(result.rotation[3])).toBe(true);
        const quatLength = Math.sqrt(
          result.rotation[0] ** 2 +
          result.rotation[1] ** 2 +
          result.rotation[2] ** 2 +
          result.rotation[3] ** 2,
        );
        expect(quatLength).toBeCloseTo(1.0, 3);

        // Suspension lengths must match compressed resting lengths for each wheel
        expect(result.suspensionLengths).toHaveLength(vehicle.config.wheels.length);
        for (let i = 0; i < vehicle.config.wheels.length; i++) {
          const w = vehicle.config.wheels[i];
          const expectedLen = w.suspensionRestLength * 0.72;
          expect(result.suspensionLengths[i]).toBeCloseTo(expectedLen, 2);
        }
      }
    }
  });

  it('guarantees valid ground clearance and suspension lengths for Kodiak Raid and Vanguard GT', () => {
    const sweden = levels.find((l) => l.id === 'level3_sweden')!;
    const heightmapData = compileTerrain(sweden.data);
    const groundAtSpawn = getInterpolatedHeight(
      sweden.spawnPosition[0],
      sweden.spawnPosition[2],
      heightmapData.heights,
      heightmapData.rows,
      heightmapData.cols,
      sweden.data.terrainBase.width,
      sweden.data.terrainBase.depth,
    );

    const kodiak = vehicles.find((v) => v.id === 'kodiak_raid')!;
    const vanguard = vehicles.find((v) => v.id === 'vanguard_gt')!;

    const kodiakResult = calculateGroundedVehicleTransform(
      sweden.spawnPosition,
      sweden.spawnRotationY,
      kodiak.config,
      heightmapData,
      sweden.data,
    );

    const vanguardResult = calculateGroundedVehicleTransform(
      sweden.spawnPosition,
      sweden.spawnRotationY,
      vanguard.config,
      heightmapData,
      sweden.data,
    );

    // Both vehicles must sit resting distance (~0.70m - 0.80m) above terrain
    expect(kodiakResult.position[1] - groundAtSpawn).toBeGreaterThanOrEqual(0.68);
    expect(kodiakResult.position[1] - groundAtSpawn).toBeLessThanOrEqual(0.82);

    expect(vanguardResult.position[1] - groundAtSpawn).toBeGreaterThanOrEqual(0.68);
    expect(vanguardResult.position[1] - groundAtSpawn).toBeLessThanOrEqual(0.82);

    // Wheel suspension lengths must be strictly positive and under rest length
    kodiakResult.suspensionLengths.forEach((len) => {
      expect(len).toBeGreaterThan(0.2);
      expect(len).toBeLessThan(0.35);
    });
  });
});
