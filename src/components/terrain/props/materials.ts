import {
  Color,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  type Texture,
  type IUniform,
} from 'three';
import { isMobileDevice } from '@/utils/device';

/**
 * Creates custom foliage material with GPU wind displacement shader.
 */
export function createFoliageWindMaterial(
  tex: Texture,
  baseColor: string,
  isBroadleaf: boolean,
  registerUniforms: (uniforms: Record<string, IUniform>) => void,
): MeshLambertMaterial {
    const isMobile = isMobileDevice();
  const mat = new MeshLambertMaterial({
    map: tex,
    side: isMobile ? FrontSide : DoubleSide,
    alphaTest: isMobile ? 0 : 0.12,
    transparent: false,
    depthWrite: true,
    color: new Color(baseColor),
  });

  mat.customProgramCacheKey = () => {
    return `foliage-wind-${isBroadleaf ? 'broadleaf' : 'conifer'}-${isMobile ? 'mobile' : 'desktop'}`;
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.u_time = { value: 0 };
    shader.uniforms.u_tex = { value: tex };
    registerUniforms(shader.uniforms);

    shader.vertexShader = `
      uniform float u_time;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec2 vFoliageUv;
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vFoliageUv = uv;
      vec3 displaced = transformed;

      vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float heightFactor = clamp(displaced.y / 4.0, 0.1, 1.0);
      float speed = ${isBroadleaf ? '2.4' : '1.8'};
      float sway = ${isBroadleaf ? '0.06' : '0.038'};
      float breeze = sin(u_time * speed + worldOrigin.x * 0.2 + worldOrigin.z * 0.3) * sway * heightFactor;
      displaced.x += breeze;
      displaced.z += breeze * 0.6;

      vec4 mvPosition = vec4( displaced, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );

    shader.fragmentShader = `
      varying vec2 vFoliageUv;
      uniform sampler2D u_tex;
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec4 fTex = texture2D(u_tex, vFoliageUv);

      // Photographic foliage cutout: discard dark background pixels from JPEG texture
      float lum = max(fTex.r, max(fTex.g, fTex.b));
      diffuseColor.a = lum;
      if (lum < 0.08) {
        discard;
      }

      // Branch ambient occlusion (deeper shadow near trunk, sunlit tips)
      float branchAO = mix(0.5, 1.15, vFoliageUv.y);
      diffuseColor.rgb = fTex.rgb * diffuseColor.rgb * 1.55 * branchAO;
      `,
    );
  };

  return mat;
}
