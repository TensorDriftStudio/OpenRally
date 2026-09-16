import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { InstancedMesh, Object3D, Color, Vector3, CanvasTexture, Quaternion, BufferAttribute } from 'three';
import { isMobileDevice } from '@/utils/device';
import { WATER_MAX_PARTICLES, WATER_MOBILE_MAX_PARTICLES } from '@/config/particles';
import { useGameStore } from '@/store/gameStore';

// Reusable objects for matrix composition
const _q = new Quaternion();
const _axisZ = new Vector3(0, 0, 1);
const _scale = new Vector3();

// Create water splash texture
const createSplashTexture = () => {
  if (typeof document === 'undefined') {
    return new CanvasTexture({} as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 16;
    const cy = 16;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
    // Ostrzejsze kropelki (ostrzejszy gradient)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(220, 240, 255, 0.8)');
    gradient.addColorStop(0.6, 'rgba(150, 200, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(canvas);
};

const splashTexture = createSplashTexture();

const WATER_COLOR = new Color('#ffffff');
const SPLASH_COLOR = new Color('#cceeff');
const DRIVING_SPEED_THRESHOLD = 2; // km/h
const WATER_LEVEL = -8.0; 
const PARTICLE_LIFETIME = 0.6; // Rapidly dissipating droplets

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

interface WaterSplashesProps {
  wheelsRef: React.RefObject<(Object3D | null)[]>;
  chassisRef: React.RefObject<RapierRigidBody | null>;
}

export function WaterSplashes({ wheelsRef, chassisRef }: WaterSplashesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const timeAccumulator = useRef(0);
  const wasRenderingRef = useRef(false);

  const maxParticles = useMemo(
    () => (isMobileDevice() ? WATER_MOBILE_MAX_PARTICLES : WATER_MAX_PARTICLES),
    [],
  );

  const opacityArray = useMemo(() => new Float32Array(maxParticles).fill(0), [maxParticles]);

  const particles = useMemo(() => {
    return Array.from({ length: maxParticles }, () => ({
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
  }, [maxParticles]);

  // Dense active index tracking and O(1) free index stack
  const freeIndices = useMemo(() => {
    const arr = new Int32Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      arr[i] = i;
    }
    return arr;
  }, [maxParticles]);
  const activeIndices = useMemo(() => new Int32Array(maxParticles), [maxParticles]);

  const freeIndicesRef = useRef(freeIndices);
  const activeIndicesRef = useRef(activeIndices);
  const freeCountRef = useRef(maxParticles);
  const activeCountRef = useRef(0);

  const dummy = useMemo(() => new Object3D(), []);

  useFrame((state, delta) => {
    if (useGameStore.getState().gameState !== 'playing') return;
    if (!meshRef.current || !chassisRef.current || !wheelsRef.current) return;

    const body = chassisRef.current;
    if (typeof body.isValid === 'function' && !body.isValid()) return;
    const wheels = wheelsRef.current;

    const trans = body.translation();
    const isNearWater = trans.y <= -7.0;

    const linvel = body.linvel();
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
    const isDriving = speed > DRIVING_SPEED_THRESHOLD;

    // Early exit when no particles are active and vehicle is not driving near water
    if (activeCountRef.current === 0 && (!isDriving || !isNearWater)) {
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
    
    // Dense water spray emission rate
    const EMIT_RATE = isDriving ? Math.max(0.005, 0.02 - (speed * 0.0005)) : 0.1; 

    if (isDriving && isNearWater) {
      let emissionsToDo = Math.floor(timeAccumulator.current / EMIT_RATE);
      emissionsToDo = Math.min(emissionsToDo, 3); // limit per frame (prevents micro-stuttering)

      if (emissionsToDo > 0) {
        timeAccumulator.current -= emissionsToDo * EMIT_RATE;

        for (let e = 0; e < emissionsToDo; e++) {
          for (let wheelIdx = 0; wheelIdx < 4; wheelIdx++) {
            const wheel = wheels[wheelIdx];
            if (!wheel) continue;

            // Check world position to determine if wheel is submerged
            wheel.getWorldPosition(dummy.position);
            
            // If bottom of wheel (radius ~0.35) is below water line
            if (dummy.position.y - 0.35 > WATER_LEVEL) continue;

            if (freeCountRef.current <= 0) break; // pool exhausted

            const pIdx = freeIndicesRef.current[--freeCountRef.current];
            const p = particles[pIdx];
            p.active = true;
            p.position.copy(dummy.position);
            
            // Water splash emitted just above water surface
            p.position.y = WATER_LEVEL + 0.1;

            // Shoot droplets upward and outward (rooster tail)
            const speedFactor = speed * 0.15;
            p.velocity.set(
              (Math.random() - 0.5) * speedFactor * 0.8,
              Math.random() * speedFactor + 3, // Strong upward trajectory
              (Math.random() - 0.5) * speedFactor * 0.8
            );
            
            // Add vehicle velocity vector (droplets trail behind)
            p.velocity.x += linvel.x * 0.3;
            p.velocity.z += linvel.z * 0.3;

            p.life = 0;
            p.maxLife = PARTICLE_LIFETIME * (0.6 + Math.random() * 0.6);
            p.scale = Math.random() * 0.8 + 0.4;
            p.color.copy(Math.random() > 0.4 ? WATER_COLOR : SPLASH_COLOR);
            p.rotationAngle = Math.random() * Math.PI * 2;
            p.rotationSpeed = (Math.random() - 0.5) * 2;

            activeIndicesRef.current[activeCountRef.current++] = pIdx;
          }
        }
      }
    } else {
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

      // Gravity pulls droplets down faster than smoke/dust
      p.velocity.y -= safeDelta * 15; 
      
      // Horizontal aerodynamic drag
      p.velocity.x *= Math.pow(0.5, safeDelta); 
      p.velocity.z *= Math.pow(0.5, safeDelta);

      p.position.addScaledVector(p.velocity, safeDelta);
      p.rotationAngle += p.rotationSpeed * safeDelta;
      
      // Droplets falling below water line dissipate rapidly
      if (p.position.y < WATER_LEVEL) {
        p.life += safeDelta * 2; 
      }

      if (p.life >= p.maxLife) {
        p.active = false;
        freeIndicesRef.current[freeCountRef.current++] = pIdx;
        continue;
      }
      
      const progress = p.life / p.maxLife;
      let currentOpacity = 0;
      
      if (progress < 0.1) {
        currentOpacity = progress / 0.1;
      } else if (progress > 0.5) {
        const t = (progress - 0.5) / 0.5;
        currentOpacity = 1 - (t * t); 
      } else {
        currentOpacity = 1;
      }

      // Droplets maintain tight radius compared to smoke
      const currentScale = p.scale * (1 + progress * 0.2);

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
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxParticles]} frustumCulled={false}>

      <planeGeometry args={[0.16, 0.16]}>
        <instancedBufferAttribute
          attach="attributes-instanceOpacity"
          args={[opacityArray, 1]}
        />
      </planeGeometry>
      <meshBasicMaterial
        transparent
        map={splashTexture}
        depthWrite={false}
        opacity={0.8}
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
