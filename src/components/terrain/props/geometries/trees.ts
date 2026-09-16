import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Vector3,
  Quaternion,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PINE / EVERGREEN GEOMETRIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an organic conifer tree trunk geometry with a flared root base
 * extending from underground (Y = -0.7) to top apex (Y = 4.2).
 */
export function createTrunkGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(0.04, 0.40, 4.9, 12, 8);
  trunk.translate(0, 1.75, 0);

  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const flare = y < 0.2 ? Math.max(0, (0.2 - y) * 0.4) : 0;
    const wobble = Math.sin(y * 2.2 + (i % 4)) * 0.018;
    pos.setXYZ(i, x * (1 + flare) + wobble, y, z * (1 + flare) + wobble);
  }
  trunk.computeVertexNormals();

  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, uvs.getY(i) * 4.0);
  }

  return trunk;
}

/**
 * Creates a dense, organic evergreen pine canopy geometry with 11 overlapping tiers,
 * natural branch curve variations, inner needle fillers, and a tapered apex crown.
 */
export function createPineFoliageGeometry(): BufferGeometry {
  const branchGeometries: BufferGeometry[] = [];

  const tiers = [
    { y: 0.65, radius: 2.15, count: 8, angleDeg: 16, cardWidth: 1.6, cardLength: 2.1 },
    { y: 0.95, radius: 2.00, count: 8, angleDeg: 18, cardWidth: 1.5, cardLength: 1.95 },
    { y: 1.25, radius: 1.85, count: 8, angleDeg: 20, cardWidth: 1.45, cardLength: 1.8 },
    { y: 1.55, radius: 1.70, count: 7, angleDeg: 22, cardWidth: 1.35, cardLength: 1.65 },
    { y: 1.85, radius: 1.55, count: 7, angleDeg: 24, cardWidth: 1.3, cardLength: 1.5 },
    { y: 2.15, radius: 1.40, count: 7, angleDeg: 26, cardWidth: 1.2, cardLength: 1.35 },
    { y: 2.45, radius: 1.25, count: 6, angleDeg: 28, cardWidth: 1.1, cardLength: 1.2 },
    { y: 2.75, radius: 1.10, count: 6, angleDeg: 30, cardWidth: 1.0, cardLength: 1.05 },
    { y: 3.10, radius: 0.90, count: 5, angleDeg: 33, cardWidth: 0.85, cardLength: 0.9 },
    { y: 3.45, radius: 0.70, count: 5, angleDeg: 36, cardWidth: 0.75, cardLength: 0.75 },
    { y: 3.80, radius: 0.50, count: 4, angleDeg: 40, cardWidth: 0.65, cardLength: 0.6 },
  ];

  for (const tier of tiers) {
    for (let i = 0; i < tier.count; i++) {
      const jitter = ((i * 19 + Math.floor(tier.y * 10)) % 7) * 0.08;
      const rotY = (i / tier.count) * Math.PI * 2 + tier.y * 1.9 + jitter;
      const dipAngle = ((tier.angleDeg + ((i % 3) - 1) * 3) * Math.PI) / 180;

      const lenJitter = 0.9 + ((i * 11) % 5) * 0.05;
      const w = tier.cardWidth * 0.5;
      const len = tier.cardLength * lenJitter;

      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      const perpX = -s * w;
      const perpZ = c * w;

      const outX = c * len * Math.cos(dipAngle);
      const outZ = s * len * Math.cos(dipAngle);
      const outY = -len * Math.sin(dipAngle);

      const startX = c * 0.1;
      const startZ = s * 0.1;

      const v0x = startX - perpX * 0.45, v0y = tier.y, v0z = startZ - perpZ * 0.45;
      const v1x = startX + perpX * 0.45, v1y = tier.y, v1z = startZ + perpZ * 0.45;
      const v2x = startX + outX + perpX, v2y = tier.y + outY, v2z = startZ + outZ + perpZ;
      const v3x = startX + outX - perpX, v3y = tier.y + outY, v3z = startZ + outZ - perpZ;

      const verts = new Float32Array([
        v0x, v0y, v0z,  v1x, v1y, v1z,  v2x, v2y, v2z,
        v0x, v0y, v0z,  v2x, v2y, v2z,  v3x, v3y, v3z,
      ]);
      const uvs = new Float32Array([
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1,
      ]);

      const cardGeo = new BufferGeometry();
      cardGeo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      cardGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      cardGeo.computeVertexNormals();
      branchGeometries.push(cardGeo);
    }

    // Secondary interior filler needles
    const fillerCount = Math.max(3, tier.count - 2);
    for (let j = 0; j < fillerCount; j++) {
      const rotY = (j / fillerCount) * Math.PI * 2 + tier.y * 1.9 + Math.PI / fillerCount;
      const dipAngle = ((tier.angleDeg + 10) * Math.PI) / 180;
      const w = tier.cardWidth * 0.42;
      const len = tier.cardLength * 0.7;

      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      const perpX = -s * w;
      const perpZ = c * w;
      const outX = c * len * Math.cos(dipAngle);
      const outZ = s * len * Math.cos(dipAngle);
      const outY = -len * Math.sin(dipAngle) + 0.08;

      const startX = c * 0.08;
      const startZ = s * 0.08;

      const v0x = startX - perpX * 0.45, v0y = tier.y + 0.06, v0z = startZ - perpZ * 0.45;
      const v1x = startX + perpX * 0.45, v1y = tier.y + 0.06, v1z = startZ + perpZ * 0.45;
      const v2x = startX + outX + perpX, v2y = tier.y + outY, v2z = startZ + outZ + perpZ;
      const v3x = startX + outX - perpX, v3y = tier.y + outY, v3z = startZ + outZ - perpZ;

      const verts = new Float32Array([
        v0x, v0y, v0z,  v1x, v1y, v1z,  v2x, v2y, v2z,
        v0x, v0y, v0z,  v2x, v2y, v2z,  v3x, v3y, v3z,
      ]);
      const uvs = new Float32Array([
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1,
      ]);

      const cardGeo = new BufferGeometry();
      cardGeo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      cardGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      cardGeo.computeVertexNormals();
      branchGeometries.push(cardGeo);
    }
  }

  // Top crown needle apex
  const topH = 4.0;
  const topW = 0.48;
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 4;
    const c = Math.cos(angle) * topW;
    const s = Math.sin(angle) * topW;

    const verts = new Float32Array([
      -c, topH - 0.45, -s,   c, topH - 0.45,  s,   c * 0.15, topH + 0.35,  s * 0.15,
      -c, topH - 0.45, -s,   c * 0.15, topH + 0.35,  s * 0.15,  -c * 0.15, topH + 0.35, -s * 0.15,
    ]);
    const uvs = new Float32Array([
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
    ]);
    const topGeo = new BufferGeometry();
    topGeo.setAttribute('position', new Float32BufferAttribute(verts, 3));
    topGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    topGeo.computeVertexNormals();
    branchGeometries.push(topGeo);
  }

  const merged = BufferGeometryUtils.mergeGeometries(branchGeometries);
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BIRCH / DECIDUOUS BROADLEAF GEOMETRIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an organic European Birch / Silver Birch (Betula pendula) trunk geometry.
 * Features a slender, gracefully curving central stem tapering from root flare to apex (Y = 4.4m),
 * with 6 primary structural boughs arching outward and upward, plus secondary twig branchlets,
 * creating an authentic botanical silhouette without blunt cuts or disconnected cylinders.
 */
