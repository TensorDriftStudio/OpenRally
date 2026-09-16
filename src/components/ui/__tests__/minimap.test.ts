import { describe, it, expect } from 'vitest';

describe('Minimap Coordinate & Heading Alignment', () => {
  const CANVAS_SIZE = 180;
  const MARGIN = 14;
  const INNER_SIZE = CANVAS_SIZE - MARGIN * 2;
  const trackBounds = {
    centerX: 0,
    centerZ: 0,
    maxSpan: 1000,
  };

  const toCanvasCoords = (wx: number, wz: number): [number, number] => {
    const cx = CANVAS_SIZE / 2 + ((wx - trackBounds.centerX) / trackBounds.maxSpan) * INNER_SIZE;
    const cy = CANVAS_SIZE / 2 + ((wz - trackBounds.centerZ) / trackBounds.maxSpan) * INNER_SIZE;
    return [cx, cy];
  };

  it('maps center of track (0, 0) to center of canvas', () => {
    const [cx, cy] = toCanvasCoords(0, 0);
    expect(cx).toBeCloseTo(CANVAS_SIZE / 2, 3);
    expect(cy).toBeCloseTo(CANVAS_SIZE / 2, 3);
  });

  it('maps track extents symmetrically around canvas center', () => {
    const [minX, minZ] = toCanvasCoords(-500, -500);
    const [maxX, maxZ] = toCanvasCoords(500, 500);
    expect(minX).toBeCloseTo(MARGIN, 3);
    expect(minZ).toBeCloseTo(MARGIN, 3);
    expect(maxX).toBeCloseTo(CANVAS_SIZE - MARGIN, 3);
    expect(maxZ).toBeCloseTo(CANVAS_SIZE - MARGIN, 3);
  });

  it('ensures rotated player arrow tip is collinear and positively aligned with vehicle heading for all angles', () => {
    // Arrow tip in local coordinates pointing in forward direction (downward +Y in canvas space)
    const baseTip = { x: 0, y: 7 };

    // Test across a full 360 degree sweep in 15 degree increments
    for (let deg = -180; deg <= 180; deg += 15) {
      const heading = (deg * Math.PI) / 180;

      // In 3D: forward vector is (sin(heading), 0, cos(heading))
      const forward3D = {
        x: Math.sin(heading),
        z: Math.cos(heading),
      };

      // Movement on canvas from (0,0) after forward delta
      const [originCx, originCy] = toCanvasCoords(0, 0);
      const [movedCx, movedCy] = toCanvasCoords(forward3D.x * 10, forward3D.z * 10);
      const canvasDelta = {
        x: movedCx - originCx,
        y: movedCy - originCy,
      };

      // Canvas rotation matrix applied with -heading (standard Three.js Y heading to 2D canvas)
      const rotAngle = -heading;
      const rotatedTip = {
        x: baseTip.x * Math.cos(rotAngle) - baseTip.y * Math.sin(rotAngle),
        y: baseTip.x * Math.sin(rotAngle) + baseTip.y * Math.cos(rotAngle),
      };

      // Rotated tip must point in the exact same direction as canvasDelta
      const tipLen = Math.hypot(rotatedTip.x, rotatedTip.y);
      const deltaLen = Math.hypot(canvasDelta.x, canvasDelta.y);

      expect(tipLen).toBeGreaterThan(0);
      expect(deltaLen).toBeGreaterThan(0);

      // Normalize
      const normTip = { x: rotatedTip.x / tipLen, y: rotatedTip.y / tipLen };
      const normDelta = { x: canvasDelta.x / deltaLen, y: canvasDelta.y / deltaLen };

      // Dot product must be +1.0 (identical direction, not reversed/inverted)
      const dot = normTip.x * normDelta.x + normTip.y * normDelta.y;
      expect(dot).toBeCloseTo(1.0, 4);
    }
  });

  it('guarantees zero duplicate requestAnimationFrame calls in Minimap render loop', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const minimapPath = path.resolve(__dirname, '../Minimap.tsx');
    const content = fs.readFileSync(minimapPath, 'utf-8');

    // Count occurrences of requestAnimationFrame
    const matches = content.match(/requestAnimationFrame\(renderMinimap\)/g);
    expect(matches).not.toBeNull();
    // Must be exactly 2: 1 recursive call inside renderMinimap and 1 initialization call outside
    expect(matches?.length).toBe(2);

    // Ensure cancelAnimationFrame cleans up animationFrameId on unmount
    expect(content).toContain('cancelAnimationFrame(animationFrameId)');
  });
});
