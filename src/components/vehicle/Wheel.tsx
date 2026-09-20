import { forwardRef } from 'react';
import type { Object3D } from 'three';
import { useGLTF, Clone, Detailed } from '@react-three/drei';
import { isMobileDevice } from '@/utils/device';
import { useSettingsStore } from '@/store/settingsStore';

interface WheelProps {
  radius?: number;
  width?: number;
  isRightSide?: boolean;
  position?: [number, number, number];
  /** When true, uses 3-level LOD (used for remote multiplayer cars). Defaults to false for the player car to prevent matrix desync. */
  lod?: boolean;
}

/**
 * Visual wheel component — a loaded 3D model with optional LOD.
 * The outer group handles position + steering (Y rotation).
 * The inner group handles spin (X rotation) — animated by the physics hook.
 */
export const Wheel = forwardRef<Object3D, WheelProps>(function Wheel(
  { isRightSide = false, position, radius = 0.32, lod = false },
  ref,
) {
  const isMobile = isMobileDevice();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const useOptimized = isMobile || graphicsQuality !== 'very_high';
  const modelUrl = useOptimized ? '/models/vehicles/wheel_opt.glb' : '/models/vehicles/wheel.glb';

  // Load wheel model (optimized for mobile / balanced profile)
  const { scene } = useGLTF(modelUrl);

  // Dynamic model scaling tailored to wheel radius (raw GLB radius is 0.0375m)
  const visualScale = radius / 0.0375;

  const glbModel = (
    <Clone
      object={scene}
      scale={visualScale}
      // Center wheel hub at origin [0, 0, 0] and orient rim facing outward
      position={[0, -radius, 0]}
      rotation={[0, isRightSide ? 0 : Math.PI, 0]}
      castShadow={!isMobile}
      receiveShadow={!isMobile}
    />
  );

  return (
    <group ref={ref} position={position}>
      {/* Inner group for spin rotation */}
      <group>
        {lod ? (
          <Detailed distances={[0, 80, 200]}>
            {/* LOD 0: Full GLB model */}
            {glbModel}
            {/* LOD 1: Simplified cylinder (16 segments) */}
            <mesh rotation={[0, 0, Math.PI / 2]} scale={1}>
              <cylinderGeometry args={[radius, radius, 0.28, 16]} />
              <meshStandardMaterial color="#111" roughness={0.9} />
            </mesh>
            {/* LOD 2: Highly simplified cylinder (8 segments, unlit basic material) */}
            <mesh rotation={[0, 0, Math.PI / 2]} scale={1}>
              <cylinderGeometry args={[radius, radius, 0.28, 8]} />
              <meshBasicMaterial color="#0a0a0a" />
            </mesh>
          </Detailed>
        ) : (
          glbModel
        )}
      </group>
    </group>
  );
});

// Preload wheel assets to prevent frame drops upon initial render
useGLTF.preload('/models/vehicles/wheel.glb');
useGLTF.preload('/models/vehicles/wheel_opt.glb');
