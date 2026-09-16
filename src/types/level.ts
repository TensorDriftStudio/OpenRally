import type { TrackConfig } from './terrain';
import type { GameMode } from './game';
import type { TireType } from './vehicle';

/**
 * Prop archetypes for realistic environmental scattering.
 */
export type PropType =
  | 'tree'
  | 'tree_pine'
  | 'tree_birch'
  | 'tree_desert'
  | 'rock'
  | 'rock_sandstone'
  | 'cabin'
  | 'fence'
  | 'castle_tower'
  | 'castle_wall'
  | 'castle_gate'
  | 'castle_keep'
  | 'castle_arch'
  | 'stone_wall'
  | 'standing_stone'
  | 'highland_cottage'
  | 'stone_bridge'
  | 'stone_cairn'
  | 'hay_bale'
  | 'rally_sign'
  | 'shipping_container'
  | 'drift_pylon'
  | 'jump_ramp';

/**
 * Represents a single instance of a prop (tree, rock) in the level.
 */
export interface PropData {
  id: string;
  type: PropType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/**
 * Base configuration for the procedural noise generator.
 * This ensures that even if we don't save a huge heightmap,
 * we have a deterministic base terrain.
 */
export interface TerrainBaseConfig {
  width: number;
  depth: number;
  subdivisions: number;
  amplitude: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  seed: number;
}

/**
 * A localized modification to the heightmap, representing
 * a brush stroke from a Map Editor.
 */
export interface HeightmapModification {
  x: number; // World X
  z: number; // World Z
  radius: number;
  heightDelta?: number; // For additive brushes
  absoluteHeight?: number; // For flatten brushes
  shape: 'sphere' | 'flat' | 'smooth';
}

/**
 * The root structure of a serialized Map/Level.
 */
export interface LevelData {
  id: string;
  name: string;
  terrainBase: TerrainBaseConfig;
  track: TrackConfig;
  heightModifiers: HeightmapModification[];
  props: PropData[];
}

export interface TagSpawnPoint {
  readonly position: [number, number, number];
  readonly rotationY: number;
}

/**
 * Complete level preset definition including gameplay metadata,
 * spawn positioning, reset bounds, and environmental styling.
 */
export interface LevelPreset {
  /** Unique level identifier */
  readonly id: string;
  /** Display title */
  readonly name: string;
  /** Description / subtitle */
  readonly description: string;
  /** Track difficulty label */
  readonly difficulty: 'easy' | 'medium' | 'hard';
  /** Primary surface type description for UI */
  readonly surfaceDescription: string;
  /** Recommended / default tire compound for this level */
  readonly recommendedTire?: TireType;
  /** Allowed game modes for this level (defaults to ['freeroam', 'timeattack'] if omitted) */
  readonly supportedModes?: readonly GameMode[];
  /** Optional stage preview image / banner URL */
  readonly bannerUrl?: string;
  /** Underlying terrain, track, and props dataset */
  readonly data: LevelData;
  /** Vehicle spawn coordinates [x, y, z] */
  readonly spawnPosition: [number, number, number];
  /** Vehicle spawn heading (radians around Y axis) */
  readonly spawnRotationY: number;
  /** 12 Safe static spawn positions for Rally Tag mode */
  readonly tagSpawnPoints?: readonly TagSpawnPoint[];
  /** Y elevation threshold below which vehicle resets */
  readonly fallResetY: number;
  /** Optional custom environment styling */
  readonly environment?: {
    sky?: {
      sunPosition?: [number, number, number];
      inclination?: number;
      azimuth?: number;
      turbidity?: number;
      rayleigh?: number;
      mieCoefficient?: number;
      mieDirectionalG?: number;
    };
    fog?: {
      color?: string;
      near?: number;
      far?: number;
    };
    /** Whether the stage features an active water/ocean body (defaults to true) */
    hasWater?: boolean;
  };
}

