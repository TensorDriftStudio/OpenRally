import { describe, it, expect } from 'vitest';
import {
  createVehiclePreset,
  createSymmetricWheels,
  createLevelPreset,
  createSurfaceDefinition,
} from '@/utils/builders';
import { validateVehiclePreset } from '@/utils/validation/vehicleValidator';
import { validateLevelPreset } from '@/utils/validation/levelValidator';
import { validateSurfaceDefinition } from '@/utils/validation/surfaceValidator';

describe('VehicleBuilder & Archetypes', () => {
  it('creates a valid rally vehicle preset from archetype', () => {
    const preset = createVehiclePreset({
      id: 'custom_rally',
      name: 'Custom Rally 4WD',
      description: 'Test rally vehicle built with archetype',
      archetype: 'rally',
    });

    expect(preset.id).toBe('custom_rally');
    expect(preset.category).toBe('rally');
    expect(preset.config.wheels).toHaveLength(4);
    expect(preset.config.weightDistribution).toBeDefined();
    expect(preset.config.weightDistribution?.frontBias).toBeCloseTo(0.53);

    const validation = validateVehiclePreset(preset);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('creates valid vehicles for all standard archetypes with weight distribution', () => {
    const archetypes = ['rally', 'supercar', 'offroad', 'drift', 'buggy'] as const;

    for (const arch of archetypes) {
      const preset = createVehiclePreset({
        id: `test_${arch}`,
        name: `Test ${arch}`,
        description: `Description for ${arch}`,
        archetype: arch,
      });

      expect(preset.config.weightDistribution).toBeDefined();
      const validation = validateVehiclePreset(preset);
      expect(validation.valid, `Archetype ${arch} should be valid`).toBe(true);
    }
  });

  it('creates symmetric wheels with correct signs and offsets', () => {
    const wheels = createSymmetricWheels(2.8, 1.6, -0.2);
    const [fl, fr, rl, rr] = wheels;

    expect(fl.position[0]).toBe(-0.8);
    expect(fr.position[0]).toBe(0.8);
    expect(rl.position[0]).toBe(-0.8);
    expect(rr.position[0]).toBe(0.8);

    expect(fl.position[2]).toBe(1.4);
    expect(fr.position[2]).toBe(1.4);
    expect(rl.position[2]).toBe(-1.4);
    expect(rr.position[2]).toBe(-1.4);
  });
});

describe('LevelBuilder', () => {
  it('creates a valid level preset with automatic spawn placement and auto tag spawns', () => {
    const points = Array.from({ length: 14 }, (_, i) => ({
      x: Math.cos((i / 14) * Math.PI * 2) * 100,
      z: Math.sin((i / 14) * Math.PI * 2) * 100,
    }));

    const preset = createLevelPreset({
      id: 'custom_island_track',
      name: 'Custom Island Stage',
      description: 'Scenic island test loop',
      archetype: 'island',
      bannerUrl: '/images/stages/island_circuit.jpg',
      supportedModes: ['freeroam', 'timeattack', 'tag'],
      trackPoints: points,
      targetHeight: 5.0,
    });

    expect(preset.id).toBe('custom_island_track');
    expect(preset.bannerUrl).toBe('/images/stages/island_circuit.jpg');
    expect(preset.supportedModes).toEqual(['freeroam', 'timeattack', 'tag']);
    expect(preset.tagSpawnPoints).toHaveLength(12);

    const validation = validateLevelPreset(preset);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe('SurfaceBuilder', () => {
  it('creates a valid surface definition', () => {
    const surface = createSurfaceDefinition({
      id: 'gravel',
      name: 'Custom Loose Gravel',
      frontGrip: { baseGrip: 2.2, slideGrip: 1.8 },
      rearGrip: { baseGrip: 2.4, slideGrip: 1.9 },
      particles: { color: '#aaaaaa' },
    });

    expect(surface.id).toBe('gravel');
    expect(surface.tireModel.front.baseGrip).toBe(2.2);

    const validation = validateSurfaceDefinition(surface);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});
