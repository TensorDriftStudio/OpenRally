import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LEVEL5_GYMKHANA_DATA } from '@/config/levels/gymkhanaIsland';

describe('Trackside & Gymkhana Props Texture Integrity', () => {
  it('confirms Gymkhana Island level contains hay bales, fences, and rally signs', () => {
    const hayBales = LEVEL5_GYMKHANA_DATA.props.filter((p) => p.type === 'hay_bale');
    const fences = LEVEL5_GYMKHANA_DATA.props.filter((p) => p.type === 'fence');
    const rallySigns = LEVEL5_GYMKHANA_DATA.props.filter((p) => p.type === 'rally_sign');

    expect(hayBales.length).toBeGreaterThan(0);
    expect(fences.length).toBeGreaterThan(0);
    expect(rallySigns.length).toBeGreaterThan(0);
  });

  it('verifies PropsInstancer dynamically assigns thatched straw texture to hay bales on Gymkhana', () => {
    const propsInstancerSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/terrain/PropsInstancer.tsx'),
      'utf-8',
    );

    // Verifies dynamic prop inspection
    expect(propsInstancerSrc).toContain("const hasHayBale = hasProp('hay_bale')");
    expect(propsInstancerSrc).toContain("const hasFence = hasProp('fence')");
    expect(propsInstancerSrc).toContain("const hasRallySign = hasProp('rally_sign')");

    // Verifies that highlandCottageThatchPath is assigned when hasHayBale is true or isGymkhana
    expect(propsInstancerSrc).toContain(
      "const highlandCottageThatchPath = (hasHayBale || hasHighlandCottage || isBritain || isGymkhana) ? '/textures/props/highland_cottage_thatch.jpg' : BLANK;",
    );
  });

  it('verifies PropsInstancer uses a neutral white fallback instead of pitch black placeholder', () => {
    const propsInstancerSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/terrain/PropsInstancer.tsx'),
      'utf-8',
    );

    expect(propsInstancerSrc).toContain('data:image/png;base64');
    expect(propsInstancerSrc).not.toContain("const BLANK = '/textures/placeholder.png'");
  });

  it('verifies PropsInstancer dynamically assigns birch bark texture when tree_birch is present', () => {
    const propsInstancerSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/terrain/PropsInstancer.tsx'),
      'utf-8',
    );

    expect(propsInstancerSrc).toContain("const hasBirch = hasProp('tree_birch') || isBritain || isIsland;");
    expect(propsInstancerSrc).toContain(
      "const birchBarkPath = hasBirch ? '/textures/foliage/birch_bark.jpg' : BLANK;",
    );
  });

  it('verifies GameCanvas pauses Rapier physics in menu/title when scene is settled', () => {
    const canvasSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/canvas/GameCanvas.tsx'),
      'utf-8',
    );

    expect(canvasSrc).toContain("paused={gameState === 'paused' || (!isGameplay && isSceneReady)}");
  });

  it('verifies useVehiclePhysics zeroes gravityScale when settled and restores to 1 for gameplay', () => {
    const physicsHookSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/hooks/useVehiclePhysics.ts'),
      'utf-8',
    );

    expect(physicsHookSrc).toContain('body.setGravityScale(0, true)');
    expect(physicsHookSrc).toContain('body.setGravityScale(1, true)');
  });
});
