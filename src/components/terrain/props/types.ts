import { Sphere, Vector3, type Matrix4 } from 'three';
import type { PropType } from '@/types/level';

/**
 * Computes a genuine bounding sphere encompassing all placed instances for a prop group.
 */
export function computeInstanceBoundingSphere(items: PropItem[], geometryRadius = 5): Sphere {
  const sphere = new Sphere();
  if (!items || items.length === 0) {
    sphere.radius = -1;
    return sphere;
  }
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const pos = new Vector3();
  for (let i = 0; i < items.length; i++) {
    pos.setFromMatrixPosition(items[i].matrix);
    min.min(pos);
    max.max(pos);
  }
  sphere.center.addVectors(min, max).multiplyScalar(0.5);
  let maxDistSq = 0;
  for (let i = 0; i < items.length; i++) {
    pos.setFromMatrixPosition(items[i].matrix);
    const dSq = pos.distanceToSquared(sphere.center);
    if (dSq > maxDistSq) maxDistSq = dSq;
  }
  sphere.radius = Math.sqrt(maxDistSq) + geometryRadius;
  return sphere;
}

export interface SpatialQuadrant {
  items: PropItem[];
  boundingSphere: Sphere;
}

/**
 * Partitions an array of prop items into 4 spatial quadrants (NW, NE, SW, SE)
 * with individual tight bounding spheres for Three.js view frustum culling.
 */
export function partitionIntoQuadrants(items: PropItem[], geometryRadius = 8): SpatialQuadrant[] {
  const q0: PropItem[] = [];
  const q1: PropItem[] = [];
  const q2: PropItem[] = [];
  const q3: PropItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = item.position[0];
    const z = item.position[2];
    if (x < 0) {
      if (z < 0) q0.push(item);
      else q2.push(item);
    } else {
      if (z < 0) q1.push(item);
      else q3.push(item);
    }
  }

  return [
    { items: q0, boundingSphere: computeInstanceBoundingSphere(q0, geometryRadius) },
    { items: q1, boundingSphere: computeInstanceBoundingSphere(q1, geometryRadius) },
    { items: q2, boundingSphere: computeInstanceBoundingSphere(q2, geometryRadius) },
    { items: q3, boundingSphere: computeInstanceBoundingSphere(q3, geometryRadius) },
  ];
}

export interface PropItem {
  id: string;
  type: PropType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  matrix: Matrix4;
}

export interface CategorizedProps {
  pineTrees: PropItem[];
  birchTrees: PropItem[];
  desertTrees: PropItem[];
  rocks: PropItem[];
  sandstoneRocks: PropItem[];
  cabins: PropItem[];
  fences: PropItem[];
  castleTowers: PropItem[];
  castleWalls: PropItem[];
  castleGates: PropItem[];
  castleKeeps: PropItem[];
  castleArches: PropItem[];
  stoneWalls: PropItem[];
  standingStones: PropItem[];
  highlandCottages: PropItem[];
  stoneCairns: PropItem[];
  hayBales: PropItem[];
  rallySigns: PropItem[];
  stoneBridges: PropItem[];
  shippingContainers: PropItem[];
  driftPylons: PropItem[];
  jumpRamps: PropItem[];
  spatialGrid: Map<string, PropItem[]>;
}

export interface ProximityCollidersProps {
  spatialGrid: Map<string, PropItem[]>;
  initialTrees: PropItem[];
  initialRocks: PropItem[];
  initialCabins: PropItem[];
  initialFences: PropItem[];
  initialCastleTowers: PropItem[];
  initialCastleWalls: PropItem[];
  initialCastleGates: PropItem[];
  initialCastleKeeps: PropItem[];
  initialCastleArches: PropItem[];
  initialStoneWalls: PropItem[];
  initialStandingStones: PropItem[];
  initialHighlandCottages: PropItem[];
  initialStoneCairns: PropItem[];
  initialHayBales: PropItem[];
  initialRallySigns: PropItem[];
  initialStoneBridges: PropItem[];
  initialShippingContainers: PropItem[];
  initialDriftPylons: PropItem[];
  initialJumpRamps: PropItem[];
}
