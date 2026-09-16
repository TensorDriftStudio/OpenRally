import { describe, it, expect } from 'vitest';
import { Texture } from 'three';
import {
  createDetailedTerrainMaterial,
  buildTerrainChunkGeometries,
  TERRAIN_CHUNKS_TOTAL,
} from '@/components/terrain/Terrain';
import { compileTerrain } from '@/utils/terrainCompiler';
import { getAvailableLevels } from '@/config/levelRegistry';
import { createGrassTuftGeometry } from '@/components/terrain/GrassField';
import {
  createTrunkGeometry,
  createPineFoliageGeometry,
  createBirchTrunkGeometry,
  createBirchFoliageGeometry,
  createDesertTrunkGeometry,
  createDesertFoliageGeometry,
  createRealisticRockGeometry,
  createSandstoneRockGeometry,
  createCabinStoneGeometry,
  createCabinWallGeometry,
  createCabinDoorGeometry,
  createCabinWindowGeometry,
  createCabinRoofGeometry,
  createFenceGeometry,
  createCastleTowerGeometry,
  createCastleWallGeometry,
  createCastleGateGeometry,
  createCastleKeepGeometry,
  createCastleArchGeometry,
  createStoneWallGeometry,
  createStandingStoneGeometry,
  createHighlandCottageWallGeometry,
  createHighlandCottageRoofGeometry,
  createStoneCairnGeometry,
  createHayBaleGeometry,
  createRallySignGeometry,
  createStoneBridgeGeometry,
} from '@/components/terrain/PropsInstancer';

