import { useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  Object3D,
  DoubleSide,
  FrontSide,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  MeshLambertMaterial,
  InstancedMesh,
  RepeatWrapping,
  SRGBColorSpace,
  type IUniform,
} from 'three';
import { useTexture } from '@react-three/drei';
import { createNoise2D } from 'simplex-noise';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { mapRange } from '@/utils/math';
import { isMobileDevice, getClampedAnisotropy } from '@/utils/device';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import {
  GRASS_HEIGHT_MIN,
  GRASS_HEIGHT_MAX,
  WIND_SPEED,
  WIND_STRENGTH,
  GRASS_MAX_TERRAIN_HEIGHT,
  GRASS_CLEARING_RADIUS,
  GRASS_EDGE_MARGIN,
  GRASS_COLOR_LIGHT,
  GRASS_COLOR_DARK,
  DESERT_GRASS_COLOR_LIGHT,
  DESERT_GRASS_COLOR_DARK,
  GRASS_CHUNKS,
  GRASS_CHUNKS_MOBILE,
  GRASS_FADE_RANGE,
} from '@/config/grass';

/**
 * Creates a volumetric 3D grass cluster geometry with tapered cards
 * and upward-biased smooth hemisphere normals for rich ambient light distribution.
 *
 * @param isMobile - When true, uses 2 crossed cards with optimized vertex budget for mobile TBDR GPUs.
 */
