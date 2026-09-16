import { Vector3, CatmullRomCurve3 } from 'three';
import type { LevelData, PropData, PropType } from '@/types/level';

/**
 * Highland Castle Rally Track Points (Great Britain Stage).
 * Authentic British / Scottish highlands circuit with medieval castle ruins,
 * narrow country lane stone walls, steep hairpin switchbacks, loch shoreline vistas,
 * and high moorland crests.
 */
const LEVEL4_TRACK_POINTS = [
  { x: 0, z: 0 },          // CP 0: Start / Finish Gantry (Moorland Valley)
  { x: 45, z: 20 },        // CP 1: Valley S-Bend Entry
  { x: 95, z: 55 },        // CP 2: Fast Right 3 past Dry-Stone Dyke
  { x: 145, z: 75 },       // CP 3: Sweeping Left 3
  { x: 195, z: 120 },      // CP 4: Technical Right 2 Chicane
  { x: 175, z: 175 },      // CP 5: Hairpin 1 Left between Stone Walls
  { x: 130, z: 220 },      // CP 6: Narrow Lane over Stone Culvert
  { x: 155, z: 280 },      // CP 7: Sharp Right 2 uphill
  { x: 215, z: 320 },      // CP 8: Fast S-Bend climbing Highland Crags
  { x: 275, z: 360 },      // CP 9: Hairpin 1 Right (Switchback 1)
  { x: 340, z: 390 },      // CP 10: Ascending Ridge Traverse
  { x: 375, z: 445 },      // CP 11: Hairpin 1 Left (Switchback 2)
  { x: 330, z: 495 },      // CP 12: Narrow Stone Wall Corridor
  { x: 365, z: 555 },      // CP 13: Castle Crag Ramp Approach
  { x: 440, z: 595 },      // CP 14: North Ramp Approach (Overlooking Castle)
  { x: 515, z: 615 },      // CP 15: Castle Plateau Sweeper Right
  { x: 565, z: 665 },      // CP 16: Outer Bailey Ridge Curve
  { x: 535, z: 725 },      // CP 17: Tight Hairpin Left around Fortress Ridge
  { x: 465, z: 740 },      // CP 18: South Castle Crest Chicane
  { x: 405, z: 695 },      // CP 19: Fortress Overlook Descent
  { x: 355, z: 650 },      // CP 20: Steep Crag Descent Hairpin 1 Right
  { x: 310, z: 615 },      // CP 21: Ridge Edge Switchback
  { x: 260, z: 580 },      // CP 22: Fast Left 3 past Granite Boulders
  { x: 215, z: 625 },      // CP 23: Hairpin Left into Birch Woods
  { x: 170, z: 660 },      // CP 24: Technical Downhill S-Bend
  { x: 120, z: 620 },      // CP 25: Fast Right 3 to Loch Shore
  { x: 90, z: 545 },       // CP 26: Shoreline Sweeper Left
  { x: 65, z: 470 },       // CP 27: Lakeside Hairpin Right
  { x: 35, z: 405 },       // CP 28: Fast Crest Jump along Loch Edge
  { x: -15, z: 365 },      // CP 29: Sharp Left 2 past Ancient Cairn
  { x: -75, z: 395 },      // CP 30: Ascending Moorland Switchback
  { x: -135, z: 440 },     // CP 31: Hairpin Right over Heather Crest
  { x: -195, z: 475 },     // CP 32: High Moorland Ridge Traverse
  { x: -255, z: 460 },     // CP 33: Technical Chicane between Stone Walls
  { x: -305, z: 405 },     // CP 34: Blind Crest Left 3
  { x: -340, z: 335 },     // CP 35: Hairpin 1 Right (West Peak Switchback)
  { x: -315, z: 265 },     // CP 36: Fast Descent through Gorse
  { x: -355, z: 200 },     // CP 37: Hairpin 1 Left
  { x: -415, z: 155 },     // CP 38: Technical Moorland S-Bend
  { x: -460, z: 95 },      // CP 39: Fast Right 3
  { x: -475, z: 25 },      // CP 40: Blind Crest Jump over Hillock
  { x: -445, z: -45 },     // CP 41: Hairpin Left descending to Valley
  { x: -390, z: -105 },    // CP 42: Narrow Stone Dyke Lane
  { x: -325, z: -150 },    // CP 43: Sweeping Right 3 through Scots Pines
  { x: -255, z: -165 },    // CP 44: Fast Left 3
  { x: -185, z: -135 },    // CP 45: Valley Entry S-Chicane
  { x: -125, z: -85 },     // CP 46: Hairpin Right approaching Finish
  { x: -65, z: -35 },      // CP 47: Final Straight Alignment to Gantry
];

