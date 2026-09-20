import {
  BufferGeometry,
  BufferAttribute,
  BoxGeometry,
  CylinderGeometry,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// 6. CASTLE, FORTRESS, STONE WALL & BRIDGE GEOMETRIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a monumental medieval round castle keep / ruined bastion tower.
 * Features deep subterranean foundation (from Y = -3.5m to guarantee zero floating on any slope),
 * thick defensive stone cylinder (Y = -3.5m to 8.5m), crumbling battlements / crenellations (Y = 8.5m to 10.2m),
 * arrow loops, and weathered stone corbels.
 */
export function createCastleTowerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main tower cylinder (radius 3.2m, height 12.0m from Y = -3.5m to +8.5m)
  const tower = new CylinderGeometry(3.1, 3.4, 12.0, 16, 6);
  tower.translate(0, 2.5, 0);
  const tUvs = tower.attributes.uv;
  for (let i = 0; i < tUvs.count; i++) {
    tUvs.setXY(i, tUvs.getX(i) * 3.5, tUvs.getY(i) * 3.5);
  }
  parts.push(tower);

  // Upper projecting parapet corbel ring
  const corbelRing = new CylinderGeometry(3.45, 3.1, 0.6, 16, 1);
  corbelRing.translate(0, 8.4, 0);
  parts.push(corbelRing);

  // Parapet floor deck
  const deck = new CylinderGeometry(3.3, 3.3, 0.3, 16, 1);
  deck.translate(0, 8.7, 0);
  parts.push(deck);

  // Battlement merlons (crenellations) around the rim, with one side broken/ruined
  const numMerlons = 8;
  for (let i = 0; i < numMerlons; i++) {
    // Leave 2 merlons missing on the ruined side
    if (i === 4 || i === 5) continue;
    const angle = (i / numMerlons) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const merlon = new BoxGeometry(1.2, 1.2, 0.5);
    merlon.rotateY(-angle);
    merlon.translate(c * 3.15, 9.4, s * 3.15);
    parts.push(merlon);
  }

  // Ruined fallen debris / stone pile at the base on one side
  const debris1 = new BoxGeometry(1.6, 0.9, 1.4);
  debris1.rotateY(0.4);
  debris1.translate(2.4, 0.45, 2.1);
  parts.push(debris1);

  const debris2 = new BoxGeometry(1.2, 0.7, 1.1);
  debris2.rotateY(-0.6);
  debris2.translate(2.8, 0.35, 1.1);
  parts.push(debris2);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a weathered medieval fortress curtain wall segment.
 * Extends from Y = -3.5m deep foundation to Y = +5.2m walkway with battlements,
 * structural buttresses, and crenellated stone parapet.
 */
export function createCastleWallGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main thick curtain wall (Length 8.0m, Height 8.5m from Y = -3.5m to +5.0m, Width 1.6m)
  const wall = new BoxGeometry(8.0, 8.5, 1.6);
  wall.translate(0, 0.75, 0);
  const wUvs = wall.attributes.uv;
  for (let i = 0; i < wUvs.count; i++) {
    wUvs.setXY(i, wUvs.getX(i) * 3.0, wUvs.getY(i) * 2.5);
  }
  parts.push(wall);

  // Walkway parapet merlons on outer edge (Z = +0.65m)
  for (let x = -3.2; x <= 3.2; x += 1.8) {
    const merlon = new BoxGeometry(1.1, 1.0, 0.35);
    merlon.translate(x, 5.5, 0.65);
    parts.push(merlon);
  }

  // Supporting stone wall buttresses on exterior face
  const buttressL = new BoxGeometry(0.8, 6.0, 0.7);
  buttressL.translate(-2.5, 0.5, 1.0);
  parts.push(buttressL);

  const buttressR = new BoxGeometry(0.8, 6.0, 0.7);
  buttressR.translate(2.5, 0.5, 1.0);
  parts.push(buttressR);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a monumental Gothic castle gatehouse / barbican archway.
 * Features two flanking round watchtowers and a grand stone arch spanning 5.4m,
 * allowing vehicles to pass underneath into the castle courtyard.
 */
export function createCastleGateGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Left flanking gate tower (from Y = -3.5m to +8.5m, radius 1.7m)
  const towerL = new CylinderGeometry(1.6, 1.8, 12.0, 12, 4);
  towerL.translate(-3.6, 2.5, 0);
  parts.push(towerL);

  // Right flanking gate tower
  const towerR = new CylinderGeometry(1.6, 1.8, 12.0, 12, 4);
  towerR.translate(3.6, 2.5, 0);
  parts.push(towerR);

  // Tower battlements (left & right)
  const capL = new CylinderGeometry(1.85, 1.6, 0.4, 12, 1);
  capL.translate(-3.6, 8.4, 0);
  parts.push(capL);

  const capR = new CylinderGeometry(1.85, 1.6, 0.4, 12, 1);
  capR.translate(3.6, 8.4, 0);
  parts.push(capR);

  for (let a = 0; a < 4; a++) {
    const angle = (a / 4) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    const mL = new BoxGeometry(0.7, 0.8, 0.35);
    mL.rotateY(-angle);
    mL.translate(-3.6 + c * 1.6, 9.0, s * 1.6);
    parts.push(mL);

    const mR = new BoxGeometry(0.7, 0.8, 0.35);
    mR.rotateY(-angle);
    mR.translate(3.6 + c * 1.6, 9.0, s * 1.6);
    parts.push(mR);
  }

  // Stone archway span header connecting the towers above the road (Y = 4.0m to 6.8m)
  const archHeader = new BoxGeometry(4.4, 2.8, 1.8);
  archHeader.translate(0, 5.4, 0);
  parts.push(archHeader);

  // Top parapet above arch
  for (let x = -1.4; x <= 1.4; x += 1.4) {
    const merlon = new BoxGeometry(0.9, 0.8, 0.35);
    merlon.translate(x, 7.2, 0.75);
    parts.push(merlon);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a traditional British / Scottish dry-stone dyke wall segment.
 * Deep subterranean foundation (Y = -2.0m) with rough fieldstone profile.
 */
export function createStoneWallGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main stone wall body (Length 6.2m, Height 3.2m from Y = -2.0m to +1.2m, Thickness 0.55m)
  const wall = new BoxGeometry(6.2, 3.2, 0.55);
  wall.translate(0, -0.4, 0);
  const uvs = wall.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setXY(i, uvs.getX(i) * 2.5, uvs.getY(i) * 1.5);
  }
  parts.push(wall);

  // Rounded top stone coping
  const coping = new BoxGeometry(6.3, 0.22, 0.65);
  coping.translate(0, 1.25, 0);
  parts.push(coping);

  // Vertical stone pier posts on ends
  const postL = new BoxGeometry(0.7, 3.5, 0.7);
  postL.translate(-3.0, -0.3, 0);
  parts.push(postL);

  const postR = new BoxGeometry(0.7, 3.5, 0.7);
  postR.translate(3.0, -0.3, 0);
  parts.push(postR);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a monumental 4-story rectangular medieval donjon keep / castle citadel.
 * Features 4 corner defensive turrets, crenellated roof battlements, arched windows,
 * and deep subterranean foundation anchoring.
 */
export function createCastleKeepGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main square keep block (Width 14m, Depth 14m, Height 18m from Y = -3.5m to +14.5m)
  const mainKeep = new BoxGeometry(14.0, 18.0, 14.0);
  mainKeep.translate(0, 5.5, 0);
  const kUvs = mainKeep.attributes.uv;
  for (let i = 0; i < kUvs.count; i++) {
    kUvs.setXY(i, kUvs.getX(i) * 3.5, kUvs.getY(i) * 3.5);
  }
  parts.push(mainKeep);

  // 4 Corner round bastion turrets (extending up to Y = +17.2m)
  const turretOffsets = [
    [-6.8, -6.8],
    [6.8, -6.8],
    [-6.8, 6.8],
    [6.8, 6.8],
  ];

  for (const [tx, tz] of turretOffsets) {
    const turret = new CylinderGeometry(2.1, 2.3, 21.0, 12, 4);
    turret.translate(tx, 7.0, tz);
    const tUvs = turret.attributes.uv;
    for (let i = 0; i < tUvs.count; i++) {
      tUvs.setXY(i, tUvs.getX(i) * 2.5, tUvs.getY(i) * 3.5);
    }
    parts.push(turret);

    // Turret crenellations
    const tCap = new CylinderGeometry(2.35, 2.1, 0.4, 12, 1);
    tCap.translate(tx, 17.2, tz);
    parts.push(tCap);

    for (let a = 0; a < 4; a++) {
      const angle = (a / 4) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);

      const merlon = new BoxGeometry(0.85, 0.9, 0.4);
      merlon.rotateY(-angle);
      merlon.translate(tx + c * 2.1, 17.8, tz + s * 2.1);
      parts.push(merlon);
    }
  }

  // Parapet roof merlons along all 4 main walls
  for (let x = -5.0; x <= 5.0; x += 2.5) {
    const mNorth = new BoxGeometry(1.4, 1.2, 0.5);
    mNorth.translate(x, 15.1, 6.8);
    parts.push(mNorth);

    const mSouth = new BoxGeometry(1.4, 1.2, 0.5);
    mSouth.translate(x, 15.1, -6.8);
    parts.push(mSouth);

    const mWest = new BoxGeometry(0.5, 1.2, 1.4);
    mWest.translate(-6.8, 15.1, x);
    parts.push(mWest);

    const mEast = new BoxGeometry(0.5, 1.2, 1.4);
    mEast.translate(6.8, 15.1, x);
    parts.push(mEast);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a ruined Gothic stone pointed archway and arcade partition.
 */
export function createCastleArchGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Left column pillar
  const pillarL = new CylinderGeometry(0.5, 0.6, 6.5, 8, 2);
  pillarL.translate(-2.6, 0.75, 0);
  parts.push(pillarL);

  // Right column pillar
  const pillarR = new CylinderGeometry(0.5, 0.6, 6.5, 8, 2);
  pillarR.translate(2.6, 0.75, 0);
  parts.push(pillarR);

  // Arch span header
  const archTop = new BoxGeometry(6.2, 1.2, 0.9);
  archTop.translate(0, 4.2, 0);
  const aUvs = archTop.attributes.uv;
  for (let i = 0; i < aUvs.count; i++) {
    aUvs.setXY(i, aUvs.getX(i) * 2.0, aUvs.getY(i) * 1.0);
  }
  parts.push(archTop);

  // Weathered broken crest stones
  const crest1 = new BoxGeometry(1.2, 0.8, 0.7);
  crest1.translate(-1.0, 5.0, 0);
  parts.push(crest1);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates an ancient arched stone packhorse bridge with double parapets.
 */
export function createStoneBridgeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const deck = new BoxGeometry(6.8, 1.4, 12.0);
  deck.translate(0, 0.5, 0);
  const uvs = deck.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setXY(i, uvs.getX(i) * 2.0, uvs.getY(i) * 3.0);
  }
  parts.push(deck);

  const parapetL = new BoxGeometry(0.55, 1.1, 12.2);
  parapetL.translate(-3.1, 1.7, 0);
  parts.push(parapetL);

  const parapetR = new BoxGeometry(0.55, 1.1, 12.2);
  parapetR.translate(3.1, 1.7, 0);
  parts.push(parapetR);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Helper to assign UV rectangle coordinates to a BoxGeometry face (4 vertices).
 */
