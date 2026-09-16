import { useMemo } from 'react';
import { Object3D, Vector3, CatmullRomCurve3 } from 'three';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useSettingsStore } from '@/store/settingsStore';
import { isMobileDevice } from '@/utils/device';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';
import type { PropItem, CategorizedProps } from './types';

const _scratchDummy = new Object3D();
const CELL_SIZE = 50;
const getCellKey = (cx: number, cz: number) => `${cx}_${cz}`;

export interface CategorizePropsOptions {
  maxVegetationDistance?: number;
}

/**
 * Pure deterministic function that parses, snaps to terrain height, calculates transform matrices,
 * and categorizes all level props into distinct typed buckets along with spatial grid cells.
 */
export function categorizeProps(
  heightmapData: HeightmapData,
  levelData: LevelData,
  options?: CategorizePropsOptions,
): CategorizedProps {
  const { heights, rows, cols } = heightmapData;
  const mapWidth = levelData.terrainBase.width;
  const mapDepth = levelData.terrainBase.depth;

  // Build exact track curve to calculate true Euclidean distances
  const trackCurve = new CatmullRomCurve3(
    levelData.track.points.map((p) => new Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5,
  );
  const splineSamples: Vector3[] = [];
  const numSplineSamples = 1500;
  for (let i = 0; i <= numSplineSamples; i++) {
    splineSamples.push(trackCurve.getPointAt(i / numSplineSamples));
  }

  const getMinDistToTrackSpline = (px: number, pz: number): number => {
    let minDistSq = Infinity;
    for (let i = 0; i < splineSamples.length - 1; i++) {
      const v = splineSamples[i];
      const w = splineSamples[i + 1];
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

  const pines: PropItem[] = [];
  const birches: PropItem[] = [];
  const deserts: PropItem[] = [];
  const graniteRocks: PropItem[] = [];
  const sandstones: PropItem[] = [];
  const cabinList: PropItem[] = [];
  const fenceList: PropItem[] = [];
  const castleTowerList: PropItem[] = [];
  const castleWallList: PropItem[] = [];
  const castleGateList: PropItem[] = [];
  const castleKeepList: PropItem[] = [];
  const castleArchList: PropItem[] = [];
  const stoneWallList: PropItem[] = [];
  const standingStoneList: PropItem[] = [];
  const highlandCottageList: PropItem[] = [];
  const stoneCairnList: PropItem[] = [];
  const hayBaleList: PropItem[] = [];
  const rallySignList: PropItem[] = [];
  const stoneBridgeList: PropItem[] = [];
  const shippingContainerList: PropItem[] = [];
  const driftPylonList: PropItem[] = [];
  const jumpRampList: PropItem[] = [];

  const grid = new Map<string, PropItem[]>();

  for (const prop of levelData.props) {
    const [x, originalY, z] = prop.position;
    const distToRoad = getMinDistToTrackSpline(x, z);

    // 1. Large buildings (cottages, cabins, keeps) need absolute clearance
    if (
      prop.type === 'cabin' ||
      prop.type === 'highland_cottage' ||
      prop.type === 'castle_keep'
    ) {
      if (distToRoad < 26.0) continue;
    }
    // 2. Structural walls, towers, arches, stone walls, fences, standing stones
    else if (
      prop.type === 'castle_tower' ||
      prop.type === 'castle_wall' ||
      prop.type === 'castle_arch' ||
      prop.type === 'stone_wall' ||
      prop.type === 'standing_stone' ||
      prop.type === 'fence'
    ) {
      if (distToRoad < 18.0) continue;
    }
    // 3. Shipping containers (buffer 5.0m from center spline)
    else if (prop.type === 'shipping_container') {
      if (distToRoad < 5.0) continue;
    }
    // 4. Trees, boulders, cairns (exempting clipping drift pylons, signs, gates, hay bales, jump ramps)
    else if (
      prop.type !== 'castle_gate' &&
      prop.type !== 'rally_sign' &&
      prop.type !== 'hay_bale' &&
      prop.type !== 'drift_pylon' &&
      prop.type !== 'jump_ramp'
    ) {
      if (distToRoad < 12.0) continue;
    }

    // Performance Optimization (Mobile/Low GPU memory & tiler relief):
    // Skip distant wild trees and rocks beyond the horizon fog boundary (leaves all structural props intact)
    const isVegetationOrWildRock =
      prop.type.startsWith('tree') ||
      prop.type === 'rock' ||
      prop.type === 'rock_sandstone';
    if (
      isVegetationOrWildRock &&
      options?.maxVegetationDistance &&
      distToRoad > options.maxVegetationDistance
    ) {
      continue;
    }

    const terrainY = getInterpolatedHeight(x, z, heights, rows, cols, mapWidth, mapDepth);
    if (terrainY < -6.0) continue;

    let finalY = terrainY;

    if (prop.type === 'cabin' || prop.type === 'highland_cottage') {
      const cornerOffsets = [
        [-3.0, -4.0],
        [3.0, -4.0],
        [-3.0, 4.0],
        [3.0, 4.0],
        [0, 0],
      ];
      let minGroundY = Infinity;
      for (const [ox, oz] of cornerOffsets) {
        const gy = getInterpolatedHeight(x + ox, z + oz, heights, rows, cols, mapWidth, mapDepth);
        if (gy < minGroundY) minGroundY = gy;
      }
      finalY = originalY !== 0 ? originalY : minGroundY;
    } else if (prop.type === 'castle_keep') {
      const offsets = [
        [-6.5, -6.5],
        [6.5, -6.5],
        [-6.5, 6.5],
        [6.5, 6.5],
        [0, 0],
      ];
      let minGroundY = Infinity;
      for (const [ox, oz] of offsets) {
        const gy = getInterpolatedHeight(x + ox, z + oz, heights, rows, cols, mapWidth, mapDepth);
        if (gy < minGroundY) minGroundY = gy;
      }
      finalY = originalY !== 0 ? originalY : minGroundY;
    } else if (prop.type === 'castle_tower') {
      const offsets = [
        [-2.5, -2.5],
        [2.5, -2.5],
        [-2.5, 2.5],
        [2.5, 2.5],
        [0, 0],
      ];
      let minGroundY = Infinity;
      for (const [ox, oz] of offsets) {
        const gy = getInterpolatedHeight(x + ox, z + oz, heights, rows, cols, mapWidth, mapDepth);
        if (gy < minGroundY) minGroundY = gy;
      }
      finalY = originalY !== 0 ? originalY : minGroundY;
    } else if (prop.type === 'castle_wall') {
      const leftY = getInterpolatedHeight(x - 3.5, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 3.5, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.min(leftY, rightY);
    } else if (prop.type === 'castle_gate') {
      const leftY = getInterpolatedHeight(x - 3.6, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 3.6, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.min(leftY, rightY);
    } else if (prop.type === 'castle_arch') {
      const leftY = getInterpolatedHeight(x - 2.6, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 2.6, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.min(leftY, rightY);
    } else if (prop.type === 'stone_wall') {
      const leftY = getInterpolatedHeight(x - 2.8, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 2.8, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.min(leftY, rightY);
    } else if (prop.type === 'stone_bridge') {
      const leftY = getInterpolatedHeight(x - 3.0, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 3.0, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.max(leftY, rightY);
    } else if (prop.type === 'standing_stone' || prop.type === 'stone_cairn') {
      finalY = (originalY !== 0 ? originalY : terrainY) - 0.3;
    } else if (prop.type === 'hay_bale') {
      finalY = (originalY !== 0 ? originalY : terrainY);
    } else if (prop.type === 'rally_sign') {
      finalY = (originalY !== 0 ? originalY : terrainY) - 0.1;
    } else if (prop.type === 'fence') {
      const leftY = getInterpolatedHeight(x - 1.6, z, heights, rows, cols, mapWidth, mapDepth);
      const rightY = getInterpolatedHeight(x + 1.6, z, heights, rows, cols, mapWidth, mapDepth);
      finalY = originalY !== 0 ? originalY : Math.min(leftY, rightY);
    } else {
      const isAnyTree = prop.type.startsWith('tree');
      const yOffset = isAnyTree ? -0.25 : -0.2;
      finalY = (originalY !== 0 ? originalY : terrainY) + yOffset;
    }

    _scratchDummy.position.set(x, finalY, z);
    _scratchDummy.rotation.set(prop.rotation[0], prop.rotation[1], prop.rotation[2]);
    _scratchDummy.scale.set(prop.scale[0], prop.scale[1], prop.scale[2]);
    _scratchDummy.updateMatrix();

    const item: PropItem = {
      id: prop.id,
      type: prop.type,
      position: [x, finalY, z],
      rotation: prop.rotation,
      scale: prop.scale,
      matrix: _scratchDummy.matrix.clone(),
    };

    if (prop.type === 'tree_birch') {
      birches.push(item);
    } else if (prop.type === 'tree_desert') {
      deserts.push(item);
    } else if (prop.type === 'rock_sandstone') {
      sandstones.push(item);
    } else if (prop.type === 'rock') {
      graniteRocks.push(item);
    } else if (prop.type === 'cabin') {
      cabinList.push(item);
    } else if (prop.type === 'fence') {
      fenceList.push(item);
    } else if (prop.type === 'castle_tower') {
      castleTowerList.push(item);
    } else if (prop.type === 'castle_wall') {
      castleWallList.push(item);
    } else if (prop.type === 'castle_gate') {
      castleGateList.push(item);
    } else if (prop.type === 'castle_keep') {
      castleKeepList.push(item);
    } else if (prop.type === 'castle_arch') {
      castleArchList.push(item);
    } else if (prop.type === 'stone_wall') {
      stoneWallList.push(item);
    } else if (prop.type === 'standing_stone') {
      standingStoneList.push(item);
    } else if (prop.type === 'highland_cottage') {
      highlandCottageList.push(item);
    } else if (prop.type === 'stone_cairn') {
      stoneCairnList.push(item);
    } else if (prop.type === 'hay_bale') {
      hayBaleList.push(item);
    } else if (prop.type === 'rally_sign') {
      rallySignList.push(item);
    } else if (prop.type === 'stone_bridge') {
      stoneBridgeList.push(item);
    } else if (prop.type === 'shipping_container') {
      shippingContainerList.push(item);
    } else if (prop.type === 'drift_pylon') {
      driftPylonList.push(item);
    } else if (prop.type === 'jump_ramp') {
      jumpRampList.push(item);
    } else {
      pines.push(item);
    }

    // Add to spatial grid cell
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const key = getCellKey(cx, cz);
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(item);
  }

  return {
    pineTrees: pines,
    birchTrees: birches,
    desertTrees: deserts,
    rocks: graniteRocks,
    sandstoneRocks: sandstones,
    cabins: cabinList,
    fences: fenceList,
    castleTowers: castleTowerList,
    castleWalls: castleWallList,
    castleGates: castleGateList,
    castleKeeps: castleKeepList,
    castleArches: castleArchList,
    stoneWalls: stoneWallList,
    standingStones: standingStoneList,
    highlandCottages: highlandCottageList,
    stoneCairns: stoneCairnList,
    hayBales: hayBaleList,
    rallySigns: rallySignList,
    stoneBridges: stoneBridgeList,
    shippingContainers: shippingContainerList,
    driftPylons: driftPylonList,
    jumpRamps: jumpRampList,
    spatialGrid: grid,
  };
}

/**
 * Custom hook that parses, snaps to terrain height, calculates transform matrices,
 * and categorizes all level props into distinct typed buckets along with spatial grid cells.
 */
export function usePropsData(): CategorizedProps {
  const { heightmapData, levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const isMobile = isMobileDevice();

  const maxVegetationDistance = useMemo(() => {
    if (isMobile) {
      if (graphicsQuality === 'low') return 130;
      if (graphicsQuality === 'medium') return 180;
      if (graphicsQuality === 'high') return 230;
      return 260; // Very High on mobile: maintains rich foliage perimeter while eliminating distant out-of-bounds tiler bloat
    }
    if (graphicsQuality === 'low') return 350;
    return Infinity; // Full unconstrained distance on desktop medium, high, and very_high
  }, [isMobile, graphicsQuality]);

  return useMemo(
    () => categorizeProps(heightmapData, levelData, { maxVegetationDistance }),
    [heightmapData, levelData, maxVegetationDistance],
  );
}
