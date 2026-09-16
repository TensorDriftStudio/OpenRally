import { Vector3, CatmullRomCurve3 } from 'three';
import type { LevelData, PropData } from '@/types/level';

export const LEVEL1_TRACK_POINTS = [
  { x: 0, z: 0 },         // CP 0: Start / Finish Gantry
  { x: 130, z: -70 },     // CP 1: Fast Straight Exit
  { x: 260, z: -150 },    // CP 2: Right 4 over Crest
  { x: 380, z: -210 },    // CP 3: Sweeping High-Speed Right
  { x: 440, z: -90 },     // CP 4: Sharp Left 2 into Coastal Ridge
  { x: 350, z: 20 },      // CP 5: Forest Tunnel Entry
  { x: 430, z: 120 },     // CP 6: Sharp Right 3 Flick
  { x: 340, z: 230 },     // CP 7: Technical Hairpin Right
  { x: 200, z: 320 },     // CP 8: Fast Downhill Straight
  { x: 70, z: 380 },      // CP 9: Left 3 into Southern Basin
  { x: -70, z: 420 },     // CP 10: S-Bend Left
  { x: -180, z: 360 },    // CP 11: S-Bend Right onto Fast Section
  { x: -280, z: 270 },    // CP 12: Sharp Left 2 Chicane
  { x: -370, z: 150 },    // CP 13: Ridge Climb Switchback
  { x: -440, z: 10 },     // CP 14: Cliffside Hairpin Left
  { x: -380, z: -120 },   // CP 15: High-Speed Forest Descent
  { x: -280, z: -210 },   // CP 16: Right 3 over Crest
  { x: -350, z: -300 },   // CP 17: Sudden Left 2 Flick
  { x: -240, z: -370 },   // CP 18: Hairpin Right around Boulders
  { x: -110, z: -300 },   // CP 19: Long Forest Full Throttle Straight
  { x: -160, z: -160 },   // CP 20: Left 3 Chicane
  { x: -70, z: -35 },     // CP 21: Final S-Bend Approach
];

/**
 * Procedurally generates props for Level 1 (Island / Finland Forest Stage).
 * Creates a vast, continuous Scandinavian boreal pine forest covering all
 * rolling hills, ridges, and valleys, with natural clearance along the driving line.
 */
