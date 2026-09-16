import { memo, useMemo, useEffect } from 'react';
import { RigidBody, CylinderCollider, CuboidCollider } from '@react-three/rapier';
import {
  CanvasTexture,
  MeshStandardMaterial,
  CylinderGeometry,
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  type BufferGeometry,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isMobileOrAndroid } from '@/utils/device';
import type { CheckpointData } from '@/types/racing';

interface CheckpointGateProps {
  readonly data: CheckpointData;
  readonly isTarget: boolean;
  readonly isPassed?: boolean;
}

// ─── Pre-rendered High-DPI Banner Textures (Zero-GC) ───
function createGateBannerCanvasTexture(isFront: boolean): CanvasTexture {
  if (typeof document === 'undefined') {
    return new CanvasTexture({} as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Dark motorsport carbon background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 256);
    bgGrad.addColorStop(0, '#0c1017');
    bgGrad.addColorStop(0.5, '#151a24');
    bgGrad.addColorStop(1, '#090d13');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 256);

    // Carbon weave pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let x = 0; x < 1024; x += 12) {
      for (let y = 0; y < 256; y += 12) {
        if ((x + y) % 24 === 0) ctx.fillRect(x, y, 12, 12);
      }
    }

    // Yellow motorsport racing frame
    ctx.fillStyle = '#ffb700';
    ctx.fillRect(0, 0, 1024, 12);
    ctx.fillRect(0, 244, 1024, 12);

    // Left & Right Racing Chevrons
    ctx.fillStyle = '#ffb700';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(100, 0); ctx.lineTo(140, 128); ctx.lineTo(100, 256); ctx.lineTo(0, 256);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1024, 0); ctx.lineTo(924, 0); ctx.lineTo(884, 128); ctx.lineTo(924, 256); ctx.lineTo(1024, 256);
    ctx.fill();

    // Dark chevron inset
    ctx.fillStyle = '#0c1017';
    ctx.beginPath();
    ctx.moveTo(0, 20); ctx.lineTo(75, 20); ctx.lineTo(110, 128); ctx.lineTo(75, 236); ctx.lineTo(0, 236);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1024, 20); ctx.lineTo(949, 20); ctx.lineTo(914, 128); ctx.lineTo(949, 236); ctx.lineTo(1024, 236);
    ctx.fill();

    // Typography
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isFront) {
      // Main Header
      ctx.font = '900 64px "Impact", "Arial Black", sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillText('CHECKPOINT', 512, 88);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('CHECKPOINT', 512, 84);

      // Sub-ribbon
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(260, 142, 504, 52);
      ctx.fillStyle = '#ffb700';
      ctx.fillRect(260, 190, 504, 4);

      ctx.font = '800 24px "Segoe UI", sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.fillText('★ SECTOR TIMING ★', 512, 168);
    } else {
      ctx.font = '900 64px "Impact", "Arial Black", sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillText('OPEN RALLY', 512, 88);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('OPEN RALLY', 512, 84);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(260, 142, 504, 52);
      ctx.fillStyle = '#ffb700';
      ctx.fillRect(260, 190, 504, 4);

      ctx.font = '800 24px "Segoe UI", sans-serif';
      ctx.fillStyle = '#00d4ff';
      ctx.fillText('★ OPEN WORLD RALLY ★', 512, 168);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

const FRONT_BANNER_TEXTURE = createGateBannerCanvasTexture(true);
const REAR_BANNER_TEXTURE = createGateBannerCanvasTexture(false);

// Shared reusable single geometries
const LAMP_LENS_GEO = new CircleGeometry(0.11, 12);
const SPOTLIGHT_LENS_GEO = new CircleGeometry(0.18, 12);

// Deep 12m subterranean foundation cylinder (never levitates on any slope)
const FOUNDATION_CYL_GEO = new CylinderGeometry(0.75, 0.85, 12.0, 10);
FOUNDATION_CYL_GEO.translate(0, -6.0, 0);

// Crash pad sitting from Y = 0 to Y = 1.3m
const CRASH_PAD_GEO = new BoxGeometry(1.3, 1.3, 1.3);
CRASH_PAD_GEO.translate(0, 0.65, 0);

// Shared reusable materials (Zero-GC, Zero runtime allocation)
const STEEL_TRUSS_MAT = new MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.88, roughness: 0.25 });
const FOUNDATION_MAT = new MeshStandardMaterial({ color: '#212529', roughness: 0.9 });
const CRASH_PAD_MAT = new MeshStandardMaterial({ color: '#ca8a04', roughness: 0.7, metalness: 0.1 });
const BANNER_BOX_MAT = new MeshStandardMaterial({ color: '#14181f', roughness: 0.4, metalness: 0.7 });
const REAR_BANNER_MAT = new MeshStandardMaterial({ map: REAR_BANNER_TEXTURE, roughness: 0.4, metalness: 0.2 });
const FRONT_BANNER_MAT = new MeshStandardMaterial({ map: FRONT_BANNER_TEXTURE, roughness: 0.4, metalness: 0.2 });
const SHARED_BANNER_MATERIALS = [
  BANNER_BOX_MAT,
  BANNER_BOX_MAT,
  BANNER_BOX_MAT,
  BANNER_BOX_MAT,
  REAR_BANNER_MAT,
  FRONT_BANNER_MAT,
];

