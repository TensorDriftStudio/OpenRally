import { describe, it, expect } from 'vitest';
import type { LevelPreset } from '@/types/level';
import {
  LEVEL_REGISTRY,
  DEFAULT_LEVEL_ID,
  getLevelPreset,
  getAvailableLevels,
  getRecommendedTireForLevel,
} from '@/config/levelRegistry';
import { AVAILABLE_TIRE_TYPES } from '@/config/tireRegistry';
import { validateLevelPreset } from '@/utils/validation/levelValidator';
import { compileTerrain, getInterpolatedHeight } from '@/utils/terrainCompiler';

describe('Level Registry', () => {
  it('has valid default level ID', () => {
    expect(LEVEL_REGISTRY[DEFAULT_LEVEL_ID]).toBeDefined();
    expect(DEFAULT_LEVEL_ID).toBe('level1_island');
  });

  it('contains valid levels that pass all procedural validation checks', () => {
    const levels = getAvailableLevels();
    expect(levels.length).toBeGreaterThanOrEqual(2);

    for (const level of levels) {
      const validation = validateLevelPreset(level);
      expect(validation.valid, `Level ${level.id} failed validation: ${validation.errors.join(', ')}`).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(level.data.track.points.length).toBeGreaterThanOrEqual(3);
      expect(level.spawnPosition).toHaveLength(3);
    }
  });

  it('retrieves level by ID with fallback to default', () => {
    const island = getLevelPreset(DEFAULT_LEVEL_ID);
    expect(island.id).toBe('level1_island');

    const unknownLevel = getLevelPreset('unknown_level');
    expect(unknownLevel.id).toBe('level1_island');

    const desert = getLevelPreset('level2_desert');
    expect(desert.id).toBe('level2_desert');
    expect(desert.surfaceDescription).toContain('Sand');

    const sweden = getLevelPreset('level3_sweden');
    expect(sweden.id).toBe('level3_sweden');
    expect(sweden.surfaceDescription).toContain('Snow');

    const britain = getLevelPreset('level4_britain');
    expect(britain.id).toBe('level4_britain');
    expect(britain.surfaceDescription).toContain('Stone');
    expect(britain.data.terrainBase.width).toBe(2600);
    expect(britain.data.terrainBase.depth).toBe(2600);
  });

  it('ensures spawn position Y is above the terrain ground height for all levels', () => {
    const levels = getAvailableLevels();
    for (const level of levels) {
      const data = compileTerrain(level.data);
      const groundY = getInterpolatedHeight(
        level.spawnPosition[0],
        level.spawnPosition[2],
        data.heights,
        data.rows,
        data.cols,
        level.data.terrainBase.width,
        level.data.terrainBase.depth,
      );
      console.log(`[Spawn Test] Level ${level.id}: groundY = ${groundY.toFixed(2)}, spawnY = ${level.spawnPosition[1]}`);
      expect(level.spawnPosition[1]).toBeGreaterThanOrEqual(groundY + 0.5);
    }
  });

  it('ensures desert map and other stages feature active water environment', () => {
    const desert = getLevelPreset('level2_desert');
    expect(desert.environment?.hasWater).toBe(true);
  });

  it('correctly maps recommended tire compound for all registered levels', () => {
    expect(getRecommendedTireForLevel('level1_island')).toBe('gravel');
    expect(getRecommendedTireForLevel('level2_desert')).toBe('gravel');
    expect(getRecommendedTireForLevel('level3_sweden')).toBe('snow');
    expect(getRecommendedTireForLevel('level4_britain')).toBe('gravel');
    expect(getRecommendedTireForLevel('level5_gymkhana')).toBe('asphalt');

    // Every level must have a valid recommended tire from AVAILABLE_TIRE_TYPES
    for (const lvl of getAvailableLevels()) {
      const rec = getRecommendedTireForLevel(lvl);
      expect(AVAILABLE_TIRE_TYPES).toContain(rec);
    }
  });

  it('falls back to heuristics based on surface description when recommendedTire is omitted', () => {
    const base = getLevelPreset('level1_island');
    const snowLevel: LevelPreset = {
      ...base,
      recommendedTire: undefined,
      surfaceDescription: 'Deep Snow & Frozen Ice',
    };
    const tarmacLevel: LevelPreset = {
      ...base,
      recommendedTire: undefined,
      surfaceDescription: 'Pure Asphalt Tarmac',
    };
    const mudLevel: LevelPreset = {
      ...base,
      recommendedTire: undefined,
      surfaceDescription: 'Muddy Forest Track',
    };
    expect(getRecommendedTireForLevel(snowLevel)).toBe('snow');
    expect(getRecommendedTireForLevel(tarmacLevel)).toBe('asphalt');
    expect(getRecommendedTireForLevel(mudLevel)).toBe('gravel');
  });
});
