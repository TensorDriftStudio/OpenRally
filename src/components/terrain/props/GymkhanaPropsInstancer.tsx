import { useRef, useMemo, useLayoutEffect } from 'react';
import {
  InstancedMesh,
  Color,
  MeshStandardMaterial,
  type Texture,
  Sphere,
  Vector3,
} from 'three';
import {
  createShippingContainerGeometry,
  createDriftPylonGeometry,
  createJumpRampGeometry,
} from './geometries';
import type { PropItem } from './types';

export interface GymkhanaPropsInstancerProps {
  shippingContainers: PropItem[];
  driftPylons: PropItem[];
  jumpRamps: PropItem[];
  jumpRampTexture: Texture;
  containerBlueTexture?: Texture;
  containerOrangeTexture?: Texture;
  containerRedTexture?: Texture;
  canShadow: boolean;
}

/**
 * Computes bounding sphere encompassing all placed instances for a prop group.
 */
function computeInstanceBoundingSphere(items: PropItem[], geometryRadius = 8): Sphere {
  const sphere = new Sphere();
  if (!items || items.length === 0) {
    sphere.radius = -1;
    return sphere;
  }
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const pos = new Vector3();
  for (let i = 0; i < items.length; i++) {
    pos.setFromMatrixPosition(items[i].matrix);
    min.min(pos);
    max.max(pos);
  }
  sphere.center.addVectors(min, max).multiplyScalar(0.5);
  let maxDistSq = 0;
  for (let i = 0; i < items.length; i++) {
    pos.setFromMatrixPosition(items[i].matrix);
    const dSq = pos.distanceToSquared(sphere.center);
    if (dSq > maxDistSq) maxDistSq = dSq;
  }
  sphere.radius = Math.sqrt(maxDistSq) + geometryRadius;
  return sphere;
}

/**
 * Helper to upload instance transformation matrices and update the instance bounding sphere.
 */
function applyInstanceMatrices(
  mesh: InstancedMesh | null,
  items: PropItem[],
  boundingRadius: number,
): void {
  if (!mesh || items.length === 0) return;
  for (let i = 0; i < items.length; i++) {
    mesh.setMatrixAt(i, items[i].matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const sphere = computeInstanceBoundingSphere(items, boundingRadius);
  if (sphere.radius > 0) {
    mesh.boundingSphere = sphere;
  }
}

/**
 * GPU instanced renderer for Gymkhana arena obstacles & stunt structures:
 * - Multi-livery industrial cargo shipping containers (Apex Logistics Blue, Open Rally Orange, Vortex Red)
 * - Safety fluorescent drift pylons
 * - Textured competition-spec launch jump ramps
 */
export function GymkhanaPropsInstancer({
  shippingContainers,
  driftPylons,
  jumpRamps,
  jumpRampTexture,
  containerBlueTexture,
  containerOrangeTexture,
  containerRedTexture,
  canShadow,
}: GymkhanaPropsInstancerProps) {
  const blueContainerRef = useRef<InstancedMesh>(null);
  const orangeContainerRef = useRef<InstancedMesh>(null);
  const redContainerRef = useRef<InstancedMesh>(null);
  const driftPylonRef = useRef<InstancedMesh>(null);
  const jumpRampRef = useRef<InstancedMesh>(null);

  // Partition shipping containers deterministically into the 3 authentic rally liveries
  // so stacked containers and obstacle rows feature realistic industrial color variety
  const { blueContainers, orangeContainers, redContainers } = useMemo(() => {
    const blue: PropItem[] = [];
    const orange: PropItem[] = [];
    const red: PropItem[] = [];

    for (let i = 0; i < shippingContainers.length; i++) {
      const mod = i % 3;
      if (mod === 0) {
        blue.push(shippingContainers[i]);
      } else if (mod === 1) {
        orange.push(shippingContainers[i]);
      } else {
        red.push(shippingContainers[i]);
      }
    }

    return { blueContainers: blue, orangeContainers: orange, redContainers: red };
  }, [shippingContainers]);

  // Geometries with computed bounding spheres
  const containerGeo = useMemo(() => {
    const geo = createShippingContainerGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const driftPylonGeo = useMemo(() => {
    const geo = createDriftPylonGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const jumpRampGeo = useMemo(() => {
    const geo = createJumpRampGeometry();
    geo.computeBoundingSphere();
    return geo;
  }, []);

  // Materials: PBR MeshStandardMaterial with texture atlases and fallback solid colors
  const blueContainerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: containerBlueTexture ?? null,
        roughness: 0.68,
        metalness: 0.25,
        color: containerBlueTexture ? new Color('#ffffff') : new Color('#1d4ed8'),
      }),
    [containerBlueTexture],
  );

  const orangeContainerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: containerOrangeTexture ?? null,
        roughness: 0.68,
        metalness: 0.25,
        color: containerOrangeTexture ? new Color('#ffffff') : new Color('#ea580c'),
      }),
    [containerOrangeTexture],
  );

  const redContainerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: containerRedTexture ?? null,
        roughness: 0.68,
        metalness: 0.25,
        color: containerRedTexture ? new Color('#ffffff') : new Color('#dc2626'),
      }),
    [containerRedTexture],
  );

  const driftPylonMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        roughness: 0.40,
        metalness: 0.15,
        color: new Color('#ea580c'), // Safety fluorescent orange
      }),
    [],
  );

  const jumpRampMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: jumpRampTexture,
        roughness: 0.55,
        metalness: 0.42,
      }),
    [jumpRampTexture],
  );

  // Upload instance matrices
  useLayoutEffect(() => {
    applyInstanceMatrices(blueContainerRef.current, blueContainers, 8);
    applyInstanceMatrices(orangeContainerRef.current, orangeContainers, 8);
    applyInstanceMatrices(redContainerRef.current, redContainers, 8);
    applyInstanceMatrices(driftPylonRef.current, driftPylons, 3);
    applyInstanceMatrices(jumpRampRef.current, jumpRamps, 8);
  }, [blueContainers, orangeContainers, redContainers, driftPylons, jumpRamps]);

  return (
    <group>
      {/* Livery 1: Apex Logistics (Cobalt Blue) */}
      {blueContainers.length > 0 && (
        <instancedMesh
          ref={blueContainerRef}
          args={[containerGeo, blueContainerMaterial, blueContainers.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
        />
      )}

      {/* Livery 2: Open Rally Freight (Vibrant Orange) */}
      {orangeContainers.length > 0 && (
        <instancedMesh
          ref={orangeContainerRef}
          args={[containerGeo, orangeContainerMaterial, orangeContainers.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
        />
      )}

      {/* Livery 3: Vortex Motorsport Cargo (Crimson Red) */}
      {redContainers.length > 0 && (
        <instancedMesh
          ref={redContainerRef}
          args={[containerGeo, redContainerMaterial, redContainers.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
        />
      )}

      {/* Drift Pylons */}
      {driftPylons.length > 0 && (
        <instancedMesh
          ref={driftPylonRef}
          args={[driftPylonGeo, driftPylonMaterial, driftPylons.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
        />
      )}

      {/* Jump Ramps */}
      {jumpRamps.length > 0 && (
        <instancedMesh
          ref={jumpRampRef}
          args={[jumpRampGeo, jumpRampMaterial, jumpRamps.length]}
          castShadow={canShadow}
          receiveShadow={canShadow}
        />
      )}
    </group>
  );
}
