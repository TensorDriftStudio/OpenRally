import { CatmullRomCurve3, Vector3 } from 'three';
import { createNoise2D } from 'simplex-noise';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';

/**
 * Seed-based PRNG (mulberry32) for deterministic noise.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compiles a LevelData definition into a final HeightmapData array.
 * This separates the Data-Driven state from the procedural rendering logic.
 */
export function compileTerrain(level: LevelData): HeightmapData {
  const { terrainBase, track, heightModifiers } = level;
  const { subdivisions, amplitude, frequency, octaves, lacunarity, persistence, seed, width, depth } = terrainBase;

  const rng = mulberry32(seed);
  const noise2D = createNoise2D(rng);

  const size = subdivisions + 1;
  const heights = new Float32Array(size * size);
  const trackMasks = new Float32Array(size * size);

  let minHeight = Infinity;
  let maxHeight = -Infinity;

  // --- Track Spline Precalculation ---
  const trackCurve = new CatmullRomCurve3(
    track.points.map((p) => new Vector3(p.x, 0, p.z)),
    true, // closed curve
    'catmullrom',
    0.5,
  );
  // Sample the curve into discrete segments for fast distance checking
  const trackSamples = trackCurve.getSpacedPoints(400);

  // Helper to compute raw terrain elevation at any world coordinate
  const sampleRawElevation = (worldX: number, worldZ: number): number => {
    const nx = (worldX / width + 0.5) * width * frequency;
    const nz = (worldZ / depth + 0.5) * depth * frequency;

    let fbm = 0;
    let amp = 1;
    let freq = 1;
    let maxAmp = 0;

    for (let o = 0; o < octaves; o++) {
      fbm += amp * noise2D(nx * freq, nz * freq);
      maxAmp += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    fbm = fbm / maxAmp; // Normalized to [-1, 1]

    // --- 1. Organic Coastal Landmass Profile ---
    const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
    const theta = Math.atan2(worldZ, worldX);

    // Multi-frequency organic coastline distortion (proportional to map dimensions)
    const coastScale = width / 2000.0;
    const coastNoise1 = noise2D(Math.cos(theta) * 2.2 + 12.3, Math.sin(theta) * 2.2 + 8.7) * (110.0 * coastScale);
    const coastNoise2 = noise2D(Math.cos(theta * 2.0) * 3.5 + 4.1, Math.sin(theta * 2.0) * 3.5 + 1.9) * (45.0 * coastScale);
    const effectiveRadius = distFromCenter + coastNoise1 + coastNoise2;

    const islandRadius = width * 0.38; // Mainland plateau coverage
    const deepRadius = width * 0.47;   // Deep ocean perimeter transition

    let baseElevation = -65.0;
    let noiseScale = 0.0;

    if (effectiveRadius < islandRadius) {
      // Inside the main landmass
      const islandT = 1.0 - effectiveRadius / islandRadius;
      const islandProfile = Math.pow(islandT, 0.7); // Gentle interior plateau
      baseElevation = 4.0 + 8.0 * islandProfile;
      noiseScale = 1.0;
    } else if (effectiveRadius < deepRadius) {
      // Coastal beach & underwater shelf descent
      const coastalT = (effectiveRadius - islandRadius) / (deepRadius - islandRadius);
      const smoothCoast = coastalT * coastalT * (3.0 - 2.0 * coastalT);
      baseElevation = 4.0 + (-65.0 - 4.0) * smoothCoast;
      noiseScale = 1.0 - smoothCoast;
    } else {
      // Deep open ocean seabed
      baseElevation = -65.0;
      noiseScale = 0.0;
    }

    let val = baseElevation + fbm * (amplitude * noiseScale);

    // --- 3. Apply Explicit Data-Driven Modifiers (Brushes) ---
    if (heightModifiers) {
      for (const mod of heightModifiers) {
        const dist = Math.sqrt((worldX - mod.x) ** 2 + (worldZ - mod.z) ** 2);
        if (dist < mod.radius) {
          const t = 1.0 - (dist / mod.radius);
          // Ken Perlin's C2 smootherstep: 6t^5 - 15t^4 + 10t^3
          // Zero 1st derivative (slope) and zero 2nd derivative (curvature) at both center & boundary,
          // completely eliminating pointy summits and circular perimeter creases.
          const smoothProfile = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);

          if (mod.shape === 'sphere' || mod.shape === 'smooth') {
            if (mod.heightDelta !== undefined) {
              val += smoothProfile * mod.heightDelta;
            } else if (mod.absoluteHeight !== undefined) {
              val = val * (1.0 - smoothProfile) + mod.absoluteHeight * smoothProfile;
            }
          } else if (mod.shape === 'flat') {
            if (mod.absoluteHeight !== undefined) {
              val = mod.absoluteHeight;
            }
          }
        }
      }
    }

    return val;
  };

  // Optional road grading: precompute and smooth elevations along the track centerline
  const roadGrading = Math.max(0, Math.min(1, track.roadGrading ?? 0));
  let smoothedTrackElevations: Float32Array | null = null;

  if (roadGrading > 0 && trackSamples.length > 0) {
    const rawElevations = new Float32Array(trackSamples.length);
    for (let i = 0; i < trackSamples.length; i++) {
      rawElevations[i] = sampleRawElevation(trackSamples[i].x, trackSamples[i].z);
    }

    smoothedTrackElevations = new Float32Array(trackSamples.length);
    // Gaussian filter with radius 8 (17 taps, sigma ~ 4.0 samples / ~12m)
    const radius = 8;
    const weights = new Float32Array(2 * radius + 1);
    let weightSum = 0;
    for (let k = -radius; k <= radius; k++) {
      const w = Math.exp(-(k * k) / (2 * 4.0 * 4.0));
      weights[k + radius] = w;
      weightSum += w;
    }
    for (let k = 0; k < weights.length; k++) {
      weights[k] /= weightSum;
    }

    for (let i = 0; i < trackSamples.length; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const idx = (i + k + trackSamples.length) % trackSamples.length;
        sum += rawElevations[idx] * weights[k + radius];
      }
      smoothedTrackElevations[i] = sum;
    }
  }

  // --- 4. Spatial Grid for Track Spline Broadphase ---
  const gradingFalloff = Math.max(track.falloff * 2.8, 16.0);
  const maxInfluenceDist = Math.max(track.width + track.falloff, track.width + gradingFalloff) + 1.0;
  const maxInfluenceDistSq = maxInfluenceDist * maxInfluenceDist;

  const cellSize = 64.0;
  const gridCols = Math.ceil(width / cellSize);
  const gridRows = Math.ceil(depth / cellSize);
  const spatialGrid: number[][] = Array.from({ length: gridCols * gridRows }, () => []);

  for (let i = 0; i < trackSamples.length - 1; i++) {
    const v = trackSamples[i];
    const w = trackSamples[i + 1];

    const minX = Math.min(v.x, w.x) - maxInfluenceDist;
    const maxX = Math.max(v.x, w.x) + maxInfluenceDist;
    const minZ = Math.min(v.z, w.z) - maxInfluenceDist;
    const maxZ = Math.max(v.z, w.z) + maxInfluenceDist;

    const c0 = Math.max(0, Math.floor((minX + width / 2) / cellSize));
    const c1 = Math.min(gridCols - 1, Math.floor((maxX + width / 2) / cellSize));
    const r0 = Math.max(0, Math.floor((minZ + depth / 2) / cellSize));
    const r1 = Math.min(gridRows - 1, Math.floor((maxZ + depth / 2) / cellSize));

    for (let gr = r0; gr <= r1; gr++) {
      const rowBase = gr * gridCols;
      for (let gc = c0; gc <= c1; gc++) {
        spatialGrid[rowBase + gc].push(i);
      }
    }
  }

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const cx = x / subdivisions - 0.5;
      const cz = z / subdivisions - 0.5;
      const worldX = cx * width;
      const worldZ = cz * depth;

      let value = sampleRawElevation(worldX, worldZ);

      // Fast Spatial Hash Lookup for Candidate Spline Segments
      const gc = Math.floor((worldX + width / 2) / cellSize);
      const gr = Math.floor((worldZ + depth / 2) / cellSize);

      let minDistanceSq = Infinity;
      let closestSegIdx = 0;
      let closestSegT = 0;

      if (gc >= 0 && gc < gridCols && gr >= 0 && gr < gridRows) {
        const candidates = spatialGrid[gr * gridCols + gc];
        for (let k = 0; k < candidates.length; k++) {
          const i = candidates[k];
          const v = trackSamples[i];
          const w = trackSamples[i + 1];

          const l2 = (w.x - v.x) ** 2 + (w.z - v.z) ** 2;
          let distSq: number;
          let t = 0;

          if (l2 === 0) {
            distSq = (worldX - v.x) ** 2 + (worldZ - v.z) ** 2;
          } else {
            t = Math.max(0, Math.min(1, ((worldX - v.x) * (w.x - v.x) + (worldZ - v.z) * (w.z - v.z)) / l2));
            const projX = v.x + t * (w.x - v.x);
            const projZ = v.z + t * (w.z - v.z);
            distSq = (worldX - projX) ** 2 + (worldZ - projZ) ** 2;
          }

          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestSegIdx = i;
            closestSegT = t;
          }
        }
      }

      let trackMask = 0;
      if (minDistanceSq < maxInfluenceDistSq) {
        const distToTrack = Math.sqrt(minDistanceSq);

        // Visual track surface texture mask (with smootherstep transition)
        if (distToTrack < track.width) {
          trackMask = 1.0;
        } else if (distToTrack < track.width + track.falloff) {
          const t = 1.0 - (distToTrack - track.width) / track.falloff;
          trackMask = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        }

        // Smooth road grading: dedicated embankment transition wider than grid resolution
        let gradeFactor = 0;
        if (distToTrack < track.width) {
          gradeFactor = 1.0;
        } else if (distToTrack < track.width + gradingFalloff) {
          const gt = 1.0 - (distToTrack - track.width) / gradingFalloff;
          gradeFactor = gt * gt * gt * (gt * (gt * 6.0 - 15.0) + 10.0);
        }

        if (gradeFactor > 0 && smoothedTrackElevations && roadGrading > 0) {
          const nextIdx = (closestSegIdx + 1) % trackSamples.length;
          const hA = smoothedTrackElevations[closestSegIdx];
          const hB = smoothedTrackElevations[nextIdx];
          const centerlineH = hA + (hB - hA) * closestSegT;

          const gradeWeight = gradeFactor * roadGrading;
          value = value * (1.0 - gradeWeight) + centerlineH * gradeWeight;
        }
      }

      heights[z * size + x] = value;
      trackMasks[z * size + x] = trackMask;

      if (value < minHeight) minHeight = value;
      if (value > maxHeight) maxHeight = value;
    }
  }

  // 5. Curvature-preserving heightfield relaxation passes:
  // Eliminates sub-grid discrete aliasing, angular quad folds, and rectangular facet edges,
  // producing silky-smooth, organic rolling hills while strictly preserving perimeter ocean edges.
  if (subdivisions >= 32) {
    const tempH = new Float32Array(heights);
    for (let pass = 0; pass < 2; pass++) {
      // Horizontal pass: [0.25, 0.5, 0.25]
      for (let z = 1; z < size - 1; z++) {
        const rowOffset = z * size;
        for (let x = 1; x < size - 1; x++) {
          tempH[rowOffset + x] = 0.5 * heights[rowOffset + x] + 0.25 * (heights[rowOffset + x - 1] + heights[rowOffset + x + 1]);
        }
      }
      // Vertical pass: [0.25, 0.5, 0.25]
      for (let z = 1; z < size - 1; z++) {
        const rowOffset = z * size;
        const prevRow = (z - 1) * size;
        const nextRow = (z + 1) * size;
        for (let x = 1; x < size - 1; x++) {
          heights[rowOffset + x] = 0.5 * tempH[rowOffset + x] + 0.25 * (tempH[prevRow + x] + tempH[nextRow + x]);
        }
      }
    }

    // Recompute minHeight and maxHeight
    minHeight = Infinity;
    maxHeight = -Infinity;
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  return {
    heights,
    trackMasks,
    cols: size,
    rows: size,
    minHeight,
    maxHeight,
  };
}

