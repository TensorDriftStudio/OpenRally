import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SpeedEffects } from '../SpeedEffects';
import { Minimap } from '../Minimap';

describe('SpeedEffects & Fullscreen Peripheral Vignette Coverage', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  const cssPath = path.join(rootDir, 'src/index.css');

  it('renders SpeedEffects with speed-effects-overlay class and fixed full-viewport styling', () => {
    const html = renderToString(<SpeedEffects />);
    expect(html).toContain('class="speed-effects-overlay"');
    expect(html).toContain('position:fixed');
    expect(html).toContain('width:100vw');
    expect(html).toContain('height:100vh');
    expect(html).toContain('radial-gradient(ellipse at 50% 50%');
  });

  it('renders Minimap with minimap-container class name', () => {
    const html = renderToString(<Minimap />);
    expect(html).toContain('class="minimap-container"');
  });

  it('verifies src/index.css protects speed-effects-overlay from scaling or clipping', () => {
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Does NOT contain the buggy un-scoped canvas descendant match
    expect(css).not.toContain('#hud > div:has(canvas:not(#game-canvas))');

    // Scopes minimap scale specifically to .minimap-container
    expect(css).toContain('#hud .minimap-container');

    // Enforces fixed full-screen coverage with transform: none
    expect(css).toContain('.speed-effects-overlay');
    expect(css).toContain('width: 100vw !important;');
    expect(css).toContain('height: 100vh !important;');
    expect(css).toContain('transform: none !important;');
  });
});
