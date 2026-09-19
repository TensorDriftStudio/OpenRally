import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useSettingsStore,
  getDefaultSettings,
  loadSettingsFromStorage,
  SETTINGS_STORAGE_KEY,
} from '../settingsStore';

describe('settingsStore', () => {
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
      antiAliasing: 'smaa',
      resolutionScale: 1.0,
      dynamicResolution: false,
      shadowsEnabled: true,
      postProcessingEnabled: true,
      sensitivity: 1.0,
      debugPhysics: false,
      sfxVolume: 1.0,
      menuMusicVolume: 0.5,
      gameMusicVolume: 0.5,
      graphicsConfiguredByUser: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getDefaultSettings', () => {
    it('returns Balanced profile settings when on Android (isAndroidDevice = true)', () => {
      const settings = getDefaultSettings(true);
      expect(settings.graphicsQuality).toBe('medium');
      expect(settings.antiAliasing).toBe('off');
      expect(settings.resolutionScale).toBe(1.0);
      expect(settings.dynamicResolution).toBe(false);
      expect(settings.shadowsEnabled).toBe(false);
      expect(settings.postProcessingEnabled).toBe(false);
      expect(settings.graphicsConfiguredByUser).toBe(false);
    });

    it('returns desktop settings when not on Android (isAndroidDevice = false)', () => {
      const settings = getDefaultSettings(false);
      expect(settings.graphicsQuality).toBe('very_high');
      expect(settings.antiAliasing).toBe('smaa');
      expect(settings.resolutionScale).toBe(1.0);
      expect(settings.dynamicResolution).toBe(false);
      expect(settings.graphicsConfiguredByUser).toBe(false);
    });
  });

  describe('loadSettingsFromStorage & Android migration', () => {
    it('migrates legacy unoptimized desktop defaults (very_high) on Android when graphicsConfiguredByUser is falsy', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          graphicsQuality: 'very_high',
          antiAliasing: 'smaa',
          resolutionScale: 1.0,
          sfxVolume: 0.8,
        })
      );

      const loaded = loadSettingsFromStorage(true);
      expect(loaded.graphicsQuality).toBe('medium');
      expect(loaded.antiAliasing).toBe('off');
      expect(loaded.resolutionScale).toBe(1.0);
      expect(loaded.graphicsConfiguredByUser).toBe(false);
      expect(loaded.sfxVolume).toBe(0.8);

      // Verify that migrated settings were written to localStorage
      const persisted = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted.graphicsQuality).toBe('medium');
      expect(persisted.antiAliasing).toBe('off');
      expect(persisted.graphicsConfiguredByUser).toBe(false);
      expect(persisted.sfxVolume).toBe(0.8);
    });

    it('preserves manual user configuration on Android when graphicsConfiguredByUser is true', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          graphicsQuality: 'very_high',
          antiAliasing: 'smaa',
          graphicsConfiguredByUser: true,
        })
      );

      const loaded = loadSettingsFromStorage(true);
      expect(loaded.graphicsQuality).toBe('very_high');
      expect(loaded.antiAliasing).toBe('smaa');
      expect(loaded.graphicsConfiguredByUser).toBe(true);
    });

    it('preserves user choice if user manually chose low or high on Android', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          graphicsQuality: 'high',
          graphicsConfiguredByUser: true,
        })
      );

      const loaded = loadSettingsFromStorage(true);
      expect(loaded.graphicsQuality).toBe('high');
      expect(loaded.graphicsConfiguredByUser).toBe(true);
    });

    it('does not migrate very_high settings on desktop / non-Android platforms', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          graphicsQuality: 'very_high',
          antiAliasing: 'smaa',
        })
      );

      const loaded = loadSettingsFromStorage(false);
      expect(loaded.graphicsQuality).toBe('very_high');
      expect(loaded.antiAliasing).toBe('smaa');
    });

    it('loads and validates targetFps from storage, ignoring invalid values', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ targetFps: 120 })
      );
      expect(loadSettingsFromStorage(false).targetFps).toBe(120);

      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ targetFps: 30 })
      );
      expect(loadSettingsFromStorage(false).targetFps).toBe(30);

      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ targetFps: 45 })
      );
      expect(loadSettingsFromStorage(false).targetFps).toBeUndefined();
    });

    it('returns empty object when localStorage is empty or corrupted', () => {
      expect(loadSettingsFromStorage(true)).toEqual({});

      localStorage.setItem(SETTINGS_STORAGE_KEY, 'invalid-json{{{');
      expect(loadSettingsFromStorage(true)).toEqual({});
    });
  });

  describe('Explicit User Graphics Configuration Tracking', () => {
    it('marks graphicsConfiguredByUser: true when setGraphicsQuality is called', () => {
      useSettingsStore.getState().setGraphicsQuality('high');

      expect(useSettingsStore.getState().graphicsQuality).toBe('high');
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      const persisted = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted.graphicsConfiguredByUser).toBe(true);
      expect(persisted.graphicsQuality).toBe('high');
    });

    it('marks graphicsConfiguredByUser: true when setAntiAliasing is called', () => {
      useSettingsStore.getState().setAntiAliasing('msaa');

      expect(useSettingsStore.getState().antiAliasing).toBe('msaa');
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      const persisted = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted.graphicsConfiguredByUser).toBe(true);
    });

    it('marks graphicsConfiguredByUser: true when setResolutionScale is called', () => {
      useSettingsStore.getState().setResolutionScale(0.75);

      expect(useSettingsStore.getState().resolutionScale).toBe(0.75);
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      const persisted = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted.graphicsConfiguredByUser).toBe(true);
    });

    it('marks graphicsConfiguredByUser: true when toggleShadows, togglePostProcessing or toggleDynamicResolution is called', () => {
      useSettingsStore.getState().toggleShadows();
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      useSettingsStore.getState().togglePostProcessing();
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      useSettingsStore.setState({ graphicsConfiguredByUser: false });
      useSettingsStore.getState().toggleDynamicResolution();
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);
      expect(useSettingsStore.getState().dynamicResolution).toBe(true);
    });

    it('marks graphicsConfiguredByUser: true when setTargetFps is called and persists value', () => {
      useSettingsStore.setState({ graphicsConfiguredByUser: false });
      useSettingsStore.getState().setTargetFps(30);

      expect(useSettingsStore.getState().targetFps).toBe(30);
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

      const persisted30 = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted30.targetFps).toBe(30);
      expect(persisted30.graphicsConfiguredByUser).toBe(true);

      useSettingsStore.getState().setTargetFps(120);
      expect(useSettingsStore.getState().targetFps).toBe(120);

      const persisted120 = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(persisted120.targetFps).toBe(120);
    });

    it('does not touch graphicsConfiguredByUser when non-graphics settings are modified', () => {
      useSettingsStore.setState({ graphicsConfiguredByUser: false });

      useSettingsStore.getState().setSfxVolume(0.5);
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(false);

      useSettingsStore.getState().setSensitivity(1.2);
      expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(false);
    });
  });

  it('initializes with very_high graphics, smaa anti-aliasing, and 1.0 resolution scale by default', () => {
    expect(useSettingsStore.getState().graphicsQuality).toBe('very_high');
    expect(useSettingsStore.getState().antiAliasing).toBe('smaa');
    expect(useSettingsStore.getState().resolutionScale).toBe(1.0);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(true);
  });

  it('updates anti-aliasing and resolution scale', () => {
    const { setAntiAliasing, setResolutionScale } = useSettingsStore.getState();

    setAntiAliasing('msaa');
    expect(useSettingsStore.getState().antiAliasing).toBe('msaa');

    setAntiAliasing('off');
    expect(useSettingsStore.getState().antiAliasing).toBe('off');

    setResolutionScale(0.75);
    expect(useSettingsStore.getState().resolutionScale).toBe(0.75);

    setResolutionScale(1.25);
    expect(useSettingsStore.getState().resolutionScale).toBe(1.25);
  });

  it('updates graphics quality preset', () => {
    useSettingsStore.getState().setGraphicsQuality('very_high');
    expect(useSettingsStore.getState().graphicsQuality).toBe('very_high');

    useSettingsStore.getState().setGraphicsQuality('high');
    expect(useSettingsStore.getState().graphicsQuality).toBe('high');

    useSettingsStore.getState().setGraphicsQuality('low');
    expect(useSettingsStore.getState().graphicsQuality).toBe('low');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);
    expect(useSettingsStore.getState().antiAliasing).toBe('off');

    // Switching back from low to very_high restores shadows and post-processing on desktop
    useSettingsStore.getState().setGraphicsQuality('very_high');
    expect(useSettingsStore.getState().graphicsQuality).toBe('very_high');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(true);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(true);
  });

  it('strictly disables shadows and post-processing across all presets on mobile devices', async () => {
    const deviceModule = await import('@/utils/device');
    const isMobileSpy = vi.spyOn(deviceModule, 'isMobileDevice').mockReturnValue(true);
    const isAndroidSpy = vi.spyOn(deviceModule, 'isAndroid').mockReturnValue(true);

    const store = useSettingsStore.getState();

    store.setGraphicsQuality('very_high');
    expect(useSettingsStore.getState().graphicsQuality).toBe('very_high');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);

    store.setGraphicsQuality('high');
    expect(useSettingsStore.getState().graphicsQuality).toBe('high');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);

    store.setGraphicsQuality('medium');
    expect(useSettingsStore.getState().graphicsQuality).toBe('medium');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);

    store.setGraphicsQuality('low');
    expect(useSettingsStore.getState().graphicsQuality).toBe('low');
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);

    isMobileSpy.mockRestore();
    isAndroidSpy.mockRestore();
  });

  it('toggles settings boolean flags', () => {
    const { toggleShadows, togglePostProcessing, toggleDebugPhysics, toggleDynamicResolution } = useSettingsStore.getState();

    toggleShadows();
    expect(useSettingsStore.getState().shadowsEnabled).toBe(false);

    togglePostProcessing();
    expect(useSettingsStore.getState().postProcessingEnabled).toBe(false);

    toggleDebugPhysics();
    expect(useSettingsStore.getState().debugPhysics).toBe(true);

    expect(useSettingsStore.getState().dynamicResolution).toBe(false);
    toggleDynamicResolution();
    expect(useSettingsStore.getState().dynamicResolution).toBe(true);
    toggleDynamicResolution();
    expect(useSettingsStore.getState().dynamicResolution).toBe(false);
  });

  it('updates volume sliders', () => {
    const { setSfxVolume, setMenuMusicVolume, setGameMusicVolume } = useSettingsStore.getState();

    setSfxVolume(0.8);
    setMenuMusicVolume(0.2);
    setGameMusicVolume(0.7);

    const state = useSettingsStore.getState();
    expect(state.sfxVolume).toBe(0.8);
    expect(state.menuMusicVolume).toBe(0.2);
    expect(state.gameMusicVolume).toBe(0.7);
  });

  it('updates vibration and sensitivity controls', () => {
    const { toggleVibration, setVibrationIntensity, setSensitivity } = useSettingsStore.getState();

    toggleVibration();
    expect(useSettingsStore.getState().vibrationEnabled).toBe(false);

    setVibrationIntensity(0.75);
    expect(useSettingsStore.getState().vibrationIntensity).toBe(0.75);

    setSensitivity(1.4);
    expect(useSettingsStore.getState().sensitivity).toBe(1.4);
  });

  it('updates draw distance and sets graphicsConfiguredByUser', () => {
    const { setDrawDistance } = useSettingsStore.getState();

    setDrawDistance('short');
    expect(useSettingsStore.getState().drawDistance).toBe('short');
    expect(useSettingsStore.getState().graphicsConfiguredByUser).toBe(true);

    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    expect(saved.drawDistance).toBe('short');
    expect(saved.graphicsConfiguredByUser).toBe(true);

    setDrawDistance('ultra');
    expect(useSettingsStore.getState().drawDistance).toBe('ultra');
  });

  it('loads valid draw distance from storage', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        drawDistance: 'short',
        graphicsConfiguredByUser: true,
      })
    );

    const loaded = loadSettingsFromStorage(false);
    expect(loaded.drawDistance).toBe('short');
  });

  describe('transmissionMode', () => {
    it('defaults to automatic transmission', () => {
      expect(useSettingsStore.getState().transmissionMode).toBe('automatic');
    });

    it('updates transmission mode and persists to localStorage', () => {
      const { setTransmissionMode } = useSettingsStore.getState();
      setTransmissionMode('manual');
      expect(useSettingsStore.getState().transmissionMode).toBe('manual');

      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(saved.transmissionMode).toBe('manual');

      setTransmissionMode('automatic');
      expect(useSettingsStore.getState().transmissionMode).toBe('automatic');
    });

    it('loads transmissionMode from localStorage', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          transmissionMode: 'manual',
        })
      );

      const loaded = loadSettingsFromStorage(false);
      expect(loaded.transmissionMode).toBe('manual');
    });
  });

  describe('driving assists (ABS, TCS, ESP)', () => {
    it('defaults to all assists disabled', () => {
      const state = useSettingsStore.getState();
      expect(state.absEnabled).toBe(false);
      expect(state.tcsEnabled).toBe(false);
      expect(state.espEnabled).toBe(false);
    });

    it('toggles ABS and persists to localStorage', () => {
      const { toggleAbs, setAbsEnabled } = useSettingsStore.getState();

      toggleAbs();
      expect(useSettingsStore.getState().absEnabled).toBe(true);
      let saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(saved.absEnabled).toBe(true);

      toggleAbs();
      expect(useSettingsStore.getState().absEnabled).toBe(false);

      setAbsEnabled(true);
      expect(useSettingsStore.getState().absEnabled).toBe(true);
    });

    it('toggles TCS and persists to localStorage', () => {
      const { toggleTcs, setTcsEnabled } = useSettingsStore.getState();

      toggleTcs();
      expect(useSettingsStore.getState().tcsEnabled).toBe(true);
      let saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(saved.tcsEnabled).toBe(true);

      toggleTcs();
      expect(useSettingsStore.getState().tcsEnabled).toBe(false);

      setTcsEnabled(true);
      expect(useSettingsStore.getState().tcsEnabled).toBe(true);
    });

    it('toggles ESP and persists to localStorage', () => {
      const { toggleEsp, setEspEnabled } = useSettingsStore.getState();

      toggleEsp();
      expect(useSettingsStore.getState().espEnabled).toBe(true);
      let saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      expect(saved.espEnabled).toBe(true);

      toggleEsp();
      expect(useSettingsStore.getState().espEnabled).toBe(false);

      setEspEnabled(true);
      expect(useSettingsStore.getState().espEnabled).toBe(true);
    });

    it('loads assists from localStorage correctly', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          absEnabled: false,
          tcsEnabled: false,
          espEnabled: false,
        })
      );

      const loaded = loadSettingsFromStorage(false);
      expect(loaded.absEnabled).toBe(false);
      expect(loaded.tcsEnabled).toBe(false);
      expect(loaded.espEnabled).toBe(false);
    });
  });
});