function setBoxFaceUV(
  uvAttr: BufferAttribute,
  faceIndex: number,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
): void {
  const base = faceIndex * 4;
  uvAttr.setXY(base + 0, uMin, vMax);
  uvAttr.setXY(base + 1, uMax, vMax);
  uvAttr.setXY(base + 2, uMin, vMin);
  uvAttr.setXY(base + 3, uMax, vMin);
}

/**
 * Creates an industrial ISO shipping freight container with corrugated panels and corner castings.
 * Features realistic UV unwrapping matching the multi-livery texture atlas:
 * - Long sides (+X and -X) -> Top half (corrugated metal, stencil logo, hazard stripes)
 * - Front cargo doors (+Z) -> Bottom-left quadrant (double doors, locking bars, ISO data plate)
 * - Rear end wall (-Z) -> Bottom-center panel (corrugated paneling, structural welds)
 * - Welded roof (+Y) -> Bottom-right quadrant (horizontal corrugated panels, rust streaks)
 * - Structural corner posts & castings -> Dark oxidized structural frame steel
 */
export function createShippingContainerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main container body (Width: 2.44m, Height: 3.0m, Length: 6.0m, deep anchor down to -0.4m)
  const body = new BoxGeometry(2.44, 3.0, 6.0);
  body.translate(0, 1.1, 0);
  const bodyUV = body.attributes.uv as BufferAttribute;

  // BoxGeometry face order:
  // Face 0: +X side (Right long wall)
  setBoxFaceUV(bodyUV, 0, 0.0, 1.0, 0.5, 1.0);
  // Face 1: -X side (Left long wall)
  setBoxFaceUV(bodyUV, 1, 0.0, 1.0, 0.5, 1.0);
  // Face 2: +Y roof (Top horizontal corrugated roof)
  setBoxFaceUV(bodyUV, 2, 0.57, 1.0, 0.0, 0.5);
  // Face 3: -Y underside (Ground anchor / hidden base)
  setBoxFaceUV(bodyUV, 3, 0.44, 0.46, 0.0, 0.05);
  // Face 4: +Z front (Cargo double doors with locking bars and ISO rating plate)
  setBoxFaceUV(bodyUV, 4, 0.0, 0.43, 0.0, 0.5);
  // Face 5: -Z rear (Corrugated rear wall)
  setBoxFaceUV(bodyUV, 5, 0.43, 0.57, 0.0, 0.5);

  bodyUV.needsUpdate = true;
  parts.push(body);

  // Corner structural posts (Dark oxidized structural steel)
  const postCorners = [
    [-1.15, -2.9],
    [1.15, -2.9],
    [-1.15, 2.9],
    [1.15, 2.9],
  ];
  for (const [px, pz] of postCorners) {
    const post = new BoxGeometry(0.18, 3.05, 0.18);
    post.translate(px, 1.1, pz);
    const postUV = post.attributes.uv as BufferAttribute;
    for (let i = 0; i < postUV.count; i++) {
      postUV.setXY(i, 0.435, 0.05);
    }
    parts.push(post);

    // Top corner castings
    const castingTop = new BoxGeometry(0.24, 0.22, 0.24);
    castingTop.translate(px, 2.65, pz);
    const castingUV = castingTop.attributes.uv as BufferAttribute;
    for (let i = 0; i < castingUV.count; i++) {
      castingUV.setXY(i, 0.435, 0.05);
    }
    parts.push(castingTop);
  }

  // End door lock rods and horizontal stiffeners
  const rodL = new CylinderGeometry(0.03, 0.03, 2.5, 8);
  rodL.translate(-0.35, 1.3, 3.02);
  const rodLUV = rodL.attributes.uv as BufferAttribute;
  for (let i = 0; i < rodLUV.count; i++) {
    rodLUV.setXY(i, 0.435, 0.05);
  }
  parts.push(rodL);

  const rodR = new CylinderGeometry(0.03, 0.03, 2.5, 8);
  rodR.translate(0.35, 1.3, 3.02);
  const rodRUV = rodR.attributes.uv as BufferAttribute;
  for (let i = 0; i < rodRUV.count; i++) {
    rodRUV.setXY(i, 0.435, 0.05);
  }
  parts.push(rodR);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a high-visibility industrial Gymkhana drift pylon / bollard with reflective stripe bands.
 */