export function createGrassTuftGeometry(isMobile: boolean = false): BufferGeometry {
  const verts: number[] = [];
  const tips: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  const NUM_CARDS = isMobile ? 2 : 3;
  const WIDTH = isMobile ? 0.58 : 0.55;
  const HEIGHT = 0.52;

  for (let c = 0; c < NUM_CARDS; c++) {
    const angle = (c * Math.PI) / NUM_CARDS;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const halfW = WIDTH * 0.5;
    const pX = -sinA * halfW;
    const pZ = cosA * halfW;

    const lean = 0.08;
    const leanX = cosA * lean;
    const leanZ = sinA * lean;

    // Segment 0: Base (Y = 0) - full width
    const bLX = -pX, bY = 0.0, bLZ = -pZ;
    const bRX = pX, bRZ = pZ;

    // Segment 1: Mid (Y = HEIGHT * 0.5) - tapered to 68%
    const midH = HEIGHT * 0.5;
    const mLX = -pX * 0.68 + leanX * 0.3, mY = midH, mLZ = -pZ * 0.68 + leanZ * 0.3;
    const mRX = pX * 0.68 + leanX * 0.3, mRZ = pZ * 0.68 + leanZ * 0.3;

    // Segment 2: Tip (Y = HEIGHT) - naturally tapered aerodynamic blade tips (18% width)
    const tLX = -pX * 0.18 + leanX, tY = HEIGHT, tLZ = -pZ * 0.18 + leanZ;
    const tRX = pX * 0.18 + leanX, tRZ = pZ * 0.18 + leanZ;

    // Upward-biased soft hemisphere normal (all ny >= 0.85 for ambient distribution)
    const nX_b = cosA * 0.15, nY_b = 0.88, nZ_b = sinA * 0.15;
    const nX_m = cosA * 0.10, nY_m = 0.93, nZ_m = sinA * 0.10;
    const nX_t = cosA * 0.05, nY_t = 0.98, nZ_t = sinA * 0.05;

    // Quad lower
    verts.push(bLX, bY, bLZ,  bRX, bY, bRZ,  mRX, mY, mRZ);
    tips.push(0.0, 0.0, 0.5);
    uvs.push(0.0, 0.0,  1.0, 0.0,  0.84, 0.5);
    normals.push(nX_b, nY_b, nZ_b,  nX_b, nY_b, nZ_b,  nX_m, nY_m, nZ_m);

    verts.push(bLX, bY, bLZ,  mRX, mY, mRZ,  mLX, mY, mLZ);
    tips.push(0.0, 0.5, 0.5);
    uvs.push(0.0, 0.0,  0.84, 0.5,  0.16, 0.5);
    normals.push(nX_b, nY_b, nZ_b,  nX_m, nY_m, nZ_m,  nX_m, nY_m, nZ_m);

    // Quad upper
    verts.push(mLX, mY, mLZ,  mRX, mY, mRZ,  tRX, tY, tRZ);
    tips.push(0.5, 0.5, 1.0);
    uvs.push(0.16, 0.5,  0.84, 0.5,  0.59, 1.0);
    normals.push(nX_m, nY_m, nZ_m,  nX_m, nY_m, nZ_m,  nX_t, nY_t, nZ_t);

    verts.push(mLX, mY, mLZ,  tRX, tY, tRZ,  tLX, tY, tLZ);
    tips.push(0.5, 1.0, 1.0);
    uvs.push(0.16, 0.5,  0.59, 1.0,  0.41, 1.0);
    normals.push(nX_m, nY_m, nZ_m,  nX_t, nY_t, nZ_t,  nX_t, nY_t, nZ_t);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('bladeTip', new Float32BufferAttribute(new Float32Array(tips), 1));
  geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('normal', new Float32BufferAttribute(new Float32Array(normals), 3));

  return geo;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getSeededRandomFn(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GrassChunkData {
  matrices: number[][];
  colors: Color[];
  center: Vector3;
  radiusXZ: number;
}

interface GrassChunkMeshProps {
  index: number;
  geometry: BufferGeometry;
  material: MeshLambertMaterial;
  chunk: GrassChunkData;
  onMeshRegister: (index: number, mesh: InstancedMesh | null) => void;
}

function GrassChunkMesh({ index, geometry, material, chunk, onMeshRegister }: GrassChunkMeshProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const count = chunk.matrices.length;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      dummy.matrix.fromArray(chunk.matrices[i]);
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, chunk.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();

    onMeshRegister(index, mesh);
    return () => onMeshRegister(index, null);
  }, [chunk, count, index, onMeshRegister]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled
    />
  );
}

export function GrassField() {
  const storeQuality = useSettingsStore((s) => s.graphicsQuality);
  const graphicsQuality = useSettingsStore.getState().graphicsQuality ?? storeQuality;

  // In Low graphics mode on mobile (or generally when graphicsQuality === 'low'),
  // completely disable grass rendering to eliminate all grass clusters, 36 draw calls,
  // and fill-rate-destroying fragment alpha discard penalty
  if (graphicsQuality === 'low') {
    return null;
  }

  return <GrassFieldContent />;
}

function GrassFieldContent() {
  const { heightmapData, levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const levelId = levelData.id.toLowerCase();
  const isDesert = levelId.includes('desert');
  const isSnow = levelId.includes('sweden') || levelId.includes('snow') || levelId.includes('winter');

  // Lightweight 68-byte placeholder texture to substitute unneeded foliage textures per biome,
  // saving over 8MB VRAM and eliminating redundant image decoding spikes on mobile devices.
  const BLANK = '/textures/placeholder.png';
  const grassTuftPath = !isDesert ? '/textures/foliage/grass_tuft.jpg' : BLANK;
  const wildflowerPath = (!isDesert && !isSnow) ? '/textures/foliage/wildflower_tuft.jpg' : BLANK;
  const desertTuftPath = isDesert ? '/textures/foliage/desert_tuft.jpg' : BLANK;

  // Load photorealistic foliage textures (biome-tailored to eliminate unnecessary VRAM consumption)
  const [grassTuftTex, wildflowerTex, desertTuftTex] = useTexture([
    grassTuftPath,
    wildflowerPath,
    desertTuftPath,
  ]);

  useMemo(() => {
    const isMobile = isMobileDevice();
    const anisotropy = getClampedAnisotropy(4, isMobile);
    [grassTuftTex, wildflowerTex, desertTuftTex].forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.needsUpdate = true;
    });
  }, [grassTuftTex, wildflowerTex, desertTuftTex]);

  const shaderUniformsRef = useRef<Record<string, IUniform>[]>([]);
  const carPosRef = useRef(new Vector3(0, 0, 0));

  const frameCountRef = useRef(0);
  const lastCamPosRef = useRef(new Vector3(9999, 9999, 9999));
  const lastDistRef = useRef(-1);

  // References to instanced meshes for LOD culling
  const meshRefs = useRef<(InstancedMesh | null)[]>([]);

  const registerMesh = useCallback((index: number, mesh: InstancedMesh | null) => {
    meshRefs.current[index] = mesh;
  }, []);

  const { chunksData, geometry } = useMemo(() => {
    const { heights, trackMasks, rows, cols, minHeight, maxHeight } = heightmapData;
    const mapWidth = levelData.terrainBase.width;
    const mapDepth = levelData.terrainBase.depth;

    const dummy = new Object3D();
    const tempColor = new Color();
    const rng = getSeededRandomFn(999);
    const clumpNoise = createNoise2D(rng);

    const isMobile = isMobileDevice();
    const activeChunks = isMobile ? GRASS_CHUNKS_MOBILE : GRASS_CHUNKS;
    const chunkWidth = mapWidth / activeChunks;
    const chunkDepth = mapDepth / activeChunks;
    const chunkRadiusXZ = Math.hypot(chunkWidth * 0.5, chunkDepth * 0.5);

    const isBritain = levelId.includes('britain') || levelId.includes('highland');

    const BRITAIN_GRASS_DARK = new Color('#2a4519');
    const BRITAIN_GRASS_LIGHT = new Color('#637f2c');
    const BRITAIN_HEATHER_1 = new Color('#8e3c7d');
    const BRITAIN_HEATHER_2 = new Color('#682b5e');
    const BRITAIN_HEATHER_3 = new Color('#a25191');

    const darkColor = isDesert ? DESERT_GRASS_COLOR_DARK : isBritain ? BRITAIN_GRASS_DARK : GRASS_COLOR_DARK;
    const lightColor = isDesert ? DESERT_GRASS_COLOR_LIGHT : isBritain ? BRITAIN_GRASS_LIGHT : GRASS_COLOR_LIGHT;

    // Initialize chunks: 9 chunks (3x3, GRASS_CHUNKS_MOBILE) on mobile TBDR GPUs for low draw call overhead, 36 chunks (6x6, GRASS_CHUNKS) on desktop for fine-grained culling
    const chunks: GrassChunkData[] = Array.from({ length: activeChunks * activeChunks }, () => ({
      matrices: [],
      colors: [],
      center: new Vector3(),
      radiusXZ: chunkRadiusXZ,
    }));

    let placed = 0;
    let attempt = 0;

    const baseCount =
      isSnow || graphicsQuality === 'low'
        ? 0
        : isMobile
        ? graphicsQuality === 'medium'
          ? 3000
          : graphicsQuality === 'high'
          ? 3800
          : 4800
        : graphicsQuality === 'medium'
        ? 36000
        : graphicsQuality === 'high'
        ? 72000
        : 105000;

    const targetGrassCount = isBritain ? Math.floor(baseCount * 1.3) : baseCount;
    const maxAttempts = targetGrassCount * 8;

    while (placed < targetGrassCount && attempt < maxAttempts) {
      attempt++;
      const seed = attempt * 7 + 13;

      const x = (seededRandom(seed) - 0.5) * mapWidth * GRASS_EDGE_MARGIN;
      const z = (seededRandom(seed + 1) - 0.5) * mapDepth * GRASS_EDGE_MARGIN;

      const noiseVal = clumpNoise(x * 0.05, z * 0.05);
      if (noiseVal < -0.18) continue;

      if (Math.abs(x) < GRASS_CLEARING_RADIUS && Math.abs(z) < GRASS_CLEARING_RADIUS) continue;

      // Track mask check - prevent grass on the muddy track
      const nx = (x + mapWidth / 2) / mapWidth;
      const nz = (z + mapDepth / 2) / mapDepth;
      const col = Math.floor(nx * (cols - 1));
      const row = Math.floor(nz * (rows - 1));
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        if (trackMasks[row * cols + col] > 0.1) continue;
      }

      const y = getInterpolatedHeight(x, z, heights, rows, cols, mapWidth, mapDepth);
      const normalizedHeight = mapRange(y, minHeight, maxHeight, 0, 1);
      if (normalizedHeight > GRASS_MAX_TERRAIN_HEIGHT) continue;
      if (y < -5) continue;

      const patchScale = mapRange(noiseVal, -0.18, 1.0, 0.7, 1.4) * (isMobile ? 1.25 : 1.0);
      const heightBonus = isBritain ? 1.25 : 1.0;
      const scaleY =
        (GRASS_HEIGHT_MIN + seededRandom(seed + 2) * (GRASS_HEIGHT_MAX - GRASS_HEIGHT_MIN)) *
        patchScale *
        heightBonus;
      const scaleXZ = (0.8 + seededRandom(seed + 3) * 0.6) * patchScale;
      const rotY = seededRandom(seed + 4) * Math.PI * 2;

      dummy.position.set(x, y - 0.03, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      dummy.updateMatrix();

      const colorT = seededRandom(seed + 5);
      if (isBritain && seededRandom(seed + 6) < 0.28) {
        // Scottish heather purple flower clusters
        const heatherSeed = seededRandom(seed + 7);
        if (heatherSeed < 0.4) {
          tempColor.copy(BRITAIN_HEATHER_1);
        } else if (heatherSeed < 0.75) {
          tempColor.copy(BRITAIN_HEATHER_2);
        } else {
          tempColor.copy(BRITAIN_HEATHER_3);
        }
      } else {
        tempColor.lerpColors(darkColor, lightColor, colorT);
      }

      // Determine chunk
      let cx = Math.floor((x + mapWidth / 2) / chunkWidth);
      let cz = Math.floor((z + mapDepth / 2) / chunkDepth);
      cx = Math.max(0, Math.min(activeChunks - 1, cx));
      cz = Math.max(0, Math.min(activeChunks - 1, cz));

      const chunkIdx = cz * activeChunks + cx;
      chunks[chunkIdx].matrices.push(Array.from(dummy.matrix.elements));
      chunks[chunkIdx].colors.push(tempColor.clone());

      placed++;
    }

    // Calculate chunk centers and conservative bounding radius for distance-based culling
    chunks.forEach((chunk, idx) => {
      if (chunk.matrices.length === 0) return;
      const cz = Math.floor(idx / activeChunks);
      const cx = idx % activeChunks;
      chunk.center.set(
        (cx + 0.5) * chunkWidth - mapWidth / 2,
        0,
        (cz + 0.5) * chunkDepth - mapDepth / 2,
      );
      chunk.radiusXZ = chunkRadiusXZ;
    });

    const geo = createGrassTuftGeometry(isMobile);

    return { chunksData: chunks, geometry: geo };
  }, [heightmapData, levelData, graphicsQuality, isDesert, isSnow, levelId]);

  // Create shared custom grass material with photorealistic texture & wind shader
  const material = useMemo(() => {
    shaderUniformsRef.current = [];

    const activeTexture = isDesert ? desertTuftTex : grassTuftTex;

    const isMobile = isMobileDevice();
    const mat = new MeshLambertMaterial({
      map: activeTexture,
      side: isMobile ? FrontSide : DoubleSide,
      transparent: false,
      depthWrite: true,
      alphaTest: isMobile ? 0 : 0.08,
      color: 0xffffff,
    });

    mat.customProgramCacheKey = () => {
      return `openrally-grass-${isDesert ? 'desert' : 'temperate'}-${isMobile ? 'mobile' : 'desktop'}`;
    };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.u_time = { value: 0 };
      shader.uniforms.u_windSpeed = { value: WIND_SPEED };
      shader.uniforms.u_windStrength = { value: WIND_STRENGTH };
      shader.uniforms.u_carPosition = { value: new Vector3(0, 0, 0) };
      shader.uniforms.u_cameraPos = { value: new Vector3(0, 0, 0) };
      shader.uniforms.u_drawDist = { value: 200.0 };
      shader.uniforms.u_fadeRange = { value: GRASS_FADE_RANGE };
      shader.uniforms.u_activeTex = { value: activeTexture };
      shader.uniforms.u_flowerTex = { value: wildflowerTex };
      shader.uniforms.u_isDesert = { value: isDesert ? 1.0 : 0.0 };
      shader.uniforms.u_isMobile = { value: isMobile ? 1.0 : 0.0 };

      shaderUniformsRef.current.push(shader.uniforms);

      shader.vertexShader = `
        uniform float u_time;
        uniform float u_windSpeed;
        uniform float u_windStrength;
        uniform vec3 u_carPosition;
        uniform vec3 u_cameraPos;
        uniform float u_drawDist;
        uniform float u_fadeRange;
        
        attribute float bladeTip;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying float vBladeTip;
        varying vec2 vMyUv;
        varying vec3 vWorldGrassPos;
        `,
      );

      // Custom vertex displacement for dynamic multi-octave wind waves and vehicle bending
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vBladeTip = bladeTip;
        vMyUv = uv;
        vec3 displaced = transformed;

        vec4 worldPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vWorldGrassPos = worldPos.xyz;
        
        // Smooth GPU distance fade: scale grass down seamlessly towards ground at draw distance edge
        float distToCam = length(worldPos.xz - u_cameraPos.xz);
        float fadeFactor = clamp((u_drawDist - distToCam) / u_fadeRange, 0.0, 1.0);
        displaced.y *= fadeFactor;
        displaced.xz *= mix(0.05, 1.0, fadeFactor);

        // Multi-frequency organic wind sway
        if (bladeTip > 0.25) {
          float wave1 = sin(u_time * u_windSpeed + worldPos.x * 0.14 + worldPos.z * 0.20);
          float wave2 = cos(u_time * (u_windSpeed * 0.65) + worldPos.x * 0.07 + worldPos.z * 0.11);
          float gust = sin(u_time * 0.85 + worldPos.x * 0.025) * 0.5 + 0.5;

          displaced.x += (wave1 + wave2 * 0.5) * u_windStrength * (1.0 + gust) * bladeTip * fadeFactor;
          displaced.z += (wave2 - wave1 * 0.4) * u_windStrength * (1.0 + gust * 0.7) * bladeTip * fadeFactor;
        }

        // Real-time vehicle pushdown & deflection under wheels (sampled directly from tuft origin)
        float distToCar = distance(worldPos.xyz, u_carPosition);
        float bendRadius = 2.5;
        if (distToCar < bendRadius && bladeTip > 0.05) {
          vec3 pushDir = normalize(worldPos.xyz - u_carPosition);
          pushDir.y = 0.0;
          float pushStrength = 1.0 - (distToCar / bendRadius);
          pushStrength = pushStrength * pushStrength;
          displaced.x += pushDir.x * pushStrength * 0.95 * bladeTip;
          displaced.z += pushDir.z * pushStrength * 0.95 * bladeTip;
          displaced.y -= pushStrength * 0.45 * bladeTip;
        }
        
        vec4 mvPosition = vec4( displaced, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );

      shader.fragmentShader = `
        varying float vBladeTip;
        varying vec2 vMyUv;
        varying vec3 vWorldGrassPos;
        uniform sampler2D u_activeTex;
        uniform sampler2D u_flowerTex;
        uniform float u_isDesert;
        uniform float u_isMobile;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>

        // Sample texture with wildflower scattering on meadow (compile-time specialized)
        vec4 grassTex;
        ${isDesert || isMobile ? `
        grassTex = texture2D(u_activeTex, vMyUv);
        ` : `
        // Organic meadow wildflower clusters on desktop
        float flowerPattern = sin(vWorldGrassPos.x * 0.2) * cos(vWorldGrassPos.z * 0.2);
        if (flowerPattern > 0.45) {
          grassTex = texture2D(u_flowerTex, vMyUv);
        } else {
          grassTex = texture2D(u_activeTex, vMyUv);
        }
        `}

        ${!isMobile ? `
        // Photorealistic blade cutout on desktop; on mobile, tapered geometry preserves Early-Z/HSR without discard
        float lum = max(grassTex.r, max(grassTex.g, grassTex.b));
        if (lum < 0.075) {
          discard;
        }
        ` : ''}

        // Natural gradient from dark moist root to sunlit golden tips with enhanced subsurface scattering
        vec3 rootDarkening = diffuseColor.rgb * mix(0.38, 1.05, smoothstep(0.0, 0.45, vBladeTip));
        vec3 bladeAlbedo = grassTex.rgb * rootDarkening * 1.38;

        // Subsurface scattering fake — sunlight filtering through blades with soft edge bounce
        float sunTranslucency = mix(0.82, 1.32, vBladeTip);
        diffuseColor.rgb = bladeAlbedo * sunTranslucency;
        `,
      );
    };

    return mat;
  }, [isDesert, desertTuftTex, grassTuftTex, wildflowerTex]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const camPos = state.camera.position;
    const carPosArray = useGameStore.getState().position;
    carPosRef.current.set(carPosArray[0], carPosArray[1], carPosArray[2]);

    const isMobile = isMobileDevice();
    const drawDistance = useSettingsStore.getState().drawDistance ?? (isMobile ? 'medium' : 'far');
    const drawDistMultiplier =
      drawDistance === 'short'
        ? 0.5
        : drawDistance === 'medium'
        ? 0.8
        : drawDistance === 'far'
        ? 1.0
        : 1.35;

    const baseDist =
      isMobile
        ? graphicsQuality === 'very_high'
          ? 140
          : graphicsQuality === 'high'
          ? 120
          : graphicsQuality === 'medium'
          ? 100
          : 75
        : graphicsQuality === 'very_high'
        ? 340
        : graphicsQuality === 'high'
        ? 240
        : graphicsQuality === 'medium'
        ? 180
        : 120;

    const effectiveDist = baseDist * drawDistMultiplier;
    const fadeRange = Math.max(24, effectiveDist * 0.2);

    for (const uniforms of shaderUniformsRef.current) {
      if (uniforms.u_time) uniforms.u_time.value = time;
      if (uniforms.u_carPosition) uniforms.u_carPosition.value.copy(carPosRef.current);
      if (uniforms.u_cameraPos) uniforms.u_cameraPos.value.copy(camPos);
      if (uniforms.u_drawDist) uniforms.u_drawDist.value = effectiveDist;
      if (uniforms.u_fadeRange) uniforms.u_fadeRange.value = fadeRange;
    }

    // Responsive distance-based culling check (runs every 2 frames, checks 1m movement or distance change)
    frameCountRef.current++;
    if (frameCountRef.current % 2 === 0) {
      const distChanged = Math.abs(effectiveDist - lastDistRef.current) > 1.0;
      const camMoved = camPos.distanceToSquared(lastCamPosRef.current) > 1.0;
      if (camMoved || distChanged) {
        lastCamPosRef.current.copy(camPos);
        lastDistRef.current = effectiveDist;

        chunksData.forEach((chunk, idx) => {
          const mesh = meshRefs.current[idx];
          if (!mesh) return;

          // Conservative 2D XZ distance check:
          // A chunk must remain visible as long as ANY point within the chunk
          // is within effectiveDist from the camera.
          const dx = chunk.center.x - camPos.x;
          const dz = chunk.center.z - camPos.z;
          const distXZSq = dx * dx + dz * dz;
          const baseMaxDist = effectiveDist + chunk.radiusXZ;
          // Spatial hysteresis: buffer of 35m prevents chunk flickering/popping at boundary
          const HYSTERESIS_BUFFER = 35.0;
          const isCurrentlyVisible = mesh.visible && mesh.count > 0;
          const allowedThreshold = isCurrentlyVisible ? baseMaxDist + HYSTERESIS_BUFFER : baseMaxDist;
          const shouldBeVisible = distXZSq <= allowedThreshold * allowedThreshold && chunk.matrices.length > 0;
          const targetCount = shouldBeVisible ? chunk.matrices.length : 0;

          if (mesh.visible !== shouldBeVisible || mesh.count !== targetCount) {
            mesh.count = targetCount;
            mesh.visible = shouldBeVisible;
          }
        });
      }
    }
  });

  // Clean up grass geometry and custom material on unmount/level change
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <group>
      {chunksData.map((chunk, index) => (
        <GrassChunkMesh
          key={index}
          index={index}
          geometry={geometry}
          material={material}
          chunk={chunk}
          onMeshRegister={registerMesh}
        />
      ))}
    </group>
  );
}
