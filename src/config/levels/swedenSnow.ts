import { Vector3, CatmullRomCurve3 } from 'three';
import type { LevelData, PropData } from '@/types/level';

/**
 * Rally Sweden Winter Circuit Track Points.
 * Authentic high-speed Scandinavian snow circuit with flowing snowbanks,
 * crest jumps (Colin's Crest), Swedish cottage villages, and frozen lake sections.
 */
const LEVEL3_TRACK_POINTS = [
  { x: 0, z: 0 },         // CP 0: Start / Finish Gantry (Snow Valley)
  { x: 130, z: -50 },     // CP 1: Snow Forest Entry Straight
  { x: 260, z: -110 },    // CP 2: Sweeping Right 4 over Snow Crest
  { x: 380, z: -180 },    // CP 3: High-Speed Ridge Jump (Colin's Crest)
  { x: 460, z: -80 },     // CP 4: Sharp Left 2 into Pine Canyon
  { x: 390, z: 40 },      // CP 5: Forest Tunnel Descent
  { x: 440, z: 160 },     // CP 6: Fast Right 3 Flick between Snowbanks
  { x: 360, z: 270 },     // CP 7: Swedish Village Entry Hairpin Right
  { x: 220, z: 350 },     // CP 8: Village Straight past Red Cottages
  { x: 90, z: 410 },      // CP 9: Left 3 into Frozen Lake Shoreline
  { x: -50, z: 450 },     // CP 10: High-Speed Frozen Lake Crossing
  { x: -190, z: 390 },    // CP 11: Lake Exit S-Bend Right
  { x: -300, z: 290 },    // CP 12: Technical Chicane around Boulders
  { x: -390, z: 170 },    // CP 13: Uphill Snow Ridge Switchback
  { x: -460, z: 20 },     // CP 14: Mountain Hairpin Left over Crest
  { x: -400, z: -110 },   // CP 15: Fast Downhill Forest Sweep
  { x: -310, z: -210 },   // CP 16: Right 3 over Snow Ridge
  { x: -370, z: -310 },   // CP 17: Sudden Left 2 Flick between Pines
  { x: -260, z: -390 },   // CP 18: Hairpin Right around Frozen Glade
  { x: -120, z: -320 },   // CP 19: Long Winter Forest Full Throttle
  { x: -170, z: -170 },   // CP 20: Left 3 Chicane
  { x: -70, z: -40 },     // CP 21: Final S-Bend to Start/Finish Gantry
];

/**
 * Procedurally generates props for Level 3 (Sweden Snow Rally).
 * Places dense snow-covered boreal pine forests, authentic Swedish red cottages (Falu Rödfärg),
 * rustic fences along corners, and frosty granite boulders.
 */
