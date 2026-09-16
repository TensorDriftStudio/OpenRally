import { useRef, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
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
import { useGLTF, Clone, Detailed } from '@react-three/drei';
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
  chassisSize,
}: VehicleVisualModelProps) {
  const { scene } = useGLTF(modelPath);

  return (
    <Detailed distances={[0, 50, 150]}>
      {/* LOD 0: Dedicated 3D GLB vehicle model */}
      <Clone 
        object={scene} 
        position={positionOffset} 
        scale={scale} 
        rotation={rotationOffset ?? [0, 0, 0]} 
        castShadow
        receiveShadow
      />
      {/* LOD 1: Simplified box proxy (medium distance) */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry
          args={[
            chassisSize[0],
            chassisSize[1],
            chassisSize[2],
          ]}
        />
        <meshStandardMaterial color="#888" roughness={0.6} />
      </mesh>
      {/* LOD 2: Far distance box proxy */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry
          args={[
            chassisSize[0],
            chassisSize[1],
            chassisSize[2],
          ]}
        />
        <meshBasicMaterial color="#555" />
      </mesh>
    </Detailed>
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
        {/* Lower Chassis Collider: floorpan, engine block, and lower running gear (92% mass for low CoM) */}
        <CuboidCollider
          key={`${selectedVehicleId}-chassis`}
          position={[
            0,
            config.weightDistribution?.centerOfMassY ?? -0.32,
            config.weightDistribution?.centerOfMassZ ?? 0.06,
          ]}
          args={[
            config.chassisSize[0] / 2,
            (config.chassisSize[1] * 0.65) / 2,
            config.chassisSize[2] / 2,
          ]}
          mass={config.chassisMass * 0.92}
        />

        {/* Upper Cabin & Roof Collider: cockpit, pillars, and roof panel for realistic rollovers (8% mass) */}
        <CuboidCollider
          key={`${selectedVehicleId}-cabin`}
          position={[
            0,
            (config.weightDistribution?.centerOfMassY ?? -0.32) + config.chassisSize[1] * 0.72,
            config.weightDistribution?.centerOfMassZ ?? 0.06,
          ]}
          args={[
            (config.chassisSize[0] * 0.78) / 2,
            (config.chassisSize[1] * 0.60) / 2,
            (config.chassisSize[2] * 0.52) / 2,
          ]}
          mass={config.chassisMass * 0.08}
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

