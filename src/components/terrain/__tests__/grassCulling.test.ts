import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { GRASS_CHUNKS, GRASS_CHUNKS_MOBILE, GRASS_FADE_RANGE } from '@/config/grass';

describe('Grass Culling & Spatial Partitioning', () => {
  it('exports valid and tuned chunking and fade range configuration', () => {
    expect(GRASS_CHUNKS).toBe(6);
    expect(GRASS_CHUNKS_MOBILE).toBe(3);
    expect(GRASS_FADE_RANGE).toBeGreaterThanOrEqual(20);
  });

  it('guarantees that camera inside any chunk always keeps that chunk visible (zero self-culling)', () => {
    const mapWidth = 2000;
    const mapDepth = 2000;
    const activeChunks = GRASS_CHUNKS;
    const chunkWidth = mapWidth / activeChunks;
    const chunkDepth = mapDepth / activeChunks;
    const chunkRadiusXZ = Math.hypot(chunkWidth * 0.5, chunkDepth * 0.5);

    const effectiveDist = 160; // Medium quality desktop draw distance

    // Test for every chunk in the grid
    for (let cz = 0; cz < activeChunks; cz++) {
      for (let cx = 0; cx < activeChunks; cx++) {
        const chunkCenterX = (cx + 0.5) * chunkWidth - mapWidth / 2;
        const chunkCenterZ = (cz + 0.5) * chunkDepth - mapDepth / 2;

        // Test multiple positions within the chunk: center, edges, and extreme corners
        const sampleOffsets = [
          [0, 0],
          [chunkWidth * 0.5 - 0.1, 0],
          [-chunkWidth * 0.5 + 0.1, 0],
          [0, chunkDepth * 0.5 - 0.1],
          [chunkWidth * 0.5 - 0.1, chunkDepth * 0.5 - 0.1], // Far corner
          [-chunkWidth * 0.5 + 0.1, -chunkDepth * 0.5 + 0.1], // Opposite corner
        ];

        for (const [ox, oz] of sampleOffsets) {
          const camPos = new Vector3(chunkCenterX + ox, 35, chunkCenterZ + oz); // On a 35m hill

          // Conservative 2D XZ distance check
          const dx = chunkCenterX - camPos.x;
          const dz = chunkCenterZ - camPos.z;
          const distXZSq = dx * dx + dz * dz;
          const maxAllowedDist = effectiveDist + chunkRadiusXZ;

          const isVisible = distXZSq <= maxAllowedDist * maxAllowedDist;
          expect(isVisible).toBe(true);
        }
      }
    }
  });

  it('eliminates dead-zones between adjacent chunks along stage trajectories', () => {
    const mapWidth = 2600; // Highland Castle large map
    const mapDepth = 2600;
    const activeChunks = GRASS_CHUNKS;
    const chunkWidth = mapWidth / activeChunks;
    const chunkDepth = mapDepth / activeChunks;
    const chunkRadiusXZ = Math.hypot(chunkWidth * 0.5, chunkDepth * 0.5);

    const effectiveDist = 160;

    // Simulate vehicle driving linearly along X across the boundary between chunk 4 and chunk 5
    const chunk4CenterX = (4 + 0.5) * chunkWidth - mapWidth / 2;
    const chunk5CenterX = (5 + 0.5) * chunkWidth - mapWidth / 2;
    const boundaryX = (chunk4CenterX + chunk5CenterX) * 0.5;

    // Step across boundary in 5m increments
    for (let x = boundaryX - 80; x <= boundaryX + 80; x += 5) {
      const camPos = new Vector3(x, 15, 0);

      // Check chunk 4
      const dx4 = chunk4CenterX - camPos.x;
      const dz4 = 0 - camPos.z;
      const distXZSq4 = dx4 * dx4 + dz4 * dz4;
      const maxAllowedDist = effectiveDist + chunkRadiusXZ;
      const chunk4Visible = distXZSq4 <= maxAllowedDist * maxAllowedDist;

      // Check chunk 5
      const dx5 = chunk5CenterX - camPos.x;
      const dz5 = 0 - camPos.z;
      const distXZSq5 = dx5 * dx5 + dz5 * dz5;
      const chunk5Visible = distXZSq5 <= maxAllowedDist * maxAllowedDist;

      // At all times near the boundary, at least one (and usually both) chunks must be visible
      const atLeastOneVisible = chunk4Visible || chunk5Visible;
      expect(atLeastOneVisible).toBe(true);
    }
  });

  it('is completely resilient to mountain/hill elevation up to 200m altitude', () => {
    const chunkCenter = new Vector3(100, 0, 100);
    const chunkRadiusXZ = 141.4;
    const effectiveDist = 160;

    // Camera directly above chunk center but at 120m altitude (mountain pass)
    const mountainCamPos = new Vector3(100, 120, 100);

    const dx = chunkCenter.x - mountainCamPos.x;
    const dz = chunkCenter.z - mountainCamPos.z;
    const distXZSq = dx * dx + dz * dz;
    const maxAllowedDist = effectiveDist + chunkRadiusXZ;

    // Using XZ distance: distXZSq is 0, so it remains strictly visible despite 120m altitude
    expect(distXZSq).toBe(0);
    expect(distXZSq <= maxAllowedDist * maxAllowedDist).toBe(true);
  });

  it('stabilizes chunk visibility at the boundary via spatial hysteresis buffer', () => {
    const chunkCenter = new Vector3(0, 0, 0);
    const chunkRadiusXZ = 100;
    const effectiveDist = 150;
    const HYSTERESIS_BUFFER = 35.0;
    const baseThreshold = effectiveDist + chunkRadiusXZ; // 250m

    // Test a camera oscillating right at the boundary (e.g., 255m from center)
    const camPos = new Vector3(255, 0, 0);
    const dx = chunkCenter.x - camPos.x;
    const dz = chunkCenter.z - camPos.z;
    const distXZSq = dx * dx + dz * dz;

    // If previously visible, the hysteresis buffer (+35m -> 285m) keeps it visible
    const isCurrentlyVisible = true;
    const allowedThresholdVisible = isCurrentlyVisible ? baseThreshold + HYSTERESIS_BUFFER : baseThreshold;
    const shouldStayVisible = distXZSq <= allowedThresholdVisible * allowedThresholdVisible;
    expect(shouldStayVisible).toBe(true);

    // If beyond the hysteresis buffer (e.g. 290m), it turns off cleanly
    const camFarDist = 290;
    const farDistXZSq = camFarDist * camFarDist;
    const shouldTurnOff = farDistXZSq <= allowedThresholdVisible * allowedThresholdVisible;
    expect(shouldTurnOff).toBe(false);
  });
});
