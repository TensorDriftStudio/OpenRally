import { Vector3, CatmullRomCurve3 } from 'three';
import type { LevelData, LevelPreset } from '@/types/level';
import { AVAILABLE_TIRE_TYPES } from '@/config/tireRegistry';
import type { ValidationResult } from './vehicleValidator';

/**
 * Validates level data (terrain base, track spline, height modifiers, props).
 */
export function validateLevelData(data: LevelData): ValidationResult {
  const errors: string[] = [];

  if (!data) {
    return { valid: false, errors: ['LevelData is null or undefined'] };
  }

  if (!data.id || typeof data.id !== 'string') {
    errors.push('LevelData.id is required.');
  }
  if (!data.name || typeof data.name !== 'string') {
    errors.push('LevelData.name is required.');
  }

  // TerrainBase checks
  const tb = data.terrainBase;
  if (!tb) {
    errors.push('LevelData.terrainBase is missing.');
  } else {
    if (tb.width <= 0 || tb.depth <= 0) {
      errors.push(`Invalid terrain dimensions: width=${tb.width}, depth=${tb.depth}. Must be > 0.`);
    }
    if (tb.subdivisions < 16) {
      errors.push(`subdivisions must be >= 16 (currently: ${tb.subdivisions}).`);
    }
    if (tb.amplitude <= 0) {
      errors.push(`amplitude must be > 0 (currently: ${tb.amplitude}).`);
    }
    if (tb.octaves < 1) {
      errors.push(`octaves must be >= 1 (currently: ${tb.octaves}).`);
    }
  }

  // Track checks
  const track = data.track;
  if (!track) {
    errors.push('LevelData.track is missing.');
  } else {
    if (!Array.isArray(track.points) || track.points.length < 3) {
      errors.push(`Track points must contain at least 3 points to form a closed spline (currently: ${track.points?.length ?? 0}).`);
    }
    if (track.width <= 0) {
      errors.push(`Track width must be > 0 (currently: ${track.width}).`);
    }
    if (track.falloff < 0) {
      errors.push(`Track falloff must be >= 0 (currently: ${track.falloff}).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Mathematically validates that all environmental props in a level respect
 * physical minimum clearance from the track spline so no object blocks the road.
 */
export function validateLevelTrackClearance(data: LevelData): ValidationResult {
  const errors: string[] = [];
  if (!data || !data.track || !data.track.points || data.track.points.length < 3 || !data.props) {
    return { valid: true, errors: [] };
  }

  const trackCurve = new CatmullRomCurve3(
    data.track.points.map((p) => new Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5,
  );
  const samplePoints: Vector3[] = [];
  const numSamples = 1200;
  for (let i = 0; i <= numSamples; i++) {
    samplePoints.push(trackCurve.getPointAt(i / numSamples));
  }

  const getMinDist = (px: number, pz: number): number => {
    let minDistSq = Infinity;
    for (let i = 0; i < samplePoints.length - 1; i++) {
      const v = samplePoints[i];
      const w = samplePoints[i + 1];
      const l2 = (w.x - v.x) ** 2 + (w.z - v.z) ** 2;
      let distSq: number;
      if (l2 === 0) {
        distSq = (px - v.x) ** 2 + (pz - v.z) ** 2;
      } else {
        let t = ((px - v.x) * (w.x - v.x) + (pz - v.z) * (w.z - v.z)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = v.x + t * (w.x - v.x);
        const projZ = v.z + t * (w.z - v.z);
        distSq = (px - projX) ** 2 + (pz - projZ) ** 2;
      }
      if (distSq < minDistSq) minDistSq = distSq;
    }
    return Math.sqrt(minDistSq);
  };

  for (const prop of data.props) {
    // Exempt road spanning features, roadside signs, apex hay bales, drift clipping pylons, and jump ramps
    if (
      prop.type === 'castle_gate' ||
      prop.type === 'rally_sign' ||
      prop.type === 'hay_bale' ||
      prop.type === 'drift_pylon' ||
      prop.type === 'jump_ramp'
    ) continue;

    const dist = getMinDist(prop.position[0], prop.position[2]);
    const roadDrivableRadius = data.track.width;
    const roadTotalRadius = data.track.width + data.track.falloff;

    let requiredMinDist = roadDrivableRadius + 1.5;

    if (prop.type === 'cabin' || prop.type === 'highland_cottage' || prop.type === 'castle_keep') {
      requiredMinDist = Math.max(requiredMinDist, roadTotalRadius + 8.0);
    } else if (
      prop.type === 'castle_wall' ||
      prop.type === 'castle_tower' ||
      prop.type === 'castle_arch' ||
      prop.type === 'stone_wall' ||
      prop.type === 'fence'
    ) {
      requiredMinDist = Math.max(requiredMinDist, roadTotalRadius + 3.0);
    } else if (prop.type === 'shipping_container') {
      requiredMinDist = roadDrivableRadius + 1.0;
    }

    if (dist < requiredMinDist) {
      errors.push(
        `[TrackClearance] Level '${data.id}': Prop '${prop.id}' (type: '${prop.type}') at (${prop.position[0].toFixed(1)}, ${prop.position[2].toFixed(1)}) is ${dist.toFixed(1)}m from track spline (min required: ${requiredMinDist.toFixed(1)}m).`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a level preset metadata and spawn properties.
 */
export function validateLevelPreset(preset: LevelPreset): ValidationResult {
  const errors: string[] = [];

  if (!preset.id || typeof preset.id !== 'string') {
    errors.push('LevelPreset.id is missing or not a string.');
  }
  if (!preset.name || typeof preset.name !== 'string') {
    errors.push('LevelPreset.name is missing or not a string.');
  }
  if (!preset.spawnPosition || preset.spawnPosition.length !== 3) {
    errors.push('LevelPreset.spawnPosition must be a 3-element tuple [x, y, z].');
  }

  const dataValidation = validateLevelData(preset.data);
  if (!dataValidation.valid) {
    errors.push(...dataValidation.errors);
  }

  const clearanceValidation = validateLevelTrackClearance(preset.data);
  if (!clearanceValidation.valid) {
    errors.push(...clearanceValidation.errors);
  }

  if (preset.tagSpawnPoints !== undefined) {
    if (!Array.isArray(preset.tagSpawnPoints) || preset.tagSpawnPoints.length !== 12) {
      errors.push('LevelPreset.tagSpawnPoints must be an array of exactly 12 TagSpawnPoints.');
    } else {
      for (let i = 0; i < preset.tagSpawnPoints.length; i++) {
        const sp = preset.tagSpawnPoints[i];
        if (!sp || !Array.isArray(sp.position) || sp.position.length !== 3 || !sp.position.every(Number.isFinite)) {
          errors.push(`LevelPreset.tagSpawnPoints[${i}].position must be a valid 3-element tuple.`);
        }
        if (typeof sp.rotationY !== 'number' || !Number.isFinite(sp.rotationY)) {
          errors.push(`LevelPreset.tagSpawnPoints[${i}].rotationY must be a finite number.`);
        }
      }
    }
  }

  if (preset.recommendedTire !== undefined) {
    if (!AVAILABLE_TIRE_TYPES.includes(preset.recommendedTire)) {
      errors.push(`LevelPreset.recommendedTire must be one of: ${AVAILABLE_TIRE_TYPES.join(', ')}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
