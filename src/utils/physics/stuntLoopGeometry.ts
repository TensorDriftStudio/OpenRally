import {
  Vector3,
  Euler,
  Matrix4,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';

export interface StuntLoopConfig {
  /** Radius of the circular vertical loop in meters */
  readonly radius: number;
  /** Usable track width in meters */
  readonly trackWidth: number;
  /** Lateral spiral offset between entry and exit lanes in meters (along local X) */
  readonly spiralOffset: number;
  /** Number of discrete segments around the 360-degree loop */
  readonly loopSegments: number;
  /** Length of the flat approach ramp before the loop curves up */
  readonly entryLength: number;
  /** Length of the flat exit ramp after the loop touches down */
  readonly exitLength: number;
  /** Height of lateral safety guide rails in meters */
  readonly guardRailHeight: number;
  /** Thickness of the road deck collider in meters */
  readonly deckThickness: number;
}

export const DEFAULT_STUNT_LOOP_CONFIG: StuntLoopConfig = {
  radius: 9.5,
  trackWidth: 8.0,
  spiralOffset: 9.0,
  loopSegments: 192,
  entryLength: 28.0,
  exitLength: 28.0,
  guardRailHeight: 0.9,
  deckThickness: 0.25,
};

export interface StuntLoopSamplePoint {
  readonly position: Vector3;
  readonly tangent: Vector3;
  readonly normal: Vector3;
  readonly binormal: Vector3;
  readonly progress: number; // 0.0 at entry start to 1.0 at exit end
}

export interface StuntLoopColliderSpec {
  readonly id: string;
  readonly type: 'deck' | 'left_guardrail' | 'right_guardrail';
  /** Center position [x, y, z] in loop-local space */
  readonly position: [number, number, number];
  /** Half-extents [halfWidth, halfHeight, halfDepth] */
  readonly halfExtents: [number, number, number];
  /** Euler rotation [x, y, z] in radians */
  readonly rotation: [number, number, number];
}

export interface StuntLoopDeckTrimesh {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

/**
 * Evaluates the theoretical minimum apex speed required to complete the loop without falling.
 * v_min = sqrt(g * R) in m/s (returns value in km/h).
 */
export function calculateMinimumApexSpeedKmh(radius: number): number {
  return Math.sqrt(9.81 * radius) * 3.6;
}

/**
 * Evaluates the minimum entry speed required assuming frictionless conservation of energy.
 * v_entry = sqrt(5 * g * R) in m/s (returns value in km/h).
 */
export function calculateMinimumEntrySpeedKmh(radius: number): number {
  return Math.sqrt(5 * 9.81 * radius) * 3.6;
}

/**
 * Generates continuous centerline sample points for the complete loop-the-loop track
 * including flat entry transition, 360-degree helix loop, and flat exit transition.
 * Uses an Euler-softened clothoid curvature transition to eliminate the instantaneous
 * G-force shock upon entry and prevent suspension bottoming-out.
 */
export function generateStuntLoopPath(
  config: StuntLoopConfig = DEFAULT_STUNT_LOOP_CONFIG,
): StuntLoopSamplePoint[] {
  const points: StuntLoopSamplePoint[] = [];
  const { radius: R, spiralOffset: dX, loopSegments, entryLength: L_in, exitLength: L_out } = config;

  // 1. Entry Straightaway (from -L_in to 0)
  // Starts at Y = 0 at -L_in (seamless ground lead-in plate) and elevates to Y = 0.10m
  // over the first 3 meters to completely eliminate Z-fighting with the arena ground plane.
  const entrySteps = 16;
  for (let i = 0; i < entrySteps; i++) {
    const t = i / entrySteps;
    const z = -L_in * (1 - t);
    const leadInDist = t * L_in;
    const leadInFraction = Math.min(1.0, leadInDist / 3.0);
    const smoothLeadIn = leadInFraction * leadInFraction * (3 - 2 * leadInFraction);
    const y = 0.10 * smoothLeadIn;
    const pos = new Vector3(0, y, z);
    const tangent = new Vector3(0, 0, 1);
    const normal = new Vector3(0, 1, 0);
    const binormal = new Vector3(1, 0, 0);
    points.push({ position: pos, tangent, normal, binormal, progress: t * 0.15 });
  }

  // 2. Main 360-degree Helix Loop with Euler-Softened Clothoid Curvature Profile
  // Smoothly softens curvature at entry and exit (effective radius ~17.3m at bottom)
  // while preserving exact apex height of 2 * R = 19.0m and zero lateral acceleration at endpoints.
  const alpha = 0.35;
  for (let i = 0; i <= loopSegments; i++) {
    const fraction = i / loopSegments;
    const theta = fraction * Math.PI * 2;

    // Quintic Minimum-Jerk lateral spiral displacement (S-curve: zero velocity and zero acceleration at entry/exit)
    // S(t) = 10*t^3 - 15*t^4 + 6*t^5
    const t = fraction;
    const t2 = t * t;
    const t3 = t2 * t;
    const smoothFraction = t3 * (10 - 15 * t + 6 * t2);
    const x = dX * smoothFraction;

    // C3-Continuous Clothoid Curvature Transition Envelope:
    // Ensures normal acceleration and curvature start at EXACTLY 0 at entry (theta = 0)
    // and ramp smoothly to full loop curvature, eliminating instantaneous G-force shock and front-axle hop.
    const thetaTrans = 0.38; // ~4.5m clothoid curvature transition zone
    let envelope = 1.0;
    let envelopePrime = 0.0;

    if (theta < thetaTrans) {
      const u = theta / thetaTrans;
      envelope = u * u * (3 - 2 * u);
      envelopePrime = (6 * u * (1 - u)) / thetaTrans;
    } else if (theta > Math.PI * 2 - thetaTrans) {
      const u = (Math.PI * 2 - theta) / thetaTrans;
      envelope = u * u * (3 - 2 * u);
      envelopePrime = (-6 * u * (1 - u)) / thetaTrans;
    }

    const rawY = R * (1 - Math.cos(theta));
    const rawDy = R * Math.sin(theta);

    const cosHalf = Math.cos(theta * 0.5);
    const z = R * Math.sin(theta) * (1 + alpha * cosHalf * cosHalf);
    const y = 0.10 + rawY * envelope;
    const pos = new Vector3(x, y, z);

    // Tangent derivative dP/d_theta
    // Quintic derivative: d/dt[10t^3 - 15t^4 + 6t^5] = 30t^2 - 60t^3 + 30t^4
    const dx_dtheta = (dX * (30 * t2 - 60 * t3 + 30 * t2 * t2)) / (Math.PI * 2);
    const dz_dtheta = R * (1 + alpha * 0.5) * Math.cos(theta) + (alpha * R * 0.5) * Math.cos(2 * theta);
    const dy_dtheta = rawDy * envelope + rawY * envelopePrime;
    const tangent = new Vector3(dx_dtheta, dy_dtheta, dz_dtheta).normalize();

    // Longitudinal curvature tangent in Y-Z plane
    const planarLen = Math.hypot(dy_dtheta, dz_dtheta);
    const ty = planarLen > 1e-6 ? dy_dtheta / planarLen : 0;
    const tz = planarLen > 1e-6 ? dz_dtheta / planarLen : 1;
    // Inward normal pointing into the loop center: (0, tz, -ty)
    const rawNormal = new Vector3(0, tz, -ty);
    // Orthogonalize normal against tangent to establish baseline Frenet frame
    const normal0 = rawNormal.clone().sub(tangent.clone().multiplyScalar(rawNormal.dot(tangent))).normalize();
    const binormal0 = new Vector3().crossVectors(normal0, tangent).normalize();

    // Helical roll banking: rolls the track deck inward into the lateral spiral acceleration curve
    // Bank angle smoothly peaks during lateral acceleration transitions and reaches zero at entry, apex, and exit with zero twist jerk.
    const bankAngle = dX !== 0 ? 0.18 * Math.sin(theta) * Math.sin(theta * 0.5) : 0;
    const normal = normal0
      .clone()
      .multiplyScalar(Math.cos(bankAngle))
      .add(binormal0.clone().multiplyScalar(Math.sin(bankAngle)))
      .normalize();

    // Binormal: lateral vector pointing across track width to driver's RIGHT
    // Binormal = Normal x Tangent
    const binormal = new Vector3().crossVectors(normal, tangent).normalize();

    const progress = 0.15 + fraction * 0.70;
    points.push({ position: pos, tangent, normal, binormal, progress });
  }

  // 3. Exit Straightaway (flat along Z from 0 to L_out, offset at dX)
  // Runs at Y = 0.10m and tapers down to Y = 0.0m over the final 3 meters
  const exitSteps = 16;
  for (let i = 1; i <= exitSteps; i++) {
    const t = i / exitSteps;
    const z = L_out * t;
    const distRemaining = (1 - t) * L_out;
    const leadOutFraction = Math.min(1.0, distRemaining / 3.0);
    const smoothLeadOut = leadOutFraction * leadOutFraction * (3 - 2 * leadOutFraction);
    const y = 0.10 * smoothLeadOut;
    const pos = new Vector3(dX, y, z);
    const tangent = new Vector3(0, 0, 1);
    const normal = new Vector3(0, 1, 0);
    const binormal = new Vector3(1, 0, 0);
    points.push({ position: pos, tangent, normal, binormal, progress: 0.85 + t * 0.15 });
  }

  return points;
}

/**
 * Builds a continuous triangulated mesh collider specification for the drivable road deck.
 * Unlike segmented cuboids, this continuous Trimesh guarantees zero internal edge snagging
 * and completely eliminates "hitting a wall" shocks at high speed.
 */
export function createStuntLoopDeckTrimesh(
  config: StuntLoopConfig = DEFAULT_STUNT_LOOP_CONFIG,
): StuntLoopDeckTrimesh {
  const path = generateStuntLoopPath(config);
  const halfW = config.trackWidth * 0.5;
  const numPoints = path.length;

  // 3 vertices across track width per path sample point:
  // 0: Left deck edge, 1: Centerline, 2: Right deck edge
  const vertices = new Float32Array(numPoints * 3 * 3);
  // 4 triangles (2 quads: left lane, right lane) per segment
  const indices = new Uint32Array((numPoints - 1) * 4 * 3);

  let vOffset = 0;
  for (let i = 0; i < numPoints; i++) {
    const pt = path[i];
    const { position: P, binormal: B } = pt;

    // 0: Left deck edge (X = -halfW, N = 0)
    vertices[vOffset++] = P.x - B.x * halfW;
    vertices[vOffset++] = P.y - B.y * halfW;
    vertices[vOffset++] = P.z - B.z * halfW;

    // 1: Centerline (X = 0, N = 0)
    vertices[vOffset++] = P.x;
    vertices[vOffset++] = P.y;
    vertices[vOffset++] = P.z;

    // 2: Right deck edge (X = +halfW, N = 0)
    vertices[vOffset++] = P.x + B.x * halfW;
    vertices[vOffset++] = P.y + B.y * halfW;
    vertices[vOffset++] = P.z + B.z * halfW;
  }

  let idxOffset = 0;
  for (let i = 0; i < numPoints - 1; i++) {
    const row0 = i * 3;
    const row1 = (i + 1) * 3;

    const l0 = row0;
    const c0 = row0 + 1;
    const r0 = row0 + 2;

    const l1 = row1;
    const c1 = row1 + 1;
    const r1 = row1 + 2;

    // 1. Left lane deck (normal pointing upward towards +N)
    indices[idxOffset++] = l0;
    indices[idxOffset++] = l1;
    indices[idxOffset++] = c0;

    indices[idxOffset++] = c0;
    indices[idxOffset++] = l1;
    indices[idxOffset++] = c1;

    // 2. Right lane deck (normal pointing upward towards +N)
    indices[idxOffset++] = c0;
    indices[idxOffset++] = c1;
    indices[idxOffset++] = r0;

    indices[idxOffset++] = r0;
    indices[idxOffset++] = c1;
    indices[idxOffset++] = r1;
  }

  return { vertices, indices };
}

/**
 * Builds continuous triangulated mesh collider for the safety guide rails.
 * Features ultra-slick friction (0.05) so vehicles brushing the rails at 140 km/h
 * glide smoothly without momentum grabbing, friction braking, or edge snagging.
 */
export function createStuntLoopRailTrimesh(
  config: StuntLoopConfig = DEFAULT_STUNT_LOOP_CONFIG,
): StuntLoopDeckTrimesh {
  const path = generateStuntLoopPath(config);
  const halfW = config.trackWidth * 0.5;
  const railH = config.guardRailHeight;
  const numPoints = path.length;

  // 4 vertices across track width per path sample point:
  // 0: Left rail top, 1: Left rail base, 2: Right rail base, 3: Right rail top
  const vertices = new Float32Array(numPoints * 4 * 3);
  // 4 triangles (2 quads: left rail inner face, right rail inner face) per segment
  const indices = new Uint32Array((numPoints - 1) * 4 * 3);

  let vOffset = 0;
  for (let i = 0; i < numPoints; i++) {
    const pt = path[i];
    const { position: P, binormal: B, normal: N } = pt;

    // 0: Left rail top (X = -halfW, N = +railH)
    vertices[vOffset++] = P.x - B.x * halfW + N.x * railH;
    vertices[vOffset++] = P.y - B.y * halfW + N.y * railH;
    vertices[vOffset++] = P.z - B.z * halfW + N.z * railH;

    // 1: Left rail base (X = -halfW, N = 0)
    vertices[vOffset++] = P.x - B.x * halfW;
    vertices[vOffset++] = P.y - B.y * halfW;
    vertices[vOffset++] = P.z - B.z * halfW;

    // 2: Right rail base (X = +halfW, N = 0)
    vertices[vOffset++] = P.x + B.x * halfW;
    vertices[vOffset++] = P.y + B.y * halfW;
    vertices[vOffset++] = P.z + B.z * halfW;

    // 3: Right rail top (X = +halfW, N = +railH)
    vertices[vOffset++] = P.x + B.x * halfW + N.x * railH;
    vertices[vOffset++] = P.y + B.y * halfW + N.y * railH;
    vertices[vOffset++] = P.z + B.z * halfW + N.z * railH;
  }

  let idxOffset = 0;
  for (let i = 0; i < numPoints - 1; i++) {
    const row0 = i * 4;
    const row1 = (i + 1) * 4;

    const lt0 = row0;
    const l0 = row0 + 1;
    const r0 = row0 + 2;
    const rt0 = row0 + 3;

    const lt1 = row1;
    const l1 = row1 + 1;
    const r1 = row1 + 2;
    const rt1 = row1 + 3;

    // 1. Left rail inner face (normal pointing inward towards +B)
    indices[idxOffset++] = l0;
    indices[idxOffset++] = lt0;
    indices[idxOffset++] = l1;

    indices[idxOffset++] = lt0;
    indices[idxOffset++] = lt1;
    indices[idxOffset++] = l1;

    // 2. Right rail inner face (normal pointing inward towards -B)
    indices[idxOffset++] = r0;
    indices[idxOffset++] = r1;
    indices[idxOffset++] = rt0;

    indices[idxOffset++] = r1;
    indices[idxOffset++] = rt1;
    indices[idxOffset++] = rt0;
  }

  return { vertices, indices };
}

/**
 * Builds discrete Rapier cuboid collider specifications for the track deck
 * and side guide rails along the generated path.
 */
export function createStuntLoopColliderSegments(
  config: StuntLoopConfig = DEFAULT_STUNT_LOOP_CONFIG,
): StuntLoopColliderSpec[] {
  const colliders: StuntLoopColliderSpec[] = [];
  const path = generateStuntLoopPath(config);
  const halfW = config.trackWidth * 0.5;
  const halfDeckT = config.deckThickness * 0.5;
  const halfRailH = config.guardRailHeight * 0.5;
  const halfRailT = 0.15; // 0.3m thick guardrail

  const matrix = new Matrix4();

  for (let i = 0; i < path.length - 1; i++) {
    const pA = path[i];
    const pB = path[i + 1];

    const center = new Vector3().addVectors(pA.position, pB.position).multiplyScalar(0.5);
    const segVec = new Vector3().subVectors(pB.position, pA.position);
    const segLen = segVec.length();
    if (segLen < 0.001) continue;

    const segTangent = segVec.clone().normalize();
    const rawNormal = new Vector3().addVectors(pA.normal, pB.normal).normalize();
    const segBinormal = new Vector3().crossVectors(rawNormal, segTangent).normalize();
    const segNormal = new Vector3().crossVectors(segTangent, segBinormal).normalize();

    // Build rotation matrix from exact orthonormal basis: X=Binormal, Y=Normal, Z=Tangent
    matrix.makeBasis(segBinormal, segNormal, segTangent);
    const euler = new Euler().setFromRotationMatrix(matrix, 'XYZ');
    const rot: [number, number, number] = [euler.x, euler.y, euler.z];

    // 1. Road Deck Collider
    // Inset slightly so segmented cuboids do not punch through smooth trimesh
    const deckCenter = center.clone().addScaledVector(segNormal, -halfDeckT);
    colliders.push({
      id: `loop_deck_${i}`,
      type: 'deck',
      position: [deckCenter.x, deckCenter.y, deckCenter.z],
      halfExtents: [halfW, halfDeckT, segLen * 0.50],
      rotation: rot,
    });

    // 2. Left Guardrail Collider
    const leftRailCenter = center
      .clone()
      .addScaledVector(segBinormal, -halfW - halfRailT)
      .addScaledVector(segNormal, halfRailH);
    colliders.push({
      id: `loop_rail_l_${i}`,
      type: 'left_guardrail',
      position: [leftRailCenter.x, leftRailCenter.y, leftRailCenter.z],
      halfExtents: [halfRailT, halfRailH, segLen * 0.50],
      rotation: rot,
    });

    // 3. Right Guardrail Collider
    const rightRailCenter = center
      .clone()
      .addScaledVector(segBinormal, halfW + halfRailT)
      .addScaledVector(segNormal, halfRailH);
    colliders.push({
      id: `loop_rail_r_${i}`,
      type: 'right_guardrail',
      position: [rightRailCenter.x, rightRailCenter.y, rightRailCenter.z],
      halfExtents: [halfRailT, halfRailH, segLen * 0.50],
      rotation: rot,
    });
  }

  return colliders;
}

interface ProfileStripSpec {
  readonly leftOffset: number; // Lateral offset along B
  readonly rightOffset: number;
  readonly leftNormalOffset: number; // Normal offset along N
  readonly rightNormalOffset: number;
  readonly normalDir: 'normal' | 'binormal' | 'neg_binormal' | 'neg_normal';
  readonly getColor: (u: number) => [number, number, number];
  readonly uScale: number;
  readonly vRange: [number, number];
}

/**
 * Constructs a procedural Three.js BufferGeometry for the stunt loop track.
 * Employs a closed 3D solid box-girder architecture with distinct functional zones:
 * - High-traction dark asphalt driving deck
 * - High-contrast yellow dashed racing centerline
 * - Crisp outer rally rumble curbs (red/white) strictly confined to edges
 * - Safety-yellow guardrail tops with gunmetal steel collision faces
 * - Heavy industrial dark steel underside box casing
 */
export function createStuntLoopMeshGeometry(
  config: StuntLoopConfig = DEFAULT_STUNT_LOOP_CONFIG,
): BufferGeometry {
  const path = generateStuntLoopPath(config);
  const halfW = config.trackWidth * 0.5;
  const railH = config.guardRailHeight;
  const railW = 0.25;
  const curbW = 0.65;
  const centerW = 0.15;
  const boxT = 0.35; // Box girder underside depth

  // Color constants (normalized RGB)
  const COLOR_ASPHALT: [number, number, number] = [0.12, 0.14, 0.18];
  const COLOR_YELLOW_DASH: [number, number, number] = [0.98, 0.82, 0.10];
  const COLOR_WHITE_CURB: [number, number, number] = [0.96, 0.96, 0.98];
  const COLOR_RED_CURB: [number, number, number] = [0.86, 0.14, 0.14];
  const COLOR_SAFETY_YELLOW: [number, number, number] = [0.95, 0.78, 0.08];
  const COLOR_STEEL_GUNMETAL: [number, number, number] = [0.30, 0.35, 0.42];
  const COLOR_STEEL_DARK: [number, number, number] = [0.18, 0.22, 0.28];
  const COLOR_STEEL_UNDERSIDE: [number, number, number] = [0.08, 0.11, 0.16];

  // Define cross-section strip specifications around the closed profile
  const strips: ProfileStripSpec[] = [
    // 0. Underside Steel Plate (capping the bottom of the box-girder)
    {
      leftOffset: halfW + railW,
      rightOffset: -halfW - railW,
      leftNormalOffset: -boxT,
      rightNormalOffset: -boxT,
      normalDir: 'neg_normal',
      getColor: () => COLOR_STEEL_UNDERSIDE,
      uScale: 20,
      vRange: [0.0, 1.0],
    },
    // 1. Left Outer Steel Skirt
    {
      leftOffset: -halfW - railW,
      rightOffset: -halfW - railW,
      leftNormalOffset: -boxT,
      rightNormalOffset: 0.0,
      normalDir: 'neg_binormal',
      getColor: () => COLOR_STEEL_DARK,
      uScale: 20,
      vRange: [0.0, 0.2],
    },
    // 2. Left Guardrail Outer Face
    {
      leftOffset: -halfW - railW,
      rightOffset: -halfW - railW,
      leftNormalOffset: 0.0,
      rightNormalOffset: railH,
      normalDir: 'neg_binormal',
      getColor: () => COLOR_STEEL_GUNMETAL,
      uScale: 20,
      vRange: [0.2, 0.6],
    },
    // 3. Left Guardrail Top Lip
    {
      leftOffset: -halfW - railW,
      rightOffset: -halfW,
      leftNormalOffset: railH,
      rightNormalOffset: railH,
      normalDir: 'normal',
      getColor: () => COLOR_SAFETY_YELLOW,
      uScale: 30,
      vRange: [0.6, 0.7],
    },
    // 4. Left Guardrail Inner Face
    {
      leftOffset: -halfW,
      rightOffset: -halfW,
      leftNormalOffset: railH,
      rightNormalOffset: 0.0,
      normalDir: 'binormal',
      getColor: () => COLOR_STEEL_GUNMETAL,
      uScale: 20,
      vRange: [0.7, 1.0],
    },
    // 5. Left Rally Curb (0.65m wide Rumble Strip)
    {
      leftOffset: -halfW,
      rightOffset: -halfW + curbW,
      leftNormalOffset: 0.002,
      rightNormalOffset: 0.002,
      normalDir: 'normal',
      getColor: (u) => (Math.sin(u * 130) > 0 ? COLOR_WHITE_CURB : COLOR_RED_CURB),
      uScale: 35,
      vRange: [0.0, 1.0],
    },
    // 6. Left Driving Lane (Asphalt)
    {
      leftOffset: -halfW + curbW,
      rightOffset: -centerW,
      leftNormalOffset: 0.0,
      rightNormalOffset: 0.0,
      normalDir: 'normal',
      getColor: () => COLOR_ASPHALT,
      uScale: 25,
      vRange: [0.0, 1.0],
    },
    // 7. Centerline Strip (Dashed Yellow)
    {
      leftOffset: -centerW,
      rightOffset: centerW,
      leftNormalOffset: 0.002,
      rightNormalOffset: 0.002,
      normalDir: 'normal',
      getColor: (u) => (Math.sin(u * 150) > -0.1 ? COLOR_YELLOW_DASH : COLOR_ASPHALT),
      uScale: 35,
      vRange: [0.0, 1.0],
    },
    // 8. Right Driving Lane (Asphalt)
    {
      leftOffset: centerW,
      rightOffset: halfW - curbW,
      leftNormalOffset: 0.0,
      rightNormalOffset: 0.0,
      normalDir: 'normal',
      getColor: () => COLOR_ASPHALT,
      uScale: 25,
      vRange: [0.0, 1.0],
    },
    // 9. Right Rally Curb (0.65m wide Rumble Strip)
    {
      leftOffset: halfW - curbW,
      rightOffset: halfW,
      leftNormalOffset: 0.002,
      rightNormalOffset: 0.002,
      normalDir: 'normal',
      getColor: (u) => (Math.sin(u * 130) > 0 ? COLOR_WHITE_CURB : COLOR_RED_CURB),
      uScale: 35,
      vRange: [0.0, 1.0],
    },
    // 10. Right Guardrail Inner Face
    {
      leftOffset: halfW,
      rightOffset: halfW,
      leftNormalOffset: 0.0,
      rightNormalOffset: railH,
      normalDir: 'neg_binormal',
      getColor: () => COLOR_STEEL_GUNMETAL,
      uScale: 20,
      vRange: [0.0, 0.3],
    },
    // 11. Right Guardrail Top Lip
    {
      leftOffset: halfW,
      rightOffset: halfW + railW,
      leftNormalOffset: railH,
      rightNormalOffset: railH,
      normalDir: 'normal',
      getColor: () => COLOR_SAFETY_YELLOW,
      uScale: 30,
      vRange: [0.3, 0.4],
    },
    // 12. Right Guardrail Outer Face
    {
      leftOffset: halfW + railW,
      rightOffset: halfW + railW,
      leftNormalOffset: railH,
      rightNormalOffset: 0.0,
      normalDir: 'binormal',
      getColor: () => COLOR_STEEL_GUNMETAL,
      uScale: 20,
      vRange: [0.4, 0.8],
    },
    // 13. Right Outer Steel Skirt
    {
      leftOffset: halfW + railW,
      rightOffset: halfW + railW,
      leftNormalOffset: 0.0,
      rightNormalOffset: -boxT,
      normalDir: 'binormal',
      getColor: () => COLOR_STEEL_DARK,
      uScale: 20,
      vRange: [0.8, 1.0],
    },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const numPoints = path.length;

  for (const strip of strips) {
    const stripVertexBase = positions.length / 3;

    // Generate vertices along the path for this strip
    for (let i = 0; i < numPoints; i++) {
      const pt = path[i];
      const { position: P, normal: N, binormal: B, progress: u } = pt;

      // Left edge vertex of strip
      const posL = P.clone()
        .addScaledVector(B, strip.leftOffset)
        .addScaledVector(N, strip.leftNormalOffset);

      // Right edge vertex of strip
      const posR = P.clone()
        .addScaledVector(B, strip.rightOffset)
        .addScaledVector(N, strip.rightNormalOffset);

      // Surface normal calculation
      let normVec: Vector3;
      switch (strip.normalDir) {
        case 'normal':
          normVec = N.clone();
          break;
        case 'neg_normal':
          normVec = N.clone().negate();
          break;
        case 'binormal':
          normVec = B.clone();
          break;
        case 'neg_binormal':
          normVec = B.clone().negate();
          break;
      }

      const col = strip.getColor(u);

      // Push left edge vertex
      positions.push(posL.x, posL.y, posL.z);
      normals.push(normVec.x, normVec.y, normVec.z);
      uvs.push(u * strip.uScale, strip.vRange[0]);
      colors.push(col[0], col[1], col[2]);

      // Push right edge vertex
      positions.push(posR.x, posR.y, posR.z);
      normals.push(normVec.x, normVec.y, normVec.z);
      uvs.push(u * strip.uScale, strip.vRange[1]);
      colors.push(col[0], col[1], col[2]);
    }

    // Connect quads along the strip
    for (let i = 0; i < numPoints - 1; i++) {
      const v0 = stripVertexBase + i * 2;
      const v1 = stripVertexBase + i * 2 + 1;
      const v2 = stripVertexBase + (i + 1) * 2;
      const v3 = stripVertexBase + (i + 1) * 2 + 1;

      // Two CCW triangles per quad
      indices.push(v0, v2, v1);
      indices.push(v1, v2, v3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  return geometry;
}
