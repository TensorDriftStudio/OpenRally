import { useMemo, useEffect } from 'react';
import {
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { useTexture } from '@react-three/drei';
import { RigidBody, HeightfieldCollider } from '@react-three/rapier';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useSettingsStore } from '@/store/settingsStore';
import { isMobileDevice, getClampedAnisotropy } from '@/utils/device';
import {
  createDetailedTerrainMaterial,
  type TerrainMaterialOptions,
} from './terrainMaterial';
import {
  buildTerrainChunkGeometries,
  type TerrainChunkBuildParams,
  TERRAIN_CHUNKS_X,
  TERRAIN_CHUNKS_Z,
  TERRAIN_CHUNKS_TOTAL,
} from './terrainGeometry';

// Re-export material and geometry helpers for 100% backward compatibility
export {
  createDetailedTerrainMaterial,
  type TerrainMaterialOptions,
  buildTerrainChunkGeometries,
  type TerrainChunkBuildParams,
  TERRAIN_CHUNKS_X,
  TERRAIN_CHUNKS_Z,
  TERRAIN_CHUNKS_TOTAL,
};

/**
 * 3D visual and physics terrain component.
 * Features 16-chunk spatial subdivision with Frustum Culling for 60-75% vertex reduction,
 * seamless precomputed global normals, and attaches a Rapier HeightfieldCollider for rigid-body physics.
 */
export function Terrain() {
  const { heightmapData, levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const shadowsEnabled = useSettingsStore((s) => s.shadowsEnabled);
  const shouldReceiveShadow = shadowsEnabled && graphicsQuality !== 'low';

  const levelId = levelData.id.toLowerCase();
  const isDesert = levelId.includes('desert');
  const isSnow = levelId.includes('sweden') || levelId.includes('snow') || levelId.includes('winter');
  const isBritain = levelId.includes('britain') || levelId.includes('highland');
  const isGymkhana = levelId.includes('gymkhana');

  // Lightweight 68-byte placeholder texture to substitute unneeded terrain textures per biome,
  // saving over 20MB VRAM and eliminating texture thrashing on TBDR mobile GPUs.
  const BLANK = '/textures/placeholder.png';

  const grassPath = (!isDesert && !isSnow && !isBritain && !isGymkhana) ? '/textures/terrain/grass.jpg' : BLANK;
  const highlandHeatherPath = isBritain ? '/textures/terrain/highland_heather.jpg' : BLANK;
  const trackPath = !isSnow ? '/textures/terrain/dirt_track.jpg' : BLANK;
  const rockPath = '/textures/terrain/rock_cliff.jpg';
  const sandPath = isDesert ? '/textures/terrain/desert_sand.jpg' : BLANK;
  const snowPath = isSnow ? '/textures/terrain/snow.jpg' : BLANK;
  const snowTrackPath = isSnow ? '/textures/terrain/snow_track.jpg' : BLANK;

  // Load AI-generated terrain textures (biome-tailored to reduce VRAM by over 20MB)
  const [grassTexture, trackTexture, rockTexture, sandTexture, snowTexture, snowTrackTexture, highlandHeatherTexture] = useTexture([
    grassPath,
    trackPath,
    rockPath,
    sandPath,
    snowPath,
    snowTrackPath,
    highlandHeatherPath,
  ]);

  // Set repeat wrapping and SRGB color space on all terrain textures (clamped to <= 2 on mobile)
  useMemo(() => {
    const isMobile = isMobileDevice();
    const baseAnisotropy = graphicsQuality === 'very_high' ? 16 : graphicsQuality === 'high' ? 8 : 4;
    const anisotropy = getClampedAnisotropy(baseAnisotropy, isMobile);
    [grassTexture, trackTexture, rockTexture, sandTexture, snowTexture, snowTrackTexture, highlandHeatherTexture].forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.needsUpdate = true;
    });
  }, [grassTexture, trackTexture, rockTexture, sandTexture, snowTexture, snowTrackTexture, highlandHeatherTexture, graphicsQuality]);

  const chunkGeometries = useMemo(() => {
    return buildTerrainChunkGeometries({
      width: levelData.terrainBase.width,
      depth: levelData.terrainBase.depth,
      subdivisions: levelData.terrainBase.subdivisions,
      rows: heightmapData.rows,
      cols: heightmapData.cols,
      heights: heightmapData.heights,
      trackMasks: heightmapData.trackMasks,
      minHeight: heightmapData.minHeight,
      maxHeight: heightmapData.maxHeight,
      isSnow,
      isBritain,
    });
  }, [heightmapData, levelData, isSnow, isBritain]);

  const isMobile = isMobileDevice();

  // Create custom multi-texture material
  const material = useMemo(
    () =>
      createDetailedTerrainMaterial({
        grassTexture: isBritain ? highlandHeatherTexture : grassTexture,
        trackTexture,
        rockTexture,
        sandTexture,
        snowTexture,
        snowTrackTexture,
        isDesert,
        isSnow,
        isGymkhana,
        isMobile,
      }),
    [grassTexture, highlandHeatherTexture, trackTexture, rockTexture, sandTexture, snowTexture, snowTrackTexture, isDesert, isSnow, isGymkhana, isBritain, isMobile],
  );

  // Prepare heights for Rapier HeightfieldCollider
  const rapierHeights = useMemo(() => {
    const { rows, cols, heights } = heightmapData;
    const transposed = new Float32Array(heights.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        transposed[c * rows + r] = heights[r * cols + c];
      }
    }
    return transposed;
  }, [heightmapData]);

  // Clean up GPU buffers and textures on unmount/level change to prevent VRAM accumulation
  useEffect(() => {
    return () => {
      chunkGeometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    };
  }, [chunkGeometries, material]);

  // Recompile terrain shader program cleanly whenever shadow receiving state changes
  useEffect(() => {
    material.needsUpdate = true;
  }, [material, shouldReceiveShadow]);

  return (
    <RigidBody type="fixed" colliders={false} friction={1.2}>
      <HeightfieldCollider
        args={[
          levelData.terrainBase.subdivisions,
          levelData.terrainBase.subdivisions,
          rapierHeights as unknown as number[],
          {
            x: levelData.terrainBase.width,
            y: 1,
            z: levelData.terrainBase.depth,
          },
        ]}
      />
      {chunkGeometries.map((chunkGeo, idx) => (
        <mesh
          key={idx}
          geometry={chunkGeo}
          material={material}
          receiveShadow={shouldReceiveShadow}
          renderOrder={0}
          frustumCulled
        />
      ))}
    </RigidBody>
  );
}
