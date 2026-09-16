import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { InstancedMesh, Object3D, Color, Vector3, CanvasTexture, Quaternion, BufferAttribute } from 'three';

// Reusable objects for matrix composition (saves CPU and GC)
const _q = new Quaternion();
const _axisZ = new Vector3(0, 0, 1);
const _scale = new Vector3();

// Create soft particle texture outside component to avoid recreation
const createDustTexture = () => {
  if (typeof document === 'undefined') {
    return new CanvasTexture({} as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 32;
    const cy = 32;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
};

const dustTexture = createDustTexture();
import {
  MAX_PARTICLES,
  MOBILE_MAX_PARTICLES,
  SMOKE_COLOR,
  DRIFT_ANGVEL_THRESHOLD,
  DRIVING_SPEED_THRESHOLD,
  GROUND_OFFSET,
  DRIFT_PARTICLE_LIFETIME,
  DRIVE_PARTICLE_LIFETIME,
} from '@/config/particles';
import { isMobileDevice } from '@/utils/device';
import { useGameStore } from '@/store/gameStore';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';


interface Particle {
  active: boolean;
  position: Vector3;
  velocity: Vector3;
  life: number;
  maxLife: number;
  scale: number;
  color: Color;
  rotationAngle: number;
  rotationSpeed: number;
}

interface DustParticlesProps {
  wheelsRef: React.RefObject<(Object3D | null)[]>;
  chassisRef: React.RefObject<RapierRigidBody | null>;
}

export function DustParticles({ wheelsRef, chassisRef }: DustParticlesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const timeAccumulator = useRef(0);
  const wasRenderingRef = useRef(false);

  const poolSize = useMemo(
    () => (isMobileDevice() ? MOBILE_MAX_PARTICLES : MAX_PARTICLES),
    [],
  );

  // Opacity array for smooth fading
  const opacityArray = useMemo(() => new Float32Array(poolSize).fill(0), [poolSize]);

  // Initialize particles pool
  const particles = useMemo(() => {
    return Array.from({ length: poolSize }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      life: 0,
      maxLife: 1,
      scale: 1,
      color: new Color(),
      rotationAngle: 0,
      rotationSpeed: 0,
    })) as Particle[];
  }, [poolSize]);

  // Dense active index tracking and O(1) free index stack
  const freeIndices = useMemo(() => {
    const arr = new Int32Array(poolSize);
    for (let i = 0; i < poolSize; i++) {
      arr[i] = i;
    }
    return arr;
  }, [poolSize]);
  const activeIndices = useMemo(() => new Int32Array(poolSize), [poolSize]);

  const freeIndicesRef = useRef(freeIndices);
  const activeIndicesRef = useRef(activeIndices);
  const freeCountRef = useRef(poolSize);
  const activeCountRef = useRef(0);

  const dummy = useMemo(() => new Object3D(), []);

  useFrame((state, delta) => {
    if (useGameStore.getState().gameState !== 'playing') return;
    if (!meshRef.current || !chassisRef.current || !wheelsRef.current) return;

    const body = chassisRef.current;
    if (typeof body.isValid === 'function' && !body.isValid()) return;
    const wheels = wheelsRef.current;

    // Check speed and drift
    const linvel = body.linvel();
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
    const angvel = body.angvel();
    const isDrifting = Math.abs(angvel.y) > DRIFT_ANGVEL_THRESHOLD && speed > DRIVING_SPEED_THRESHOLD;
    const isDriving = speed > DRIVING_SPEED_THRESHOLD;

    // Early exit when no particles are active and vehicle is not driving/drifting
    if (activeCountRef.current === 0 && !isDriving && !isDrifting) {
      if (wasRenderingRef.current) {
        meshRef.current.count = 0;
        meshRef.current.instanceMatrix.needsUpdate = true;
        wasRenderingRef.current = false;
      }
      return;
    }

    // Clamp delta to prevent burst emissions after backgrounding or delta spikes
    const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 60;
    timeAccumulator.current = Math.min(timeAccumulator.current + safeDelta, 0.15);
    const EMIT_RATE = isDrifting ? 0.02 : 0.05; // 50 particles/sec drift, 20 particles/sec drive

    const isAirborne = useGameStore.getState().isAirborne;
    if (isAirborne) {
      timeAccumulator.current = 0;
    }

    if ((isDriving || isDrifting) && !isAirborne) {
      let emissionsToDo = Math.floor(timeAccumulator.current / EMIT_RATE);
      // Cap at 3 per frame to prevent lag spikes if tab was in background
      emissionsToDo = Math.min(emissionsToDo, 3);

      if (emissionsToDo > 0) {
        timeAccumulator.current -= emissionsToDo * EMIT_RATE;
        const currentSurface = useGameStore.getState().surface;
        const surfaceDef = getSurfaceDefinition(currentSurface);
        const surfaceColorHex = surfaceDef.particles.color;
        const surfaceScale = surfaceDef.particles.scale;
        const surfaceLifetime = surfaceDef.particles.lifetime;

        for (let e = 0; e < emissionsToDo; e++) {
          // Emit from all wheels
          for (let wheelIdx = 0; wheelIdx < 4; wheelIdx++) {
            const wheel = wheels[wheelIdx];
            if (!wheel) continue;

            // Check if wheel has physical ground contact
            const isWheelGrounded =
              typeof wheel.userData.isGrounded === 'boolean'
                ? wheel.userData.isGrounded
                : true;
            if (!isWheelGrounded) continue;

            if (freeCountRef.current <= 0) break; // pool exhausted

            const pIdx = freeIndicesRef.current[--freeCountRef.current];
            const p = particles[pIdx];
            p.active = true;
            // Get wheel world position
            wheel.getWorldPosition(p.position);
            
            // Do not emit dust if the wheel is in the water
            if (p.position.y - 0.35 <= -8.0) {
              p.active = false;
              freeIndicesRef.current[freeCountRef.current++] = pIdx;
              continue;
            }
            p.position.y -= GROUND_OFFSET;

            // Burst velocity from wheel spinning
            p.velocity.set(
              (Math.random() - 0.5) * 4,
              Math.random() * 2 + 1,
              (Math.random() - 0.5) * 4
            );

            p.life = 0;
            p.maxLife = (isDrifting ? DRIFT_PARTICLE_LIFETIME : DRIVE_PARTICLE_LIFETIME) * Math.max(0.5, surfaceLifetime / 0.5);
            p.scale = (Math.random() * 0.25 + 0.15) * surfaceScale;
            if (isDrifting && currentSurface === 'tarmac') {
              p.color.copy(SMOKE_COLOR);
            } else {
              p.color.set(surfaceColorHex);
            }
            p.rotationAngle = Math.random() * Math.PI * 2;
            p.rotationSpeed = (Math.random() - 0.5) * 2;

            activeIndicesRef.current[activeCountRef.current++] = pIdx;
          }
        }
      }
    } else {
      // Prevent accumulator from building up when not moving
      timeAccumulator.current = 0;
    }

    // Dense particle update loop with in-place compaction
    const count = activeCountRef.current;
    let writeIdx = 0;

    for (let i = 0; i < count; i++) {
      const pIdx = activeIndicesRef.current[i];
      const p = particles[pIdx];

      p.life += safeDelta;
      if (p.life >= p.maxLife) {
        p.active = false;
        freeIndicesRef.current[freeCountRef.current++] = pIdx;
        continue;
      }

      // Air resistance (drag) and upward lift
      p.velocity.x *= Math.pow(0.05, safeDelta); // slow down quickly laterally
      p.velocity.z *= Math.pow(0.05, safeDelta);
      p.velocity.y += safeDelta * 1.5; // slight upward drift

      p.position.addScaledVector(p.velocity, safeDelta);
      p.rotationAngle += p.rotationSpeed * safeDelta;
      
      const progress = p.life / p.maxLife;
      
      // Smooth fade in and fade out using opacity instead of imploding scale
      let currentOpacity = 0;
      if (progress < 0.2) {
        // Fade in (0 to 1)
        currentOpacity = progress / 0.2;
      } else if (progress > 0.6) {
        // Fade out smoothly (1 to 0) using an easing curve
        const t = (progress - 0.6) / 0.4;
        currentOpacity = 1 - (t * t); 
      } else {
        currentOpacity = 1;
      }

      // Controlled particle expansion to prevent screen-covering overdraw
      const currentScale = p.scale * (1 + progress * 0.8);

      // Billboarding: face camera + individual particle rotation
      _q.setFromAxisAngle(_axisZ, p.rotationAngle);
      dummy.quaternion.copy(state.camera.quaternion).multiply(_q);
      
      _scale.set(currentScale, currentScale, currentScale);
      dummy.matrix.compose(p.position, dummy.quaternion, _scale);

      meshRef.current.setMatrixAt(writeIdx, dummy.matrix);
      meshRef.current.setColorAt(writeIdx, p.color);
      opacityArray[writeIdx] = currentOpacity;

      activeIndicesRef.current[writeIdx] = pIdx;
      writeIdx++;
    }

    activeCountRef.current = writeIdx;
    meshRef.current.count = writeIdx;

    if (writeIdx > 0) {
      const matAttr = meshRef.current.instanceMatrix;
      if (typeof matAttr.clearUpdateRanges === 'function') {
        matAttr.clearUpdateRanges();
        matAttr.addUpdateRange(0, writeIdx * 16);
      }
      matAttr.needsUpdate = true;

      if (meshRef.current.instanceColor) {
        const colorAttr = meshRef.current.instanceColor;
        if (typeof colorAttr.clearUpdateRanges === 'function') {
          colorAttr.clearUpdateRanges();
          colorAttr.addUpdateRange(0, writeIdx * 3);
        }
        colorAttr.needsUpdate = true;
      }

      if (meshRef.current.geometry && meshRef.current.geometry.attributes.instanceOpacity) {
        const opAttr = meshRef.current.geometry.attributes.instanceOpacity;
        if (opAttr instanceof BufferAttribute) {
          opAttr.clearUpdateRanges();
          opAttr.addUpdateRange(0, writeIdx);
        }
        opAttr.needsUpdate = true;
      }
      wasRenderingRef.current = true;
    } else if (wasRenderingRef.current) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      wasRenderingRef.current = false;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, poolSize]} frustumCulled={false}>

      <planeGeometry args={[1.1, 1.1]}>
        <instancedBufferAttribute
          attach="attributes-instanceOpacity"
          args={[opacityArray, 1]}
        />
      </planeGeometry>
      <meshBasicMaterial
        transparent
        map={dustTexture}
        depthWrite={false}
        opacity={0.65}
        onBeforeCompile={(shader) => {
          shader.vertexShader = `
            attribute float instanceOpacity;
            varying float vInstanceOpacity;
            ${shader.vertexShader}
          `.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
             vInstanceOpacity = instanceOpacity;`
          );
          shader.fragmentShader = `
            varying float vInstanceOpacity;
            ${shader.fragmentShader}
          `.replace(
            `vec4 diffuseColor = vec4( diffuse, opacity );`,
            `vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );`
          );
        }}
      />
    </instancedMesh>
  );
}
