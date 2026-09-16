import type {
  LevelPreset,
  LevelData,
  TerrainBaseConfig,
  HeightmapModification,
  PropData,
  TagSpawnPoint,
} from '@/types/level';
import type { GameMode } from '@/types/game';
import type { TrackPoint, TrackConfig } from '@/types/terrain';
import type { TireType } from '@/types/vehicle';

/**
 * Environment archetypes with predefined procedural noise & atmosphere styles.
 */
export type EnvironmentArchetype = 'island' | 'desert' | 'alpine' | 'tundra' | 'canyon';

export interface EnvironmentAtmosphere {
  sky?: {
    sunPosition?: [number, number, number];
    inclination?: number;
    azimuth?: number;
  };
  fog?: {
    color?: string;
    near?: number;
    far?: number;
  };
}

/**
 * Standard terrain bases for environments.
 */
export const ARCHETYPE_TERRAINS: Record<
  EnvironmentArchetype,
  {
    terrainBase: Omit<TerrainBaseConfig, 'seed'>;
    atmosphere: EnvironmentAtmosphere;
    defaultSurfaceDescription: string;
  }
> = {
  island: {
    terrainBase: {
      width: 600,
      depth: 600,
      subdivisions: 180,
      amplitude: 25,
      frequency: 0.005,
      octaves: 4,
      lacunarity: 2.0,
      persistence: 0.5,
    },
    atmosphere: {
      sky: {
        sunPosition: [100, 40, 100],
        inclination: 0.5,
        azimuth: 0.25,
      },
      fog: {
        color: '#cce0ff',
        near: 200,
        far: 1000,
      },
    },
    defaultSurfaceDescription: 'Mud & Grass',
  },
  desert: {
    terrainBase: {
      width: 700,
      depth: 700,
      subdivisions: 200,
      amplitude: 35,
      frequency: 0.003,
      octaves: 4,
      lacunarity: 2.0,
      persistence: 0.45,
    },
    atmosphere: {
      sky: {
        sunPosition: [100, 30, -50],
        inclination: 0.6,
        azimuth: 0.3,
      },
      fog: {
        color: '#d4b483',
        near: 150,
        far: 1400,
      },
    },
    defaultSurfaceDescription: 'Sand & Gravel',
  },
  alpine: {
    terrainBase: {
      width: 800,
      depth: 800,
      subdivisions: 220,
      amplitude: 55,
      frequency: 0.004,
      octaves: 5,
      lacunarity: 2.1,
      persistence: 0.48,
    },
    atmosphere: {
      sky: {
        sunPosition: [50, 60, 80],
        inclination: 0.4,
        azimuth: 0.15,
      },
      fog: {
        color: '#e0e7ff',
        near: 250,
        far: 1600,
      },
    },
    defaultSurfaceDescription: 'Tarmac & Snow',
  },
  tundra: {
    terrainBase: {
      width: 700,
      depth: 700,
      subdivisions: 190,
      amplitude: 28,
      frequency: 0.004,
      octaves: 4,
      lacunarity: 2.0,
      persistence: 0.4,
    },
    atmosphere: {
      sky: {
        sunPosition: [80, 20, -100],
        inclination: 0.75,
        azimuth: 0.5,
      },
      fog: {
        color: '#dbeafe',
        near: 100,
        far: 900,
      },
    },
    defaultSurfaceDescription: 'Snow & Ice',
  },
  canyon: {
    terrainBase: {
      width: 750,
      depth: 750,
      subdivisions: 210,
      amplitude: 48,
      frequency: 0.0035,
      octaves: 5,
      lacunarity: 2.2,
      persistence: 0.46,
    },
    atmosphere: {
      sky: {
        sunPosition: [120, 25, 40],
        inclination: 0.65,
        azimuth: 0.4,
      },
      fog: {
        color: '#fed7aa',
        near: 120,
        far: 1200,
      },
    },
    defaultSurfaceDescription: 'Gravel & Dirt',
  },
};

/**
 * Options for creating a level preset.
 */
