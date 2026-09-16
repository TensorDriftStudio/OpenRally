import { describe, it, expect } from 'vitest';
import {
  TIRE_REGISTRY,
  AVAILABLE_TIRE_TYPES,
  DEFAULT_TIRE_TYPE,
  getTireDefinition,
  getAllTireDefinitions,
} from '@/config/tireRegistry';
import type { TireType } from '@/types/vehicle';

describe('Tire Compound Registry', () => {
  it('contains exactly 3 tire compound types: asphalt, gravel, snow', () => {
    expect(AVAILABLE_TIRE_TYPES).toHaveLength(3);
    expect(AVAILABLE_TIRE_TYPES).toEqual(['asphalt', 'gravel', 'snow']);
    expect(Object.keys(TIRE_REGISTRY)).toEqual(['asphalt', 'gravel', 'snow']);
  });

  it('guarantees each tire compound has valid metadata and surface multipliers', () => {
    const requiredSurfaces = ['tarmac', 'gravel', 'mud', 'sand', 'snow', 'grass'] as const;

    for (const tireId of AVAILABLE_TIRE_TYPES) {
      const def = TIRE_REGISTRY[tireId];
      expect(def.id).toBe(tireId);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.badge.length).toBeGreaterThan(0);
      expect(def.icon.length).toBeGreaterThan(0);
      expect(def.color.startsWith('#')).toBe(true);

      for (const surf of requiredSurfaces) {
        expect(def.surfaceGripMultipliers[surf]).toBeGreaterThan(0);
        expect(Number.isFinite(def.surfaceGripMultipliers[surf])).toBe(true);
      }

      expect(def.looseTractionLossMultiplier).toBeGreaterThan(0);
      expect(def.rollingResistanceMultiplier).toBeGreaterThan(0);
    }
  });

  it('verifies asphalt tires have highest grip on tarmac and lowest on snow', () => {
    const asphalt = getTireDefinition('asphalt');
    const gravel = getTireDefinition('gravel');
    const snow = getTireDefinition('snow');

    // On tarmac: asphalt > gravel > snow
    expect(asphalt.surfaceGripMultipliers.tarmac).toBeGreaterThan(gravel.surfaceGripMultipliers.tarmac);
    expect(asphalt.surfaceGripMultipliers.tarmac).toBeGreaterThan(snow.surfaceGripMultipliers.tarmac);

    // On snow: snow > gravel > asphalt
    expect(snow.surfaceGripMultipliers.snow).toBeGreaterThan(gravel.surfaceGripMultipliers.snow);
    expect(snow.surfaceGripMultipliers.snow).toBeGreaterThan(asphalt.surfaceGripMultipliers.snow);

    // On gravel: gravel > snow > asphalt
    expect(gravel.surfaceGripMultipliers.gravel).toBeGreaterThan(snow.surfaceGripMultipliers.gravel);
    expect(gravel.surfaceGripMultipliers.gravel).toBeGreaterThan(asphalt.surfaceGripMultipliers.gravel);
  });

  it('safely handles unknown or invalid tire types via getTireDefinition fallback', () => {
    const fallback = getTireDefinition('invalid_type' as TireType);
    expect(fallback).toBeDefined();
    expect(fallback.id).toBe(DEFAULT_TIRE_TYPE);
  });

  it('returns all 3 definitions via getAllTireDefinitions()', () => {
    const all = getAllTireDefinitions();
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.id)).toEqual(['asphalt', 'gravel', 'snow']);
  });
});
