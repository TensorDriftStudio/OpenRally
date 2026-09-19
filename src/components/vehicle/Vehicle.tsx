import { useRef, useMemo, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { RigidBody, CuboidCollider, RoundCuboidCollider, CoefficientCombineRule } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Group, Object3D } from 'three';
import { Wheel } from '@/components/vehicle/Wheel';
import { useVehiclePhysics } from '@/hooks/useVehiclePhysics';
import { useMultiplayerTelemetrySync } from '@/hooks/useMultiplayerTelemetrySync';
import { useTagProximity } from '@/hooks/useTagProximity';
import { useChaseCamera } from '@/hooks/useChaseCamera';
import { useBumperCamera } from '@/hooks/useBumperCamera';
import { FreeCamera } from '@/components/vehicle/FreeCamera';
import { useEngineSound } from '@/hooks/useEngineSound';
import { useSurfaceSound } from '@/hooks/useSurfaceSound';
import { useSkidSound } from '@/hooks/useSkidSound';
import { DustParticles } from '@/components/vehicle/DustParticles';
import { TireTracks } from '@/components/vehicle/TireTracks';
import { WaterSplashes } from '@/components/vehicle/WaterSplashes';
import { useGLTF, Clone } from '@react-three/drei';
import { VEHICLE_MODEL_PATH, VEHICLE_WRC_MODEL_PATH } from '@/config/assets';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { useTagStore } from '@/store/tagStore';
import { getVehiclePreset } from '@/config/vehicleRegistry';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { isMobileDevice } from '@/utils/device';
import { calculateGroundedVehicleTransform } from '@/utils/physics/groundSettler';

interface VehicleVisualModelProps {
  modelPath: string;
  positionOffset: [number, number, number];
  rotationOffset?: [number, number, number];
  scale: [number, number, number];
  chassisSize: [number, number, number];
}

interface VehicleModelErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface VehicleModelErrorBoundaryState {
  hasError: boolean;
}

/**
 * Robust error boundary isolating 3D GLB vehicle asset loading and shader errors.
 * Ensures that if a vehicle GLB model fails to load (e.g. offline mobile mode, corrupted mesh),
 * it seamlessly degrades to the procedural chassis box proxy instead of crashing the React tree.
 */
export class VehicleModelErrorBoundary extends Component<
  VehicleModelErrorBoundaryProps,
  VehicleModelErrorBoundaryState
> {
  public override state: VehicleModelErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): VehicleModelErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn(
      '[VehicleModelErrorBoundary] Suppressed vehicle model loading error, rendering fallback proxy:',
      error,
      errorInfo,
    );
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Isolated visual 3D model component wrapped in Suspense so that loading new GLB assets
 * never unmounts or suspends the physics RigidBody.
 */
function VehicleVisualModel({
  modelPath,
  positionOffset,
  rotationOffset,
  scale,
}: VehicleVisualModelProps) {
  const { scene } = useGLTF(modelPath);

  return (
    <Clone 
      object={scene} 
      position={positionOffset} 
      scale={scale} 
      rotation={rotationOffset ?? [0, 0, 0]} 
      castShadow
      receiveShadow
    />
  );
}

/**
 * Main Vehicle component — procedural car from Three.js primitives + GLB models.
 * Integrates physics (Rapier raycast vehicle), camera follow, audio, particles,
 * and dynamic preset selection from VehicleRegistry.
 */