export function createBirchTrunkGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // 1. Central tapered trunk from underground (Y = -0.7m) to crown apex (Y = 4.4m)
  const trunk = new CylinderGeometry(0.035, 0.32, 5.1, 10, 12);
  trunk.translate(0, 1.85, 0);

  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Root flare near base
    const flare = y < 0.25 ? Math.max(0, (0.25 - y) * 0.45) : 0;
    // Gentle natural S-curve / lean of silver birch
    const swayX = Math.sin(y * 0.75) * 0.08 + Math.cos(y * 1.5) * 0.02;
    const swayZ = Math.cos(y * 0.65) * 0.06;
    pos.setXYZ(i, x * (1 + flare) + swayX, y, z * (1 + flare) + swayZ);
  }
  trunk.computeVertexNormals();

  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, uvs.getY(i) * 3.5);
  }
  parts.push(trunk);

  // 2. Primary arching structural boughs (smoothly anchored into the central trunk)
  const up = new Vector3(0, 1, 0);

  const boughConfigs = [
    { start: new Vector3(0.04, 1.95, 0.03), end: new Vector3(0.85, 3.25, 0.45), rBottom: 0.08, rTop: 0.025, wobble: 0.025 },
    { start: new Vector3(-0.04, 2.15, -0.03), end: new Vector3(-0.90, 3.35, -0.40), rBottom: 0.075, rTop: 0.022, wobble: 0.025 },
    { start: new Vector3(0.02, 2.50, 0.05), end: new Vector3(0.40, 3.80, 0.80), rBottom: 0.065, rTop: 0.020, wobble: 0.020 },
    { start: new Vector3(-0.03, 2.65, -0.04), end: new Vector3(-0.48, 3.85, -0.70), rBottom: 0.065, rTop: 0.020, wobble: 0.020 },
    { start: new Vector3(0.04, 3.05, -0.02), end: new Vector3(0.65, 4.15, -0.45), rBottom: 0.050, rTop: 0.018, wobble: 0.018 },
    { start: new Vector3(-0.03, 3.20, 0.03), end: new Vector3(-0.55, 4.25, 0.50), rBottom: 0.050, rTop: 0.018, wobble: 0.018 },
  ];

  for (const b of boughConfigs) {
    const dir = new Vector3().subVectors(b.end, b.start);
    const len = dir.length();
    const branchGeo = new CylinderGeometry(b.rTop, b.rBottom, len, 8, 4);
    branchGeo.translate(0, len / 2, 0);

    const quat = new Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    branchGeo.applyQuaternion(quat);
    branchGeo.translate(b.start.x, b.start.y, b.start.z);

    const bPos = branchGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const y = bPos.getY(i);
      const wobble = Math.sin(y * 2.8) * b.wobble;
      bPos.setX(i, bPos.getX(i) + wobble);
      bPos.setZ(i, bPos.getZ(i) + wobble * 0.7);
    }
    branchGeo.computeVertexNormals();

    const bUvs = branchGeo.attributes.uv;
    for (let i = 0; i < bUvs.count; i++) {
      bUvs.setY(i, bUvs.getY(i) * 2.0);
    }
    parts.push(branchGeo);
  }

  // 3. Secondary twig branchlets extending outward into the canopy
  const twigConfigs = [
    { start: new Vector3(0.45, 2.65, 0.25), end: new Vector3(1.10, 3.45, 0.65), rBottom: 0.035, rTop: 0.012 },
    { start: new Vector3(-0.50, 2.75, -0.22), end: new Vector3(-1.15, 3.55, -0.55), rBottom: 0.035, rTop: 0.012 },
    { start: new Vector3(0.22, 3.20, 0.45), end: new Vector3(0.60, 3.95, 1.05), rBottom: 0.030, rTop: 0.010 },
    { start: new Vector3(-0.25, 3.30, -0.40), end: new Vector3(-0.75, 4.05, -0.90), rBottom: 0.030, rTop: 0.010 },
  ];

  for (const t of twigConfigs) {
    const dir = new Vector3().subVectors(t.end, t.start);
    const len = dir.length();
    const twigGeo = new CylinderGeometry(t.rTop, t.rBottom, len, 6, 2);
    twigGeo.translate(0, len / 2, 0);

    const quat = new Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    twigGeo.applyQuaternion(quat);
    twigGeo.translate(t.start.x, t.start.y, t.start.z);
    twigGeo.computeVertexNormals();

    const tUvs = twigGeo.attributes.uv;
    for (let i = 0; i < tUvs.count; i++) {
      tUvs.setY(i, tUvs.getY(i) * 1.5);
    }
    parts.push(twigGeo);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates a lush volumetric rounded leafy canopy for Broadleaf / Birch trees.
 */
export function createBirchFoliageGeometry(): BufferGeometry {
  const cards: BufferGeometry[] = [];

  const clusterPositions = [
    { x: 0.70, y: 2.30, z: 0.35, size: 2.3 },
    { x: -0.70, y: 2.20, z: -0.35, size: 2.3 },
    { x: 0.15, y: 2.40, z: 0.70, size: 2.1 },
    { x: -0.20, y: 2.30, z: -0.70, size: 2.1 },
    { x: 0.00, y: 3.10, z: 0.00, size: 2.9 },
    { x: 0.90, y: 3.30, z: 0.45, size: 2.5 },
    { x: -0.80, y: 3.10, z: -0.45, size: 2.5 },
    { x: 0.35, y: 3.40, z: -0.75, size: 2.3 },
    { x: -0.35, y: 3.20, z: 0.75, size: 2.3 },
    { x: 0.00, y: 4.30, z: 0.00, size: 2.4 },
    { x: 0.45, y: 4.00, z: -0.35, size: 2.0 },
    { x: -0.45, y: 4.10, z: 0.35, size: 2.0 },
  ];

  for (const cl of clusterPositions) {
    for (let a = 0; a < 3; a++) {
      const angle = (a * Math.PI) / 3;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const halfW = cl.size * 0.5;
      const halfH = cl.size * 0.5;

      const v0x = cl.x - c * halfW, v0y = cl.y - halfH, v0z = cl.z - s * halfW;
      const v1x = cl.x + c * halfW, v1y = cl.y - halfH, v1z = cl.z + s * halfW;
      const v2x = cl.x + c * halfW, v2y = cl.y + halfH, v2z = cl.z + s * halfW;
      const v3x = cl.x - c * halfW, v3y = cl.y + halfH, v3z = cl.z - s * halfW;

      const verts = new Float32Array([
        v0x, v0y, v0z,  v1x, v1y, v1z,  v2x, v2y, v2z,
        v0x, v0y, v0z,  v2x, v2y, v2z,  v3x, v3y, v3z,
      ]);
      const uvs = new Float32Array([
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1,
      ]);

      const cardGeo = new BufferGeometry();
      cardGeo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      cardGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      cardGeo.computeVertexNormals();
      cards.push(cardGeo);
    }
  }

  const merged = BufferGeometryUtils.mergeGeometries(cards);
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DESERT ARID TREE / AFRICAN UMBRELLA ACACIA GEOMETRIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an authentic African Umbrella Acacia (Acacia Tortilis) trunk geometry.
 * The curving gnarled trunk forks smoothly at Y = 2.0m into upward-arching structural boughs
 * that seamlessly terminate inside the canopy discs (no cut stumps or disconnected branches).
 */
export function createDesertTrunkGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  // Main lower gnarled trunk from underground (Y = -0.6m) to fork (Y = 2.0m)
  const trunk = new CylinderGeometry(0.24, 0.44, 2.7, 10, 8);
  trunk.translate(0, 0.75, 0);

  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const flare = y < 0.2 ? Math.max(0, (0.2 - y) * 0.4) : 0;
    const twist = Math.sin(y * 1.6) * 0.14;
    pos.setXYZ(i, x * (1 + flare) + twist, y, z * (1 + flare) + twist * 0.6);
  }
  trunk.computeVertexNormals();

  const uvs = trunk.attributes.uv;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, uvs.getY(i) * 3.0);
  }
  parts.push(trunk);

  // Upward-arching structural boughs anchored firmly into trunk fork
  const boughVectors = [
    { start: new Vector3(0.05, 1.95, 0.05), end: new Vector3(1.65, 3.65, 0.45), rBottom: 0.16, rTop: 0.05 },
    { start: new Vector3(-0.05, 1.95, -0.05), end: new Vector3(-1.60, 3.55, -0.35), rBottom: 0.15, rTop: 0.05 },
    { start: new Vector3(0.02, 1.98, 0.06), end: new Vector3(0.35, 3.75, 1.55), rBottom: 0.14, rTop: 0.04 },
    { start: new Vector3(-0.04, 1.98, -0.06), end: new Vector3(-0.40, 3.65, -1.45), rBottom: 0.14, rTop: 0.04 },
    { start: new Vector3(0.0, 2.0, 0.0), end: new Vector3(0.08, 3.95, 0.08), rBottom: 0.13, rTop: 0.05 },
  ];

  for (const b of boughVectors) {
    const dir = new Vector3().subVectors(b.end, b.start);
    const len = dir.length();
    const branchGeo = new CylinderGeometry(b.rTop, b.rBottom, len, 8, 4);

    branchGeo.translate(0, len / 2, 0);

    const up = new Vector3(0, 1, 0);
    const quat = new Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    branchGeo.applyQuaternion(quat);
    branchGeo.translate(b.start.x, b.start.y, b.start.z);

    const bPos = branchGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const y = bPos.getY(i);
      const wobble = Math.sin(y * 2.5) * 0.035;
      bPos.setX(i, bPos.getX(i) + wobble);
      bPos.setZ(i, bPos.getZ(i) + wobble * 0.7);
    }
    branchGeo.computeVertexNormals();

    const bUvs = branchGeo.attributes.uv;
    for (let i = 0; i < bUvs.count; i++) {
      bUvs.setY(i, bUvs.getY(i) * 2.5);
    }
    parts.push(branchGeo);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  return merged;
}