export function createDriftPylonGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Heavy rubber weighted baseplate
  const base = new BoxGeometry(1.0, 0.15, 1.0);
  base.translate(0, 0.075, 0);
  parts.push(base);

  // Deep anchor post
  const anchor = new CylinderGeometry(0.3, 0.3, 0.8, 12);
  anchor.translate(0, -0.4, 0);
  parts.push(anchor);

  // Conical main barrel (Radius 0.32m top, 0.44m bottom, Height 1.4m)
  const cone = new CylinderGeometry(0.32, 0.44, 1.4, 16, 1);
  cone.translate(0, 0.77, 0);
  parts.push(cone);

  // Upper high-visibility reflective stripe collar
  const stripe = new CylinderGeometry(0.35, 0.38, 0.32, 16, 1);
  stripe.translate(0, 0.95, 0);
  parts.push(stripe);

  // Lower reflective collar
  const stripeLow = new CylinderGeometry(0.39, 0.42, 0.28, 16, 1);
  stripeLow.translate(0, 0.52, 0);
  parts.push(stripeLow);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a competition-spec Gymkhana jump ramp.
 * Features an inclined steel traction plate deck (5.5m wide, 8.0m run length, 1.85m peak launch lip),
 * sunken ground transition skirt to prevent vehicle snagging, heavy steel side truss rails,
 * vertical structural support pillars, and rear cross-braced panel.
 */
