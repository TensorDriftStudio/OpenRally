import { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import {
  InstancedMesh,
  Color,
  MeshStandardMaterial,
  type Texture,
} from 'three';
import {
  createFenceGeometry,
  createStoneWallGeometry,
  createHayBaleGeometry,
  createRallySignGeometry,
} from './geometries';
import type { PropItem } from './types';

export interface TracksidePropsInstancerProps {
  fences: PropItem[];
  stoneWalls: PropItem[];
  hayBales: PropItem[];
  rallySigns: PropItem[];
  canShadow: boolean;
  isSnow: boolean;
  fenceTexture: Texture;
  britishDrystoneTexture: Texture;
  highlandCottageThatchTexture: Texture;
  cabinRedWallTexture: Texture;
}

/**
 * GPU instanced renderer for trackside barriers, roadside fencing, straw bales, and rally signs.
 */
export function TracksidePropsInstancer({
  fences,
  stoneWalls,
  hayBales,
  rallySigns,
  canShadow,
  isSnow,
  fenceTexture,
  britishDrystoneTexture,
  highlandCottageThatchTexture,
  cabinRedWallTexture,
}: TracksidePropsInstancerProps) {
  const fenceRef = useRef<InstancedMesh>(null);
  const stoneWallRef = useRef<InstancedMesh>(null);
  const hayBaleRef = useRef<InstancedMesh>(null);
  const rallySignRef = useRef<InstancedMesh>(null);

  // Geometries with genuine bounding spheres
  const fenceGeo = useMemo(() => {
    const geo = createFenceGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const stoneWallGeo = useMemo(() => {
    const geo = createStoneWallGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const hayBaleGeo = useMemo(() => {
    const geo = createHayBaleGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const rallySignGeo = useMemo(() => {
    const geo = createRallySignGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  // Materials
  const fenceMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: fenceTexture,
        roughness: 0.92,
        metalness: 0.02,
        color: new Color(isSnow ? '#8b8478' : '#7a7164'),
      }),
    [fenceTexture, isSnow],
  );

  const stoneWallMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: britishDrystoneTexture,
        roughness: 0.88,
        metalness: 0.01,
        color: new Color('#ffffff'),
      }),
    [britishDrystoneTexture],
  );

  const hayBaleMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: highlandCottageThatchTexture,
        roughness: 0.94,
        metalness: 0.01,
        color: new Color('#e5c26b'),
      }),
    [highlandCottageThatchTexture],
  );

  const rallySignMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: cabinRedWallTexture,
        roughness: 0.60,
        metalness: 0.08,
        color: new Color('#ff3322'),
      }),
    [cabinRedWallTexture],
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

    uploadBatch(fenceRef.current, fences);
    uploadBatch(stoneWallRef.current, stoneWalls);
    uploadBatch(hayBaleRef.current, hayBales);
    uploadBatch(rallySignRef.current, rallySigns);
  }, [fences, stoneWalls, hayBales, rallySigns]);

  // Clean up GPU buffers and materials on unmount/track change to prevent VRAM accumulation
  useEffect(() => {
    return () => {
      fenceGeo.dispose();
      stoneWallGeo.dispose();
      hayBaleGeo.dispose();
      rallySignGeo.dispose();

      fenceMaterial.dispose();
      stoneWallMaterial.dispose();
      hayBaleMaterial.dispose();
      rallySignMaterial.dispose();
    };
  }, [
    fenceGeo,
    stoneWallGeo,
    hayBaleGeo,
    rallySignGeo,
    fenceMaterial,
    stoneWallMaterial,
    hayBaleMaterial,
    rallySignMaterial,
  ]);

  return (
    <>
      {/* 1. Village Wooden Fences */}
      {fences.length > 0 && (
        <instancedMesh
          ref={fenceRef}
          args={[fenceGeo, fenceMaterial, fences.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
          frustumCulled
        />
      )}

      {/* 2. British Dry-Stone Dyke Walls */}
      {stoneWalls.length > 0 && (
        <instancedMesh
          ref={stoneWallRef}
          args={[stoneWallGeo, stoneWallMaterial, stoneWalls.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
          frustumCulled
        />
      )}

      {/* 3. Agricultural Straw Hay Bales */}
      {hayBales.length > 0 && (
        <instancedMesh
          ref={hayBaleRef}
          args={[hayBaleGeo, hayBaleMaterial, hayBales.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
          frustumCulled
        />
      )}

      {/* 4. Roadside Rally Warning Signs */}
      {rallySigns.length > 0 && (
        <instancedMesh
          ref={rallySignRef}
          args={[rallySignGeo, rallySignMaterial, rallySigns.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
          frustumCulled
        />
      )}
    </>
  );
}
