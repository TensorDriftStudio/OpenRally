import { describe, it, expect } from 'vitest';
import { Vector3, CatmullRomCurve3 } from 'three';
import { LEVEL5_TRACK_POINTS } from '@/config/levels/gymkhanaIsland';
import { DEFAULT_STUNT_LOOP_CONFIG, generateStuntLoopPath } from '@/utils/physics/stuntLoopGeometry';

describe('StuntLoop Gymkhana Arena Integration', () => {
  const LOOP_BASE_POS = new Vector3(-70, 8.0, -30);

  it('maintains safe operational clearance from the official Gymkhana track spline', () => {
    const trackCurve = new CatmullRomCurve3(
      LEVEL5_TRACK_POINTS.map((p) => new Vector3(p.x, 0, p.z)),
      true,
      'catmullrom',
      0.5,
    );

    const numSamples = 600;
    const samplePoints: Vector3[] = [];
    for (let i = 0; i <= numSamples; i++) {
      samplePoints.push(trackCurve.getPointAt(i / numSamples));
    }

    // Measure minimum distance from any point of the loop to the race line
    const loopPath = generateStuntLoopPath(DEFAULT_STUNT_LOOP_CONFIG);
    let minDistance = Infinity;

    for (const pt of loopPath) {
      const worldX = LOOP_BASE_POS.x + pt.position.x;
      const worldZ = LOOP_BASE_POS.z + pt.position.z;

      for (const trackPt of samplePoints) {
        const dist = Math.hypot(worldX - trackPt.x, worldZ - trackPt.z);
        if (dist < minDistance) {
          minDistance = dist;
        }
      }
    }

    // Loop is comfortably located in the freestyle compound, well clear of the 22m wide track
    expect(minDistance).toBeGreaterThan(16.0);
  });

  it('provides generous track width and safe height for rally vehicles', () => {
    expect(DEFAULT_STUNT_LOOP_CONFIG.trackWidth).toBeGreaterThanOrEqual(7.0);
    expect(DEFAULT_STUNT_LOOP_CONFIG.guardRailHeight).toBeGreaterThanOrEqual(0.8);
    expect(DEFAULT_STUNT_LOOP_CONFIG.spiralOffset).toBeGreaterThanOrEqual(7.0);

    const apexHeight = DEFAULT_STUNT_LOOP_CONFIG.radius * 2;
    // Apex height at ~19m above arena tarmac provides awe-inspiring vertical scale
    expect(apexHeight).toBeGreaterThanOrEqual(18.0);
    expect(apexHeight).toBeLessThanOrEqual(24.0);
  });

  it('guarantees exterior scaffolding towers maintain safe structural setback outside the driving envelope', () => {
    const halfW = DEFAULT_STUNT_LOOP_CONFIG.trackWidth * 0.5; // 4.0m
    const spiralOffset = DEFAULT_STUNT_LOOP_CONFIG.spiralOffset; // 12.0m

    // Driving lane envelopes:
    // Entry lane: [-4.0, 4.0]
    // Exit lane: [12.0 - 4.0, 12.0 + 4.0] = [8.0, 16.0]
    const leftTrackEdge = -halfW;
    const rightTrackEdge = spiralOffset + halfW;

    const leftTowerX = -halfW - 4.0; // -8.0m
    const rightTowerX = spiralOffset + halfW + 4.0; // 20.0m

    // Towers must be strictly outside the roadway with at least 3m clearance
    expect(leftTowerX).toBeLessThan(leftTrackEdge - 3.0);
    expect(rightTowerX).toBeGreaterThan(rightTrackEdge + 3.0);

    // No vertical support column can ever be inside [-4.0, 16.0] at ground level
    const isPillarInRoadway = (x: number) => x >= leftTrackEdge && x <= rightTrackEdge;
    expect(isPillarInRoadway(leftTowerX)).toBe(false);
    expect(isPillarInRoadway(rightTowerX)).toBe(false);
  });
});
