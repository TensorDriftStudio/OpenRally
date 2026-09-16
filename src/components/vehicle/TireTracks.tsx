import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import type { RapierRigidBody } from '@react-three/rapier';
import {
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  DoubleSide,
} from 'three';
import { useTireTracksLogic } from '@/hooks/useTireTracksLogic';

interface TireTracksProps {
  wheelsRef: React.RefObject<(Object3D | null)[]>;
  chassisRef: React.RefObject<RapierRigidBody | null>;
}

/**
 * Enterprise-grade continuous ribbon tire tracks.
 * Renders 4 dynamic triangle strips with soft edge feathering,
 * surface-color tinting, continuous UV mapping, and terrain conformance.
 */
export function TireTracks({ wheelsRef, chassisRef }: TireTracksProps) {
  // Load AI-generated high-definition rally tire tread texture
  const trackTexture = useTexture('/textures/tire_track.png');

  useMemo(() => {
    trackTexture.wrapS = RepeatWrapping;
    trackTexture.wrapT = RepeatWrapping;
    trackTexture.needsUpdate = true;
  }, [trackTexture]);

  const { meshRefs, geometries } = useTireTracksLogic(wheelsRef, chassisRef);

  // High-performance ShaderMaterial extracting tread patterns and applying edge feathering
  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        uTexture: { value: trackTexture },
      },
      vertexShader: /* glsl */ `
        attribute float ribbonAlpha;
        attribute vec3 color;
        
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
          vUv = uv;
          vAlpha = ribbonAlpha;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
          // Soft edge feathering across tire width to prevent hard polygonal edges
          float edgeFeather = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
          
          vec4 texSample = texture2D(uTexture, vUv);
          
          // Luminance-based tread mask (dark tire rubber -> high alpha, white background -> 0 alpha)
          float luminance = dot(texSample.rgb, vec3(0.299, 0.587, 0.114));
          float treadAlpha = clamp((0.85 - luminance) / 0.65, 0.0, 1.0);
          
          // Include texture alpha if present
          if (texSample.a > 0.05 && texSample.a < 0.95) {
            treadAlpha = max(treadAlpha, texSample.a);
          }
          
          // Subtle base contact strip across entire width
          float baseStrip = smoothstep(0.04, 0.15, vUv.x) * smoothstep(0.96, 0.85, vUv.x) * 0.35;
          float patternAlpha = clamp(treadAlpha + baseStrip, 0.0, 1.0);
          
          float finalAlpha = patternAlpha * vAlpha * edgeFeather;
          gl_FragColor = vec4(vColor, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -3,
    });
  }, [trackTexture]);

  return (
    <group frustumCulled={false}>
      {geometries.map((geo, index) => (
        <mesh
          key={index}
          ref={meshRefs[index]}
          geometry={geo}
          material={material}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
