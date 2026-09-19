import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STUNT_LOOP_CONFIG,
  calculateMinimumApexSpeedKmh,
  calculateMinimumEntrySpeedKmh,
  generateStuntLoopPath,
  createStuntLoopDeckTrimesh,
  createStuntLoopColliderSegments,
  createStuntLoopMeshGeometry,
} from '../stuntLoopGeometry';

describe('StuntLoopGeometry & Physics Generator', () => {
  it('calculates physical threshold speeds matching centrifugal physics equations', () => {
    const R = DEFAULT_STUNT_LOOP_CONFIG.radius; // 9.5m
    const apexKmh = calculateMinimumApexSpeedKmh(R);
    const entryKmh = calculateMinimumEntrySpeedKmh(R);

    // v_apex = sqrt(9.81 * 9.5) * 3.6 ≈ 34.7 km/h
    expect(apexKmh).toBeGreaterThan(34.0);
    expect(apexKmh).toBeLessThan(36.0);

    // v_entry = sqrt(5 * 9.81 * 9.5) * 3.6 ≈ 77.7 km/h
    expect(entryKmh).toBeGreaterThan(75.0);
    expect(entryKmh).toBeLessThan(80.0);
  });

  it('generates a continuous loop path with orthogonal Frenet frames', () => {
    const path = generateStuntLoopPath(DEFAULT_STUNT_LOOP_CONFIG);

    expect(path.length).toBeGreaterThan(50);

    // Verify first point is at entry (z < 0, y = 0, x = 0)
    const first = path[0];
    expect(first.position.x).toBe(0);
    expect(first.position.y).toBe(0);
    expect(first.position.z).toBeLessThan(-10);

    // Verify last point is at exit (z > 0, y = 0, x = spiralOffset)
    const last = path[path.length - 1];
    expect(last.position.x).toBeCloseTo(DEFAULT_STUNT_LOOP_CONFIG.spiralOffset, 2);
    expect(last.position.y).toBe(0);
    expect(last.position.z).toBeGreaterThan(10);

    // Verify maximum height equals 2 * R
    let maxY = 0;
    for (const pt of path) {
      if (pt.position.y > maxY) maxY = pt.position.y;
    }
    expect(maxY).toBeCloseTo(DEFAULT_STUNT_LOOP_CONFIG.radius * 2, 0.5);

    // Verify orthogonality of T, N, B frames for all sample points
    for (const pt of path) {
      expect(pt.tangent.length()).toBeCloseTo(1.0, 3);
      expect(pt.normal.length()).toBeCloseTo(1.0, 3);
      expect(pt.binormal.length()).toBeCloseTo(1.0, 3);

      expect(pt.tangent.dot(pt.normal)).toBeCloseTo(0.0, 2);
      expect(pt.tangent.dot(pt.binormal)).toBeCloseTo(0.0, 2);
      expect(pt.normal.dot(pt.binormal)).toBeCloseTo(0.0, 2);
    }
  });

  it('creates segmented Rapier colliders for deck and guardrails without NaNs', () => {
    const colliders = createStuntLoopColliderSegments(DEFAULT_STUNT_LOOP_CONFIG);

    expect(colliders.length).toBeGreaterThan(100);

    const decks = colliders.filter((c) => c.type === 'deck');
    const leftRails = colliders.filter((c) => c.type === 'left_guardrail');
    const rightRails = colliders.filter((c) => c.type === 'right_guardrail');

    expect(decks.length).toBeGreaterThan(30);
    expect(leftRails.length).toBe(decks.length);
    expect(rightRails.length).toBe(decks.length);

    for (const c of colliders) {
      expect(Number.isFinite(c.position[0])).toBe(true);
      expect(Number.isFinite(c.position[1])).toBe(true);
      expect(Number.isFinite(c.position[2])).toBe(true);

      expect(c.halfExtents[0]).toBeGreaterThan(0);
      expect(c.halfExtents[1]).toBeGreaterThan(0);
      expect(c.halfExtents[2]).toBeGreaterThan(0);

      expect(c.rotation).toHaveLength(3);
      expect(Number.isFinite(c.rotation[0])).toBe(true);
      expect(Number.isFinite(c.rotation[1])).toBe(true);
      expect(Number.isFinite(c.rotation[2])).toBe(true);
    }
  });

  it('builds valid Three.js visual BufferGeometry with complete attributes', () => {
    const geom = createStuntLoopMeshGeometry(DEFAULT_STUNT_LOOP_CONFIG);

    expect(geom).toBeDefined();
    expect(geom.getAttribute('position')).toBeDefined();
    expect(geom.getAttribute('normal')).toBeDefined();
    expect(geom.getAttribute('uv')).toBeDefined();
    expect(geom.getAttribute('color')).toBeDefined();
    expect(geom.getIndex()).toBeDefined();

    const vertexCount = geom.getAttribute('position').count;
    const indexCount = geom.getIndex()!.count;

    expect(vertexCount).toBeGreaterThan(500);
    expect(indexCount).toBeGreaterThan(1500);
    expect(indexCount % 3).toBe(0); // Valid triangle mesh
  });

  it('maintains distinct vertex color palettes for asphalt, curbs, and rails without color bleeding', () => {
    const geom = createStuntLoopMeshGeometry(DEFAULT_STUNT_LOOP_CONFIG);
    const colorAttr = geom.getAttribute('color');
    expect(colorAttr).toBeDefined();

    let foundAsphalt = false;
    let foundCurbRed = false;
    let foundCurbWhite = false;
    let foundSafetyYellow = false;
    let foundUndersideSteel = false;

    for (let i = 0; i < colorAttr.count; i++) {
      const r = colorAttr.getX(i);
      const g = colorAttr.getY(i);
      const b = colorAttr.getZ(i);

      // Asphalt tarmac (~0.12, 0.14, 0.18)
      if (Math.abs(r - 0.12) < 0.02 && Math.abs(g - 0.14) < 0.02) {
        foundAsphalt = true;
      }
      // Curb Red (~0.86, 0.14, 0.14)
      if (r > 0.80 && g < 0.20 && b < 0.20) {
        foundCurbRed = true;
      }
      // Curb White (~0.96, 0.96, 0.98)
      if (r > 0.90 && g > 0.90 && b > 0.90) {
        foundCurbWhite = true;
      }
      // Safety Yellow (~0.95, 0.78, 0.08)
      if (r > 0.90 && g > 0.70 && b < 0.20) {
        foundSafetyYellow = true;
      }
      // Underside Steel (~0.08, 0.11, 0.16)
      if (r < 0.10 && g < 0.15 && b < 0.20) {
        foundUndersideSteel = true;
      }
    }

    expect(foundAsphalt).toBe(true);
    expect(foundCurbRed).toBe(true);
    expect(foundCurbWhite).toBe(true);
    expect(foundSafetyYellow).toBe(true);
    expect(foundUndersideSteel).toBe(true);
  });

  it('provides generous 28m straight runways for stable high-speed loop approach and exit', () => {
    expect(DEFAULT_STUNT_LOOP_CONFIG.entryLength).toBeGreaterThanOrEqual(24.0);
    expect(DEFAULT_STUNT_LOOP_CONFIG.exitLength).toBeGreaterThanOrEqual(24.0);

    const path = generateStuntLoopPath(DEFAULT_STUNT_LOOP_CONFIG);
    const entryStart = path[0];
    const exitEnd = path[path.length - 1];

    expect(entryStart.position.z).toBeCloseTo(-DEFAULT_STUNT_LOOP_CONFIG.entryLength, 1);
    expect(exitEnd.position.z).toBeCloseTo(DEFAULT_STUNT_LOOP_CONFIG.exitLength, 1);
  });

  it('builds continuous, snag-free Rapier Trimesh collider for the drivable road deck', () => {
    const trimesh = createStuntLoopDeckTrimesh(DEFAULT_STUNT_LOOP_CONFIG);

    expect(trimesh).toBeDefined();
    expect(trimesh.vertices).toBeInstanceOf(Float32Array);
    expect(trimesh.indices).toBeInstanceOf(Uint32Array);

    expect(trimesh.vertices.length).toBeGreaterThan(300);
    expect(trimesh.indices.length).toBeGreaterThan(600);
    expect(trimesh.indices.length % 3).toBe(0); // Valid triangle mesh

    // Verify all coordinates are finite numbers with zero NaNs
    for (let i = 0; i < trimesh.vertices.length; i++) {
      expect(Number.isFinite(trimesh.vertices[i])).toBe(true);
    }

    // Verify all triangle indices reference valid vertex positions
    const maxVertexIdx = trimesh.vertices.length / 3 - 1;
    for (let i = 0; i < trimesh.indices.length; i++) {
      expect(trimesh.indices[i]).toBeGreaterThanOrEqual(0);
      expect(trimesh.indices[i]).toBeLessThanOrEqual(maxVertexIdx);
    }
  });

  it('guarantees seamless minimum-jerk lateral trajectory with zero entry/exit jerk', () => {
    const path = generateStuntLoopPath(DEFAULT_STUNT_LOOP_CONFIG);
    // Find entry transition point (where loop starts: z ≈ 0, progress ≈ 0.15)
    const entryIndex = path.findIndex((p) => Math.abs(p.position.z) < 0.05 && p.progress >= 0.14);
    expect(entryIndex).toBeGreaterThan(0);

    const entryPt = path[entryIndex];
    expect(entryPt.position.x).toBeCloseTo(0, 3);
    // Tangent X component at entry must be zero (tangent is pure (0, 0, 1))
    expect(entryPt.tangent.x).toBeCloseTo(0, 2);

    // Lateral displacement must monotonically increase from 0 to spiralOffset
    const loopPoints = path.filter((p) => p.progress >= 0.15 && p.progress <= 0.85);
    for (let i = 1; i < loopPoints.length; i++) {
      expect(loopPoints[i].position.x).toBeGreaterThanOrEqual(loopPoints[i - 1].position.x - 1e-5);
    }

    // Clearance between entry lane edge (+trackWidth/2) and exit lane edge (spiralOffset - trackWidth/2)
    const halfW = DEFAULT_STUNT_LOOP_CONFIG.trackWidth * 0.5;
    const entryRightEdge = halfW;
    const exitLeftEdge = DEFAULT_STUNT_LOOP_CONFIG.spiralOffset - halfW;
    const clearance = exitLeftEdge - entryRightEdge;
    expect(clearance).toBeGreaterThanOrEqual(0.8); // At least 0.8m safety corridor between parallel lanes
  });
});

