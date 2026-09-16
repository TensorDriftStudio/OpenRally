import { Color } from 'three';

// ─── Grass Instancing Config ────────────────────────────────────────

/** Total number of grass clusters to scatter across the terrain (High quality) */
export const GRASS_COUNT = 80_000;

/** Minimum height of grass blades (world units) */
export const GRASS_HEIGHT_MIN = 0.26;

/** Maximum height of grass blades (world units) */
export const GRASS_HEIGHT_MAX = 0.52;

/** Radius of a single multi-blade grass cluster (world units) */
export const GRASS_WIDTH = 0.28;

/** Blade width at tip as fraction of base */
export const GRASS_TIP_WIDTH = 0.25;

// ─── Wind Animation ─────────────────────────────────────────────────

/** Wind sway speed */
export const WIND_SPEED = 2.2;

/** Wind sway max displacement (world units) */
export const WIND_STRENGTH = 0.06;

// ─── Placement Rules ────────────────────────────────────────────────

/** Max normalized terrain height (0–1) where grass grows */
export const GRASS_MAX_TERRAIN_HEIGHT = 0.55;

/** Min distance from map center to keep spawn zone clear */
export const GRASS_CLEARING_RADIUS = 18;

/** Fraction of map edge within which grass can appear */
export const GRASS_EDGE_MARGIN = 0.9;

// ─── Colors ─────────────────────────────────────────────────────────

/** Grass blade tip color (fresh vibrant sunlit meadow green) */
export const GRASS_COLOR_LIGHT = new Color('#487826');

/** Grass blade root color (deep moist soil emerald, perfectly matching terrain) */
export const GRASS_COLOR_DARK = new Color('#1b3012');

/** Desert dry grass tip color */
export const DESERT_GRASS_COLOR_LIGHT = new Color('#c29b48');

/** Desert dry grass root color */
export const DESERT_GRASS_COLOR_DARK = new Color('#5c441a');

// ─── Chunking & Culling (Performance) ───────────────────────────────

/** Number of chunks per axis to divide the grass into (e.g. 6 = 6x6 grid = 36 chunks) */
export const GRASS_CHUNKS = 6;

/** Number of chunks per axis on mobile TBDR GPUs (3 = 3x3 grid = 9 chunks) */
export const GRASS_CHUNKS_MOBILE = 3;

/** Distance range (meters) over which grass smoothly scales to 0 at the draw distance boundary */
export const GRASS_FADE_RANGE = 28;