export function generateLevel1Props(_mapWidth: number, _mapDepth: number): PropData[] {
  const props: PropData[] = [];
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let propId = 0;

  // Build CatmullRom track curve to sample road segments
  const trackCurve = new CatmullRomCurve3(
    LEVEL1_TRACK_POINTS.map((p) => new Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5,
  );

  const numSamples = 600;
  const samplePoints: Vector3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    samplePoints.push(trackCurve.getPointAt(i / numSamples));
  }

  // Fast minimum distance to track segments
  const getMinDistToTrack = (px: number, pz: number): number => {
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

  // Dense boreal Scandinavian forest matrix covering all hills, ridges, and valleys
  const islandRadius = 550;
  const gridStep = 13.0; // Dense 13m grid with organic jitter
  const halfExtent = 560;

  for (let gx = -halfExtent; gx <= halfExtent; gx += gridStep) {
    for (let gz = -halfExtent; gz <= halfExtent; gz += gridStep) {
      const distFromCenter = Math.hypot(gx, gz);
      if (distFromCenter > islandRadius) continue; // Out in the ocean

      // Organic position jitter
      const seed = (gx * 374761393 + gz * 668265263) ^ 0x5bf03635;
      const jx = (random(seed) - 0.5) * (gridStep * 0.85);
      const jz = (random(seed + 1) - 0.5) * (gridStep * 0.85);
      const x = gx + jx;
      const z = gz + jz;

      // Keep start gantry and spawn grid clear
      if (Math.hypot(x, z) < 42) continue;

      // Keep cabin clearings free of dense trees
      if (Math.hypot(x - 70, z - (-175)) < 26) continue;
      if (Math.hypot(x - (-80), z - 485) < 26) continue;

      // Check distance to road
      const distToTrack = getMinDistToTrack(x, z);
      if (distToTrack < 19.0) continue; // Keep driving lane & shoulders 100% clear

      // Natural forest density modulation (organic groves and clearings)
      const groveNoise = Math.sin(x * 0.015) * Math.cos(z * 0.015);
      const treeProb = distToTrack < 35 ? 0.96 : (groveNoise > -0.6 ? 0.88 : 0.40);
      if (random(seed + 2) > treeProb) continue;

      const propRoll = random(seed + 3);
      let propType: 'tree_pine' | 'tree_birch' | 'rock' = 'tree_pine';
      let scaleBase = 1.0;
      let heightScale = 1.0;

      if (propRoll < 0.80) {
        // Nordic Conifers & Pines (Dominant majestic forest)
        propType = 'tree_pine';
        scaleBase = 1.6 + random(seed + 4) * 3.2; // 1.6m to 4.8m
        heightScale = scaleBase * (1.15 + random(seed + 6) * 0.4);
      } else if (propRoll < 0.92) {
        // European Hardwood & Broadleaf Trees
        propType = 'tree_birch';
        scaleBase = 1.8 + random(seed + 4) * 2.0; // 1.8m to 3.8m
        heightScale = scaleBase * (1.0 + random(seed + 6) * 0.25);
      } else {
        // Granite & Glacial Boulders
        propType = 'rock';
        scaleBase = 0.9 + random(seed + 4) * 1.8;
        heightScale = scaleBase * 0.85;
      }

      const yRot = random(seed + 5) * Math.PI * 2;

      props.push({
        id: `isl_prop_${propId++}`,
        type: propType,
        position: [x, 0, z],
        rotation: [0, yRot, 0],
        scale: [scaleBase, heightScale, scaleBase],
      });
    }
  }

  // ─── Scenic Rustic Countryside Cabins (Deep in Forest Clearings) ───
  // Cabin 1: Start Valley Mountain Chalet (55m north of straight in open meadow)
  props.push({
    id: `cabin_start_valley`,
    type: 'cabin',
    position: [70, 0, -175],
    rotation: [0, -0.3, 0],
    scale: [1.3, 1.3, 1.3],
  });

  // Cabin 2: Southern Basin Farmstead (50m off the southern S-bend)
  props.push({
    id: `cabin_southern_farm`,
    type: 'cabin',
    position: [-80, 0, 485],
    rotation: [0, 3.1, 0],
    scale: [1.3, 1.3, 1.3],
  });

  // ─── Scenic Village Wooden Fences ──────────────────────────────────
  // Fence Run 1: Start Valley Cabin Meadow Boundary
  const fenceRun1 = [
    { x: 55, z: -152, rotY: -0.1 },
    { x: 62, z: -153, rotY: -0.1 },
    { x: 69, z: -154, rotY: -0.1 },
    { x: 76, z: -155, rotY: -0.1 },
    { x: 83, z: -156, rotY: -0.1 },
  ];
  fenceRun1.forEach((f, idx) => {
    props.push({
      id: `fence_run1_${idx}`,
      type: 'fence',
      position: [f.x, 0, f.z],
      rotation: [0, f.rotY, 0],
      scale: [1.0, 1.0, 1.0],
    });
  });

  // Fence Run 2: Southern Farmstead Meadow Boundary
  const fenceRun2 = [
    { x: -95, z: 462, rotY: -0.15 },
    { x: -88, z: 463, rotY: -0.15 },
    { x: -81, z: 464, rotY: -0.15 },
    { x: -74, z: 465, rotY: -0.15 },
    { x: -67, z: 466, rotY: -0.15 },
  ];
  fenceRun2.forEach((f, idx) => {
    props.push({
      id: `fence_run2_${idx}`,
      type: 'fence',
      position: [f.x, 0, f.z],
      rotation: [0, f.rotY, 0],
      scale: [1.0, 1.0, 1.0],
    });
  });

  return props;
}

export const LEVEL1_DATA: LevelData = {
  id: 'level1',
  name: 'Island Circuit',
  terrainBase: {
    width: 2000,
    depth: 2000,
    subdivisions: 384,
    amplitude: 15,
    frequency: 0.002,
    octaves: 3,
    lacunarity: 2.0,
    persistence: 0.35,
    seed: 42,
  },
  track: {
    width: 11.0,
    falloff: 10.0,
    targetHeight: 0,
    roadGrading: 0.85,
    points: LEVEL1_TRACK_POINTS,
  },
  heightModifiers: [
    {
      x: 0,
      z: 0,
      radius: 80,
      absoluteHeight: 8.0,
      shape: 'sphere', // Level spawn & start straight foundation
    },
    {
      x: 550,
      z: -450,
      radius: 380,
      heightDelta: 75,
      shape: 'smooth', // Grand North-East Mountain Peak
    },
    {
      x: 50,
      z: -550,
      radius: 320,
      heightDelta: 60,
      shape: 'smooth', // Northern Mountain Ridge
    },
    {
      x: 500,
      z: 380,
      radius: 340,
      heightDelta: 55,
      shape: 'smooth', // South-East Coastal Horn
    },
    {
      x: -480,
      z: 480,
      radius: 360,
      heightDelta: 70,
      shape: 'smooth', // South-West Mountain Massif
    },
    {
      x: -520,
      z: -380,
      radius: 340,
      heightDelta: 50,
      shape: 'smooth', // North-West Coastal Cliffs
    },
  ],
  props: generateLevel1Props(2000, 2000),
};