/**
 * Procedurally generates props for Level 4 (Highland Castle Rally).
 * Places the grand Medieval Castle Ruins complex on the hill (towers, curtain walls, keep, arches),
 * ancient Celtic standing stone megalith circle, Scottish highland croft cottages,
 * mountain stone cairns with Celtic crosses, dry-stone walls along field pastures,
 * and dense Scottish Scots pine and silver birch woodlands.
 */
function generateBritainProps(_mapWidth: number, _mapDepth: number): PropData[] {
  const props: PropData[] = [];
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let propId = 0;

  // Build CatmullRom track curve to sample road segments
  const trackCurve = new CatmullRomCurve3(
    LEVEL4_TRACK_POINTS.map((p) => new Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5,
  );

  const numSamples = 1200;
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

  // Helper to safely add roadside decorative prop
  const addPropIfClear = (prop: Omit<PropData, 'id'>, minClearance = 8.5) => {
    const dist = getMinDistToTrack(prop.position[0], prop.position[2]);
    if (dist >= minClearance) {
      props.push({
        id: `prop_britain_${propId++}`,
        ...prop,
      });
      return true;
    }
    return false;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. THE FULL-FLEDGED MEDIEVAL CASTLE CITADEL (Elevated Hilltop Crag)
  // Situated on the high crag plateau at (x: 480, z: 670), overlooking the track
  // with strict clearance (> 14m) so the road remains 100% unobstructed.
  // ─────────────────────────────────────────────────────────────────────────────

  // A. Grand Central Citadel Donjon Keep
  addPropIfClear(
    {
      type: 'castle_keep',
      position: [480, 0, 670],
      rotation: [0, 0.4, 0],
      scale: [1.2, 1.3, 1.2],
    },
    15.0,
  );

  // B. Fortress Bastion Towers (Circling the inner hilltop ridge)
  const castleTowers = [
    { x: 450, z: 640, rotY: 0.3, scaleY: 1.3 },
    { x: 505, z: 645, rotY: 0.9, scaleY: 1.4 },
    { x: 520, z: 690, rotY: 1.6, scaleY: 1.3 },
    { x: 490, z: 705, rotY: 2.3, scaleY: 1.4 },
    { x: 445, z: 690, rotY: -2.2, scaleY: 1.3 },
    { x: 430, z: 660, rotY: -1.0, scaleY: 1.2 },
    // Cliffside lookout towers
    { x: 575, z: 640, rotY: 0.8, scaleY: 1.5 },
    { x: 585, z: 695, rotY: 1.9, scaleY: 1.5 },
  ];

  for (const t of castleTowers) {
    addPropIfClear(
      {
        type: 'castle_tower',
        position: [t.x, 0, t.z],
        rotation: [0, t.rotY, 0],
        scale: [1.0, t.scaleY, 1.0],
      },
      14.0,
    );
  }

  // C. Fortress Curtain Walls (Connecting the hilltop bastion towers)
  const castleWalls = [
    { x: 478, z: 642, rotY: 0.1 },
    { x: 512, z: 668, rotY: 1.25 },
    { x: 505, z: 698, rotY: 2.0 },
    { x: 468, z: 698, rotY: 3.14 },
    { x: 438, z: 675, rotY: -1.8 },
    { x: 440, z: 650, rotY: -0.7 },
    { x: 580, z: 668, rotY: 1.57 },
  ];

  for (const w of castleWalls) {
    addPropIfClear(
      {
        type: 'castle_wall',
        position: [w.x, 0, w.z],
        rotation: [0, w.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      13.0,
    );
  }

  // D. Ruined Gothic Arches & Courtyard Arcades
  const castleArches = [
    { x: 465, z: 660, rotY: 0.6 },
    { x: 495, z: 660, rotY: 0.1 },
    { x: 495, z: 680, rotY: 1.57 },
    { x: 465, z: 680, rotY: 2.2 },
  ];

  for (const a of castleArches) {
    addPropIfClear(
      {
        type: 'castle_arch',
        position: [a.x, 0, a.z],
        rotation: [0, a.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      14.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ANCIENT CELTIC STANDING STONE CIRCLE (Megalith Henge on Western Moor Ridge)
  // Dramatic Callanish-style stone circle on high elevation at (x: -330, z: 380).
  // ─────────────────────────────────────────────────────────────────────────────

  const hengeCenterX = -330;
  const hengeCenterZ = 380;
  const hengeRadius = 24.0;
  const numStandingStones = 12;

  // Central megalith
  addPropIfClear(
    {
      type: 'standing_stone',
      position: [hengeCenterX, 0, hengeCenterZ],
      rotation: [0, 0.25, 0],
      scale: [1.2, 1.35, 1.2],
    },
    16.0,
  );

  // Outer circle of standing megaliths
  for (let i = 0; i < numStandingStones; i++) {
    const angle = (i / numStandingStones) * Math.PI * 2;
    const sx = hengeCenterX + Math.cos(angle) * hengeRadius;
    const sz = hengeCenterZ + Math.sin(angle) * hengeRadius;
    const rotY = angle + Math.PI / 2;
    const sH = 0.9 + random(i * 13.7) * 0.35;

    addPropIfClear(
      {
        type: 'standing_stone',
        position: [sx, 0, sz],
        rotation: [0, rotY, 0],
        scale: [1.0, sH, 1.0],
      },
      14.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SCOTTISH HIGHLAND CROFT VILLAGES & COTTAGES
  // Traditional stone cottages with thatched roofs and stone chimneys in valleys.
  // ─────────────────────────────────────────────────────────────────────────────

  const cottageSettlements = [
    // 1. Glen Start Valley Village (meadows south/north of start gantry)
    { x: -50, z: 80, rotY: 0.5 },
    { x: -95, z: 110, rotY: -0.3 },
    { x: -130, z: 70, rotY: 1.2 },
    { x: -170, z: -20, rotY: 0.8 },
    { x: -100, z: -120, rotY: -0.6 },
    { x: 80, z: -70, rotY: 2.1 },

    // 2. Lochside Fishing Hamlet (along the loch shoreline far from CP 25 - 28)
    { x: 160, z: 520, rotY: 0.4 },
    { x: 185, z: 555, rotY: -0.8 },
    { x: 135, z: 430, rotY: 1.1 },
    { x: 170, z: 390, rotY: 1.7 },
    { x: 195, z: 460, rotY: -0.2 },

    // 3. Lower Glen Valley Crofts (outer valley pastures near CP 5 - 8)
    { x: 250, z: 180, rotY: 0.3 },
    { x: 270, z: 240, rotY: -0.7 },
    { x: 100, z: 170, rotY: 1.4 },
    { x: 80, z: 270, rotY: 0.8 },
    { x: 240, z: 280, rotY: -0.4 },

    // 4. Castle Foot Terrace Village (lower terraces below CP 12 & 21)
    { x: 230, z: 530, rotY: 0.6 },
    { x: 200, z: 560, rotY: -0.5 },
    { x: 380, z: 720, rotY: 1.3 },
    { x: 330, z: 710, rotY: -0.9 },
    { x: 230, z: 630, rotY: 0.2 },

    // 5. Western Moorland Crofting Farmsteads (moorland meadows away from CP 32 - 38)
    { x: -260, z: 350, rotY: 0.4 },
    { x: -300, z: 250, rotY: -0.8 },
    { x: -370, z: 290, rotY: 1.1 },
    { x: -420, z: 230, rotY: -0.3 },
    { x: -460, z: 160, rotY: 0.7 },
  ];

  for (const c of cottageSettlements) {
    addPropIfClear(
      {
        type: 'highland_cottage',
        position: [c.x, 0, c.z],
        rotation: [0, c.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      20.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MOUNTAIN PASS STONE CAIRNS & CELTIC CROSSES
  // Sacred stone mounds atop panoramic highland peaks and switchback crests.
  // ─────────────────────────────────────────────────────────────────────────────

  const stoneCairns = [
    { x: 590, z: 540, rotY: 0.4 },   // East Castle Peak
    { x: -35, z: 470, rotY: 1.1 },   // Loch Overlook Summit
    { x: -425, z: 380, rotY: 2.2 },  // West Ridge Summit
    { x: -385, z: -190, rotY: -0.5 },// South Moorland Hill
    { x: 235, z: 725, rotY: 0.9 },   // North Shore Bluff
    { x: -85, z: 65, rotY: 1.7 },    // Starting Valley Mound
  ];

  for (const cairn of stoneCairns) {
    addPropIfClear(
      {
        type: 'stone_cairn',
        position: [cairn.x, 0, cairn.z],
        rotation: [0, cairn.rotY, 0],
        scale: [1.1, 1.2, 1.1],
      },
      12.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. TRADITIONAL DRY-STONE DYKE WALLS (Field Boundaries & Pasture Enclosures)
  // Placed safely around village pastures and far from road checkpoints (> 12m).
  // ─────────────────────────────────────────────────────────────────────────────

  const fieldEnclosures = [
    // North Loch Hamlet Pastures (far back into hills)
    { x: 180, z: 490, rotY: 0.2 },
    { x: 186, z: 490, rotY: 0.2 },
    { x: 210, z: 520, rotY: 1.57 },
    { x: 210, z: 526, rotY: 1.57 },
    // South Valley Croft Pastures (deep in valley)
    { x: -210, z: -60, rotY: 0.4 },
    { x: -216, z: -60, rotY: 0.4 },
    { x: -250, z: -90, rotY: 1.57 },
    { x: -250, z: -96, rotY: 1.57 },
  ];

  for (const w of fieldEnclosures) {
    addPropIfClear(
      {
        type: 'stone_wall',
        position: [w.x, 0, w.z],
        rotation: [0, w.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      25.0,
    );
  }

  // Village Rustic Wooden Fences (around far croft paddocks)
  const villageFences = [
    { x: -140, z: 80, rotY: 0.5 },
    { x: -180, z: -30, rotY: -0.3 },
    { x: 190, z: 535, rotY: 0.4 },
    { x: 260, z: 195, rotY: 0.3 },
    { x: 395, z: 735, rotY: 0.6 },
    { x: -280, z: 360, rotY: 0.4 },
  ];

  for (const f of villageFences) {
    addPropIfClear(
      {
        type: 'fence',
        position: [f.x, 0, f.z],
        rotation: [0, f.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      25.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. RALLY HAY BALES (Apex Protectors & Farm Field Bales)
  // ─────────────────────────────────────────────────────────────────────────────

  const cornerApexHayBales = [
    // Technical hairpin apexes and runoff cushions
    { x: 184, z: 172, rotY: 0.4 },
    { x: 186, z: 175, rotY: 0.4 },
    { x: 144, z: 278, rotY: 1.2 },
    { x: 146, z: 281, rotY: 1.2 },
    { x: 284, z: 358, rotY: 0.8 },
    { x: 286, z: 361, rotY: 0.8 },
    { x: 384, z: 442, rotY: -0.5 },
    { x: 386, z: 445, rotY: -0.5 },
    { x: 574, z: 662, rotY: 1.6 },
    { x: 576, z: 665, rotY: 1.6 },
    { x: 544, z: 722, rotY: -0.9 },
    { x: 546, z: 725, rotY: -0.9 },
    { x: 344, z: 648, rotY: 0.3 },
    { x: 346, z: 651, rotY: 0.3 },
    { x: 204, z: 622, rotY: 1.1 },
    { x: 206, z: 625, rotY: 1.1 },
    { x: 56, z: 468, rotY: -0.7 },
    { x: 58, z: 471, rotY: -0.7 },
    { x: -144, z: 438, rotY: 0.6 },
    { x: -146, z: 441, rotY: 0.6 },
    { x: -348, z: 332, rotY: -1.2 },
    { x: -350, z: 335, rotY: -1.2 },
    { x: -364, z: 198, rotY: 0.5 },
    { x: -366, z: 201, rotY: 0.5 },
    { x: -454, z: -42, rotY: -0.4 },
    { x: -456, z: -45, rotY: -0.4 },
    { x: -134, z: -82, rotY: 1.4 },
    { x: -136, z: -85, rotY: 1.4 },
    // Farm paddock bales around villages
    { x: -65, z: 65, rotY: 0.2 },
    { x: -68, z: 68, rotY: 0.8 },
    { x: -70, z: 65, rotY: 1.5 },
    { x: 145, z: 525, rotY: 0.5 },
    { x: 148, z: 528, rotY: 1.1 },
    { x: 225, z: 215, rotY: -0.3 },
    { x: 228, z: 218, rotY: 0.7 },
    { x: 310, z: 550, rotY: 0.4 },
    { x: 313, z: 553, rotY: -0.8 },
    { x: -240, z: 420, rotY: 1.2 },
    { x: -243, z: 423, rotY: 0.3 },
    { x: -335, z: 305, rotY: -0.6 },
    { x: -338, z: 308, rotY: 0.9 },
  ];

  for (const hb of cornerApexHayBales) {
    addPropIfClear(
      {
        type: 'hay_bale',
        position: [hb.x, 0, hb.z],
        rotation: [0, hb.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      8.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. RALLY WARNING CHEVRON ARROW SIGNS
  // ─────────────────────────────────────────────────────────────────────────────

  const rallyChevronSigns = [
    { x: 180, z: 155, rotY: 0.3 },   // Turn 5 Left
    { x: 140, z: 260, rotY: 1.1 },   // Turn 7 Right
    { x: 260, z: 345, rotY: 0.7 },   // Turn 9 Right
    { x: 360, z: 430, rotY: -0.6 },  // Turn 11 Left
    { x: 550, z: 645, rotY: 1.4 },   // Turn 16 Right
    { x: 545, z: 705, rotY: -0.8 },  // Turn 17 Left
    { x: 365, z: 665, rotY: 0.4 },   // Turn 20 Right
    { x: 225, z: 605, rotY: 1.2 },   // Turn 23 Left
    { x: 75, z: 485, rotY: -0.7 },   // Turn 27 Right
    { x: -120, z: 425, rotY: 0.8 },  // Turn 31 Right
    { x: -325, z: 350, rotY: -1.1 }, // Turn 35 Right
    { x: -340, z: 215, rotY: 0.6 },  // Turn 37 Left
    { x: -435, z: -30, rotY: -0.5 }, // Turn 41 Left
    { x: -140, z: -98, rotY: 1.3 },  // Turn 46 Right
  ];

  for (const s of rallyChevronSigns) {
    addPropIfClear(
      {
        type: 'rally_sign',
        position: [s.x, 0, s.z],
        rotation: [0, s.rotY, 0],
        scale: [1.0, 1.0, 1.0],
      },
      8.0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. DENSE SCOTTISH HIGHLAND WOODLANDS & FOREST CLUSTERS (2,400+ Props)
  // ─────────────────────────────────────────────────────────────────────────────

  // Highland Lochs (Water basins far from track)
  const highlandLakes = [
    { x: -80, z: 660, radius: 110 }, // Loch Fyne (North-West Basin)
    { x: 380, z: -80, radius: 115 }, // Loch Awe (South-East Valley)
    { x: -560, z: 320, radius: 85 }, // Lochan West (Western Crags Tarn)
  ];

  // 16 Major Clustered Forest Stands (Scots Pines, Birches, Granite Boulder Scree)
  const forestStands = [
    { cx: -220, cz: 180, radius: 95, count: 140 },  // West Glen Forest
    { cx: 160, cz: 360, radius: 85, count: 120 },   // East Hillside Woods
    { cx: 310, cz: 210, radius: 90, count: 130 },   // South Ridge Forest
    { cx: -380, cz: -60, radius: 100, count: 150 }, // South-West Moor Forest
    { cx: -110, cz: 320, radius: 80, count: 110 },  // North-West Birch Copse
    { cx: 520, cz: 460, radius: 95, count: 140 },   // Castle Approach Woodlands
    { cx: 340, cz: 760, radius: 85, count: 120 },   // North Crag Pine Stand
    { cx: -160, cz: -210, radius: 90, count: 130 }, // South Valley Forest
    { cx: -340, cz: 460, radius: 95, count: 140 },  // West Summit Woods
    { cx: 30, cz: 660, radius: 80, count: 110 },    // Lakeside Birch Grove
    { cx: 240, cz: 500, radius: 75, count: 100 },   // Mid-Glen Pine Copse
    { cx: -420, cz: 280, radius: 90, count: 130 },  // High Moor Ridge Forest
    { cx: -70, cz: -140, radius: 80, count: 110 },  // Finish Straight Woods
    { cx: 410, cz: 330, radius: 85, count: 120 },   // East Valley Pine Wood
    { cx: -270, cz: -90, radius: 90, count: 130 },  // South-West Valley Wood
    { cx: 200, cz: 720, radius: 85, count: 120 },   // North Shore Pine Copse
  ];

  let forestSeed = 1042.8;
  for (const stand of forestStands) {
    for (let i = 0; i < stand.count; i++) {
      forestSeed += 7.391;
      const angle = random(forestSeed) * Math.PI * 2;
      const dist = Math.sqrt(random(forestSeed + 1)) * stand.radius;
      const px = stand.cx + Math.cos(angle) * dist;
      const pz = stand.cz + Math.sin(angle) * dist;

      if (getMinDistToTrack(px, pz) < 11.5) continue;

      const distToCastle = Math.sqrt((px - 480) ** 2 + (pz - 670) ** 2);
      if (distToCastle < 52) continue;

      const distToHenge = Math.sqrt((px - hengeCenterX) ** 2 + (pz - hengeCenterZ) ** 2);
      if (distToHenge < 30) continue;

      const isInLake = highlandLakes.some(
        (l) => Math.hypot(px - l.x, pz - l.z) < l.radius * 0.72,
      );
      if (isInLake) continue;

      const rType = random(forestSeed + 2);
      let type: PropType;
      let scale: [number, number, number];

      if (rType < 0.55) {
        // Scots Pine (Pinus sylvestris)
        type = 'tree_pine';
        const sz = 0.9 + random(forestSeed + 3) * 0.65;
        scale = [sz, sz * (0.95 + random(forestSeed + 4) * 0.35), sz];
      } else if (rType < 0.82) {
        // Silver Birch (Betula pendula)
        type = 'tree_birch';
        const sz = 0.85 + random(forestSeed + 3) * 0.5;
        scale = [sz, sz * (0.9 + random(forestSeed + 4) * 0.3), sz];
      } else {
        // Highland Granite Crag Boulders
        type = 'rock';
        const sz = 0.85 + random(forestSeed + 3) * 1.1;
        scale = [sz, sz * (0.75 + random(forestSeed + 4) * 0.4), sz];
      }

      const rotY = random(forestSeed + 5) * Math.PI * 2;

      props.push({
        id: `prop_highland_${propId++}`,
        type,
        position: [px, 0, pz],
        rotation: [0, rotY, 0],
        scale,
      });
    }
  }

  // Lakeside Shoreline Flora & Boulders around scenic lochs
  for (const lake of highlandLakes) {
    const lakePropsCount = 30;
    for (let i = 0; i < lakePropsCount; i++) {
      const s = i * 13.71 + lake.x * 2.3;
      const angle = random(s) * Math.PI * 2;
      const r = lake.radius * (0.78 + random(s + 1) * 0.28);
      const px = lake.x + Math.cos(angle) * r;
      const pz = lake.z + Math.sin(angle) * r;

      if (getMinDistToTrack(px, pz) < 11.5) continue;

      const isBirch = random(s + 2) > 0.4;
      const isRock = random(s + 3) > 0.65;
      const type: PropType = isRock ? 'rock' : isBirch ? 'tree_birch' : 'tree_pine';
      const sz = 0.85 + random(s + 4) * 0.5;

      props.push({
        id: `prop_lake_${propId++}`,
        type,
        position: [px, 0, pz],
        rotation: [0, random(s + 5) * Math.PI * 2, 0],
        scale: [sz, sz, sz],
      });
    }
  }

  // Roadside Tree Avenues & Shrub Rows along scenic straightaways
  const roadsideCanopies = 180;
  for (let i = 0; i < roadsideCanopies; i++) {
    const t = i / roadsideCanopies;
    const pt = trackCurve.getPointAt(t);
    const tangent = trackCurve.getTangentAt(t);
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();

    const side = i % 2 === 0 ? 1 : -1;
    const offset = 12.0 + random(i * 19.3) * 4.5;
    const px = pt.x + normal.x * side * offset;
    const pz = pt.z + normal.z * side * offset;

    if (getMinDistToTrack(px, pz) < 11.5) continue;

    const distToCastle = Math.sqrt((px - 480) ** 2 + (pz - 670) ** 2);
    if (distToCastle < 45) continue;

    const isBirch = random(i * 31.7) > 0.4;
    const type: PropType = isBirch ? 'tree_birch' : 'tree_pine';
    const sz = 0.85 + random(i * 47.1) * 0.4;

    props.push({
      id: `prop_roadside_${propId++}`,
      type,
      position: [px, 0, pz],
      rotation: [0, random(i * 13.9) * Math.PI * 2, 0],
      scale: [sz, sz, sz],
    });
  }

  // Wilderness Moorland & Mountain Rocks scattering
  const totalWilderness = 650;
  for (let i = 0; i < totalWilderness; i++) {
    const s1 = i * 23.3821 + 511.2;
    const s2 = i * 37.4123 + 912.7;
    const s3 = i * 51.1947 + 234.4;

    const rAngle = random(s1) * Math.PI * 2;
    const rDist = 60 + random(s2) * 1180;

    const px = Math.cos(rAngle) * rDist;
    const pz = Math.sin(rAngle) * rDist;

    if (getMinDistToTrack(px, pz) < 11.5) continue;

    const distToCastle = Math.sqrt((px - 480) ** 2 + (pz - 670) ** 2);
    if (distToCastle < 50) continue;

    const distToHenge = Math.sqrt((px - hengeCenterX) ** 2 + (pz - hengeCenterZ) ** 2);
    if (distToHenge < 30) continue;

    const isInLake = highlandLakes.some(
      (l) => Math.hypot(px - l.x, pz - l.z) < l.radius * 0.72,
    );
    if (isInLake) continue;

    const rType = random(s3);
    const type: PropType = rType < 0.4 ? 'tree_pine' : rType < 0.7 ? 'tree_birch' : 'rock';
    const sz = 0.8 + random(s1 + 1) * 0.6;

    props.push({
      id: `prop_wild_${propId++}`,
      type,
      position: [px, 0, pz],
      rotation: [0, random(s2 + 2) * Math.PI * 2, 0],
      scale: [sz, sz, sz],
    });
  }

  return props;
}

export const LEVEL4_BRITAIN_DATA: LevelData = {
  id: 'level4_britain',
  name: 'Highland Castle Rally',
  terrainBase: {
    width: 2600,
    depth: 2600,
    subdivisions: 512,
    amplitude: 17,
    frequency: 0.0016,
    octaves: 3,
    lacunarity: 2.1,
    persistence: 0.35,
    seed: 491823,
  },
  track: {
    points: LEVEL4_TRACK_POINTS,
    width: 5.5,
    falloff: 4.5,
    targetHeight: 0,
    roadGrading: 0.65,
  },
  props: generateBritainProps(2600, 2600),
  heightModifiers: [
    // Starting Moorland Glen (wide flat bowl around CP 0)
    {
      x: 0,
      z: 0,
      radius: 160,
      absoluteHeight: 8.5,
      shape: 'sphere',
    },
    // Monumental Castle Crag Hilltop (fortress overlook)
    {
      x: 480,
      z: 670,
      radius: 150,
      heightDelta: 32.0,
      shape: 'smooth',
    },
    // West Peak Mountain Ridge (Celtic Standing Stone Circle)
    {
      x: -330,
      z: 380,
      radius: 160,
      heightDelta: 26.0,
      shape: 'smooth',
    },
    // North High Pass Mountain Ridge
    {
      x: 220,
      z: 760,
      radius: 140,
      heightDelta: 20.0,
      shape: 'smooth',
    },
    // East Ascending Crags
    {
      x: 280,
      z: 380,
      radius: 130,
      heightDelta: 16.0,
      shape: 'smooth',
    },
    // ─── Scenic Highland Lochs (Safely distant from track) ───
    // Loch Fyne (North-West Mountain Basin)
    {
      x: -80,
      z: 660,
      radius: 110,
      absoluteHeight: -15.0,
      shape: 'smooth',
    },
    // Loch Awe (South-East Wilderness Basin)
    {
      x: 380,
      z: -80,
      radius: 115,
      absoluteHeight: -15.0,
      shape: 'smooth',
    },
    // Lochan West (Western High Tarn)
    {
      x: -560,
      z: 320,
      radius: 85,
      absoluteHeight: -14.0,
      shape: 'smooth',
    },
  ],
};