// Status light materials (Zero runtime creation)
const TARGET_STATUS_LAMP_MAT = new MeshStandardMaterial({
  color: '#00e676',
  emissive: '#00c853',
  emissiveIntensity: 1.5,
  roughness: 0.2,
});
const PASSED_STATUS_LAMP_MAT = new MeshStandardMaterial({
  color: '#4fc3f7',
  emissive: '#0288d1',
  emissiveIntensity: 1.0,
  roughness: 0.2,
});
const INACTIVE_STATUS_LAMP_MAT = new MeshStandardMaterial({
  color: '#546e7a',
  emissive: '#263238',
  emissiveIntensity: 0.2,
  roughness: 0.2,
});

// Spotlight materials
const TARGET_SPOTLIGHT_LENS_MAT = new MeshStandardMaterial({
  color: '#fffde7',
  emissive: '#fffde7',
  emissiveIntensity: 1.0,
  roughness: 0.2,
  side: DoubleSide,
});
const INACTIVE_SPOTLIGHT_LENS_MAT = new MeshStandardMaterial({
  color: '#fffde7',
  emissive: '#fffde7',
  emissiveIntensity: 0.3,
  roughness: 0.2,
  side: DoubleSide,
});

interface HeaderMergedGeometries {
  headerTrussGeo: BufferGeometry;
  bannerGeo: BufferGeometry;
}

const headerGeoCache = new Map<number, HeaderMergedGeometries>();