/**
 * Bilinear height interpolation from heightmap data for smooth world coordinates sampling.
 * Eliminates step artifacts and levitation on slopes.
 */
export function getInterpolatedHeight(
  worldX: number,
  worldZ: number,
  heights: Float32Array,
  rows: number,
  cols: number,
  mapWidth: number,
  mapDepth: number,
): number {
  if (
    !Number.isFinite(worldX) ||
    !Number.isFinite(worldZ) ||
    !Number.isFinite(mapWidth) ||
    !Number.isFinite(mapDepth) ||
    mapWidth <= 0 ||
    mapDepth <= 0 ||
    !heights ||
    rows <= 0 ||
    cols <= 0
  ) {
    return 0;
  }

  const nx = (worldX + mapWidth / 2) / mapWidth;
  const nz = (worldZ + mapDepth / 2) / mapDepth;
  const gx = nx * (cols - 1);
  const gz = nz * (rows - 1);
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);

  if (!Number.isFinite(x0) || !Number.isFinite(z0) || x0 < 0 || x0 >= cols || z0 < 0 || z0 >= rows) {
    return 0;
  }

  const x1 = Math.min(x0 + 1, cols - 1);
  const z1 = Math.min(z0 + 1, rows - 1);

  const fx = gx - x0;
  const fz = gz - z0;

  const h00 = heights[z0 * cols + x0] ?? 0;
  const h10 = heights[z0 * cols + x1] ?? 0;
  const h01 = heights[z1 * cols + x0] ?? 0;
  const h11 = heights[z1 * cols + x1] ?? 0;

  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  const result = h0 + (h1 - h0) * fz;
  return Number.isFinite(result) ? result : 0;
}
