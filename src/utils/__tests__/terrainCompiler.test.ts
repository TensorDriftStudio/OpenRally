import { describe, it, expect } from 'vitest';
import { compileTerrain, getInterpolatedHeight } from '../terrainCompiler';
import type { LevelData } from '@/types/level';

describe('terrainCompiler', () => {
  const mockLevel: LevelData = {
    id: 'test-level',
    name: 'Test Island',
    terrainBase: {
      width: 100,
      depth: 100,
      subdivisions: 10,
      amplitude: 15,
      frequency: 0.02,
      octaves: 3,
      lacunarity: 2,
      persistence: 0.5,
      seed: 42,
    },
    track: {
      points: [
        { x: -20, z: -20 },
        { x: 20, z: -20 },
        { x: 20, z: 20 },
        { x: -20, z: 20 },
      ],
      width: 6,
      falloff: 2,
      targetHeight: 2,
    },
    heightModifiers: [
      {
        x: 0,
        z: 0,
        radius: 10,
        heightDelta: 5,
        shape: 'sphere',
      },
    ],
    props: [],
  };

  it('compiles deterministic heightmap and track mask with matching dimensions', () => {
    const data1 = compileTerrain(mockLevel);
    const data2 = compileTerrain(mockLevel);

    const expectedSize = mockLevel.terrainBase.subdivisions + 1; // 11
    const totalSamples = expectedSize * expectedSize; // 121

    expect(data1.cols).toBe(expectedSize);
    expect(data1.rows).toBe(expectedSize);
    expect(data1.heights.length).toBe(totalSamples);
    expect(data1.trackMasks.length).toBe(totalSamples);

    // Deterministic results with the same seed
    expect(data1.heights[0]).toBeCloseTo(data2.heights[0], 5);
    expect(data1.minHeight).toBeLessThanOrEqual(data1.maxHeight);
  });

  it('computes valid track mask values in [0, 1] range', () => {
    const data = compileTerrain(mockLevel);
    for (let i = 0; i < data.trackMasks.length; i++) {
      const mask = data.trackMasks[i];
      expect(mask).toBeGreaterThanOrEqual(0);
      expect(mask).toBeLessThanOrEqual(1);
    }
  });

  it('applies height modifiers correctly', () => {
    const withModifier = compileTerrain(mockLevel);
    const withoutModifier = compileTerrain({
      ...mockLevel,
      heightModifiers: [],
    });

    // Center point (x=5, z=5 in 11x11 grid) should be elevated by the sphere modifier
    const centerIndex = 5 * 11 + 5;
    expect(withModifier.heights[centerIndex]).toBeGreaterThan(withoutModifier.heights[centerIndex]);
  });

  it('smoothly interpolates heights with getInterpolatedHeight', () => {
    const data = compileTerrain(mockLevel);
    // At center (0, 0)
    const centerH = getInterpolatedHeight(0, 0, data.heights, data.rows, data.cols, 100, 100);
    const centerIndex = 5 * 11 + 5;
    expect(centerH).toBeCloseTo(data.heights[centerIndex], 4);

    // Interpolation between grid points (x=2.5, z=0 -> halfway between x=5 and x=6 in 10-subdivision 100m grid)
    const midH = getInterpolatedHeight(5, 0, data.heights, data.rows, data.cols, 100, 100);
    const h55 = data.heights[5 * 11 + 5];
    const h56 = data.heights[5 * 11 + 6];
    const expectedInterpH = (h55 + h56) / 2;
    expect(midH).toBeCloseTo(expectedInterpH, 4);

    // Out of bounds safely returns 0
    expect(getInterpolatedHeight(-200, 0, data.heights, data.rows, data.cols, 100, 100)).toBe(0);
  });

  it('smoothly submerges map perimeter edges deep underwater to prevent shoreline cutoffs', () => {
    const data = compileTerrain(mockLevel);
    const size = mockLevel.terrainBase.subdivisions + 1;

    // Corners (0,0), (size-1, 0), (0, size-1), (size-1, size-1) should be submerged to -65m
    const cornerTopLeft = data.heights[0];
    const cornerTopRight = data.heights[size - 1];
    const cornerBottomLeft = data.heights[(size - 1) * size];
    const cornerBottomRight = data.heights[(size - 1) * size + (size - 1)];

    expect(cornerTopLeft).toBeCloseTo(-65.0, 1);
    expect(cornerTopRight).toBeCloseTo(-65.0, 1);
    expect(cornerBottomLeft).toBeCloseTo(-65.0, 1);
    expect(cornerBottomRight).toBeCloseTo(-65.0, 1);
  });

  it('smooths track roadbed and reduces cross-track roughness when roadGrading is enabled', () => {
    const withoutGrading = compileTerrain(mockLevel);
    const withGrading = compileTerrain({
      ...mockLevel,
      track: {
        ...mockLevel.track,
        roadGrading: 0.85,
      },
    });

    // Heightmap dimensions and masks should be identical
    expect(withGrading.cols).toBe(withoutGrading.cols);
    expect(withGrading.rows).toBe(withoutGrading.rows);
    expect(withGrading.trackMasks).toEqual(withoutGrading.trackMasks);

    // Far corner off the track should be completely unchanged
    expect(withGrading.heights[0]).toBeCloseTo(withoutGrading.heights[0], 5);

    // At least one point within the track corridor should be refined by road grading
    let trackPointsModified = 0;
    for (let i = 0; i < withGrading.trackMasks.length; i++) {
      if (withGrading.trackMasks[i] > 0.5) {
        if (Math.abs(withGrading.heights[i] - withoutGrading.heights[i]) > 0.001) {
          trackPointsModified++;
        }
      }
    }
    expect(trackPointsModified).toBeGreaterThan(0);
  });
});