/**
 * Creates multi-tiered flat umbrella canopy discs with fine bipinnate feathery acacia leaves.
 */
export function createDesertFoliageGeometry(): BufferGeometry {
  const cards: BufferGeometry[] = [];

  const clusters = [
    { x: 0.08, y: 4.0, z: 0.08, width: 3.5, depth: 3.3, count: 5 },
    { x: 1.65, y: 3.7, z: 0.45, width: 2.7, depth: 2.5, count: 4 },
    { x: -1.60, y: 3.6, z: -0.35, width: 2.7, depth: 2.5, count: 4 },
    { x: 0.35, y: 3.8, z: 1.55, width: 2.4, depth: 2.3, count: 4 },
    { x: -0.40, y: 3.7, z: -1.45, width: 2.4, depth: 2.3, count: 4 },
  ];

  for (const cl of clusters) {
    for (let a = 0; a < cl.count; a++) {
      const angle = (a * Math.PI) / cl.count + cl.x * 0.5;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const halfW = (cl.width * 0.5) * (0.9 + ((a * 7) % 3) * 0.1);
      const halfL = (cl.depth * 0.5) * (0.9 + ((a * 5) % 3) * 0.1);

      const dipY = 0.12;

      // Horizontal disc card
      const v0x = cl.x - c * halfW, v0y = cl.y - dipY, v0z = cl.z - s * halfL;
      const v1x = cl.x + c * halfW, v1y = cl.y - dipY, v1z = cl.z + s * halfL;
      const v2x = cl.x + c * halfW * 0.7, v2y = cl.y + 0.18, v2z = cl.z + s * halfL * 0.7;
      const v3x = cl.x - c * halfW * 0.7, v3y = cl.y + 0.18, v3z = cl.z - s * halfL * 0.7;

      const verts = new Float32Array([
        v0x, v0y, v0z,  v1x, v1y, v1z,  v2x, v2y, v2z,
        v0x, v0y, v0z,  v2x, v2y, v2z,  v3x, v3y, v3z,
      ]);
      const uvs = new Float32Array([
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1,
      ]);

      const cardGeo = new BufferGeometry();
      cardGeo.setAttribute('position', new Float32BufferAttribute(verts, 3));
      cardGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      cardGeo.computeVertexNormals();
      cards.push(cardGeo);

      // Vertical skirt card crossing through to envelope branch tip
      const vertAngle = angle + Math.PI * 0.5;
      const vc = Math.cos(vertAngle) * halfW * 0.8;
      const vs = Math.sin(vertAngle) * halfL * 0.8;
      const skirtH = 0.55;

      const sv0x = cl.x - vc, sv0y = cl.y - skirtH, sv0z = cl.z - vs;
      const sv1x = cl.x + vc, sv1y = cl.y - skirtH, sv1z = cl.z + vs;
      const sv2x = cl.x + vc, sv2y = cl.y + 0.2, sv2z = cl.z + vs;
      const sv3x = cl.x - vc, sv3y = cl.y + 0.2, sv3z = cl.z - vs;

      const sverts = new Float32Array([
        sv0x, sv0y, sv0z,  sv1x, sv1y, sv1z,  sv2x, sv2y, sv2z,
        sv0x, sv0y, sv0z,  sv2x, sv2y, sv2z,  sv3x, sv3y, sv3z,
      ]);
      const suvs = new Float32Array([
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1,
      ]);

      const skirtGeo = new BufferGeometry();
      skirtGeo.setAttribute('position', new Float32BufferAttribute(sverts, 3));
      skirtGeo.setAttribute('uv', new Float32BufferAttribute(suvs, 2));
      skirtGeo.computeVertexNormals();
      cards.push(skirtGeo);
    }
  }

  const merged = BufferGeometryUtils.mergeGeometries(cards);
  return merged;
}