export function createJumpRampGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const width = 5.5;
  const runLength = 8.0;
  const entryY = -0.15;
  const peakY = 1.85;
  const heightDiff = peakY - entryY; // 2.0m
  const slopeLength = Math.sqrt(runLength * runLength + heightDiff * heightDiff); // ~8.246m
  const theta = Math.atan2(heightDiff, runLength); // ~0.24498 rad (~14.04 deg)
  const centerY = (entryY + peakY) / 2; // 0.85m

  // 1. Main traction deck (BoxGeometry with custom UVs on top face)
  const deck = new BoxGeometry(width, 0.16, slopeLength);
  const deckUvs = deck.attributes.uv;
  const deckPositions = deck.attributes.position;
  for (let i = 0; i < deckPositions.count; i++) {
    const y = deckPositions.getY(i);
    if (y > 0.05) {
      const x = deckPositions.getX(i);
      const z = deckPositions.getZ(i);
      const u = (x + width / 2) / width;
      const v = (z + slopeLength / 2) / slopeLength;
      deckUvs.setXY(i, u, v);
    }
  }
  deck.rotateX(-theta);
  deck.translate(0, centerY, 0);
  parts.push(deck);

  // 2. Heavy steel side runner rails
  const railL = new BoxGeometry(0.22, 0.38, slopeLength);
  railL.rotateX(-theta);
  railL.translate(-width / 2, centerY + 0.1, 0);
  parts.push(railL);

  const railR = new BoxGeometry(0.22, 0.38, slopeLength);
  railR.rotateX(-theta);
  railR.translate(width / 2, centerY + 0.1, 0);
  parts.push(railR);

  // 3. Rear upright support columns (under the peak lip)
  const colBL = new BoxGeometry(0.26, peakY + 0.4, 0.26);
  colBL.translate(-width / 2 + 0.1, (peakY - 0.4) / 2, runLength / 2 - 0.15);
  parts.push(colBL);

  const colBR = new BoxGeometry(0.26, peakY + 0.4, 0.26);
  colBR.translate(width / 2 - 0.1, (peakY - 0.4) / 2, runLength / 2 - 0.15);
  parts.push(colBR);

  const colBM = new BoxGeometry(0.26, peakY + 0.4, 0.26);
  colBM.translate(0, (peakY - 0.4) / 2, runLength / 2 - 0.15);
  parts.push(colBM);

  // 4. Mid-span upright support columns
  const midHeight = centerY;
  const colML = new BoxGeometry(0.22, midHeight + 0.4, 0.22);
  colML.translate(-width / 2 + 0.1, (midHeight - 0.4) / 2, 0);
  parts.push(colML);

  const colMR = new BoxGeometry(0.22, midHeight + 0.4, 0.22);
  colMR.translate(width / 2 - 0.1, (midHeight - 0.4) / 2, 0);
  parts.push(colMR);

  // 5. Rear safety backboard at Z = +3.93m
  const backWall = new BoxGeometry(width - 0.1, peakY + 0.3, 0.14);
  backWall.translate(0, (peakY - 0.3) / 2, runLength / 2 - 0.07);
  parts.push(backWall);

  // 6. Subterranean foundation anchor skirting
  const skirtL = new BoxGeometry(0.18, 0.5, runLength);
  skirtL.translate(-width / 2, -0.2, 0);
  parts.push(skirtL);

  const skirtR = new BoxGeometry(0.18, 0.5, runLength);
  skirtR.translate(width / 2, -0.2, 0);
  parts.push(skirtR);

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}


