import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  PlaneGeometry,
  Vector2,
  DataTexture,
  RedFormat,
  FloatType,
  MeshStandardMaterial,
  Mesh,
  LinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type IUniform,
} from 'three';
import { useTexture } from '@react-three/drei';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useSettingsStore } from '@/store/settingsStore';
import { isMobileDevice, getClampedAnisotropy } from '@/utils/device';
import {
  WATER_COLOR,
  WATER_SIZE,
  WATER_POSITION_Y,
  WATER_SEGMENTS,
  WATER_WAVE_SPEED,
  WATER_DEPTH_THRESHOLD,
  WATER_FOAM_THRESHOLD,
  WATER_FOAM_COLOR,
  WATER_SHALLOW_COLOR,
} from '@/config/water';

/**
 * Photorealistic PBR Ocean & Frozen Lake with analytical wave/ice normals,
 * smooth depth grading (tropical turquoise shore to deep sapphire ocean, or glacial blue ice),
 * soft shoreline foam/frost, and physically balanced sun/sky specular reflections.
 */
export function Ocean() {
  const { levelPreset } = useTerrainData();
  const hasWater = levelPreset.environment?.hasWater ?? true;

  if (!hasWater) {
    return null;
  }

  return <OceanContent />;
}

function OceanContent() {
  const waterRef = useRef<Mesh>(null);
  const { heightmapData, levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const levelId = levelData.id.toLowerCase();
  const isSnow = levelId.includes('sweden') || levelId.includes('snow') || levelId.includes('winter');

  // Lightweight 68-byte placeholder texture to substitute unneeded ice texture on temperate/desert stages
  const icePath = isSnow ? '/textures/terrain/ice_lake.jpg' : '/textures/placeholder.png';
  const [iceTexture] = useTexture([icePath]);

  useMemo(() => {
    const isMobile = isMobileDevice();
    iceTexture.wrapS = RepeatWrapping;
    iceTexture.wrapT = RepeatWrapping;
    iceTexture.colorSpace = SRGBColorSpace;
    iceTexture.anisotropy = getClampedAnisotropy(8, isMobile);
    iceTexture.needsUpdate = true;
  }, [iceTexture]);

  const segmentsCount = graphicsQuality === 'low' ? 64 : graphicsQuality === 'medium' ? 128 : WATER_SEGMENTS;

  const terrainHeightmap = useMemo(() => {
    const texture = new DataTexture(
      heightmapData.heights,
      heightmapData.cols,
      heightmapData.rows,
      RedFormat,
      FloatType
    );
    const isMobile = isMobileDevice();
    texture.minFilter = isMobile ? NearestFilter : LinearFilter;
    texture.magFilter = isMobile ? NearestFilter : LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [heightmapData]);

  const waterMesh = useMemo(() => {
    // On mobile, clamp segments to 8 (128 tris) since wave motion is 100% in fragment shader with 0 vertex displacement;
    // On desktop, clamp to 32 (2,048 tris) to eliminate over 125,000 redundant vertices without any visual degradation
    const effectiveSegments = isMobileDevice() ? Math.min(segmentsCount, 8) : Math.min(segmentsCount, 32);
    const geometry = new PlaneGeometry(
      WATER_SIZE,
      WATER_SIZE,
      effectiveSegments,
      effectiveSegments,
    );

    const commonUniforms = {
      time: { value: 0 },
      u_terrainHeightmap: { value: terrainHeightmap },
      u_terrainSize: { value: new Vector2(levelData.terrainBase.width, levelData.terrainBase.depth) },
      u_foamColor: { value: WATER_FOAM_COLOR },
      u_shallowColor: { value: WATER_SHALLOW_COLOR },
      u_depthThreshold: { value: WATER_DEPTH_THRESHOLD },
      u_foamThreshold: { value: WATER_FOAM_THRESHOLD },
      u_iceTexture: { value: iceTexture },
      u_isSnow: { value: isSnow ? 1.0 : 0.0 },
      u_isMobile: { value: isMobileDevice() ? 1.0 : 0.0 },
    };

    const material = new MeshStandardMaterial({
      color: isSnow ? '#88b5d3' : WATER_COLOR,
      roughness: isSnow ? 0.12 : 0.16,
      metalness: 0.0,
      flatShading: false,
    });

    const isMobile = isMobileDevice();

    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_POSITION_Y;
    mesh.renderOrder = 1;

    material.customProgramCacheKey = () => {
      return `openrally-ocean-${isSnow ? 'snow' : 'water'}-${isMobile ? 'mobile' : 'desktop'}`;
    };

    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      Object.assign(shader.uniforms, commonUniforms);
      material.userData.shader = shader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vWorldPos;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float time;
        uniform sampler2D u_terrainHeightmap;
        uniform vec2 u_terrainSize;
        
        uniform vec3 u_foamColor;
        uniform vec3 u_shallowColor;
        uniform float u_depthThreshold;
        uniform float u_foamThreshold;
        uniform sampler2D u_iceTexture;
        uniform float u_isSnow;
        uniform float u_isMobile;
        
        varying vec3 vWorldPos;

        ${isMobile ? /* glsl */ `
        // Ultra-fast analytical wave normal for mobile devices:
        // Eliminates 15 procedural Simplex noise evaluations per fragment while preserving rich hydrodynamic ripple motion.
        vec3 getMobileWaterNormal(vec2 p, float t, float viewDist) {
          float distFade = clamp(viewDist / 320.0, 0.0, 1.0);
          float waveStrength = mix(0.24, 0.03, distFade);

          // Wave train 1: primary oceanic swell
          vec2 dir1 = vec2(0.707, 0.707);
          float phase1 = dot(p, dir1) * 0.22 + t * 1.35;
          float c1 = cos(phase1) * 0.18;

          // Wave train 2: cross choppy ripple
          vec2 dir2 = vec2(-0.45, 0.89);
          float phase2 = dot(p, dir2) * 0.50 - t * 1.85;
          float c2 = cos(phase2) * 0.09;

          // Wave train 3: high-frequency surface shimmer
          vec2 dir3 = vec2(0.85, -0.52);
          float phase3 = dot(p, dir3) * 1.15 + t * 2.4;
          float c3 = cos(phase3) * (0.04 * (1.0 - distFade * 0.8));

          float dX = dir1.x * c1 + dir2.x * c2 + dir3.x * c3;
          float dZ = dir1.y * c1 + dir2.y * c2 + dir3.y * c3;

          return normalize(vec3(-dX * waveStrength, 1.0, -dZ * waveStrength));
        }
        ` : /* glsl */ `
        // Fast 2D Simplex/Perlin Gradient Noise for natural organic water turbulence (desktop)
        vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
            mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float waterHeight(vec2 p, float t, float distFade) {
          vec2 q = vec2(
            noise2D(p * 0.14 + vec2(t * 0.14, t * 0.09)),
            noise2D(p * 0.14 + vec2(-t * 0.11, t * 0.16) + vec2(5.2, 1.3))
          );

          vec2 r = p * 0.28 + q * 0.65 + vec2(t * 0.22, -t * 0.18);
          float h1 = noise2D(r) * 0.5;
          float h2 = noise2D(r * 2.2 - vec2(t * 0.32, t * 0.25)) * (0.25 * (1.0 - distFade * 0.7));
          float h3 = noise2D(r * 4.2 + vec2(-t * 0.55, t * 0.42)) * (0.12 * (1.0 - distFade * 0.95));

          return h1 + h2 + h3;
        }

        vec3 getOrganicWaterNormal(vec2 p, float t, float viewDist) {
          float distFade = clamp(viewDist / 300.0, 0.0, 1.0);
          float eps = mix(0.15, 0.65, distFade);
          float hC = waterHeight(p, t, distFade);
          float hR = waterHeight(p + vec2(eps, 0.0), t, distFade);
          float hU = waterHeight(p + vec2(0.0, eps), t, distFade);

          float dX = (hR - hC) / eps;
          float dZ = (hU - hC) / eps;

          float waveStrength = mix(0.24, 0.03, distFade);
          return normalize(vec3(-dX * waveStrength, 1.0, -dZ * waveStrength));
        }
        `}
        `
      );

      // Wave normal perturbation with distance anti-aliasing (frozen ice is smooth plane)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>

        vec3 waveNormalWorld;
        if (u_isSnow > 0.5) {
          waveNormalWorld = vec3(0.0, 1.0, 0.0);
        } else {
          float viewDist = length(vWorldPos - cameraPosition);
          waveNormalWorld = ${isMobile ? 'getMobileWaterNormal(vWorldPos.xz, time * 1.1, viewDist);' : 'getOrganicWaterNormal(vWorldPos.xz, time * 1.1, viewDist);'}
        }
        normal = normalize(mat3(viewMatrix) * waveNormalWorld);
        `
      );

      // Depth gradient and shoreline foam / frost integrated cleanly into PBR diffuse albedo
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        
        vec2 terrainUv = vec2(
          (vWorldPos.x + u_terrainSize.x * 0.5) / u_terrainSize.x,
          (vWorldPos.z + u_terrainSize.y * 0.5) / u_terrainSize.y
        );
        
        // Sample terrain height with smooth bilinear interpolation
        float terrainHeight = texture2D(u_terrainHeightmap, clamp(terrainUv, 0.0, 1.0)).r;

        // Outside map bounds transition seamlessly to deep sea floor (-75m)
        vec2 boxDist = max(vec2(0.0), abs(terrainUv - 0.5) * 2.0 - vec2(1.0));
        float distOutside = length(boxDist * u_terrainSize * 0.5);
        terrainHeight = mix(terrainHeight, -75.0, clamp(distOutside / 40.0, 0.0, 1.0));

        float waterDepth = max(0.0, vWorldPos.y - terrainHeight);
        
        if (u_isSnow > 0.5) {
          vec2 iceUvMacro = vWorldPos.xz * 0.04;
          vec2 iceUvMicro = mat2(0.866, -0.5, 0.5, 0.866) * (vWorldPos.xz * 0.18);
          vec3 iceMacro = texture2D(u_iceTexture, iceUvMacro).rgb;
          vec3 iceMicro = texture2D(u_iceTexture, iceUvMicro).rgb;
          vec3 iceTex = mix(iceMacro, iceMicro, 0.5);

          float depthFactor = smoothstep(0.0, u_depthThreshold * 1.5, waterDepth);
          vec3 iceAlbedo = mix(vec3(0.72, 0.84, 0.94), iceTex, depthFactor);

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(clamp(1.0 - max(0.0, dot(vec3(0.0, 1.0, 0.0), viewDir)), 0.0, 1.0), 3.0);
          vec3 skyReflection = mix(vec3(0.75, 0.88, 1.0), vec3(0.95, 0.98, 1.0), fresnel);
          iceAlbedo = mix(iceAlbedo, skyReflection, fresnel * 0.55);

          float shoreFrost = 0.0;
          if (waterDepth < u_foamThreshold * 1.8) {
            shoreFrost = smoothstep(0.65, 0.0, waterDepth / (u_foamThreshold * 1.8));
          }
          diffuseColor.rgb = mix(iceAlbedo, vec3(0.95, 0.98, 1.0), shoreFrost * 0.7);
        } else {
          // Depth gradient: 0 = shallow turquoise shore, 1 = deep sapphire ocean
          float depthFactor = smoothstep(0.0, u_depthThreshold, waterDepth);
          vec3 waterAlbedo = mix(u_shallowColor, diffuseColor.rgb, depthFactor);

          // Realistic Fresnel reflection: glancing angles reflect the sky bright blue
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(clamp(1.0 - max(0.0, dot(vec3(0.0, 1.0, 0.0), viewDir)), 0.0, 1.0), 3.5);
          vec3 skyReflection = mix(vec3(0.55, 0.75, 0.98), vec3(0.88, 0.95, 1.0), fresnel);
          waterAlbedo = mix(waterAlbedo, skyReflection, fresnel * 0.42);

          // Soft shoreline foam
          float foamFactor = 0.0;
          if (waterDepth < u_foamThreshold) {
            float shoreDist = waterDepth / u_foamThreshold;
            foamFactor = smoothstep(0.55, 0.05, shoreDist);
          }

          diffuseColor.rgb = mix(waterAlbedo, u_foamColor, foamFactor * 0.55);
        }
        `
      );

      // Specular roughness: smooth glossy frozen ice lake or silky ocean horizon
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        if (u_isSnow > 0.5) {
          roughnessFactor = 0.10;
        } else {
          float distToCam = length(vWorldPos - cameraPosition);
          roughnessFactor = mix(0.16, 0.42, clamp(distToCam / 450.0, 0.0, 1.0));
        }
        `
      );
    };

    return mesh;
  }, [terrainHeightmap, levelData, segmentsCount, iceTexture, isSnow]);

  // Explicitly dispose GPU resources (textures, geometries, materials) on unmount
  // to prevent VRAM accumulation because <primitive /> bypasses R3F auto-disposal.
  // terrainHeightmap is decoupled from waterMesh so graphics quality changes
  // do not inadvertently dispose the shared heightmap texture while the stage is active.
  useEffect(() => {
    return () => {
      terrainHeightmap.dispose();
    };
  }, [terrainHeightmap]);

  useEffect(() => {
    return () => {
      waterMesh.geometry.dispose();
      if (Array.isArray(waterMesh.material)) {
        waterMesh.material.forEach((m) => m.dispose());
      } else {
        waterMesh.material.dispose();
      }
    };
  }, [waterMesh]);

  useFrame((state, delta) => {
    // Anchor ocean directly under camera to give infinite ocean horizon
    if (waterRef.current) {
      waterRef.current.position.x = state.camera.position.x;
      waterRef.current.position.z = state.camera.position.z;
    }

    const mat = waterMesh.material as {
      userData?: {
        shader?: {
          uniforms: {
            time: IUniform<number>;
          };
        };
      };
    };

    if (mat.userData && mat.userData.shader) {
      const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 60;
      mat.userData.shader.uniforms.time.value += safeDelta * WATER_WAVE_SPEED;
    }
  });

  return <primitive ref={waterRef} object={waterMesh} />;
}
