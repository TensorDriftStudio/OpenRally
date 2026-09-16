import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Uint16BufferAttribute,
} from 'three';
import { mapRange } from '@/utils/math';
import {
  BIOME_COLOR_LOW,
  BIOME_COLOR_MID,
  BIOME_COLOR_HIGH,
  BIOME_MID_THRESHOLD,
} from '@/config/terrain';

export const TERRAIN_CHUNKS_X = 4;
export const TERRAIN_CHUNKS_Z = 4;
export const TERRAIN_CHUNKS_TOTAL = TERRAIN_CHUNKS_X * TERRAIN_CHUNKS_Z;

export interface TerrainChunkBuildParams {
  width: number;
  depth: number;
  subdivisions: number;
  rows: number;
  cols: number;
  heights: Float32Array;
  trackMasks: Float32Array;
  minHeight: number;
  maxHeight: number;
  isSnow: boolean;
  isBritain: boolean;
}

/**
 * Builds 16 seamless terrain chunks (4x4 grid) with 16-bit Uint16 indices and precomputed global normals.
 * Each chunk has an analytical tight bounding box and bounding sphere for Three.js view frustum culling.
 */
export function buildTerrainChunkGeometries(params: TerrainChunkBuildParams): BufferGeometry[] {
  const {
    width,
    depth,
    subdivisions,
    rows,
    cols,
    heights,
    trackMasks,
    minHeight,
    maxHeight,
    isSnow,
    isBritain,
  } = params;

  const vertexCount = rows * cols;
  const globalNormals = new Float32Array(vertexCount * 3);
  const globalColors = new Float32Array(vertexCount * 3);

  const tempColor = new Color();
  const MUD_COLOR = isBritain ? new Color('#2c221a') : new Color('#3b2818');
  const SNOW_COLOR_LOW = new Color('#e6f0fa');
  const SNOW_COLOR_MID = new Color('#f4f9ff');
  const SNOW_COLOR_HIGH = new Color('#ffffff');
  const SNOW_TRACK_COLOR = new Color('#d2e3f0');

  const BRITAIN_COLOR_LOW = new Color('#2e4222');
  const BRITAIN_COLOR_MID = new Color('#4c5438');
  const BRITAIN_COLOR_HIGH = new Color('#625f54');

  // 1. Precalculate vertex biome colors across global grid
  for (let i = 0; i < vertexCount; i++) {
    const height = heights[i];
    const trackMask = trackMasks[i];

    const normalizedHeight = mapRange(height, minHeight, maxHeight, 0, 1);

    if (isSnow) {
      if (normalizedHeight < BIOME_MID_THRESHOLD) {
        tempColor.lerpColors(SNOW_COLOR_LOW, SNOW_COLOR_MID, normalizedHeight / BIOME_MID_THRESHOLD);
      } else {
        tempColor.lerpColors(
          SNOW_COLOR_MID,
          SNOW_COLOR_HIGH,
          (normalizedHeight - BIOME_MID_THRESHOLD) / (1 - BIOME_MID_THRESHOLD),
        );
      }

      if (trackMask > 0) {
        tempColor.lerp(SNOW_TRACK_COLOR, trackMask * 0.8);
      }
    } else if (isBritain) {
      if (normalizedHeight < BIOME_MID_THRESHOLD) {
        tempColor.lerpColors(BRITAIN_COLOR_LOW, BRITAIN_COLOR_MID, normalizedHeight / BIOME_MID_THRESHOLD);
      } else {
        tempColor.lerpColors(
          BRITAIN_COLOR_MID,
          BRITAIN_COLOR_HIGH,
          (normalizedHeight - BIOME_MID_THRESHOLD) / (1 - BIOME_MID_THRESHOLD),
        );
      }

      if (trackMask > 0) {
        tempColor.lerp(MUD_COLOR, trackMask * 0.8);
      }
    } else {
      if (normalizedHeight < BIOME_MID_THRESHOLD) {
        tempColor.lerpColors(BIOME_COLOR_LOW, BIOME_COLOR_MID, normalizedHeight / BIOME_MID_THRESHOLD);
      } else {
        tempColor.lerpColors(
          BIOME_COLOR_MID,
          BIOME_COLOR_HIGH,
          (normalizedHeight - BIOME_MID_THRESHOLD) / (1 - BIOME_MID_THRESHOLD),
        );
      }

      if (trackMask > 0) {
        tempColor.lerp(MUD_COLOR, trackMask * 0.8);
      }
    }

    const idx = i * 3;
    globalColors[idx] = tempColor.r;
    globalColors[idx + 1] = tempColor.g;
    globalColors[idx + 2] = tempColor.b;
  }

  // 2. Compute global analytical vertex normals via 8-neighbor Sobel operator on regular grid.
  // Eliminates diagonal grid bias and yields smooth C1 continuous normal vectors.
  const stepX = width / (cols - 1);
  const stepZ = depth / (rows - 1);

  for (let r = 0; r < rows; r++) {
    const rPrev = Math.max(0, r - 1);
    const rNext = Math.min(rows - 1, r + 1);
    const scaleZ = (rNext - rPrev) * stepZ * 4.0;

    for (let c = 0; c < cols; c++) {
      const cPrev = Math.max(0, c - 1);
      const cNext = Math.min(cols - 1, c + 1);
      const scaleX = (cNext - cPrev) * stepX * 4.0;

      const hTL = heights[rNext * cols + cPrev];
      const hTC = heights[rNext * cols + c];
      const hTR = heights[rNext * cols + cNext];

      const hML = heights[r * cols + cPrev];
      const hMR = heights[r * cols + cNext];

      const hBL = heights[rPrev * cols + cPrev];
      const hBC = heights[rPrev * cols + c];
      const hBR = heights[rPrev * cols + cNext];

      // Sobel kernel: dx = (TR + 2*MR + BR) - (TL + 2*ML + BL)
      const dhdx = ((hTR + 2.0 * hMR + hBR) - (hTL + 2.0 * hML + hBL)) / scaleX;
      // dz = (TL + 2*TC + TR) - (BL + 2*BC + BR)
      const dhdz = ((hTL + 2.0 * hTC + hTR) - (hBL + 2.0 * hBC + hBR)) / scaleZ;

      const nx = -dhdx;
      const ny = 1.0;
      const nz = -dhdz;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      const nIdx = (r * cols + c) * 3;
      globalNormals[nIdx] = nx * invLen;
      globalNormals[nIdx + 1] = ny * invLen;
      globalNormals[nIdx + 2] = nz * invLen;
    }
  }

  // 3. Subdivide terrain into TERRAIN_CHUNKS_X x TERRAIN_CHUNKS_Z grid
  const chunkSubdivsX = Math.floor(subdivisions / TERRAIN_CHUNKS_X);
  const chunkSubdivsZ = Math.floor(subdivisions / TERRAIN_CHUNKS_Z);
  const chunkVertsX = chunkSubdivsX + 1;
  const chunkVertsZ = chunkSubdivsZ + 1;
  const chunkVertexCount = chunkVertsX * chunkVertsZ;
  const chunkIndexCount = chunkSubdivsX * chunkSubdivsZ * 6;

  const geometries: BufferGeometry[] = [];

  for (let cz = 0; cz < TERRAIN_CHUNKS_Z; cz++) {
    for (let cx = 0; cx < TERRAIN_CHUNKS_X; cx++) {
      const colStart = cx * chunkSubdivsX;
      const rowStart = cz * chunkSubdivsZ;

      const positions = new Float32Array(chunkVertexCount * 3);
      const normals = new Float32Array(chunkVertexCount * 3);
      const uvs = new Float32Array(chunkVertexCount * 2);
      const colors = new Float32Array(chunkVertexCount * 3);
      const trackMaskArray = new Float32Array(chunkVertexCount);
      const indices = new Uint16Array(chunkIndexCount);

      for (let lr = 0; lr < chunkVertsZ; lr++) {
        const r = rowStart + lr;
        for (let lc = 0; lc < chunkVertsX; lc++) {
          const c = colStart + lc;
          const gIdx = r * cols + c;
          const lIdx = lr * chunkVertsX + lc;

          const x = -width / 2 + c * stepX;
          const y = heights[gIdx];
          const z = -depth / 2 + r * stepZ;

          positions[lIdx * 3] = x;
          positions[lIdx * 3 + 1] = y;
          positions[lIdx * 3 + 2] = z;

          normals[lIdx * 3] = globalNormals[gIdx * 3];
          normals[lIdx * 3 + 1] = globalNormals[gIdx * 3 + 1];
          normals[lIdx * 3 + 2] = globalNormals[gIdx * 3 + 2];

          uvs[lIdx * 2] = c / (cols - 1);
          uvs[lIdx * 2 + 1] = 1.0 - r / (rows - 1);

          colors[lIdx * 3] = globalColors[gIdx * 3];
          colors[lIdx * 3 + 1] = globalColors[gIdx * 3 + 1];
          colors[lIdx * 3 + 2] = globalColors[gIdx * 3 + 2];

          trackMaskArray[lIdx] = trackMasks[gIdx];
        }
      }

      let idxPtr = 0;
      for (let lr = 0; lr < chunkSubdivsZ; lr++) {
        for (let lc = 0; lc < chunkSubdivsX; lc++) {
          const v0 = lr * chunkVertsX + lc;
          const v1 = v0 + 1;
          const v2 = (lr + 1) * chunkVertsX + lc;
          const v3 = v2 + 1;

          // Delaunay / minimal-ridge diagonal selection:
          // Choose the diagonal with the smaller height delta to eliminate artificial 45-degree creases.
          const y0 = positions[v0 * 3 + 1];
          const y1 = positions[v1 * 3 + 1];
          const y2 = positions[v2 * 3 + 1];
          const y3 = positions[v3 * 3 + 1];

          const diff1 = Math.abs(y1 - y2); // diagonal v1 - v2
          const diff2 = Math.abs(y0 - y3); // diagonal v0 - v3

          if (diff2 < diff1) {
            // Split along v0 - v3: triangles (v0, v2, v3) and (v0, v3, v1)
            indices[idxPtr++] = v0;
            indices[idxPtr++] = v2;
            indices[idxPtr++] = v3;

            indices[idxPtr++] = v0;
            indices[idxPtr++] = v3;
            indices[idxPtr++] = v1;
          } else {
            // Split along v1 - v2: triangles (v0, v2, v1) and (v1, v2, v3)
            indices[idxPtr++] = v0;
            indices[idxPtr++] = v2;
            indices[idxPtr++] = v1;

            indices[idxPtr++] = v1;
            indices[idxPtr++] = v2;
            indices[idxPtr++] = v3;
          }
        }
      }

      const chunkGeo = new BufferGeometry();
      chunkGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      chunkGeo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      chunkGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      chunkGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      chunkGeo.setAttribute('trackMask', new Float32BufferAttribute(trackMaskArray, 1));
      chunkGeo.setIndex(new Uint16BufferAttribute(indices, 1));

      chunkGeo.computeBoundingBox();
      chunkGeo.computeBoundingSphere();

      geometries.push(chunkGeo);
    }
  }

  return geometries;
}
