import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { shouldEnableCanvasShadows, getCanvasShadowsType, shouldRenderEnvironment } from '../GameCanvas';
import { useSettingsStore } from '@/store/settingsStore';

describe('Graphics Pipeline & Settings Scaling', () => {
  const storageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    storageMock.clear();
    vi.stubGlobal('localStorage', storageMock);
    useSettingsStore.setState({
      graphicsQuality: 'very_high',
      shadowsEnabled: true,
      postProcessingEnabled: true,
      antiAliasing: 'smaa',
      graphicsConfiguredByUser: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('shouldEnableCanvasShadows', () => {
    it('enables shadows on high and very_high when shadowsEnabled is true', () => {
      expect(shouldEnableCanvasShadows(true, 'very_high')).toBe(true);
      expect(shouldEnableCanvasShadows(true, 'high')).toBe(true);
      expect(shouldEnableCanvasShadows(true, 'medium')).toBe(true);
    });

    it('strictly suppresses shadows when graphics quality is low even if shadowsEnabled is true', () => {
      expect(shouldEnableCanvasShadows(true, 'low')).toBe(false);
    });

    it('suppresses shadows across all quality levels when shadowsEnabled is false', () => {
      expect(shouldEnableCanvasShadows(false, 'very_high')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'high')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'medium')).toBe(false);
      expect(shouldEnableCanvasShadows(false, 'low')).toBe(false);
    });
  });

  describe('getCanvasShadowsType', () => {
    it('returns false on mobile devices (e.g. Pixel 10 Pro) to protect mobile GPUs from driver crashes', () => {
      expect(getCanvasShadowsType(true, 'very_high', true)).toBe(false);
      expect(getCanvasShadowsType(true, 'high', true)).toBe(false);
      expect(getCanvasShadowsType(true, 'medium', true)).toBe(false);
    });

    it('returns "percentage" on desktop devices when shadows are enabled', () => {
      expect(getCanvasShadowsType(true, 'very_high', false)).toBe('percentage');
      expect(getCanvasShadowsType(true, 'high', false)).toBe('percentage');
      expect(getCanvasShadowsType(true, 'medium', false)).toBe('percentage');
    });

    it('returns false across all platforms when shadows are disabled or quality is low', () => {
      expect(getCanvasShadowsType(false, 'very_high', true)).toBe(false);
      expect(getCanvasShadowsType(false, 'very_high', false)).toBe(false);
      expect(getCanvasShadowsType(true, 'low', true)).toBe(false);
      expect(getCanvasShadowsType(true, 'low', false)).toBe(false);
    });
  });

  describe('settingsStore graphics preset scaling', () => {
    it('disables shadows, AA, and post-processing when switching to low', () => {
      useSettingsStore.getState().setGraphicsQuality('low');
      const state = useSettingsStore.getState();

      expect(state.graphicsQuality).toBe('low');
      expect(state.shadowsEnabled).toBe(false);
      expect(state.postProcessingEnabled).toBe(false);
      expect(state.antiAliasing).toBe('off');
    });

    it('restores shadows and post-processing when switching back to very_high', () => {
      useSettingsStore.getState().setGraphicsQuality('low');
      expect(useSettingsStore.getState().shadowsEnabled).toBe(false);

      useSettingsStore.getState().setGraphicsQuality('very_high');
      const state = useSettingsStore.getState();

      expect(state.graphicsQuality).toBe('very_high');
      expect(state.shadowsEnabled).toBe(true);
      expect(state.postProcessingEnabled).toBe(true);
    });

    it('enables balanced shadows without heavy AA on medium preset', () => {
      useSettingsStore.getState().setGraphicsQuality('low');
      useSettingsStore.getState().setGraphicsQuality('medium');
      const state = useSettingsStore.getState();

      expect(state.graphicsQuality).toBe('medium');
      expect(state.shadowsEnabled).toBe(true);
      expect(state.antiAliasing).toBe('off');
    });

    it('manages dynamic resolution scaling configuration independently of quality preset', () => {
      useSettingsStore.setState({ dynamicResolution: false });
      expect(useSettingsStore.getState().dynamicResolution).toBe(false);

      useSettingsStore.getState().toggleDynamicResolution();
      expect(useSettingsStore.getState().dynamicResolution).toBe(true);

      useSettingsStore.getState().setGraphicsQuality('low');
      expect(useSettingsStore.getState().dynamicResolution).toBe(true);
    });
  });

  describe('PostProcessingErrorBoundary containment', () => {
    it('catches and isolates rendering exceptions without throwing to caller', async () => {
      const { PostProcessingErrorBoundary } = await import('../PostProcessingErrorBoundary');
      const boundary = new PostProcessingErrorBoundary({
        children: null,
      });
      expect(boundary.state.hasError).toBe(false);

      const state = PostProcessingErrorBoundary.getDerivedStateFromError(new Error('WebGL Framebuffer Incomplete'));
      expect(state.hasError).toBe(true);
      expect(state.errorMessage).toBe('WebGL Framebuffer Incomplete');

      const onErrorMock = vi.fn();
      const boundaryWithCallback = new PostProcessingErrorBoundary({
        children: null,
        onError: onErrorMock,
      });

      boundaryWithCallback.componentDidCatch(new Error('Shader Compilation Timeout'), {
        componentStack: 'in EffectComposer\n in GameCanvas',
      });
      expect(onErrorMock).toHaveBeenCalled();
    });
  });

  describe('shouldRenderEnvironment', () => {
    it('enables environment cubemap reflections on desktop across all quality levels', () => {
      expect(shouldRenderEnvironment(false, 'low')).toBe(true);
      expect(shouldRenderEnvironment(false, 'medium')).toBe(true);
      expect(shouldRenderEnvironment(false, 'high')).toBe(true);
      expect(shouldRenderEnvironment(false, 'very_high')).toBe(true);
    });

    it('strictly bypasses environment cubemap reflections on mobile for low and medium presets', () => {
      expect(shouldRenderEnvironment(true, 'low')).toBe(false);
      expect(shouldRenderEnvironment(true, 'medium')).toBe(false);
    });

    it('permits environment cubemap reflections on mobile only for high and very_high presets', () => {
      expect(shouldRenderEnvironment(true, 'high')).toBe(true);
      expect(shouldRenderEnvironment(true, 'very_high')).toBe(true);
    });
  });

  describe('EnvironmentErrorBoundary containment', () => {
    it('catches and isolates cubemap capture exceptions without unmounting the scene', async () => {
      const { EnvironmentErrorBoundary } = await import('../EnvironmentErrorBoundary');
      const boundary = new EnvironmentErrorBoundary({
        children: null,
      });
      expect(boundary.state.hasError).toBe(false);

      const state = EnvironmentErrorBoundary.getDerivedStateFromError(new Error('CubeCamera WebGLRenderTarget OOM'));
      expect(state.hasError).toBe(true);
      expect(state.errorMessage).toBe('CubeCamera WebGLRenderTarget OOM');

      const onErrorMock = vi.fn();
      const boundaryWithCallback = new EnvironmentErrorBoundary({
        children: null,
        onError: onErrorMock,
      });

      boundaryWithCallback.componentDidCatch(new Error('CubeCamera WebGLRenderTarget OOM'), {
        componentStack: 'in Environment\n in GameCanvas',
      });
      expect(onErrorMock).toHaveBeenCalled();
    });
  });
});
