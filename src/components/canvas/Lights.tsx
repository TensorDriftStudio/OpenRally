import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DirectionalLight, Object3D, PCFShadowMap } from 'three';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { LIGHTING_CONFIG, SKY_CONFIG } from '@/config/environment';
import { getLevelPreset } from '@/config/levelRegistry';
import { isMobileOrAndroid } from '@/utils/device';

/**
 * Scene lighting setup — ambient + directional sun + hemisphere.
 * Shadows are controlled by settings store and graphics quality.
 * The directional light target follows the camera/player to ensure shadows
 * are focused tightly around the vehicle, maximizing texel density and eliminating acne.
 */
export function Lights() {
  const shadowsEnabled = useSettingsStore((s) => s.shadowsEnabled);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const selectedLevelId = useGameStore((s) => s.selectedLevelId);
  const lightRef = useRef<DirectionalLight>(null);
  const targetRef = useRef<Object3D>(new Object3D());
  const gl = useThree((s) => s.gl);

  const isMobile = isMobileOrAndroid();

  // Configure shadow map type: hardware-accelerated PCFShadowMap on desktop
  useEffect(() => {
    if (gl.shadowMap) {
      gl.shadowMap.type = PCFShadowMap;
      gl.shadowMap.needsUpdate = true;
    }
  }, [gl, shadowsEnabled, graphicsQuality]);
  const levelPreset = getLevelPreset(selectedLevelId);
  const sunPos = levelPreset.environment?.sky?.sunPosition ?? SKY_CONFIG.sunPosition;

  // Dynamic shadow map size and range on desktop
  const shadowMapSize = graphicsQuality === 'low'
    ? 256
    : graphicsQuality === 'medium'
    ? 512
    : graphicsQuality === 'high'
    ? 1024
    : 2048;

  const shadowRange = graphicsQuality === 'very_high'
    ? LIGHTING_CONFIG.directional.shadowCameraRange * 1.3
    : LIGHTING_CONFIG.directional.shadowCameraRange;

  const shadowCameraNear = LIGHTING_CONFIG.directional.shadowCameraNear;
  const shadowCameraFar = LIGHTING_CONFIG.directional.shadowCameraFar;
  const shadowBias = LIGHTING_CONFIG.directional.shadowBias;
  const shadowNormalBias = LIGHTING_CONFIG.directional.shadowNormalBias;

  // Adjust shadow map render target size cleanly when quality changes
  useEffect(() => {
    if (lightRef.current?.shadow?.map && shadowsEnabled && !isMobile) {
      lightRef.current.shadow.map.setSize(shadowMapSize, shadowMapSize);
      lightRef.current.shadow.needsUpdate = true;
    }
  }, [shadowMapSize, shadowsEnabled, isMobile]);

  // Clean up shadow map textures deterministically on unmount
  useEffect(() => {
    const light = lightRef.current;
    return () => {
      const shadow = light?.shadow;
      if (shadow?.map) {
        if (shadow.map.depthTexture) {
          shadow.map.depthTexture.dispose();
          shadow.map.depthTexture = null;
        }
        shadow.map.dispose();
        shadow.map = null;
      }
    };
  }, []);

  // Ensure directional shadow camera projection matrix updates when frustum parameters change
  useEffect(() => {
    if (lightRef.current?.shadow?.camera) {
      lightRef.current.shadow.camera.updateProjectionMatrix();
    }
  }, [shadowRange, shadowCameraNear, shadowCameraFar]);

  useFrame((state) => {
    if (lightRef.current && targetRef.current) {
      const camPos = state.camera.position;
      if (!Number.isFinite(camPos.x) || !Number.isFinite(camPos.y) || !Number.isFinite(camPos.z)) {
        return;
      }

      // Update the light target to ground focus point under the camera
      targetRef.current.position.set(camPos.x, Math.max(0, camPos.y - 3), camPos.z);

      // Rigid directional light offset maintains constant sun direction angle
      lightRef.current.position.set(
        camPos.x + sunPos[0],
        camPos.y + sunPos[1],
        camPos.z + sunPos[2]
      );

      // Synchronize shadow camera frustum bounds and projection matrix
      const shadowCam = lightRef.current.shadow?.camera;
      if (shadowCam) {
        if (
          shadowCam.left !== -shadowRange ||
          shadowCam.right !== shadowRange ||
          shadowCam.top !== shadowRange ||
          shadowCam.bottom !== -shadowRange ||
          shadowCam.near !== shadowCameraNear ||
          shadowCam.far !== shadowCameraFar
        ) {
          shadowCam.left = -shadowRange;
          shadowCam.right = shadowRange;
          shadowCam.top = shadowRange;
          shadowCam.bottom = -shadowRange;
          shadowCam.near = shadowCameraNear;
          shadowCam.far = shadowCameraFar;
          shadowCam.updateProjectionMatrix();
        }
      }
    }
  });

  return (
    <>
      {/* Ambient fill light */}
      <ambientLight 
        intensity={LIGHTING_CONFIG.ambient.intensity} 
        color={LIGHTING_CONFIG.ambient.color} 
      />

      {/* Target object added to scene graph so matrixWorld updates properly */}
      <primitive object={targetRef.current} />

      {/* Sun — directional light with shadows */}
      <directionalLight
        ref={lightRef}
        target={targetRef.current}
        intensity={LIGHTING_CONFIG.directional.intensity}
        color={LIGHTING_CONFIG.directional.color}
        castShadow={!isMobile && shadowsEnabled && graphicsQuality !== 'low'}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-left={-shadowRange}
        shadow-camera-right={shadowRange}
        shadow-camera-top={shadowRange}
        shadow-camera-bottom={-shadowRange}
        shadow-camera-near={shadowCameraNear}
        shadow-camera-far={shadowCameraFar}
        shadow-bias={shadowBias}
        shadow-normalBias={shadowNormalBias}
      />

      {/* Hemisphere light — sky/ground color bounce */}
      <hemisphereLight
        args={[
          LIGHTING_CONFIG.hemisphere.skyColor, 
          LIGHTING_CONFIG.hemisphere.groundColor, 
          LIGHTING_CONFIG.hemisphere.intensity
        ]}
      />
    </>
  );
}
