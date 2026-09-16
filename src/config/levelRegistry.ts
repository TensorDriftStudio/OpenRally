import type { LevelPreset } from '@/types/level';
import type { TireType } from '@/types/vehicle';
import { LEVEL1_DATA } from './levels/islandCircuit';
import { LEVEL2_DESERT_DATA } from './levels/desertCanyon';
import { LEVEL3_SWEDEN_DATA } from './levels/swedenSnow';
import { LEVEL4_BRITAIN_DATA } from './levels/highlandCastle';
import { LEVEL5_GYMKHANA_DATA } from './levels/gymkhanaIsland';
import { TAG_LEVEL_SPAWNS } from './tagSpawns';

/**
 * Stage 1 / Default Level: Island Circuit.
 * Coastal asphalt/mud track surrounded by ocean and green hills.
 * Vehicle spawns directly on the marked start grid facing the Start/Finish Gantry.
 */
export const LEVEL_PRESET_ISLAND: LevelPreset = {
  id: 'level1_island',
  name: 'Island Circuit',
  description: 'Coastal circuit featuring rolling green hills, mud track curves, and ocean vistas.',
  difficulty: 'easy',
  surfaceDescription: 'Mud & Grass',
  recommendedTire: 'gravel',
  supportedModes: ['freeroam', 'timeattack', 'tag'],
  bannerUrl: '/images/stages/island_circuit.jpg',
  data: LEVEL1_DATA,
  spawnPosition: [-3.5, 9.5, 2.0],
  spawnRotationY: Math.atan2(130 - (-70), -70 - (-35)), // Aligned with start straight
  tagSpawnPoints: TAG_LEVEL_SPAWNS['level1_island'],
  fallResetY: -8.25,
  environment: {
    sky: {
      sunPosition: [80, 100, 60],
      inclination: 0,
      azimuth: 0.25,
      turbidity: 3.5,
      rayleigh: 1.2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
    },
    fog: {
      color: '#a4bccc',
      near: 100,
      far: 800,
    },
  },
};

/**
 * Stage 2 Level: Desert Canyon.
 * Arid canyon with rocky slopes, loose sand dunes, and sharp sweeping curves.
 * Vehicle spawns directly on the marked start grid facing the Start/Finish Gantry.
 */
export const LEVEL_PRESET_DESERT: LevelPreset = {
  id: 'level2_desert',
  name: 'Desert Canyon',
  description: 'Arid desert basin with rocky canyon passes, loose sand dunes, and elevated ridges.',
  difficulty: 'medium',
  surfaceDescription: 'Sand & Gravel',
  recommendedTire: 'gravel',
  supportedModes: ['freeroam', 'timeattack', 'tag'],
  bannerUrl: '/images/stages/desert_canyon.jpg',
  data: LEVEL2_DESERT_DATA,
  spawnPosition: [-3.5, 9.8, -1.5],
  spawnRotationY: Math.atan2(140 - (-60), 50 - (-30)), // Aligned with start straight
  tagSpawnPoints: TAG_LEVEL_SPAWNS['level2_desert'],
  fallResetY: -10.0,
  environment: {
    hasWater: true,
    sky: {
      sunPosition: [100, 30, -50],
      inclination: 0.6,
      azimuth: 0.3,
      turbidity: 8.0,
      rayleigh: 2.2,
      mieCoefficient: 0.015,
      mieDirectionalG: 0.75,
    },
    fog: {
      color: '#d4b483',
      near: 150,
      far: 1400,
    },
  },
};

/**
 * Stage 3 Level: Sweden Snow Rally.
 * High-speed Scandinavian winter stage with snowbanks, crest jumps, red cottages, and frozen lake sections.
 * Vehicle spawns directly on the marked start grid facing the Start/Finish Gantry.
 */
export const LEVEL_PRESET_SWEDEN: LevelPreset = {
  id: 'level3_sweden',
  name: 'Sweden Snow Rally',
  description: 'High-speed Scandinavian winter stage with snowbanks, crest jumps, red cottages, and frozen lake.',
  difficulty: 'hard',
  surfaceDescription: 'Snow & Ice',
  recommendedTire: 'snow',
  supportedModes: ['freeroam', 'timeattack', 'tag'],
  bannerUrl: '/images/stages/sweden_snow.jpg',
  data: LEVEL3_SWEDEN_DATA,
  spawnPosition: [-3.5, 9.5, 1.5],
  spawnRotationY: Math.atan2(130 - (-70), -50 - (-40)), // Aligned with start straight
  tagSpawnPoints: TAG_LEVEL_SPAWNS['level3_sweden'],
  fallResetY: -10.0,
  environment: {
    sky: {
      sunPosition: [120, 25, -60],
      inclination: 0.72,
      azimuth: 0.35,
      turbidity: 2.5,
      rayleigh: 0.9,
      mieCoefficient: 0.008,
      mieDirectionalG: 0.85,
    },
    fog: {
      color: '#d4e5f2',
      near: 120,
      far: 1400,
    },
  },
};

