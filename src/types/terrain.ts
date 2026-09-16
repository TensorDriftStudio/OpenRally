export type MapFeatureType = 'mountain' | 'lake' | 'spawn_flatten';

export interface MapFeatureBase {
  readonly type: MapFeatureType;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface MountainFeature extends MapFeatureBase {
  readonly type: 'mountain';
  readonly height: number;
  readonly flattenTop?: boolean;
}

export interface LakeFeature extends MapFeatureBase {
  readonly type: 'lake';
  readonly depth: number;
}

export interface SpawnFlattenFeature extends MapFeatureBase {
  readonly type: 'spawn_flatten';
  readonly falloff: number;
}

export type MapFeature = MountainFeature | LakeFeature | SpawnFlattenFeature;

export interface TrackPoint {
  readonly x: number;
  readonly z: number;
}

export interface TrackConfig {
  readonly points: TrackPoint[];
  readonly width: number;
  readonly falloff: number;
  readonly targetHeight: number;
  /** Optional roadbed grading strength [0.0 - 1.0] to flatten cross-track tilt and smooth micro-bumps (default: undefined / 0) */
  readonly roadGrading?: number;
}

/**
 * Configuration for procedural terrain generation.
 */
export interface TerrainConfig {
  /** World-space width of the terrain (X axis) */
  readonly width: number;
  /** World-space depth of the terrain (Z axis) */
  readonly depth: number;
  /** Number of subdivisions along each axis */
  readonly subdivisions: number;
  /** Maximum height amplitude */
  readonly amplitude: number;
  /** Base noise frequency */
  readonly frequency: number;
  /** Number of noise octaves for fBM */
  readonly octaves: number;
  /** Frequency multiplier per octave */
  readonly lacunarity: number;
  /** Amplitude multiplier per octave */
  readonly persistence: number;
  /** Random seed for noise */
  readonly seed: number;
  /** Array of map features like mountains and lakes */
  readonly features: MapFeature[];
  /** Track configuration */
  readonly track: TrackConfig;
}

/**
 * Generated heightmap data — shared between visual mesh and physics collider.
 */
export interface HeightmapData {
  /** Raw height values, row-major order, size = (subdivisions+1)^2 */
  readonly heights: Float32Array;
  /** Track mask values, row-major order, 1.0 = center of track, 0.0 = no track */
  readonly trackMasks: Float32Array;
  /** Number of columns (X direction) */
  readonly cols: number;
  /** Number of rows (Z direction) */
  readonly rows: number;
  /** Minimum height value in the map */
  readonly minHeight: number;
  /** Maximum height value in the map */
  readonly maxHeight: number;
}


