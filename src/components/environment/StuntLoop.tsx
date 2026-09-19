import { useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { RepeatWrapping, DoubleSide, type Group } from 'three';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import {
  DEFAULT_STUNT_LOOP_CONFIG,
  createStuntLoopDeckTrimesh,
  createStuntLoopRailTrimesh,
  createStuntLoopMeshGeometry,
  type StuntLoopConfig,
} from '@/utils/physics/stuntLoopGeometry';

export interface StuntLoopProps {
  /** World position of loop base [x, y, z] */
  readonly position?: [number, number, number];
  /** Euler rotation in radians [x, y, z] */
  readonly rotation?: [number, number, number];
  /** Optional custom geometry configuration */
  readonly config?: StuntLoopConfig;
}

/**
 * High-performance 3D Stunt Loop-the-Loop for the Apex Gymkhana Arena.
 * Features:
 * - Parametric helix track allowing full 360-degree inverted driving with lateral spiral exit offset.
 * - Solid 3D box-girder cross-section with asphalt road deck, yellow centerline, red/white curbs, and steel underside.
 * - Seamless PBR motorsport tarmac texture mapping with aggregate grain and subtle tire marks.
 * - Elevated runway deck with lead-in bevels to guarantee zero Z-fighting with arena terrain.
 * - Continuous Rapier Trimesh collider for the driving deck (zero internal edge snagging or wall-like collisions).
 * - Segmented Rapier CuboidColliders for outer safety guide rails.
 * - Exterior A-frame lattice support scaffolding placed safely OUTSIDE the vehicle clearance corridor.
 * - Overhead LED stunt entrance and exit gantries with directional clearance.
 */
export function StuntLoop({
  position = [-70, 8.0, -30],
  rotation = [0, 0, 0],
  config = DEFAULT_STUNT_LOOP_CONFIG,
}: StuntLoopProps) {
  const groupRef = useRef<Group>(null);

  // Dedicated high-resolution PBR stunt loop tarmac texture
  const tarmacTexture = useTexture('/textures/race/stunt_loop_tarmac.jpg');

  useMemo(() => {
    tarmacTexture.wrapS = RepeatWrapping;
    tarmacTexture.wrapT = RepeatWrapping;
    tarmacTexture.repeat.set(1, 1);
    tarmacTexture.needsUpdate = true;
  }, [tarmacTexture]);

  // Generate visual geometry and continuous snag-free trimesh colliders (deck + slick guardrails)
  const trackGeometry = useMemo(() => createStuntLoopMeshGeometry(config), [config]);
  const deckTrimesh = useMemo(() => createStuntLoopDeckTrimesh(config), [config]);
  const railTrimesh = useMemo(() => createStuntLoopRailTrimesh(config), [config]);

  // Geometric benchmarks for exterior scaffolding
  const R = config.radius;
  const apexY = R * 2; // 19.0m
  const dX = config.spiralOffset; // 12.0m
  const halfW = config.trackWidth * 0.5; // 4.0m

  // Safe exterior foundation setback coordinates (well outside the driving corridors)
  // Left apex tower: 4.0m outside the entrance track edge (-4.0 - 4.0 = -8.0m)
  // Right apex tower: 4.0m outside the exit track edge (12.0 + 4.0 + 4.0 = 20.0m)
  const leftTowerX = -halfW - 4.0; // -8.0m
  const rightTowerX = dX + halfW + 4.0; // 20.0m

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* ─── Rapier Physics RigidBody ─── */}
      <RigidBody type="fixed" colliders={false} friction={0.92} restitution={0.0}>
        {/* Continuous snag-free Asphalt Road Deck Trimesh (high traction 0.92) */}
        <TrimeshCollider
          args={[deckTrimesh.vertices, deckTrimesh.indices]}
          friction={0.92}
          restitution={0.0}
        />
        {/* Continuous slick Steel Guardrail Trimesh (ultra-low friction 0.05 so cars glide smoothly) */}
        <TrimeshCollider
          args={[railTrimesh.vertices, railTrimesh.indices]}
          friction={0.05}
          restitution={0.05}
        />
      </RigidBody>

      {/* ─── Visual Mesh: 3D Box-Girder Track Surface & Curbs ─── */}
      <mesh geometry={trackGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={tarmacTexture}
          vertexColors
          roughness={0.75}
          metalness={0.10}
          side={DoubleSide}
        />
      </mesh>

      {/* ─── Exterior Structural Steel Suspension Towers ─── */}
      {/* Positioned strictly at Z = 0 with wide lateral setback (X = -8m and X = +20m) */}
      <group>
        {/* Left Apex Main Tower Column */}
        <mesh position={[leftTowerX, (apexY + 2.0) * 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.42, apexY + 2.0, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Left Tower Concrete Base Pedestal */}
        <mesh position={[leftTowerX, 0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.8, 2.0]} />
          <meshStandardMaterial color="#475569" roughness={0.9} />
        </mesh>

        {/* Right Apex Main Tower Column */}
        <mesh position={[rightTowerX, (apexY + 2.0) * 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.42, apexY + 2.0, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Right Tower Concrete Base Pedestal */}
        <mesh position={[rightTowerX, 0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.8, 2.0]} />
          <meshStandardMaterial color="#475569" roughness={0.9} />
        </mesh>

        {/* Overhead Horizontal Suspension Girder (Spans across the entire apex at Y = 21.0m) */}
        <mesh position={[(leftTowerX + rightTowerX) * 0.5, apexY + 2.0, 0]} castShadow>
          <boxGeometry args={[rightTowerX - leftTowerX + 1.0, 0.7, 0.7]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.8} />
        </mesh>

        {/* Vertical High-Tensile Suspension Hangers (Holding loop apex from overhead girder) */}
        <mesh position={[dX * 0.25, apexY + 1.0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.0, 8]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[dX * 0.75, apexY + 1.0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.0, 8]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.9} />
        </mesh>

        {/* Outer Diagonal A-Frame Buttress Stays (Anchoring the side towers laterally away from track) */}
        {/* Left Lateral Ground Anchor */}
        <mesh position={[leftTowerX - 3.0, (apexY + 2.0) * 0.35, 0]} rotation={[0, 0, -0.32]} castShadow>
          <cylinderGeometry args={[0.22, 0.26, (apexY + 2.0) * 0.75, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Right Lateral Ground Anchor */}
        <mesh position={[rightTowerX + 3.0, (apexY + 2.0) * 0.35, 0]} rotation={[0, 0, 0.32]} castShadow>
          <cylinderGeometry args={[0.22, 0.26, (apexY + 2.0) * 0.75, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.7} />
        </mesh>
      </group>

      {/* ─── Entrance Overhead Stunt Gantry ─── */}
      <group position={[0, 0, -config.entryLength]}>
        {/* Left Gantry Upright */}
        <mesh position={[-halfW - 1.5, 3.25, 0]} castShadow>
          <cylinderGeometry args={[0.20, 0.24, 6.5, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Right Gantry Upright */}
        <mesh position={[halfW + 1.5, 3.25, 0]} castShadow>
          <cylinderGeometry args={[0.20, 0.24, 6.5, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Overhead Gantry Crossbeam */}
        <mesh position={[0, 6.5, 0]} castShadow>
          <boxGeometry args={[config.trackWidth + 3.6, 0.7, 0.6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Illuminated Warning Signboard */}
        <mesh position={[0, 6.5, 0.32]}>
          <boxGeometry args={[config.trackWidth * 0.85, 0.5, 0.08]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
        {/* Safety Amber Strobe Beacons */}
        <mesh position={[-halfW - 1.5, 6.7, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.25, 8]} />
          <meshBasicMaterial color="#eab308" />
        </mesh>
        <mesh position={[halfW + 1.5, 6.7, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.25, 8]} />
          <meshBasicMaterial color="#eab308" />
        </mesh>
      </group>

      {/* ─── Exit Overhead Gantry ─── */}
      <group position={[dX, 0, config.exitLength]}>
        {/* Left Gantry Upright */}
        <mesh position={[-halfW - 1.5, 3.25, 0]} castShadow>
          <cylinderGeometry args={[0.20, 0.24, 6.5, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Right Gantry Upright */}
        <mesh position={[halfW + 1.5, 3.25, 0]} castShadow>
          <cylinderGeometry args={[0.20, 0.24, 6.5, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Overhead Gantry Crossbeam */}
        <mesh position={[0, 6.5, 0]} castShadow>
          <boxGeometry args={[config.trackWidth + 3.6, 0.7, 0.6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
        </mesh>
        {/* Green Safe Exit Sign */}
        <mesh position={[0, 6.5, -0.32]}>
          <boxGeometry args={[config.trackWidth * 0.7, 0.5, 0.08]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      </group>
    </group>
  );
}
