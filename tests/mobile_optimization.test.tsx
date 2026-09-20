import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Matrix4, InstancedMesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { AnalogGauges } from '@/components/ui/gauges/AnalogGauges';
import { TimingBoard } from '@/components/ui/gauges/TimingBoard';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { setLastInputType, resetTouchInputState } from '@/utils/input/touch';
import { getClampedAnisotropy } from '@/utils/device';
import { shouldEnableCanvasShadows } from '@/components/canvas/GameCanvas';
import { GrassField } from '@/components/terrain/GrassField';
import {
  computeInstanceBoundingSphere,
  canPropsCastShadow,
} from '@/components/terrain/PropsInstancer';
import { BALANCED_MOBILE_SETTINGS } from '@/types/settings';
import type { PropItem } from '@/components/terrain/props/types';

describe('Mobile HUD & Optimization Suite', () => {
  beforeEach(() => {
    resetTouchInputState();
    useSettingsStore.setState({
      graphicsQuality: 'very_high',
      antiAliasing: 'smaa',
      resolutionScale: 1.0,
      shadowsEnabled: true,
      postProcessingEnabled: true,
      touchControlMode: 'auto',
    });
    useGameStore.setState({
      gameState: 'playing',
      gameMode: 'timeattack',
    });
  });

  afterEach(() => {
    resetTouchInputState();
  });

  describe('AnalogGauges Top-Left Mobile Positioning', () => {
    it('positions AnalogGauges cleanly at top-left under touch modality', () => {
      setLastInputType('touch');
      const html = renderToString(<AnalogGauges />);

      // Top-left positioning & scale (under utility buttons)
      expect(html).toContain('top:calc(68px + var(--sat, 0px))');
      expect(html).toContain('left:calc(16px + var(--sal, 0px))');
      expect(html).toContain('transform:scale(0.60)');
      expect(html).toContain('transform-origin:top left');
      expect(html).toContain('bottom:auto');
      expect(html).toContain('right:auto');
    });

    it('restores AnalogGauges to bottom-right under keyboard/gamepad modality', () => {
      setLastInputType('keyboard');
      const htmlKeyboard = renderToString(<AnalogGauges />);
      expect(htmlKeyboard).toContain('bottom:calc(20px + var(--sab))');
      expect(htmlKeyboard).toContain('right:calc(20px + var(--sar))');
      expect(htmlKeyboard).toContain('transform:none');

      setLastInputType('gamepad');
      const htmlGamepad = renderToString(<AnalogGauges />);
      expect(htmlGamepad).toContain('bottom:calc(20px + var(--sab))');
      expect(htmlGamepad).toContain('right:calc(20px + var(--sar))');
      expect(htmlGamepad).toContain('transform:none');
    });
  });

  describe('TimingBoard Safe-Area and Touch Collision Avoidance', () => {
    it('shifts TimingBoard down to 68px in touch mode to stack beneath top buttons', () => {
      setLastInputType('touch');
      const html = renderToString(<TimingBoard />);
      expect(html).toContain('top:calc(68px + var(--sat, 0px))');
    });

    it('keeps TimingBoard at standard 20px top in desktop mode', () => {
      setLastInputType('keyboard');
      const html = renderToString(<TimingBoard />);
      expect(html).toContain('top:calc(20px + var(--sat))');
    });
  });

  describe('Settings Store Mobile-Optimized Behaviors', () => {
    it('automatically disables heavy post-processing and sets AA to off when switching to low quality', () => {
      useSettingsStore.getState().setGraphicsQuality('low');
      const state = useSettingsStore.getState();

      expect(state.graphicsQuality).toBe('low');
      expect(state.postProcessingEnabled).toBe(false);
      expect(state.antiAliasing).toBe('off');
      expect(state.shadowsEnabled).toBe(false);
    });
  });

  describe('Milestone M3 Performance Optimizations', () => {
    it('reliably disables shadows and post-processing when setGraphicsQuality is low', () => {
      useSettingsStore.setState({ shadowsEnabled: true, postProcessingEnabled: true, graphicsQuality: 'medium' });
      useSettingsStore.getState().setGraphicsQuality('low');
      const state = useSettingsStore.getState();

      expect(state.graphicsQuality).toBe('low');
      expect(state.shadowsEnabled).toBe(false);
      expect(state.postProcessingEnabled).toBe(false);
      expect(state.antiAliasing).toBe('off');
    });

    it('BALANCED_MOBILE_SETTINGS explicitly sets postProcessingEnabled to false', () => {
      expect(BALANCED_MOBILE_SETTINGS.graphicsQuality).toBe('medium');
      expect(BALANCED_MOBILE_SETTINGS.postProcessingEnabled).toBe(false);
      expect(BALANCED_MOBILE_SETTINGS.antiAliasing).toBe('off');
      expect(BALANCED_MOBILE_SETTINGS.resolutionScale).toBe(1.0);
      expect(BALANCED_MOBILE_SETTINGS.shadowsEnabled).toBe(false);
    });

    it('GameCanvas shadows guard expression eliminates shadow passes in low graphics mode', () => {
      // With shadowsEnabled: true — only non-low quality levels activate canvas shadows
      expect(shouldEnableCanvasShadows(true, 'low')).toBe(false);
      expect(shouldEnableCanvasShadows(true, 'medium')).toBe(true);
      expect(shouldEnableCanvasShadows(true, 'high')).toBe(true);
      expect(shouldEnableCanvasShadows(true, 'very_high')).toBe(true);

      // With shadowsEnabled: false — shadows remain disabled across ALL quality levels
      expect(shouldEnableCanvasShadows(false, 'low')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'medium')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'high')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'very_high')).toBe(false);
    });

    it('GrassField returns null immediately when graphicsQuality is low to eliminate draw calls and alpha discard', () => {
      useSettingsStore.getState().setGraphicsQuality('low');
      const renderedHtml = renderToString(<GrassField />);
      expect(renderedHtml).toBe('');
    });

    it('disables prop shadow casting on mobile in Balanced mode (canShadow is false)', () => {
      // Mobile modes: MUST NOT cast prop shadows (saves 27 draw calls and shadow pass)
      expect(canPropsCastShadow(true, 'medium')).toBe(false);
      expect(canPropsCastShadow(true, 'low')).toBe(false);
      expect(canPropsCastShadow(true, 'high')).toBe(false);
      expect(canPropsCastShadow(true, 'very_high')).toBe(false);

      // Desktop non-low modes: SHOULD cast prop shadows
      expect(canPropsCastShadow(false, 'medium')).toBe(true);
      expect(canPropsCastShadow(false, 'high')).toBe(true);
      expect(canPropsCastShadow(false, 'very_high')).toBe(true);
      // Desktop Low mode: MUST NOT cast prop shadows
      expect(canPropsCastShadow(false, 'low')).toBe(false);
    });

    it('computeInstanceBoundingSphere restores genuine Three.js frustum culling with tight bounds', () => {
      // 0 items returns radius -1
      const emptySphere = computeInstanceBoundingSphere([]);
      expect(emptySphere.radius).toBe(-1);

      // Single item at (10, 5, 20) with geometry radius 4
      const m1 = new Matrix4().makeTranslation(10, 5, 20);
      const items: PropItem[] = [
        { matrix: m1, position: [10, 5, 20], scale: [1, 1, 1], rotationY: 0 },
      ];
      const singleSphere = computeInstanceBoundingSphere(items, 4);
      expect(singleSphere.center.x).toBeCloseTo(10);
      expect(singleSphere.center.y).toBeCloseTo(5);
      expect(singleSphere.center.z).toBeCloseTo(20);
      expect(singleSphere.radius).toBeCloseTo(4);

      // Distributed cluster: points at (0, 0, 0) and (100, 0, 100)
      const clusterItems: PropItem[] = [
        { matrix: new Matrix4().makeTranslation(0, 0, 0), position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0 },
        { matrix: new Matrix4().makeTranslation(100, 0, 100), position: [100, 0, 100], scale: [1, 1, 1], rotationY: 0 },
      ];
      const clusterSphere = computeInstanceBoundingSphere(clusterItems, 5);
      expect(clusterSphere.center.x).toBeCloseTo(50);
      expect(clusterSphere.center.y).toBeCloseTo(0);
      expect(clusterSphere.center.z).toBeCloseTo(50);
      // Distance from center (50, 0, 50) to (0, 0, 0) is sqrt(50^2 + 50^2) = ~70.71, + 5 = ~75.71
      expect(clusterSphere.radius).toBeCloseTo(Math.sqrt(5000) + 5, 1);
      // Must be significantly smaller than the old artificial 1200m global sphere
      expect(clusterSphere.radius).toBeLessThan(200);
      expect(clusterSphere.radius).toBeGreaterThan(0);
    });

    it('verifies InstancedMesh native bounding sphere calculation operates without 1200m global override', () => {
      const geo = new BoxGeometry(2, 4, 2);
      geo.computeBoundingSphere();
      const mat = new MeshStandardMaterial();
      const mesh = new InstancedMesh(geo, mat, 10);

      // Populate instances at (10, 0, 0) and (50, 0, 0)
      mesh.setMatrixAt(0, new Matrix4().makeTranslation(10, 0, 0));
      mesh.setMatrixAt(1, new Matrix4().makeTranslation(50, 0, 0));
      mesh.count = 2;
      mesh.instanceMatrix.needsUpdate = true;

      // Compute native Three.js bounding sphere
      mesh.computeBoundingSphere();

      expect(mesh.boundingSphere).not.toBeNull();
      // True bounds: center is around (30, 0, 0), radius is ~22m, far smaller than legacy 1200m global sphere
      expect(mesh.boundingSphere!.radius).toBeGreaterThan(0);
      expect(mesh.boundingSphere!.radius).toBeLessThan(100);
      expect(mesh.boundingSphere!.center.x).toBeCloseTo(30, 0);
    });

    it('clamps texture anisotropy to <= 2 on mobile (Ocean, Terrain, Grass, Props)', () => {
      // Ocean: base 8 -> clamped to 2 on mobile, preserved as 8 on desktop
      expect(getClampedAnisotropy(8, true)).toBe(2);
      expect(getClampedAnisotropy(8, false)).toBe(8);

      // Terrain very_high: base 16 -> clamped to 2 on mobile, preserved as 16 on desktop
      expect(getClampedAnisotropy(16, true)).toBe(2);
      expect(getClampedAnisotropy(16, false)).toBe(16);

      // Terrain high: base 8 -> clamped to 2 on mobile, preserved as 8 on desktop
      expect(getClampedAnisotropy(8, true)).toBe(2);
      expect(getClampedAnisotropy(8, false)).toBe(8);

      // Terrain medium/low: base 4 -> clamped to 2 on mobile, preserved as 4 on desktop
      expect(getClampedAnisotropy(4, true)).toBe(2);
      expect(getClampedAnisotropy(4, false)).toBe(4);

      // Foliage (GrassField) & Props (PropsInstancer): base 4 -> clamped to 2 on mobile, preserved as 4 on desktop
      expect(getClampedAnisotropy(4, true)).toBe(2);
      expect(getClampedAnisotropy(4, false)).toBe(4);

      // Degenerate/hostile inputs: safely falls back to isotropic baseline (1)
      expect(getClampedAnisotropy(0, true)).toBe(1);
      expect(getClampedAnisotropy(-5, true)).toBe(1);
      expect(getClampedAnisotropy(NaN, true)).toBe(1);

      // Ambient environment test: defaults to isMobileDevice()
      expect(getClampedAnisotropy(16)).toBeGreaterThanOrEqual(1);
      expect(getClampedAnisotropy(16)).toBeLessThanOrEqual(16);
    });
  });
});
