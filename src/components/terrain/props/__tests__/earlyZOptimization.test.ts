import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture } from 'three';
import fs from 'node:fs';
import path from 'node:path';
import * as deviceUtils from '@/utils/device';
import { createFoliageWindMaterial } from '../materials';

describe('Early-Z & Mobile 60 FPS 3D Optimizations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets alphaTest to 0 on mobile devices to preserve hardware Early-Z / LRZ on TBDR GPUs', () => {
    vi.spyOn(deviceUtils, 'isMobileDevice').mockReturnValue(true);
    const mockTex = new Texture();
    const mat = createFoliageWindMaterial(mockTex, '#224411', false, () => {});

    expect(mat.alphaTest).toBe(0);
  });

  it('preserves alphaTest at 0.12 on desktop devices for photorealistic cutout precision', () => {
    vi.spyOn(deviceUtils, 'isMobileDevice').mockReturnValue(false);
    const mockTex = new Texture();
    const mat = createFoliageWindMaterial(mockTex, '#224411', false, () => {});

    expect(mat.alphaTest).toBe(0.12);
  });

  it('verifies GrassField enables frustumCulled on instancedMesh', () => {
    const grassFieldSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/terrain/GrassField.tsx'),
      'utf-8',
    );

    expect(grassFieldSrc).toMatch(/<instancedMesh[\s\S]*?frustumCulled[\s\S]*?\/>/);
    expect(grassFieldSrc).not.toContain('frustumCulled={false}');
  });

  it('verifies GameCanvas scales Bloom resolution on mobile to protect memory bandwidth', () => {
    const canvasSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/canvas/GameCanvas.tsx'),
      'utf-8',
    );

    expect(canvasSrc).toContain('resolutionScale={isMobile ? 0.5 : 1.0}');
    expect(canvasSrc).toContain("levels={isMobile ? 2 : (graphicsQuality === 'very_high' ? 8 : 5)}");
  });
});