export function Vehicle() {
  const selectedVehicleId = useGameStore((s) => s.selectedVehicleId);
  const vehiclePreset = getVehiclePreset(selectedVehicleId);
  const { heightmapData, levelData, levelPreset } = useTerrainData();

  const isMobile = isMobileDevice();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const useOptimized = isMobile || graphicsQuality !== 'very_high';
  const effectiveModelPath = useOptimized
    ? (vehiclePreset.optimizedModelPath ?? (vehiclePreset.modelPath.endsWith('.glb') ? vehiclePreset.modelPath.replace(/\.glb$/, '_opt.glb') : vehiclePreset.modelPath))
    : vehiclePreset.modelPath;

  const chassisRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<Group>(null);
  const wheelObjectsRef = useRef<(Object3D | null)[]>([null, null, null, null]);

  const config = vehiclePreset.config;

  // Attach vehicle physics with dynamic chassis sprung mass dynamics
  useVehiclePhysics(chassisRef, wheelObjectsRef, config, visualRef);

  // Broadcast local vehicle telemetry to multiplayer room
  useMultiplayerTelemetrySync(chassisRef, wheelObjectsRef);

  // Proximity tagger interaction in Rally Tag mode
  useTagProximity(chassisRef);

  // Attach cameras to the INTERPOLATED visual mesh, not the physics body
  useChaseCamera(visualRef);
  useBumperCamera(visualRef);

  // Attach engine, surface, and skid sounds
  useEngineSound();
  useSurfaceSound(wheelObjectsRef);
  useSkidSound();

  const spawnPos = levelPreset.spawnPosition;
  const spawnRotY = levelPreset.spawnRotationY;

  const gameMode = useGameStore((s) => s.gameMode);
  const tagSpawnIndex = useTagStore((s) => s.assignedSpawnIndex);

  const isMultiplayer = useMultiplayerStore((s) => s.status) !== 'disconnected' && !!useMultiplayerStore.getState().currentRoom;
  const isSpectating = useMultiplayerStore((s) => s.isSpectating);

  let effectiveSpawnPos: [number, number, number];
  let effectiveSpawnRotY = spawnRotY;

  if (gameMode === 'tag' && levelPreset.tagSpawnPoints && levelPreset.tagSpawnPoints.length > 0) {
    const spIndex = tagSpawnIndex % levelPreset.tagSpawnPoints.length;
    const pt = levelPreset.tagSpawnPoints[spIndex];
    effectiveSpawnPos = pt.position;
    effectiveSpawnRotY = pt.rotationY;
  } else {
    const slotIndex = isMultiplayer
      ? useMultiplayerStore.getState().slotIndex
      : 0;
    const gridColumn = slotIndex % 2;
    const gridRow = Math.floor(slotIndex / 2);
    const lateralOffset = isMultiplayer ? (gridColumn === 0 ? -2.8 : 2.8) : 0;
    const longitudinalOffset = isMultiplayer ? -gridRow * 6.0 : 0;

    // Rotate offsets by track spawn heading so cars align perfectly on any starting grid
    const cosY = Math.cos(spawnRotY);
    const sinY = Math.sin(spawnRotY);
    effectiveSpawnPos = [
      spawnPos[0] + cosY * lateralOffset + sinY * longitudinalOffset,
      spawnPos[1],
      spawnPos[2] - sinY * lateralOffset + cosY * longitudinalOffset,
    ];
  }

  const gameState = useGameStore((s) => s.gameState);
  const loadingTarget = useGameStore((s) => s.loadingTarget);
  const isMenuOrTitle = gameState === 'menu' || gameState === 'title' || (gameState === 'loading' && loadingTarget === 'menu');

  let effectiveSpawnRotation: [number, number, number] = [0, effectiveSpawnRotY, 0];

  if (isMenuOrTitle && heightmapData?.heights) {
    const grounded = calculateGroundedVehicleTransform(
      effectiveSpawnPos,
      effectiveSpawnRotY,
      config,
      heightmapData,
      levelData,
    );
    effectiveSpawnPos = grounded.position;
    effectiveSpawnRotation = grounded.euler;
  }

  // Segment chassis colliders into 3 structural zones:
  // 1. Central Floorpan Skid Plate (strictly between front & rear axles, Y in [-0.42m, -0.14m], 77% mass)
  // 2. Front & Rear Bumper Envelopes (elevated to Y in [-0.16m, +0.14m], providing 26° approach/departure angles & preventing loop snagging, 4% mass each)
  // 3. Upper Cabin & Roof Collider (cockpit, pillars, rollover protection, 15% mass)
  // Total mass = 77% + 4% + 4% + 15% = 100%, preserving center of mass and full obstacle collision coverage without gaps.
  const colliderEnvelope = useMemo(() => {
    const comZ = config.weightDistribution?.centerOfMassZ ?? 0.06;
    const halfWidth = config.chassisSize[0] / 2;
    const halfLength = config.chassisSize[2] / 2;

    let maxWheelZ = -Infinity;
    let minWheelZ = Infinity;
    for (const w of config.wheels) {
      if (w.position[2] > maxWheelZ) maxWheelZ = w.position[2];
      if (w.position[2] < minWheelZ) minWheelZ = w.position[2];
    }
    const frontAxleZ = Number.isFinite(maxWheelZ) ? maxWheelZ : 1.35;
    const rearAxleZ = Number.isFinite(minWheelZ) ? minWheelZ : -1.30;

    // Floorpan boundaries: keep skid plate between axles
    const floorpanFrontZ = frontAxleZ - 0.05;
    const floorpanRearZ = rearAxleZ + 0.05;
    const floorpanLength = Math.max(0.5, floorpanFrontZ - floorpanRearZ);
    const floorpanCenterZ = (floorpanFrontZ + floorpanRearZ) / 2;
    const floorpanHalfZ = floorpanLength / 2;

    // Front Bumper / Overhang boundaries:
    const frontBumperLength = Math.max(0.2, halfLength - floorpanFrontZ);
    const frontBumperCenterZ = (floorpanFrontZ + halfLength) / 2;
    const frontBumperHalfZ = frontBumperLength / 2;

    // Rear Bumper / Overhang boundaries:
    const rearBumperLength = Math.max(0.2, floorpanRearZ - (-halfLength));
    const rearBumperCenterZ = (-halfLength + floorpanRearZ) / 2;
    const rearBumperHalfZ = rearBumperLength / 2;

    return {
      comZ,
      halfWidth,
      floorpan: {
        centerZ: floorpanCenterZ,
        halfX: Math.max(0.1, halfWidth - 0.06),
        halfZ: Math.max(0.1, floorpanHalfZ - 0.05),
      },
      frontBumper: {
        centerZ: frontBumperCenterZ,
        halfX: Math.max(0.1, halfWidth * 0.90 - 0.03),
        halfZ: Math.max(0.1, frontBumperHalfZ - 0.03),
      },
      rearBumper: {
        centerZ: rearBumperCenterZ,
        halfX: Math.max(0.1, halfWidth * 0.90 - 0.03),
        halfZ: Math.max(0.1, rearBumperHalfZ - 0.03),
      },
    };
  }, [config.chassisSize, config.wheels, config.weightDistribution?.centerOfMassZ]);

  return (
    <group visible={!isSpectating}>
      <RigidBody
        ref={chassisRef}
        type="dynamic"
        colliders={false}
        mass={config.chassisMass}
        position={effectiveSpawnPos}
        rotation={effectiveSpawnRotation}
        linearDamping={0.08}
        angularDamping={0.6}
        canSleep={false}
        ccd={true}
      >
        {/* Zone 1: Central Floorpan Skid Plate (between axles, low CoM, Y in [-0.32m, -0.12m]) */}
        <RoundCuboidCollider
          key={`${selectedVehicleId}-floorpan`}
          position={[
            0,
            -0.22,
            colliderEnvelope.floorpan.centerZ,
          ]}
          args={[
            colliderEnvelope.floorpan.halfX,
            0.06,
            colliderEnvelope.floorpan.halfZ,
            0.04,
          ]}
          mass={config.chassisMass * 0.77}
          friction={0.05}
          restitution={0.0}
          frictionCombineRule={CoefficientCombineRule.Min}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />

        {/* Zone 2A: Front Bumper & Overhang Envelope (elevated to Y in [-0.16m, +0.14m] for 26° approach angle & loop clearance) */}
        <RoundCuboidCollider
          key={`${selectedVehicleId}-front-bumper`}
          position={[
            0,
            -0.01,
            colliderEnvelope.frontBumper.centerZ,
          ]}
          args={[
            colliderEnvelope.frontBumper.halfX,
            0.12,
            colliderEnvelope.frontBumper.halfZ,
            0.03,
          ]}
          mass={config.chassisMass * 0.04}
          friction={0.2}
          restitution={0.0}
          frictionCombineRule={CoefficientCombineRule.Min}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />

        {/* Zone 2B: Rear Bumper & Overhang Envelope (elevated to Y in [-0.16m, +0.14m] for departure angle) */}
        <RoundCuboidCollider
          key={`${selectedVehicleId}-rear-bumper`}
          position={[
            0,
            -0.01,
            colliderEnvelope.rearBumper.centerZ,
          ]}
          args={[
            colliderEnvelope.rearBumper.halfX,
            0.12,
            colliderEnvelope.rearBumper.halfZ,
            0.03,
          ]}
          mass={config.chassisMass * 0.04}
          friction={0.2}
          restitution={0.0}
          frictionCombineRule={CoefficientCombineRule.Min}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />

        {/* Zone 3: Upper Cabin & Roof Collider: cockpit, pillars, and roof panel for realistic rollovers (15% mass) */}
        {/* Overlaps bumper and lower hull by 2cm (Y in [-0.16m, -0.14m]) to prevent snagging or seam cracking */}
        <CuboidCollider
          key={`${selectedVehicleId}-cabin`}
          position={[
            0,
            0.18,
            colliderEnvelope.comZ,
          ]}
          args={[
            (config.chassisSize[0] * 0.90) / 2,
            0.34,
            (config.chassisSize[2] * 0.52) / 2,
          ]}
          mass={config.chassisMass * 0.15}
          friction={0.95}
          restitution={0.0}
          frictionCombineRule={CoefficientCombineRule.Max}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />

        {/* Visual Mesh (Interpolated Position) */}
        <group ref={visualRef}>
          <VehicleModelErrorBoundary
            fallback={
              <mesh position={[0, 0.8, 0]}>
                <boxGeometry
                  args={[
                    config.chassisSize[0],
                    config.chassisSize[1],
                    config.chassisSize[2],
                  ]}
                />
                <meshStandardMaterial color="#888" roughness={0.6} />
              </mesh>
            }
          >
            <Suspense
              fallback={
                <mesh position={[0, 0.8, 0]}>
                  <boxGeometry
                    args={[
                      config.chassisSize[0],
                      config.chassisSize[1],
                      config.chassisSize[2],
                    ]}
                  />
                  <meshStandardMaterial color="#888" roughness={0.6} />
                </mesh>
              }
            >
              <VehicleVisualModel
                modelPath={effectiveModelPath}
                positionOffset={vehiclePreset.modelPositionOffset ?? [0, 0.2, 0.1]}
                rotationOffset={vehiclePreset.modelRotationOffset ?? [0, 0, 0]}
                scale={vehiclePreset.modelScale ?? [4.5, 4.5, 4.5]}
                chassisSize={config.chassisSize}
              />
            </Suspense>
          </VehicleModelErrorBoundary>
        </group>

        {/* Soft contact ambient occlusion shadow directly beneath the chassis floor */}
        <mesh position={[0, -0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[config.chassisSize[0] * 1.35, config.chassisSize[2] * 1.2]} />
          <meshBasicMaterial
            transparent
            opacity={0.55}
            depthWrite={false}
            color="#000000"
            onBeforeCompile={(shader) => {
              shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                /* glsl */ `
                #include <common>
                varying vec2 vShadowUv;
                `,
              );
              shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                /* glsl */ `
                #include <uv_vertex>
                vShadowUv = uv;
                `,
              );
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                /* glsl */ `
                #include <common>
                varying vec2 vShadowUv;
                `,
              );
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                /* glsl */ `
                #include <color_fragment>
                vec2 uvC = vShadowUv * 2.0 - 1.0;
                float d = length(uvC * vec2(1.15, 0.85));
                // Dual-zone occlusion: tight dark contact core directly under floor pan + soft feathered penumbra
                float softPenumbra = smoothstep(1.0, 0.20, d) * 0.42;
                float innerCore = smoothstep(0.48, 0.05, d) * 0.38;
                float alpha = clamp(softPenumbra + innerCore, 0.0, 0.80);
                diffuseColor.a *= alpha;
                `,
              );
            }}
          />
        </mesh>

        {/* Wheels — inside RigidBody so their local transform is relative to the chassis */}
        {config.wheels.map((wheel, index) => (
          <Wheel
            key={`${selectedVehicleId}-${index}`}
            ref={(el) => {
              if (wheelObjectsRef.current) {
                wheelObjectsRef.current[index] = el;
              }
            }}
            radius={wheel.radius}
            isRightSide={wheel.position[0] > 0}
            position={[
              wheel.position[0],
              wheel.position[1] - wheel.suspensionRestLength * 0.5,
              wheel.position[2],
            ]}
          />
        ))}
      </RigidBody>

      {/* Visual Particle Effects */}
      <DustParticles chassisRef={chassisRef} wheelsRef={wheelObjectsRef} />
      <TireTracks chassisRef={chassisRef} wheelsRef={wheelObjectsRef} />
      <WaterSplashes chassisRef={chassisRef} wheelsRef={wheelObjectsRef} />

      {/* Free Camera Controls (enabled only when cameraMode === 'free') */}
      <FreeCamera targetRef={visualRef} />
    </group>
  );
}

// Preload core vehicle models on initial load; non-default vehicles are loaded on-demand
useGLTF.preload(VEHICLE_MODEL_PATH);
useGLTF.preload(VEHICLE_WRC_MODEL_PATH);