function getHeaderGeometries(width: number): HeaderMergedGeometries {
  const cached = headerGeoCache.get(width);
  if (cached) return cached;

  const halfWidth = width / 2;
  const gateHeight = 6.2;
  const topBarY = gateHeight + 0.9;
  const botBarY = gateHeight - 0.9;
  const bannerCenterY = gateHeight;
  const bannerHeight = 1.6;
  const bannerWidth = width * 0.72;

  const trussParts: BufferGeometry[] = [];

  // 1. Lamp housings (Left & Right)
  const lampHousingCyl = new CylinderGeometry(0.12, 0.14, 0.22, 10);
  const leftLampHousing = lampHousingCyl.clone();
  leftLampHousing.rotateZ(Math.PI / 2);
  leftLampHousing.translate(-halfWidth + 0.38, gateHeight * 0.72, 0);
  trussParts.push(leftLampHousing);

  const rightLampHousing = lampHousingCyl.clone();
  rightLampHousing.rotateZ(-Math.PI / 2);
  rightLampHousing.translate(halfWidth - 0.38, gateHeight * 0.72, 0);
  trussParts.push(rightLampHousing);

  // 2. Overhead crossbeams (Top & Bottom, Front & Rear)
  const crossbeamCyl = new CylinderGeometry(0.065, 0.065, width + 1.2, 8);
  [-0.3, 0.3].forEach((oz) => {
    const topBar = crossbeamCyl.clone();
    topBar.rotateZ(Math.PI / 2);
    topBar.translate(0, topBarY, oz);
    trussParts.push(topBar);

    const botBar = crossbeamCyl.clone();
    botBar.rotateZ(Math.PI / 2);
    botBar.translate(0, botBarY, oz);
    trussParts.push(botBar);
  });

  // 3. Overhead diagonal braces
  const topTrussDiagCyl = new CylinderGeometry(0.025, 0.025, 1.8, 6);
  for (let idx = 0; idx < 8; idx++) {
    const step = (width * 0.85) / 8;
    const posX = -width * 0.425 + idx * step + step / 2;
    const diag = topTrussDiagCyl.clone();
    diag.rotateZ(idx % 2 === 0 ? 0.65 : -0.65);
    diag.translate(posX, bannerCenterY, 0);
    trussParts.push(diag);
  }

  // 4. Spotlight housings
  const spotCone = new CylinderGeometry(0.02, 0.2, 0.32, 8);
  [-halfWidth * 0.55, 0, halfWidth * 0.55].forEach((sx) => {
    const spot = spotCone.clone();
    spot.rotateX(Math.PI / 8);
    spot.translate(sx, botBarY - 0.08, 0);
    trussParts.push(spot);
  });

  const mergedHeaderTruss = BufferGeometryUtils.mergeGeometries(trussParts, false);
  const bannerGeo = new BoxGeometry(bannerWidth, bannerHeight, 0.28);

  const result: HeaderMergedGeometries = {
    headerTrussGeo: mergedHeaderTruss,
    bannerGeo,
  };

  headerGeoCache.set(width, result);
  return result;
}

const pillarGeoCache = new Map<number, BufferGeometry>();

/**
 * Creates an adaptive steel truss column geometry spanning from Y = 0 to Y = height.
 */