/**
 * Stage 4 Level: Highland Castle Rally (Great Britain).
 * Largest rally stage in OpenRally (2600m x 2600m) with ancient medieval castle ruins,
 * narrow country lane stone walls, steep hairpin switchbacks, loch shoreline vistas, and misty moors.
 * Vehicle spawns directly on the marked start grid facing the Start/Finish Gantry.
 */
export const LEVEL_PRESET_BRITAIN: LevelPreset = {
  id: 'level4_britain',
  name: 'Highland Castle Rally',
  description: 'Epic British highlands stage through medieval castle ruins, stone wall corridors, and tight technical hairpins.',
  difficulty: 'hard',
  surfaceDescription: 'Mud, Gravel & Stone',
  recommendedTire: 'gravel',
  supportedModes: ['freeroam', 'timeattack', 'tag'],
  bannerUrl: '/images/stages/highland_castle.jpg',
  data: LEVEL4_BRITAIN_DATA,
  spawnPosition: [-3.13, 9.75, -1.57],
  spawnRotationY: Math.atan2(45 - (-65), 20 - (-35)), // Aligned with CP0 track heading
  tagSpawnPoints: TAG_LEVEL_SPAWNS['level4_britain'],
  fallResetY: -10.0,
  environment: {
    sky: {
      sunPosition: [160, 55, -120],
      inclination: 0.62,
      azimuth: 0.28,
      turbidity: 3.2,
      rayleigh: 2.2,
      mieCoefficient: 0.008,
      mieDirectionalG: 0.82,
    },
    fog: {
      color: '#a8bbcc',
      near: 140,
      far: 2200,
    },
  },
};

/**
 * Stage 5 Level: Apex Gymkhana Arena.
 * High-octane industrial drift island compound with shipping container chicanes,
 * 360 donut zones, and wide tarmac pads. Exclusively supports Free Roam, Gymkhana Blitz, and Rally Tag.
 */
export const LEVEL_PRESET_GYMKHANA: LevelPreset = {
  id: 'level5_gymkhana',
  name: 'Apex Gymkhana Arena',
  description: 'Industrial island drift compound featuring shipping container chicanes, 360 donut zones, and wide asphalt drift pads.',
  difficulty: 'medium',
  surfaceDescription: 'Tarmac & Concrete',
  recommendedTire: 'asphalt',
  supportedModes: ['freeroam', 'gymkhana_blitz', 'tag'],
  bannerUrl: '/images/stages/apex_gymkhana.jpg',
  data: LEVEL5_GYMKHANA_DATA,
  spawnPosition: [-1.86, 9.5, -4.64],
  spawnRotationY: Math.atan2(40, 100), // Aligned with CP0 track heading
  tagSpawnPoints: TAG_LEVEL_SPAWNS['level5_gymkhana'],
  fallResetY: -10.0,
  environment: {
    sky: {
      sunPosition: [120, 45, -80],
      inclination: 0.55,
      azimuth: 0.32,
      turbidity: 4.0,
      rayleigh: 1.5,
      mieCoefficient: 0.008,
      mieDirectionalG: 0.85,
    },
    fog: {
      color: '#9cb5c9',
      near: 120,
      far: 1600,
    },
  },
};

/**
 * Registry of all available levels in OpenRally.
 */
export const LEVEL_REGISTRY: Record<string, LevelPreset> = {
  level1_island: LEVEL_PRESET_ISLAND,
  level2_desert: LEVEL_PRESET_DESERT,
  level3_sweden: LEVEL_PRESET_SWEDEN,
  level4_britain: LEVEL_PRESET_BRITAIN,
  level5_gymkhana: LEVEL_PRESET_GYMKHANA,
};

/** Default active level ID */
export const DEFAULT_LEVEL_ID = 'level1_island';

/**
 * Returns level preset by ID, falling back to Island Circuit if not found.
 */
export function getLevelPreset(id: string): LevelPreset {
  return LEVEL_REGISTRY[id] ?? LEVEL_PRESET_ISLAND;
}

/**
 * Returns an array of all registered level presets.
 */
export function getAvailableLevels(): LevelPreset[] {
  return Object.values(LEVEL_REGISTRY);
}

/**
 * Resolves the recommended default tire compound for a given level.
 * Falls back to 'gravel' for unpaved terrain or 'asphalt' if unspecified.
 */
export function getRecommendedTireForLevel(levelOrId: LevelPreset | string): TireType {
  const preset = typeof levelOrId === 'string' ? getLevelPreset(levelOrId) : levelOrId;
  if (preset?.recommendedTire) {
    return preset.recommendedTire;
  }
  const surfDesc = (preset?.surfaceDescription || '').toLowerCase();
  if (surfDesc.includes('snow') || surfDesc.includes('ice') || surfDesc.includes('winter')) {
    return 'snow';
  }
  if (surfDesc.includes('tarmac') || surfDesc.includes('asphalt') || surfDesc.includes('concrete')) {
    return 'asphalt';
  }
  return 'gravel';
}