export interface CreateLevelOptions {
  /** Unique level ID */
  readonly id: string;
  /** Display title */
  readonly name: string;
  /** Description / subtitle */
  readonly description: string;
  /** Difficulty rating */
  readonly difficulty?: 'easy' | 'medium' | 'hard';
  /** Primary surface description for UI */
  readonly surfaceDescription?: string;
  /** Recommended / default tire compound for this level */
  readonly recommendedTire?: TireType;
  /** Environmental archetype */
  readonly archetype?: EnvironmentArchetype;
  /** Deterministic PRNG seed */
  readonly seed?: number;
  /** Custom track spline points */
  readonly trackPoints: readonly TrackPoint[];
  /** Track width (default 20) */
  readonly trackWidth?: number;
  /** Track elevation blending falloff distance (default 30) */
  readonly trackFalloff?: number;
  /** Base track elevation Y (default 0.0) */
  readonly targetHeight?: number;
  /** Heightmap brush modifications */
  readonly heightModifiers?: readonly HeightmapModification[];
  /** Placed trees, rocks, buildings */
  readonly props?: readonly PropData[];
  /** Custom vehicle spawn position (defaults to slightly above first track point) */
  readonly spawnPosition?: [number, number, number];
  /** Custom vehicle spawn heading rotation Y (defaults to track tangent) */
  readonly spawnRotationY?: number;
  /** Allowed game modes for this level (defaults to ['freeroam', 'timeattack'] if omitted) */
  readonly supportedModes?: readonly GameMode[];
  /** Optional preview image / banner URL */
  readonly bannerUrl?: string;
  /** 12 Safe static spawn positions for Rally Tag mode (automatically generated along spline if omitted) */
  readonly tagSpawnPoints?: readonly TagSpawnPoint[];
  /** Fall reset threshold Y (defaults to -10.0) */
  readonly fallResetY?: number;
  /** Environment overrides (sky, fog) */
  readonly environment?: EnvironmentAtmosphere;
  /** Specific terrain base overrides */
  readonly terrainOverrides?: Partial<TerrainBaseConfig>;
}

/**
 * Generates 12 evenly-spaced spawn points along a track spline for Rally Tag mode.
 */
export function generateDefaultTagSpawns(
  trackPoints: readonly TrackPoint[],
  targetHeight = 0.0,
): TagSpawnPoint[] {
  if (trackPoints.length < 3) return [];
  const spawns: TagSpawnPoint[] = [];
  const count = 12;
  const step = trackPoints.length / count;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * step) % trackPoints.length;
    const nextIdx = (idx + 1) % trackPoints.length;
    const p0 = trackPoints[idx];
    const p1 = trackPoints[nextIdx];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const rotY = Math.atan2(dx, dz);
    spawns.push({
      position: [p0.x, targetHeight + 1.2, p0.z],
      rotationY: rotY,
    });
  }
  return spawns;
}

/**
 * Factory function to create a complete, type-safe LevelPreset.
 * Automatically computes safe spawn positions and headings aligned with the track spline.
 */
export function createLevelPreset(options: CreateLevelOptions): LevelPreset {
  const archetype = options.archetype ?? 'island';
  const archetypeSpec = ARCHETYPE_TERRAINS[archetype];

  const terrainBase: TerrainBaseConfig = {
    ...archetypeSpec.terrainBase,
    seed: options.seed ?? 42,
    ...options.terrainOverrides,
  };

  const track: TrackConfig = {
    points: [...options.trackPoints],
    width: options.trackWidth ?? 20,
    falloff: options.trackFalloff ?? 30,
    targetHeight: options.targetHeight ?? 0.0,
  };

  const data: LevelData = {
    id: options.id,
    name: options.name,
    terrainBase,
    track,
    heightModifiers: options.heightModifiers ? [...options.heightModifiers] : [],
    props: options.props ? [...options.props] : [],
  };

  // Compute smart spawn position and orientation if not provided
  let spawnPos: [number, number, number] = options.spawnPosition ?? [0, 1.0, 0];
  let spawnRot: number = options.spawnRotationY ?? 0;

  if (!options.spawnPosition && options.trackPoints.length >= 2) {
    const p0 = options.trackPoints[0];
    const p1 = options.trackPoints[1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    // Align heading along track forward vector (+Z is forward in Three.js)
    spawnRot = Math.atan2(dx, dz);
    spawnPos = [p0.x, (options.targetHeight ?? 0) + 1.2, p0.z];
  }

  const fallResetY = options.fallResetY ?? -12.0;

  const tagSpawnPoints =
    options.tagSpawnPoints ??
    (options.trackPoints.length >= 12
      ? generateDefaultTagSpawns(options.trackPoints, options.targetHeight ?? 0.0)
      : undefined);

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    difficulty: options.difficulty ?? 'medium',
    surfaceDescription: options.surfaceDescription ?? archetypeSpec.defaultSurfaceDescription,
    recommendedTire:
      options.recommendedTire ??
      (archetype === 'tundra' || archetype === 'alpine' ? 'snow' : 'gravel'),
    supportedModes: options.supportedModes,
    bannerUrl: options.bannerUrl,
    data,
    spawnPosition: spawnPos,
    spawnRotationY: spawnRot,
    tagSpawnPoints,
    fallResetY,
    environment: {
      ...archetypeSpec.atmosphere,
      ...options.environment,
    },
  };
}