function generateSwedenProps(_mapWidth: number, _mapDepth: number): PropData[] {
  const props: PropData[] = [];
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let propId = 0;

  // Build CatmullRom track curve to sample road segments
  const trackCurve = new CatmullRomCurve3(
    LEVEL3_TRACK_POINTS.map((p) => new Vector3(p.x, 0, p.z)),
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

  // 1. Traditional Swedish Village Hamlets (Falu red cottages, rustic split fences, surrounding pine trees)
  const villageHamlets = [
    { x: 270, z: 310, rotY: 0.35, scale: 1.05 },
    { x: 290, z: 380, rotY: -0.4, scale: 0.95 },
    { x: 170, z: 430, rotY: 0.8, scale: 1.0 },
    { x: -360, z: -210, rotY: -0.6, scale: 1.0 },
    { x: -405, z: -285, rotY: 0.25, scale: 0.9 },
    { x: 410, z: -20, rotY: -0.9, scale: 1.05 },
  ];

  for (let i = 0; i < villageHamlets.length; i++) {
    const v = villageHamlets[i];
    if (getMinDistToTrack(v.x, v.z) < 32.5) continue;

    props.push({
      id: `sweden_cabin_${propId++}`,
      type: 'cabin',
      position: [v.x, 0, v.z],
      rotation: [0, v.rotY, 0],
      scale: [v.scale, v.scale, v.scale],
    });

    // Add wooden split-rail fences around cottage yards
    const fenceOffsets = [
      { ox: 5.5, oz: 4.5, rot: v.rotY + 0.1 },
      { ox: -5.5, oz: 4.5, rot: v.rotY - 0.1 },
      { ox: 0, oz: 7.5, rot: v.rotY + Math.PI * 0.5 },
    ];
    for (const fo of fenceOffsets) {
      const fx = v.x + fo.ox;
      const fz = v.z + fo.oz;
      if (getMinDistToTrack(fx, fz) >= 27.5) {
        props.push({
          id: `sweden_fence_${propId++}`,
          type: 'fence',
          position: [fx, 0, fz],
          rotation: [0, fo.rot, 0],
          scale: [1.0, 1.0, 1.0],
        });
      }
    }
  }

  // 2. Trackside Fences & Boulders along dangerous snowbank curves
  const fenceWaypoints = [
    { u: 0.30, offset: 27.5, side: 1 },
    { u: 0.32, offset: 27.5, side: 1 },
    { u: 0.34, offset: 27.5, side: 1 },
    { u: 0.65, offset: 27.5, side: -1 },
    { u: 0.67, offset: 27.5, side: -1 },
    { u: 0.69, offset: 27.5, side: -1 },
    { u: 0.82, offset: 27.5, side: 1 },
    { u: 0.84, offset: 27.5, side: 1 },
  ];

  for (const fw of fenceWaypoints) {
    const pt = trackCurve.getPointAt(fw.u);
    const tangent = trackCurve.getTangentAt(fw.u).normalize();
    const normalX = -tangent.z * fw.side;
    const normalZ = tangent.x * fw.side;
    const angle = Math.atan2(tangent.x, tangent.z);
    const fx = pt.x + normalX * fw.offset;
    const fz = pt.z + normalZ * fw.offset;

    if (getMinDistToTrack(fx, fz) >= 25.0) {
      props.push({
        id: `sweden_trackside_fence_${propId++}`,
        type: 'fence',
        position: [fx, 0, fz],
        rotation: [0, angle, 0],
        scale: [1.0, 1.0, 1.0],
      });
    }
  }

  // 3. Dense Scandinavian Boreal Pine Forest & Granite Boulders
  const gridStep = 13.5;
  const halfExtent = 600;

  for (let gx = -halfExtent; gx <= halfExtent; gx += gridStep) {
    for (let gz = -halfExtent; gz <= halfExtent; gz += gridStep) {
      const distFromCenter = Math.hypot(gx, gz);
      if (distFromCenter > 590) continue;

      // Jitter
      const seed = (gx * 452930477 + gz * 824633729) ^ 0x6acb3512;
      const jx = (random(seed) - 0.5) * (gridStep * 0.85);
      const jz = (random(seed + 1) - 0.5) * (gridStep * 0.85);
      const x = gx + jx;
      const z = gz + jz;

      // Keep Start Grid clear
      if (Math.hypot(x, z) < 45) continue;

      // Keep track corridor clear
      const distToTrack = getMinDistToTrack(x, z);
      if (distToTrack < 25.5) continue;

      // Check distance to Swedish cabins
      let nearCabin = false;
      for (const v of villageHamlets) {
        if (Math.hypot(x - v.x, z - v.z) < 16) {
          nearCabin = true;
          break;
        }
      }
      if (nearCabin) continue;

      const roll = random(seed + 2);
      const yRot = random(seed + 3) * Math.PI * 2;
      const scaleBase = 1.35 + random(seed + 4) * 1.5;

      if (roll < 0.82) {
        // Snow-covered Scandinavian Pine
        props.push({
          id: `sweden_pine_${propId++}`,
          type: 'tree_pine',
          position: [x, 0, z],
          rotation: [0, yRot, 0],
          scale: [scaleBase, scaleBase * (0.95 + random(seed + 5) * 0.25), scaleBase],
        });
      } else if (roll < 0.94) {
        // Frosty Granite Boulder
        const rockScale = 0.8 + random(seed + 4) * 1.6;
        props.push({
          id: `sweden_rock_${propId++}`,
          type: 'rock',
          position: [x, 0, z],
          rotation: [0, yRot, 0],
          scale: [rockScale, rockScale * 0.8, rockScale],
        });
      } else {
        // Occasional Winter Birch
        props.push({
          id: `sweden_birch_${propId++}`,
          type: 'tree_birch',
          position: [x, 0, z],
          rotation: [0, yRot, 0],
          scale: [scaleBase * 0.85, scaleBase * 0.9, scaleBase * 0.85],
        });
      }
    }
  }

  return props;
}

export const LEVEL3_SWEDEN_DATA: LevelData = {
  id: 'sweden_snow',
  name: 'Sweden Snow Rally',
  terrainBase: {
    width: 2000,
    depth: 2000,
    subdivisions: 384,
    amplitude: 17,
    frequency: 0.0022,
    octaves: 3,
    lacunarity: 2.1,
    persistence: 0.35,
    seed: 73921,
  },
  track: {
    width: 12.5,
    falloff: 11.5,
    targetHeight: 0,
    roadGrading: 0.85,
    points: LEVEL3_TRACK_POINTS,
  },
  heightModifiers: [
    {
      x: 0,
      z: 0,
      radius: 85,
      absoluteHeight: 8.0,
      shape: 'sphere', // Level spawn & start straight foundation
    },
    {
      x: 380,
      z: -180,
      radius: 260,
      heightDelta: 45,
      shape: 'smooth', // Colin's Crest Winter Jump Ridge
    },
    {
      x: 520,
      z: 320,
      radius: 380,
      heightDelta: 65,
      shape: 'smooth', // Eastern Scandinavian Mountain Ridge
    },
    {
      x: -100,
      z: 420,
      radius: 280,
      heightDelta: -12,
      shape: 'smooth', // Frozen Lake Shoreline Basin
    },
    {
      x: -450,
      z: 60,
      radius: 340,
      heightDelta: 55,
      shape: 'smooth', // Western Alpine Snow Peak
    },
    {
      x: -300,
      z: -380,
      radius: 360,
      heightDelta: 60,
      shape: 'smooth', // Northern Boreal Forest Ridge
    },
  ],
  props: generateSwedenProps(2000, 2000),
};
