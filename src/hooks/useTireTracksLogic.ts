import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { Object3D, Vector3, Mesh, BufferGeometry, BufferAttribute } from 'three';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  TireRibbonBuffer,
  sampleTerrainHeightAndNormal,
} from '@/utils/physics/tireRibbon';
import {
  TIRE_TRACK_QUALITY_PRESETS,
  TIRE_TRACK_MOBILE_PRESETS,
} from '@/config/particles';
import { isMobileDevice } from '@/utils/device';
import { useGameEventListener } from '@/utils/events';

// Reusable scratch objects to avoid per-frame allocations
const _wheelPos = new Vector3();
const _contactPos = new Vector3();
const _contactNormal = new Vector3();

export function useTireTracksLogic(
  wheelsRef: React.RefObject<(Object3D | null)[]>,
  chassisRef: React.RefObject<RapierRigidBody | null>,
) {
  const { heightmapData, levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);

  // 4 wheel mesh refs (FL, FR, RL, RR)
  const meshRef0 = useRef<Mesh>(null);
  const meshRef1 = useRef<Mesh>(null);
  const meshRef2 = useRef<Mesh>(null);
  const meshRef3 = useRef<Mesh>(null);
  const meshRefs = useMemo(() => [meshRef0, meshRef1, meshRef2, meshRef3], []);

  // Preset configuration based on active graphics quality and mobile device scaling
  const presets = useMemo(() => (isMobileDevice() ? TIRE_TRACK_MOBILE_PRESETS : TIRE_TRACK_QUALITY_PRESETS), []);
  const qualityPreset = presets[graphicsQuality] ?? presets.medium;

  // Initialize 4 separate zero-GC ring buffers
  const ribbonBuffers = useMemo(() => {
    return Array.from(
      { length: 4 },
      () =>
        new TireRibbonBuffer({
          maxSegments: qualityPreset.maxSegments,
          lifetime: qualityPreset.lifetime,
          minDistance: qualityPreset.minDistance,
        }),
    );
  }, [qualityPreset.maxSegments, qualityPreset.lifetime, qualityPreset.minDistance]);

  // Geometries for each wheel ribbon (recreated when ribbon buffer capacity changes)
  const geometries = useMemo(() => {
    return Array.from({ length: 4 }, () => new BufferGeometry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ribbonBuffers]);

  /**
   * Resets all ribbon buffers and flushes geometry draw ranges immediately to 0.
   */
  const clearTracks = useCallback(() => {
    for (let i = 0; i < 4; i++) {
      ribbonBuffers[i].reset();
      const geo = geometries[i];
      if (geo) {
        geo.setDrawRange(0, 0);
        const alphaAttr = geo.attributes.ribbonAlpha;
        if (alphaAttr) {
          alphaAttr.needsUpdate = true;
        }
      }
    }
  }, [geometries, ribbonBuffers]);

  // Reset ribbon buffers on vehicle reset events (restart stage, manual 'R' respawn, out of bounds)
  useGameEventListener('vehicle_reset', (e) => {
    if (e.reason !== 'recovery') {
      clearTracks();
    }
  });

  // Clear tire tracks when stage reset is pending, switching back to menu/loading, or changing track
  useEffect(() => {
    return useGameStore.subscribe((state, prevState) => {
      if (state.pendingReset && !prevState.pendingReset) {
        clearTracks();
      }
      if (
        state.gameState !== prevState.gameState &&
        (state.gameState === 'menu' || state.gameState === 'loading')
      ) {
        clearTracks();
      }
      if (state.selectedLevelId !== prevState.selectedLevelId) {
        clearTracks();
      }
    });
  }, [clearTracks]);

  // Clear tracks on initial mount, track data change, and unmount
  useEffect(() => {
    clearTracks();
    return () => {
      clearTracks();
    };
  }, [levelData, clearTracks]);

  // Bind buffer geometry attributes on initialization or quality change
  useEffect(() => {
    for (let i = 0; i < 4; i++) {
      const geo = geometries[i];
      const buf = ribbonBuffers[i];

      geo.setAttribute('position', new BufferAttribute(buf.positions, 3));
      geo.setAttribute('uv', new BufferAttribute(buf.uvs, 2));
      geo.setAttribute('color', new BufferAttribute(buf.colors, 3));
      geo.setAttribute('ribbonAlpha', new BufferAttribute(buf.alphas, 1));
      geo.setIndex(new BufferAttribute(buf.indices, 1));
      geo.setDrawRange(0, 0);
    }

    return () => {
      for (let i = 0; i < 4; i++) {
        geometries[i].dispose();
      }
    };
  }, [geometries, ribbonBuffers]);

  useFrame((state) => {
    const chassis = chassisRef.current;
    const wheels = wheelsRef.current;
    if (!chassis || !wheels) return;
    if (typeof chassis.isValid === 'function' && !chassis.isValid()) return;

    const gameState = useGameStore.getState();
    if (gameState.pendingReset) {
      clearTracks();
      return;
    }
    if (gameState.gameState !== 'playing') return;

    const currentTime = state.clock.elapsedTime;
    const surfaceType = gameState.surface;

    const linvel = chassis.linvel();
    const speedMps = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);

    // Early exit if vehicle is stationary (< 0.2 m/s) and all ribbon buffers are empty
    if (speedMps < 0.2) {
      let hasAnySegments = false;
      for (let i = 0; i < 4; i++) {
        if (ribbonBuffers[i].getSegmentCount() > 0) {
          hasAnySegments = true;
          break;
        }
      }
      if (!hasAnySegments) return;
    }

    // Calculate slip intensity from lateral speed and slip angle
    const lateralSpeed = Math.abs(gameState.lateralSpeed);
    const slipAngle = Math.abs(gameState.slipAngle);
    const slipRatio = lateralSpeed + slipAngle * 3.0;

    const isAirborne = gameState.isAirborne;

    for (let i = 0; i < 4; i++) {
      const wheel = wheels[i];
      const buf = ribbonBuffers[i];
      const geo = geometries[i];
      if (!wheel || !geo) continue;

      // Check physical contact status from Rapier wheel raycast
      const isWheelContact =
        typeof wheel.userData.isGrounded === 'boolean'
          ? wheel.userData.isGrounded
          : !isAirborne;

      // Skip tire tracks when vehicle is stopped (< 0.2 m/s), vehicle is airborne, or wheel has no contact
      if (speedMps < 0.2 || isAirborne || !isWheelContact) {
        buf.notifyAirborne();
      } else {
        wheel.getWorldPosition(_wheelPos);

        // Sample terrain elevation at the wheel's world location
        sampleTerrainHeightAndNormal(
          _wheelPos.x,
          _wheelPos.z,
          heightmapData,
          levelData,
          _contactPos,
          _contactNormal,
          buf.config.normalOffset,
        );

        // Approximate wheel radius is ~0.35m.
        // If the wheel bottom is elevated above the sampled ground (e.g. airborne or on an elevated ramp structure),
        // disconnect the ribbon and do not draw ghost tracks on the terrain below!
        const wheelBottomY = _wheelPos.y - 0.35;
        const heightAboveGround = wheelBottomY - _contactPos.y;

        if (heightAboveGround > 0.25 || heightAboveGround < -0.6) {
          buf.notifyAirborne();
        } else {
          buf.addContactPoint(
            _contactPos,
            _contactNormal,
            surfaceType,
            speedMps,
            slipRatio,
            true,
            currentTime,
            heightmapData,
            levelData,
          );
        }
      }

      const hasActive = buf.updateLifetime(currentTime);

      if (hasActive || buf.getActiveIndicesCount() > 0) {
        const posAttr = geo.attributes.position;
        const uvAttr = geo.attributes.uv;
        const colAttr = geo.attributes.color;
        const alphaAttr = geo.attributes.ribbonAlpha;
        const idxAttr = geo.index;

        // Gate VBO buffer re-uploads behind topologyDirty flag
        if (buf.topologyDirty) {
          if (posAttr) posAttr.needsUpdate = true;
          if (uvAttr) uvAttr.needsUpdate = true;
          if (colAttr) colAttr.needsUpdate = true;
          if (idxAttr) idxAttr.needsUpdate = true;
          buf.topologyDirty = false;
        }

        if (hasActive && alphaAttr) {
          alphaAttr.needsUpdate = true;
        }

        geo.setDrawRange(0, buf.getActiveIndicesCount());
      } else {
        if (buf.topologyDirty) {
          buf.topologyDirty = false;
        }
        geo.setDrawRange(0, 0);
      }
    }
  });

  return { meshRefs, geometries, clearTracks };
}

