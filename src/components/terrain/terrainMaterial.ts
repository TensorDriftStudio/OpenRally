import {
  MeshStandardMaterial,
  type Texture,
} from 'three';
import { isMobileDevice } from '@/utils/device';
import { SLOPE_DARKENING_STRENGTH } from '@/config/terrainDetail';

export interface TerrainMaterialOptions {
  grassTexture: Texture;
  trackTexture: Texture;
  rockTexture: Texture;
  sandTexture: Texture;
  snowTexture: Texture;
  snowTrackTexture: Texture;
  isDesert: boolean;
  isSnow: boolean;
  isGymkhana?: boolean;
  isMobile?: boolean;
}

/**
 * Custom MeshStandardMaterial with photorealistic multi-texture splatting,
 * triplanar slope projection for cliffs, and damp mud / packed snow track blending.
 */
export function createDetailedTerrainMaterial(options: TerrainMaterialOptions): MeshStandardMaterial {
  const {
    grassTexture,
    trackTexture,
    rockTexture,
    sandTexture,
    snowTexture,
    snowTrackTexture,
    isDesert,
    isSnow,
    isGymkhana = false,
    isMobile = isMobileDevice(),
  } = options;

  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: isSnow ? 0.92 : 0.88,
    metalness: 0.04,
    flatShading: false,
  });

  mat.customProgramCacheKey = () => {
    return `detailed-terrain-${isSnow ? 'snow' : isDesert ? 'desert' : isGymkhana ? 'gymkhana' : 'grass'}-${isMobile ? 'mobile' : 'desktop'}`;
  };

  mat.onBeforeCompile = (shader) => {
    // Add custom uniforms
    shader.uniforms.u_slopeDarkening = { value: SLOPE_DARKENING_STRENGTH };
    shader.uniforms.u_grassTexture = { value: grassTexture };
    shader.uniforms.u_trackTexture = { value: trackTexture };
    shader.uniforms.u_rockTexture = { value: rockTexture };
    shader.uniforms.u_sandTexture = { value: sandTexture };
    shader.uniforms.u_snowTexture = { value: snowTexture };
    shader.uniforms.u_snowTrackTexture = { value: snowTrackTexture };
    shader.uniforms.u_isDesert = { value: isDesert ? 1.0 : 0.0 };
    shader.uniforms.u_isSnow = { value: isSnow ? 1.0 : 0.0 };
    shader.uniforms.u_isGymkhana = { value: isGymkhana ? 1.0 : 0.0 };

    // Inject custom attributes and varyings into vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>
        attribute float trackMask;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying float vTrackMask;
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      /* glsl */ `
        #include <worldpos_vertex>
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
        vTrackMask = trackMask;
      `,
    );

    // Inject multi-texture blending into fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>
        ${isSnow ? '#define BIOME_SNOW 1' : ''}
        ${isDesert ? '#define BIOME_DESERT 1' : ''}
        ${isGymkhana ? '#define BIOME_GYMKHANA 1' : ''}

        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying float vTrackMask;

        uniform float u_slopeDarkening;
        uniform float u_isDesert;
        uniform float u_isSnow;
        uniform float u_isGymkhana;

        uniform sampler2D u_grassTexture;
        uniform sampler2D u_trackTexture;
        uniform sampler2D u_rockTexture;
        uniform sampler2D u_sandTexture;
        uniform sampler2D u_snowTexture;
        uniform sampler2D u_snowTrackTexture;
      `,
    );

    // Base ground and track sampling code generated at compile-time via JS interpolation
    // (eliminates GLSL ES 1.0 #elif incompatibility on TBDR mobile GPUs)
    const mobileBaseGroundCode = isSnow
      ? 'baseGround = texture2D(u_snowTexture, uvMacro).rgb * 1.08;'
      : isDesert
      ? 'baseGround = texture2D(u_sandTexture, uvMacro).rgb;'
      : isGymkhana
      ? 'baseGround = texture2D(u_trackTexture, uvMacro).rgb * vec3(0.28, 0.29, 0.31);'
      : 'baseGround = texture2D(u_grassTexture, uvMacro).rgb;';

    const mobileTrackTexCode = isSnow
      ? 'trackTex = texture2D(u_snowTrackTexture, uvTrackMacro).rgb * vec3(0.92, 0.95, 1.0);'
      : isGymkhana
      ? 'trackTex = texture2D(u_trackTexture, uvTrackMacro).rgb * vec3(0.35, 0.36, 0.38);'
      : 'trackTex = texture2D(u_trackTexture, uvTrackMacro).rgb * vec3(0.95, 0.90, 0.85);';

    const desktopBaseGroundCode = isSnow
      ? `vec3 snowMacro = texture2D(u_snowTexture, uvMacro).rgb;
        vec3 snowMicro = texture2D(u_snowTexture, uvMicro).rgb;
        baseGround = mix(snowMacro, snowMicro, 0.5) * 1.08;`
      : isDesert
      ? `vec3 sandMacro = texture2D(u_sandTexture, uvMacro).rgb;
        vec3 sandMicro = texture2D(u_sandTexture, uvMicro).rgb;
        baseGround = mix(sandMacro, sandMicro, 0.5);`
      : isGymkhana
      ? `vec3 asphaltMacro = texture2D(u_trackTexture, uvMacro).rgb;
        vec3 asphaltMicro = texture2D(u_trackTexture, uvMicro).rgb;
        baseGround = mix(asphaltMacro, asphaltMicro, 0.5) * vec3(0.28, 0.29, 0.31);`
      : `vec3 grassMacro = texture2D(u_grassTexture, uvMacro).rgb;
        vec3 grassMicro = texture2D(u_grassTexture, uvMicro).rgb;
        baseGround = mix(grassMacro, grassMicro, 0.5);`;

    const desktopTrackTexCode = isSnow
      ? `vec3 snowTrkMacro = texture2D(u_snowTrackTexture, uvTrackMacro).rgb;
        vec3 snowTrkMicro = texture2D(u_snowTrackTexture, uvTrackMicro).rgb;
        trackTex = mix(snowTrkMacro, snowTrkMicro, 0.5) * vec3(0.92, 0.95, 1.0);`
      : isGymkhana
      ? `vec3 trackMacro = texture2D(u_trackTexture, uvTrackMacro).rgb;
        vec3 trackMicro = texture2D(u_trackTexture, uvTrackMacro).rgb;
        trackTex = mix(trackMacro, trackMicro, 0.5) * vec3(0.35, 0.36, 0.38) * 1.15;`
      : `vec3 trackMacro = texture2D(u_trackTexture, uvTrackMacro).rgb;
        vec3 trackMicro = texture2D(u_trackTexture, uvTrackMicro).rgb;
        trackTex = mix(trackMacro, trackMicro, 0.5) * vec3(0.95, 0.90, 0.85);`;

    // Apply texture splatting after diffuse color is computed
    const mobileFragmentChunk = /* glsl */ `
        #include <color_fragment>

        // Mobile optimized fast ground sampling: 1 macro UV lookup for ground & track (compile-time specialized)
        vec2 uvMacro = vWorldPosition.xz * 0.055;
        vec3 baseGround;
        ${mobileBaseGroundCode}

        // Fast track lookup
        vec2 uvTrackMacro = vWorldPosition.xz * 0.08;
        vec3 trackTex;
        ${mobileTrackTexCode}

        // Blend base ground with track
        vec3 blendedAlbedo = mix(baseGround, trackTex, clamp(vTrackMask * 1.25, 0.0, 1.0));

        // Fast cliff shading without expensive 3-pass triplanar mapping
        float slope = 1.0 - abs(vWorldNormal.y);
        float rockFactor = smoothstep(0.30, 0.65, slope);
        if (rockFactor > 0.01) {
          vec3 rockTex = texture2D(u_rockTexture, vWorldPosition.xz * 0.22).rgb;
          ${isSnow ? 'rockTex = mix(rockTex * 0.85, vec3(0.95, 0.98, 1.0), clamp(vWorldNormal.y * 0.6, 0.0, 0.6));' : ''}
          blendedAlbedo = mix(blendedAlbedo, rockTex, rockFactor);
        }

        diffuseColor.rgb = blendedAlbedo;
        float slopeFactor = 1.0 - slope * (u_slopeDarkening * 0.75);
        diffuseColor.rgb *= slopeFactor;
    `;

    const desktopFragmentChunk = /* glsl */ `
        #include <color_fragment>

        // Dual-frequency texture coordinates with anti-tiling octave rotation (realistic ~3.5m micro, ~18m macro)
        vec2 uvMacro = vWorldPosition.xz * 0.055;
        vec2 uvMicro = mat2(0.866, -0.5, 0.5, 0.866) * (vWorldPosition.xz * 0.28);

        // Base biome ground texture sampling (compile-time specialized)
        vec3 baseGround;
        ${desktopBaseGroundCode}

        // Rally track dirt/mud/packed snow texture sampling with subtle color grading
        vec2 uvTrackMacro = vWorldPosition.xz * 0.08;
        vec2 uvTrackMicro = mat2(0.866, -0.5, 0.5, 0.866) * (vWorldPosition.xz * 0.35);
        vec3 trackTex;
        ${desktopTrackTexCode}

        // Blend base ground with track
        vec3 blendedAlbedo = mix(baseGround, trackTex, clamp(vTrackMask * 1.25, 0.0, 1.0));

        // Triplanar rock mapping on steep slopes / cliffs (prevents vertical texture stretching)
        vec3 normalWeights = pow(abs(vWorldNormal), vec3(4.0));
        normalWeights /= max(0.0001, normalWeights.x + normalWeights.y + normalWeights.z);

        vec3 rockTexX = texture2D(u_rockTexture, vWorldPosition.zy * 0.22).rgb;
        vec3 rockTexY = texture2D(u_rockTexture, vWorldPosition.xz * 0.22).rgb;
        vec3 rockTexZ = texture2D(u_rockTexture, vWorldPosition.xy * 0.22).rgb;
        vec3 triplanarRock = rockTexX * normalWeights.x + rockTexY * normalWeights.y + rockTexZ * normalWeights.z;

        // In snow biome, cliff rocks have snow dusting on flatter micro-surfaces
        ${isSnow ? 'triplanarRock = mix(triplanarRock * 0.85, vec3(0.95, 0.98, 1.0), clamp(vWorldNormal.y * 0.6, 0.0, 0.6));' : ''}

        // Slope calculation: 0 = flat plane, 1 = vertical cliff
        float slope = 1.0 - abs(vWorldNormal.y);
        float rockFactor = smoothstep(0.28, 0.62, slope);
        blendedAlbedo = mix(blendedAlbedo, triplanarRock, rockFactor);

        // Use natural vibrant texture albedo directly with subtle macro-lighting
        diffuseColor.rgb = blendedAlbedo;

        // Slope darkening — ambient occlusion on steep crevices
        float slopeFactor = 1.0 - slope * (u_slopeDarkening * 0.75);
        diffuseColor.rgb *= slopeFactor;
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      isMobile ? mobileFragmentChunk : desktopFragmentChunk,
    );

    // Modulate roughness: damp mud/packed snow on tracks have glossy specular sheen
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      /* glsl */ `
        #include <roughnessmap_fragment>
        float trackGloss = clamp(vTrackMask * 1.25, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.52, trackGloss);
      `,
    );

    if (!isMobile) {
      // Procedural micro-relief normal perturbation from texture luminance gradients without polygon face-normal artifacts
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
          #include <normal_fragment_maps>
          float microLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 dPdx = dFdx(vWorldPosition);
          vec3 dPdy = dFdy(vWorldPosition);
          float dhx = dFdx(microLum) * 0.20;
          float dhy = dFdy(microLum) * 0.20;
          vec3 grad = dPdx * dhx + dPdy * dhy;
          vec3 bumpWorld = normalize(vWorldNormal - grad);
          vec3 bumpView = normalize((viewMatrix * vec4(bumpWorld, 0.0)).xyz);
          normal = normalize(mix(normal, bumpView, 0.12));
        `,
      );
    }
  };

  mat.customProgramCacheKey = () =>
    `terrain-${isMobile ? 'm' : 'd'}-${isDesert ? 'des' : isSnow ? 'sno' : isGymkhana ? 'gym' : 'std'}`;

  return mat;
}