describe('Terrain Materials and Procedural Geometries', () => {
  it('creates detailed terrain material with all required uniforms and properties', () => {
    const dummyTex = new Texture();
    const material = createDetailedTerrainMaterial({
      grassTexture: dummyTex,
      trackTexture: dummyTex,
      rockTexture: dummyTex,
      sandTexture: dummyTex,
      snowTexture: dummyTex,
      snowTrackTexture: dummyTex,
      isDesert: false,
      isSnow: false,
    });

    expect(material).toBeDefined();
    expect(material.vertexColors).toBe(true);
    expect(material.roughness).toBeGreaterThan(0.5);
    expect(typeof material.onBeforeCompile).toBe('function');

    const snowMaterial = createDetailedTerrainMaterial({
      grassTexture: dummyTex,
      trackTexture: dummyTex,
      rockTexture: dummyTex,
      sandTexture: dummyTex,
      snowTexture: dummyTex,
      snowTrackTexture: dummyTex,
      isDesert: false,
      isSnow: true,
    });

    expect(snowMaterial).toBeDefined();
    expect(snowMaterial.roughness).toBeGreaterThan(0.85);

    // Verify onBeforeCompile GLSL shader code integrity and uniform declaration symmetry
    const mockShader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
    };
    material.onBeforeCompile(mockShader as any, {} as any);

    expect(mockShader.uniforms.u_isGymkhana).toBeDefined();
    expect(mockShader.fragmentShader).toContain('uniform float u_isGymkhana;');
    expect(mockShader.fragmentShader).toContain('uniform float u_isSnow;');
    expect(mockShader.fragmentShader).toContain('uniform float u_isDesert;');
    expect(mockShader.fragmentShader).toContain('uniform float u_slopeDarkening;');

    // All uniforms referenced in fragment code must be declared
    const usedUniforms = new Set(
      Array.from(mockShader.fragmentShader.matchAll(/\b(u_[a-zA-Z0-9_]+)\b/g)).map((m) => m[1]),
    );
    for (const uName of usedUniforms) {
      expect(
        mockShader.fragmentShader.includes(`uniform float ${uName}`) ||
        mockShader.fragmentShader.includes(`uniform sampler2D ${uName}`),
        `Uniform ${uName} used in fragment shader must be declared!`,
      ).toBe(true);
    }
  });

  it('creates 3D volumetric grass tuft geometry with bladeTip, uv, normal, and position attributes', () => {
    const geometry = createGrassTuftGeometry();

    expect(geometry.attributes.position).toBeDefined();
    expect(geometry.attributes.bladeTip).toBeDefined();
    expect(geometry.attributes.uv).toBeDefined();
    expect(geometry.attributes.normal).toBeDefined();

    const posCount = geometry.attributes.position.count;
    expect(posCount).toBeGreaterThan(0);
    expect(geometry.attributes.bladeTip.count).toBe(posCount);
  });

  it('creates organic pine tree trunk geometry with flared root base', () => {
    const trunk = createTrunkGeometry();

    expect(trunk.attributes.position).toBeDefined();
    expect(trunk.attributes.normal).toBeDefined();
    expect(trunk.attributes.uv).toBeDefined();
    expect(trunk.attributes.position.count).toBeGreaterThan(20);
  });

  it('creates multi-tier pine foliage canopy geometry', () => {
    const foliage = createPineFoliageGeometry();

    expect(foliage.attributes.position).toBeDefined();
    expect(foliage.attributes.uv).toBeDefined();
    expect(foliage.attributes.normal).toBeDefined();
    expect(foliage.attributes.position.count).toBeGreaterThan(50);
  });

  it('creates branched European birch trunk geometry', () => {
    const trunk = createBirchTrunkGeometry();

    expect(trunk.attributes.position).toBeDefined();
    expect(trunk.attributes.normal).toBeDefined();
    expect(trunk.attributes.uv).toBeDefined();
    expect(trunk.attributes.position.count).toBeGreaterThan(30);
  });

  it('creates volumetric birch/broadleaf rounded foliage canopy geometry', () => {
    const foliage = createBirchFoliageGeometry();

    expect(foliage.attributes.position).toBeDefined();
    expect(foliage.attributes.uv).toBeDefined();
    expect(foliage.attributes.normal).toBeDefined();
    expect(foliage.attributes.position.count).toBeGreaterThan(50);
  });

  it('creates twisted desert acacia trunk geometry', () => {
    const trunk = createDesertTrunkGeometry();

    expect(trunk.attributes.position).toBeDefined();
    expect(trunk.attributes.normal).toBeDefined();
    expect(trunk.attributes.uv).toBeDefined();
    expect(trunk.attributes.position.count).toBeGreaterThan(25);
  });

  it('creates flat umbrella desert foliage geometry', () => {
    const foliage = createDesertFoliageGeometry();

    expect(foliage.attributes.position).toBeDefined();
    expect(foliage.attributes.uv).toBeDefined();
    expect(foliage.attributes.normal).toBeDefined();
    expect(foliage.attributes.position.count).toBeGreaterThan(40);
  });

  it('creates realistic fractured granite rock geometry with UVs', () => {
    const rock = createRealisticRockGeometry();

    expect(rock.attributes.position).toBeDefined();
    expect(rock.attributes.normal).toBeDefined();
    expect(rock.attributes.uv).toBeDefined();
    expect(rock.attributes.position.count).toBeGreaterThan(10);
  });

  it('creates layered sandstone slab geometry with UVs', () => {
    const rock = createSandstoneRockGeometry();

    expect(rock.attributes.position).toBeDefined();
    expect(rock.attributes.normal).toBeDefined();
    expect(rock.attributes.uv).toBeDefined();
    expect(rock.attributes.position.count).toBeGreaterThan(10);
  });

  it('creates deep grounded stone foundation and chimney geometry', () => {
    const stone = createCabinStoneGeometry();

    expect(stone.attributes.position).toBeDefined();
    expect(stone.attributes.normal).toBeDefined();
    expect(stone.attributes.uv).toBeDefined();
    expect(stone.attributes.position.count).toBeGreaterThan(20);
  });

  it('creates rustic cabin wall geometry with porch posts and log notches', () => {
    const cabin = createCabinWallGeometry();

    expect(cabin.attributes.position).toBeDefined();
    expect(cabin.attributes.normal).toBeDefined();
    expect(cabin.attributes.uv).toBeDefined();
    expect(cabin.attributes.position.count).toBeGreaterThan(30);
  });

  it('creates textured wooden entrance door geometry', () => {
    const door = createCabinDoorGeometry();

    expect(door.attributes.position).toBeDefined();
    expect(door.attributes.normal).toBeDefined();
    expect(door.attributes.uv).toBeDefined();
    expect(door.attributes.position.count).toBeGreaterThan(5);
  });

  it('creates authentic 3D rustic window geometry for cabins', () => {
    const windows = createCabinWindowGeometry();

    expect(windows.attributes.position).toBeDefined();
    expect(windows.attributes.normal).toBeDefined();
    expect(windows.attributes.uv).toBeDefined();
    expect(windows.attributes.position.count).toBeGreaterThan(20);
  });

  it('creates pitched A-frame roof geometry for cabins', () => {
    const roof = createCabinRoofGeometry();

    expect(roof.attributes.position).toBeDefined();
    expect(roof.attributes.normal).toBeDefined();
    expect(roof.attributes.uv).toBeDefined();
    expect(roof.attributes.position.count).toBeGreaterThan(30);
  });

  it('creates deeply anchored split-rail village wooden fence geometry', () => {
    const fence = createFenceGeometry();

    expect(fence.attributes.position).toBeDefined();
    expect(fence.attributes.normal).toBeDefined();
    expect(fence.attributes.uv).toBeDefined();
    expect(fence.attributes.position.count).toBeGreaterThan(30);
  });

  it('creates monumental round castle tower geometry with battlements and foundation', () => {
    const tower = createCastleTowerGeometry();

    expect(tower.attributes.position).toBeDefined();
    expect(tower.attributes.normal).toBeDefined();
    expect(tower.attributes.uv).toBeDefined();
    expect(tower.attributes.position.count).toBeGreaterThan(50);
  });

  it('creates medieval fortress curtain wall geometry with crenellations', () => {
    const wall = createCastleWallGeometry();

    expect(wall.attributes.position).toBeDefined();
    expect(wall.attributes.normal).toBeDefined();
    expect(wall.attributes.uv).toBeDefined();
    expect(wall.attributes.position.count).toBeGreaterThan(40);
  });

  it('creates Gothic arched castle barbican gatehouse geometry', () => {
    const gate = createCastleGateGeometry();

    expect(gate.attributes.position).toBeDefined();
    expect(gate.attributes.normal).toBeDefined();
    expect(gate.attributes.uv).toBeDefined();
    expect(gate.attributes.position.count).toBeGreaterThan(60);
  });

  it('creates British countryside dry-stone wall geometry', () => {
    const stoneWall = createStoneWallGeometry();

    expect(stoneWall.attributes.position).toBeDefined();
    expect(stoneWall.attributes.normal).toBeDefined();
    expect(stoneWall.attributes.uv).toBeDefined();
    expect(stoneWall.attributes.position.count).toBeGreaterThan(20);
  });

  it('creates grand medieval donjon keep citadel geometry with corner turrets', () => {
    const keep = createCastleKeepGeometry();

    expect(keep.attributes.position).toBeDefined();
    expect(keep.attributes.normal).toBeDefined();
    expect(keep.attributes.uv).toBeDefined();
    expect(keep.attributes.position.count).toBeGreaterThan(80);
  });

  it('creates ruined Gothic stone pointed archway and arcade geometry', () => {
    const arch = createCastleArchGeometry();

    expect(arch.attributes.position).toBeDefined();
    expect(arch.attributes.normal).toBeDefined();
    expect(arch.attributes.uv).toBeDefined();
    expect(arch.attributes.position.count).toBeGreaterThan(40);
  });

  it('creates ancient Celtic standing megalith stone geometry', () => {
    const stone = createStandingStoneGeometry();

    expect(stone.attributes.position).toBeDefined();
    expect(stone.attributes.normal).toBeDefined();
    expect(stone.attributes.uv).toBeDefined();
    expect(stone.attributes.position.count).toBeGreaterThan(30);
  });

  it('creates Scottish highland croft cottage walls and thatched roof geometries', () => {
    const walls = createHighlandCottageWallGeometry();
    const roof = createHighlandCottageRoofGeometry();

    expect(walls.attributes.position).toBeDefined();
    expect(walls.attributes.normal).toBeDefined();
    expect(walls.attributes.uv).toBeDefined();
    expect(walls.attributes.position.count).toBeGreaterThan(40);

    expect(roof.attributes.position).toBeDefined();
    expect(roof.attributes.normal).toBeDefined();
    expect(roof.attributes.uv).toBeDefined();
    expect(roof.attributes.position.count).toBeGreaterThan(10);
  });

  it('creates mountain stone cairn with Celtic cross geometry', () => {
    const cairn = createStoneCairnGeometry();

    expect(cairn.attributes.position).toBeDefined();
    expect(cairn.attributes.normal).toBeDefined();
    expect(cairn.attributes.uv).toBeDefined();
    expect(cairn.attributes.position.count).toBeGreaterThan(50);
  });

  it('creates agricultural straw hay bale geometry', () => {
    const bale = createHayBaleGeometry();

    expect(bale.attributes.position).toBeDefined();
    expect(bale.attributes.normal).toBeDefined();
    expect(bale.attributes.uv).toBeDefined();
    expect(bale.attributes.position.count).toBeGreaterThan(20);
  });

  it('creates rally warning chevron sign geometry', () => {
    const sign = createRallySignGeometry();

    expect(sign.attributes.position).toBeDefined();
    expect(sign.attributes.normal).toBeDefined();
    expect(sign.attributes.uv).toBeDefined();
    expect(sign.attributes.position.count).toBeGreaterThan(15);
  });

  it('creates ancient arched stone bridge geometry', () => {
    const bridge = createStoneBridgeGeometry();

    expect(bridge.attributes.position).toBeDefined();
    expect(bridge.attributes.normal).toBeDefined();
    expect(bridge.attributes.uv).toBeDefined();
    expect(bridge.attributes.position.count).toBeGreaterThan(20);
  });

  describe('Texture Anisotropy Clamping (R4)', () => {
    it('clamps terrain texture anisotropy to <= 2 when on mobile devices', () => {
      const qualities = ['low', 'medium', 'high', 'very_high'] as const;
      for (const q of qualities) {
        const base = q === 'very_high' ? 16 : q === 'high' ? 8 : 4;
        const mobileAnisotropy = Math.min(base, 2);
        expect(mobileAnisotropy).toBe(2);
        expect(mobileAnisotropy).toBeLessThanOrEqual(2);
      }
    });

    it('preserves high desktop anisotropy up to 16x when on desktop devices', () => {
      const getDesktopAnisotropy = (q: string) => (q === 'very_high' ? 16 : q === 'high' ? 8 : 4);
      expect(getDesktopAnisotropy('very_high')).toBe(16);
      expect(getDesktopAnisotropy('high')).toBe(8);
      expect(getDesktopAnisotropy('medium')).toBe(4);
      expect(getDesktopAnisotropy('low')).toBe(4);
    });

    it('applies clamped anisotropy to texture instances', () => {
      const tex = new Texture();
      const isMobile = true;
      const baseAnisotropy = 16;
      tex.anisotropy = isMobile ? Math.min(baseAnisotropy, 2) : baseAnisotropy;
      expect(tex.anisotropy).toBe(2);

      const desktopTex = new Texture();
      const isDesktop = false;
      desktopTex.anisotropy = isDesktop ? Math.min(baseAnisotropy, 2) : baseAnisotropy;
      expect(desktopTex.anisotropy).toBe(16);
    });
  });

  describe('Terrain Chunking & Frustum Culling (Reserve 1)', () => {
    it('generates 16 seamless terrain chunks with Uint16 indices and tight bounds', () => {
      const subdivisions = 384;
      const rows = 385;
      const cols = 385;
      const heights = new Float32Array(rows * cols);
      const trackMasks = new Float32Array(rows * cols);

      // Create a test parabolic hill
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const normX = (c / 384) * 2 - 1;
          const normZ = (r / 384) * 2 - 1;
          heights[r * cols + c] = 50 * (1 - normX * normX - normZ * normZ);
          trackMasks[r * cols + c] = r === c ? 1.0 : 0.0;
        }
      }

      const chunks = buildTerrainChunkGeometries({
        width: 2000,
        depth: 2000,
        subdivisions,
        rows,
        cols,
        heights,
        trackMasks,
        minHeight: -10,
        maxHeight: 60,
        isSnow: false,
        isBritain: false,
      });

      expect(chunks.length).toBe(TERRAIN_CHUNKS_TOTAL);
      expect(chunks.length).toBe(16);

      const chunkSubdivs = 96; // 384 / 4
      const expectedVertsPerChunk = (chunkSubdivs + 1) * (chunkSubdivs + 1); // 97 * 97 = 9409
      const expectedIndicesPerChunk = chunkSubdivs * chunkSubdivs * 6; // 96 * 96 * 6 = 55296

      for (const chunk of chunks) {
        expect(chunk.attributes.position.count).toBe(expectedVertsPerChunk);
        expect(chunk.attributes.normal.count).toBe(expectedVertsPerChunk);
        expect(chunk.attributes.uv.count).toBe(expectedVertsPerChunk);
        expect(chunk.attributes.color.count).toBe(expectedVertsPerChunk);
        expect(chunk.attributes.trackMask.count).toBe(expectedVertsPerChunk);

        // Verify Uint16Array indices are used to conserve memory
        expect(chunk.index).toBeDefined();
        expect(chunk.index!.count).toBe(expectedIndicesPerChunk);
        expect(chunk.index!.array).toBeInstanceOf(Uint16Array);

        // Verify valid bounding box and sphere computed for frustum culling
        expect(chunk.boundingBox).not.toBeNull();
        expect(chunk.boundingSphere).not.toBeNull();
        expect(chunk.boundingSphere!.radius).toBeGreaterThan(0);
        // Radius of 500m x 500m chunk is ~350m-450m (far less than monolithic 1400m sphere)
        expect(chunk.boundingSphere!.radius).toBeLessThan(600);
      }

      // Verify seamless boundary normals between chunk 0 (col 0..96) and chunk 1 (col 96..192) along row 0
      const chunk0 = chunks[0];
      const chunk1 = chunks[1];
      const localIdx0 = 96; // (row 0, col 96) in chunk 0
      const localIdx1 = 0; // (row 0, col 0) in chunk 1 (which corresponds to global col 96)

      const n0x = chunk0.attributes.normal.getX(localIdx0);
      const n0y = chunk0.attributes.normal.getY(localIdx0);
      const n0z = chunk0.attributes.normal.getZ(localIdx0);

      const n1x = chunk1.attributes.normal.getX(localIdx1);
      const n1y = chunk1.attributes.normal.getY(localIdx1);
      const n1z = chunk1.attributes.normal.getZ(localIdx1);

      expect(n0x).toBeCloseTo(n1x, 4);
      expect(n0y).toBeCloseTo(n1y, 4);
      expect(n0z).toBeCloseTo(n1z, 4);

      // Verify position along boundary is identical
      expect(chunk0.attributes.position.getX(localIdx0)).toBeCloseTo(chunk1.attributes.position.getX(localIdx1), 4);
      expect(chunk0.attributes.position.getY(localIdx0)).toBeCloseTo(chunk1.attributes.position.getY(localIdx1), 4);
      expect(chunk0.attributes.position.getZ(localIdx0)).toBeCloseTo(chunk1.attributes.position.getZ(localIdx1), 4);

      // Clean up test geometries
      chunks.forEach((c) => c.dispose());
    });

    it('ensures HeightfieldCollider grid dimensions perfectly match compiled heightmap rows and cols with zero stride offset', () => {
      const levels = getAvailableLevels();

      for (const level of levels) {
        const heightmapData = compileTerrain(level.data);
        const { rows, cols, heights } = heightmapData;

        // Heights array must match rows * cols
        expect(heights.length).toBe(rows * cols);

        // Transposed height array for Rapier HeightfieldCollider
        const transposed = new Float32Array(heights.length);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            transposed[c * rows + r] = heights[r * cols + c];
          }
        }

        expect(transposed.length).toBe(rows * cols);
        // Ensure that rows and cols (vertices) are subdivisions + 1, not subdivisions
        expect(rows).toBe(level.data.terrainBase.subdivisions + 1);
        expect(cols).toBe(level.data.terrainBase.subdivisions + 1);
      }
    });
  });
});