function getPillarColumnGeometry(height: number): BufferGeometry {
  const roundedHeight = Math.max(0.5, Math.round(height * 10) / 10);
  const cached = pillarGeoCache.get(roundedHeight);
  if (cached) return cached;

  const parts: BufferGeometry[] = [];

  // 4 vertical tubular chords
  const chordCyl = new CylinderGeometry(0.055, 0.055, roundedHeight, 8);
  [-0.32, 0.32].forEach((ox) => {
    [-0.3, 0.3].forEach((oz) => {
      const chord = chordCyl.clone();
      chord.translate(ox, roundedHeight / 2, oz);
      parts.push(chord);
    });
  });

  // Diagonal cross braces along the variable height
  const numBraces = Math.max(1, Math.floor(roundedHeight / 0.95));
  const braceStep = roundedHeight / numBraces;
  const braceCyl = new CylinderGeometry(0.028, 0.028, Math.hypot(0.64, braceStep), 6);
  for (let idx = 0; idx < numBraces; idx++) {
    const brace = braceCyl.clone();
    brace.rotateX(0.42 * (idx % 2 === 0 ? 1 : -1));
    brace.translate(0, (idx + 0.5) * braceStep, 0);
    parts.push(brace);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  pillarGeoCache.set(roundedHeight, merged);
  return merged;
}

/**
 * Intermediate Rally Timing Checkpoint Gate with Adaptive Terrain Ground Anchoring.
 * Seamlessly anchors into slopes, hillsides, and banked curves with zero levitation and zero clipping.
 */
export const CheckpointGate = memo(function CheckpointGate({
  data,
  isTarget,
  isPassed = false,
}: CheckpointGateProps) {
  const [x, y, z] = data.position;
  const width = data.width;
  const halfWidth = width / 2;
  const gateHeight = 6.2;
  const topBarY = gateHeight + 0.9;
  const botBarY = gateHeight - 0.9;
  const bannerCenterY = gateHeight;

  const leftOffset = data.leftGroundOffset ?? 0;
  const rightOffset = data.rightGroundOffset ?? 0;

  // Pillar column heights extending from top of crash pad (offset + 1.3m) up to topBarY (7.1m)
  const leftColHeight = Math.max(0.5, topBarY - (leftOffset + 1.3));
  const rightColHeight = Math.max(0.5, topBarY - (rightOffset + 1.3));

  const { headerTrussGeo, bannerGeo } = useMemo(() => getHeaderGeometries(width), [width]);
  const leftColumnGeo = useMemo(() => getPillarColumnGeometry(leftColHeight), [leftColHeight]);
  const rightColumnGeo = useMemo(() => getPillarColumnGeometry(rightColHeight), [rightColHeight]);

  const statusLampMat = isPassed
    ? PASSED_STATUS_LAMP_MAT
    : isTarget
    ? TARGET_STATUS_LAMP_MAT
    : INACTIVE_STATUS_LAMP_MAT;

  const spotlightMat = isTarget ? TARGET_SPOTLIGHT_LENS_MAT : INACTIVE_SPOTLIGHT_LENS_MAT;

  const isMobile = isMobileOrAndroid();
  const canShadow = !isMobile;

  // Exact collider heights matching terrain elevations
  const leftColliderHeight = Math.max(1.0, topBarY - leftOffset);
  const rightColliderHeight = Math.max(1.0, topBarY - rightOffset);

  // ─── GEOMETRY BATCHING: Merge full steel truss structure into 1 single draw call ───
  const fullSteelTrussGeo = useMemo(() => {
    const parts: BufferGeometry[] = [];
    if (headerTrussGeo) parts.push(headerTrussGeo.clone());
    if (leftColumnGeo) {
      const left = leftColumnGeo.clone();
      left.translate(-halfWidth, leftOffset + 1.3, 0);
      parts.push(left);
    }
    if (rightColumnGeo) {
      const right = rightColumnGeo.clone();
      right.translate(halfWidth, rightOffset + 1.3, 0);
      parts.push(right);
    }
    return parts.length > 0 ? BufferGeometryUtils.mergeGeometries(parts, false) : null;
  }, [headerTrussGeo, leftColumnGeo, rightColumnGeo, halfWidth, leftOffset, rightOffset]);

  const foundationsGeo = useMemo(() => {
    const left = FOUNDATION_CYL_GEO.clone();
    left.translate(-halfWidth, leftOffset, 0);
    const right = FOUNDATION_CYL_GEO.clone();
    right.translate(halfWidth, rightOffset, 0);
    return BufferGeometryUtils.mergeGeometries([left, right], false);
  }, [halfWidth, leftOffset, rightOffset]);

  const crashPadsGeo = useMemo(() => {
    const left = CRASH_PAD_GEO.clone();
    left.translate(-halfWidth, leftOffset, 0);
    const right = CRASH_PAD_GEO.clone();
    right.translate(halfWidth, rightOffset, 0);
    return BufferGeometryUtils.mergeGeometries([left, right], false);
  }, [halfWidth, leftOffset, rightOffset]);

  const statusLampsGeo = useMemo(() => {
    const leftLens = LAMP_LENS_GEO.clone();
    leftLens.rotateZ(Math.PI / 2);
    leftLens.translate(-halfWidth + 0.49, gateHeight * 0.72, 0);
    const rightLens = LAMP_LENS_GEO.clone();
    rightLens.rotateZ(-Math.PI / 2);
    rightLens.translate(halfWidth - 0.49, gateHeight * 0.72, 0);
    return BufferGeometryUtils.mergeGeometries([leftLens, rightLens], false);
  }, [halfWidth, gateHeight]);

  const spotlightLensesGeo = useMemo(() => {
    const parts: BufferGeometry[] = [];
    ([-halfWidth * 0.55, 0, halfWidth * 0.55] as const).forEach((sx) => {
      const geo = SPOTLIGHT_LENS_GEO.clone();
      geo.rotateX(Math.PI / 2 + Math.PI / 8);
      geo.translate(sx, botBarY - 0.24, 0);
      parts.push(geo);
    });
    return BufferGeometryUtils.mergeGeometries(parts, false);
  }, [halfWidth, botBarY]);

  // Clean up merged geometries on unmount
  useEffect(() => {
    return () => {
      fullSteelTrussGeo?.dispose();
      foundationsGeo?.dispose();
      crashPadsGeo?.dispose();
      statusLampsGeo?.dispose();
      spotlightLensesGeo?.dispose();
    };
  }, [fullSteelTrussGeo, foundationsGeo, crashPadsGeo, statusLampsGeo, spotlightLensesGeo]);

  return (
    <group position={[x, y, z]} rotation={[0, data.rotationY, 0]}>
      {/* ─── 0. SOLID PHYSICS COLLIDERS ─── */}
      <RigidBody type="fixed" colliders={false}>
        {/* Left Pillar Collider */}
        <CylinderCollider
          args={[leftColliderHeight / 2, 0.65]}
          position={[-halfWidth, (leftOffset + topBarY) / 2, 0]}
          friction={0.8}
        />
        {/* Right Pillar Collider */}
        <CylinderCollider
          args={[rightColliderHeight / 2, 0.65]}
          position={[halfWidth, (rightOffset + topBarY) / 2, 0]}
          friction={0.8}
        />
        {/* Top Overhead Crossbeam & Banner */}
        <CuboidCollider
          args={[(width + 1.2) / 2, 1.0, 0.45]}
          position={[0, bannerCenterY, 0]}
          friction={0.8}
        />
      </RigidBody>

      {/* ─── VISUAL GATE MESHES (Distance-Culled beyond max visibility distance) ─── */}
      <group>
        {/* ─── 1. FULL STEEL TRUSS ARCHITECTURE (Batched header + columns: 1 draw call instead of 3) ─── */}
        {fullSteelTrussGeo && (
          <mesh geometry={fullSteelTrussGeo} material={STEEL_TRUSS_MAT} castShadow={canShadow} />
        )}

        {/* ─── 2. OVERHEAD RALLY TIMING BANNER ─── */}
        <mesh
          position={[0, bannerCenterY, 0]}
          geometry={bannerGeo}
          material={SHARED_BANNER_MATERIALS}
          castShadow={canShadow}
        />

        {/* Target checkpoint neon laser arch for instant long-range visibility */}
        {isTarget && (
          <mesh position={[0, bannerCenterY - 0.95, 0]}>
            <planeGeometry args={[width * 0.96, 0.16]} />
            <meshBasicMaterial color="#00e676" transparent opacity={0.88} side={DoubleSide} />
          </mesh>
        )}

        {/* ─── 3. BATCHED SUBTERRANEAN FOUNDATIONS (1 draw call instead of 2) ─── */}
        {foundationsGeo && (
          <mesh geometry={foundationsGeo} material={FOUNDATION_MAT} />
        )}

        {/* ─── 4. BATCHED CRASH PADS (1 draw call instead of 2) ─── */}
        {crashPadsGeo && (
          <mesh geometry={crashPadsGeo} material={CRASH_PAD_MAT} castShadow={canShadow} receiveShadow={canShadow} />
        )}

        {/* ─── 5. BATCHED STATUS INDICATOR LIGHT LENSES (1 draw call instead of 2) ─── */}
        {statusLampsGeo && (
          <mesh geometry={statusLampsGeo} material={statusLampMat} />
        )}

        {/* ─── 6. BATCHED SPOTLIGHT LENSES (1 draw call instead of 3) ─── */}
        {spotlightLensesGeo && (
          <mesh geometry={spotlightLensesGeo} material={spotlightMat} />
        )}
      </group>
    </group>
  );
});
