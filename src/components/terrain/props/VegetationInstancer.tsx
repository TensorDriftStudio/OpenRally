import { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Color,
  MeshStandardMaterial,
  type Texture,
  type IUniform,
} from 'three';
import {
  createTrunkGeometry,
  createPineFoliageGeometry,
  createBirchTrunkGeometry,
  createBirchFoliageGeometry,
  createDesertTrunkGeometry,
  createDesertFoliageGeometry,
} from './geometries';
import { createFoliageWindMaterial } from './materials';
import type { PropItem } from './types';

export interface VegetationInstancerProps {
  pineTrees: PropItem[];
  birchTrees: PropItem[];
  desertTrees: PropItem[];
  canShadow: boolean;
  isSnow: boolean;
  isDesert: boolean;
  pineBarkTexture: Texture;
  pineBranchTexture: Texture;
  pineBranchSnowTexture: Texture;
  birchBarkTexture: Texture;
  leafyBranchTexture: Texture;
  desertBarkTexture: Texture;
  desertAcaciaBranchTexture: Texture;
}

/**
 * High-performance GPU-instanced vegetation renderer (Nordic Pines, Broadleaf Birch, Desert Acacia)
 * featuring custom vertex wind displacement shaders and zero-GC matrix uploads.
 */
export function VegetationInstancer({
  pineTrees,
  birchTrees,
  desertTrees,
  canShadow,
  isSnow,
  isDesert,
  pineBarkTexture,
  pineBranchTexture,
  pineBranchSnowTexture,
  birchBarkTexture,
  leafyBranchTexture,
  desertBarkTexture,
  desertAcaciaBranchTexture,
}: VegetationInstancerProps) {
  const pineTrunkRef = useRef<InstancedMesh>(null);
  const pineFoliageRef = useRef<InstancedMesh>(null);
  const birchTrunkRef = useRef<InstancedMesh>(null);
  const birchFoliageRef = useRef<InstancedMesh>(null);
  const desertTrunkRef = useRef<InstancedMesh>(null);
  const desertFoliageRef = useRef<InstancedMesh>(null);

  const foliageShaderUniformsRef = useRef<Record<string, IUniform>[]>([]);

  // Procedural Geometries with genuine bounding spheres
  const pineTrunkGeo = useMemo(() => {
    const geo = createTrunkGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const pineFoliageGeo = useMemo(() => {
    const geo = createPineFoliageGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const birchTrunkGeo = useMemo(() => {
    const geo = createBirchTrunkGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const birchFoliageGeo = useMemo(() => {
    const geo = createBirchFoliageGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const desertTrunkGeo = useMemo(() => {
    const geo = createDesertTrunkGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const desertFoliageGeo = useMemo(() => {
    const geo = createDesertFoliageGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  // Materials
  const pineTrunkMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: pineBarkTexture,
        roughness: 0.92,
        metalness: 0.02,
        color: new Color(isSnow ? '#44342a' : '#5a3f2b'),
      }),
    [pineBarkTexture, isSnow],
  );

  const birchTrunkMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: birchBarkTexture,
        roughness: 0.94,
        metalness: 0.01,
        color: new Color('#ffffff'),
      }),
    [birchBarkTexture],
  );

  const desertTrunkMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: desertBarkTexture,
        roughness: 0.95,
        metalness: 0.02,
        color: new Color('#5a3e2b'),
      }),
    [desertBarkTexture],
  );

  const pineFoliageMaterial = useMemo(
    () =>
      createFoliageWindMaterial(
        isSnow ? pineBranchSnowTexture : pineBranchTexture,
        isSnow ? '#ffffff' : isDesert ? '#8b7a42' : '#23441a',
        false,
        (u) => foliageShaderUniformsRef.current.push(u),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pineBranchTexture, pineBranchSnowTexture, isDesert, isSnow],
  );

  const birchFoliageMaterial = useMemo(
    () =>
      createFoliageWindMaterial(
        isSnow ? pineBranchSnowTexture : leafyBranchTexture,
        isSnow ? '#ffffff' : '#2d541a',
        true,
        (u) => foliageShaderUniformsRef.current.push(u),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafyBranchTexture, pineBranchSnowTexture, isSnow],
  );

  const desertFoliageMaterial = useMemo(
    () =>
      createFoliageWindMaterial(
        desertAcaciaBranchTexture,
        '#9e914c',
        true,
        (u) => foliageShaderUniformsRef.current.push(u),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [desertAcaciaBranchTexture],
  );

  // VRAM Upload per batch
  useLayoutEffect(() => {
    const uploadBatch = (mesh: InstancedMesh | null, items: PropItem[]) => {
      if (!mesh || items.length === 0) return;
      for (let i = 0; i < items.length; i++) {
        mesh.setMatrixAt(i, items[i].matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = items.length;
      mesh.visible = true;
      mesh.computeBoundingSphere();
    };

    uploadBatch(pineTrunkRef.current, pineTrees);
    uploadBatch(pineFoliageRef.current, pineTrees);
    uploadBatch(birchTrunkRef.current, birchTrees);
    uploadBatch(birchFoliageRef.current, birchTrees);
    uploadBatch(desertTrunkRef.current, desertTrees);
    uploadBatch(desertFoliageRef.current, desertTrees);
  }, [pineTrees, birchTrees, desertTrees]);

  // Frame update for wind animation
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    for (const uniforms of foliageShaderUniformsRef.current) {
      if (uniforms.u_time) uniforms.u_time.value = time;
    }
  });

  // Clean up GPU buffers and materials on unmount/track change to prevent VRAM accumulation
  useEffect(() => {
    return () => {
      pineTrunkGeo.dispose();
      pineFoliageGeo.dispose();
      birchTrunkGeo.dispose();
      birchFoliageGeo.dispose();
      desertTrunkGeo.dispose();
      desertFoliageGeo.dispose();

      pineTrunkMaterial.dispose();
      birchTrunkMaterial.dispose();
      desertTrunkMaterial.dispose();
      pineFoliageMaterial.dispose();
      birchFoliageMaterial.dispose();
      desertFoliageMaterial.dispose();
    };
  }, [
    pineTrunkGeo,
    pineFoliageGeo,
    birchTrunkGeo,
    birchFoliageGeo,
    desertTrunkGeo,
    desertFoliageGeo,
    pineTrunkMaterial,
    birchTrunkMaterial,
    desertTrunkMaterial,
    pineFoliageMaterial,
    birchFoliageMaterial,
    desertFoliageMaterial,
  ]);

  return (
    <>
      {/* 1. Nordic Pines */}
      {pineTrees.length > 0 && (
        <>
          <instancedMesh
            ref={pineTrunkRef}
            args={[pineTrunkGeo, pineTrunkMaterial, pineTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={1}
            frustumCulled
          />
          <instancedMesh
            ref={pineFoliageRef}
            args={[pineFoliageGeo, pineFoliageMaterial, pineTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={2}
            frustumCulled
          />
        </>
      )}

      {/* 2. European Birch */}
      {birchTrees.length > 0 && (
        <>
          <instancedMesh
            ref={birchTrunkRef}
            args={[birchTrunkGeo, birchTrunkMaterial, birchTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={1}
            frustumCulled
          />
          <instancedMesh
            ref={birchFoliageRef}
            args={[birchFoliageGeo, birchFoliageMaterial, birchTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={2}
            frustumCulled
          />
        </>
      )}

      {/* 3. Desert Acacia */}
      {desertTrees.length > 0 && (
        <>
          <instancedMesh
            ref={desertTrunkRef}
            args={[desertTrunkGeo, desertTrunkMaterial, desertTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={1}
            frustumCulled
          />
          <instancedMesh
            ref={desertFoliageRef}
            args={[desertFoliageGeo, desertFoliageMaterial, desertTrees.length]}
            castShadow={canShadow}
            receiveShadow={canShadow}
            renderOrder={2}
            frustumCulled
          />
        </>
      )}
    </>
  );
}
