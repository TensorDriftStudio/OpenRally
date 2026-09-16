import { Vector3, CatmullRomCurve3 } from 'three';
import type { LevelData, PropData } from '@/types/level';

const LEVEL2_TRACK_POINTS = [
  { x: 0, z: 0 },         // CP 0: Start / Finish Gantry
  { x: 140, z: 50 },      // CP 1: Canyon Entry Straight
  { x: 270, z: 110 },     // CP 2: Sweeping Right 4 over Dune
  { x: 390, z: 190 },     // CP 3: Sharp Left 2 into Rock Gorge
  { x: 470, z: 320 },     // CP 4: High-Speed Plateau Run
  { x: 370, z: 430 },     // CP 5: Hairpin Right around Mesa
  { x: 220, z: 470 },     // CP 6: Steep Gorge Descent
  { x: 50, z: 410 },      // CP 7: 90° Left into Dry Riverbed
  { x: -70, z: 450 },     // CP 8: Right 3 Flick
  { x: -210, z: 390 },    // CP 9: Sand Wash Chicane
  { x: -330, z: 270 },    // CP 10: Technical Hairpin Left
  { x: -420, z: 120 },    // CP 11: Western Canyon Ridge Climb
  { x: -470, z: -50 },    // CP 12: Fast Ridge Crest Straight
  { x: -370, z: -170 },   // CP 13: 90° Right Flick
  { x: -440, z: -290 },   // CP 14: Sand Dune Hairpin Left
  { x: -310, z: -400 },   // CP 15: High-Speed Dunes Descent
  { x: -150, z: -350 },   // CP 16: Sharp Right 3 Chicane
  { x: -210, z: -210 },   // CP 17: S-Bend around Rock Pillars
  { x: -120, z: -110 },   // CP 18: Fast Canyon Straight
  { x: -60, z: -30 },     // CP 19: Final S-Bend to Start Line
];

function generateDesertProps(mapWidth: number, mapDepth: number): PropData[] {
  const props: PropData[] = [];
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let propId = 0;

  // 1. Canyon Rock Formations & Markers along track
  const trackCurve = new CatmullRomCurve3(
    LEVEL2_TRACK_POINTS.map((p) => new Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5,
  );

  const numSamples = 600;
  const samplePoints: Vector3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    samplePoints.push(trackCurve.getPointAt(i / numSamples));
  }

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

  const numTrackSamples = 120;
  for (let i = 0; i < numTrackSamples; i++) {
    const u = i / numTrackSamples;
    const pt = trackCurve.getPointAt(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    
    const normalX = -tangent.z;
    const normalZ = tangent.x;

    if (Math.hypot(pt.x, pt.z) < 45) continue;

    const sideOffsets = [26.0, 40.0];
    for (const offset of sideOffsets) {
      // Left side canyon feature
      const leftRoll = random(propId * 5);
      const isLeftTree = leftRoll < 0.35;
      const leftDist = offset + (random(propId * 5 + 1) - 0.5) * 4.0;
      const leftScale = isLeftTree ? 1.4 + random(propId * 5 + 2) * 2.0 : 1.2 + random(propId * 5 + 2) * 2.8;
      
      const pxL = pt.x + normalX * leftDist + tangent.x * (random(propId * 5 + 3) - 0.5) * 4.0;
      const pzL = pt.z + normalZ * leftDist + tangent.z * (random(propId * 5 + 3) - 0.5) * 4.0;

      if (getMinDistToTrack(pxL, pzL) >= 25.5) {
        props.push({
          id: `desert_corridor_L_${propId++}`,
          type: isLeftTree ? 'tree_desert' : (leftRoll < 0.85 ? 'rock_sandstone' : 'rock'),
          position: [pxL, 0, pzL],
          rotation: [0, random(propId * 5 + 4) * Math.PI * 2, 0],
          scale: [leftScale, isLeftTree ? leftScale * 1.1 : leftScale * 0.9, leftScale],
        });
      }

      // Right side canyon feature
      const rightRoll = random(propId * 5);
      const isRightTree = rightRoll < 0.35;
      const rightDist = offset + (random(propId * 5 + 1) - 0.5) * 4.0;
      const rightScale = isRightTree ? 1.4 + random(propId * 5 + 2) * 2.0 : 1.2 + random(propId * 5 + 2) * 2.8;

      const pxR = pt.x - normalX * rightDist + tangent.x * (random(propId * 5 + 3) - 0.5) * 4.0;
      const pzR = pt.z - normalZ * rightDist + tangent.z * (random(propId * 5 + 3) - 0.5) * 4.0;

      if (getMinDistToTrack(pxR, pzR) >= 25.5) {
        props.push({
          id: `desert_corridor_R_${propId++}`,
          type: isRightTree ? 'tree_desert' : (rightRoll < 0.85 ? 'rock_sandstone' : 'rock'),
          position: [pxR, 0, pzR],
          rotation: [0, random(propId * 5 + 4) * Math.PI * 2, 0],
          scale: [rightScale, isRightTree ? rightScale * 1.1 : rightScale * 0.9, rightScale],
        });
      }
    }
  }

  // 2. Wide Desert Basin Boulders & Desert Trees
  const NUM_BG_PROPS = 1000;
  for (let i = 0; i < NUM_BG_PROPS; i++) {
    const bgRoll = random(propId * 5);
    const isTree = bgRoll < 0.30;
    const x = (random(propId * 5 + 1) - 0.5) * mapWidth * 0.75;
    const z = (random(propId * 5 + 2) - 0.5) * mapDepth * 0.75;

    if (Math.hypot(x, z) < 45) continue;
    if (getMinDistToTrack(x, z) < 25.5) continue;

    const yRot = random(propId * 5 + 3) * Math.PI * 2;
    const scaleBase = isTree ? 1.4 + random(propId * 5 + 4) * 2.0 : 1.0 + random(propId * 5 + 4) * 3.2;

    props.push({
      id: `desert_bg_${propId++}`,
      type: isTree ? 'tree_desert' : (bgRoll < 0.85 ? 'rock_sandstone' : 'rock'),
      position: [x, 0, z],
      rotation: [0, yRot, 0],
      scale: [scaleBase, isTree ? scaleBase * 1.1 : scaleBase * 0.9, scaleBase],
    });
  }

  return props;
}

export const LEVEL2_DESERT_DATA: LevelData = {
  id: 'desert_canyon',
  name: 'Desert Canyon',
  terrainBase: {
    width: 2000,
    depth: 2000,
    subdivisions: 384,
    amplitude: 16,
    frequency: 0.002,
    octaves: 3,
    lacunarity: 2.1,
    persistence: 0.35,
    seed: 98765,
  },
  track: {
    width: 12.0,
    falloff: 12.0,
    targetHeight: 0,
    roadGrading: 0.85,
    points: LEVEL2_TRACK_POINTS,
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
      shape: 'smooth', // Grand North-East Canyon Mesa
    },
    {
      x: -520,
      z: -480,
      radius: 400,
      heightDelta: 80,
      shape: 'smooth', // Great North-West Mesa Massif
    },
    {
      x: 520,
      z: 500,
      radius: 360,
      heightDelta: 65,
      shape: 'smooth', // South-East Red Rock Ridge
    },
    {
      x: -500,
      z: 480,
      radius: 380,
      heightDelta: 70,
      shape: 'smooth', // South-West High Dunes
    },
    {
      x: -560,
      z: 50,
      radius: 320,
      heightDelta: 55,
      shape: 'smooth', // Western Canyon Buttress
    },
  ],
  props: generateDesertProps(2000, 2000),
};
