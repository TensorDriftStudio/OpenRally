import { create } from 'zustand';
import type {
  GraphicsQuality,
  TargetFps,
  DrawDistance,
  AntiAliasingMode,
  TouchControlMode,
  TouchSteeringScheme,
  TouchButtonSize,
  TransmissionMode,
  GameSettings,
} from '@/types';
import { DEFAULT_SETTINGS, BALANCED_MOBILE_SETTINGS } from '@/types/settings';
import { isAndroid, isMobileDevice } from '@/utils/device';
import { MIN_STEERING_SENSITIVITY, MAX_STEERING_SENSITIVITY } from '@/config/input';

/**
 * Checks if running on Android or any mobile / touch-first device.
 */
export function isMobileOrAndroid(): boolean {
  return isAndroid() || isMobileDevice();
}

export const SETTINGS_STORAGE_KEY = 'openrally_settings';

/**
 * Returns default settings based on device platform.
 * Android defaults to the Balanced profile ('medium' graphics, 'off' AA, 1.0 DPR);
 * Desktop defaults to 'very_high' graphics and 'smaa' AA.
 */
export function getDefaultSettings(isAndroidDevice: boolean = isMobileOrAndroid()): GameSettings {
  if (isAndroidDevice) {
    return {
      ...DEFAULT_SETTINGS,
      ...BALANCED_MOBILE_SETTINGS,
      shadowsEnabled: false,
      postProcessingEnabled: false,
      graphicsConfiguredByUser: false,
    };
  }
  return {
    ...DEFAULT_SETTINGS,
    graphicsConfiguredByUser: false,
  };
}

/**
 * Loads and validates settings from localStorage.
 * Automatically migrates legacy unoptimized desktop defaults on Android devices
 * unless the user has explicitly manually configured their graphics preferences.
 * Gracefully falls back to defaults on corrupted JSON or missing storage.
 */
export function loadSettingsFromStorage(isAndroidDevice: boolean = isMobileOrAndroid()): Partial<GameSettings> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const validated: Partial<GameSettings> = {};

    if (typeof parsed.graphicsConfiguredByUser === 'boolean') {
      validated.graphicsConfiguredByUser = parsed.graphicsConfiguredByUser;
    }

    // Touch settings validation
    if (['auto', 'always', 'off'].includes(parsed.touchControlMode)) {
      validated.touchControlMode = parsed.touchControlMode as TouchControlMode;
    }
    if (['joystick', 'buttons'].includes(parsed.touchSteeringScheme)) {
      validated.touchSteeringScheme = parsed.touchSteeringScheme as TouchSteeringScheme;
    }
    if (typeof parsed.touchOpacity === 'number' && Number.isFinite(parsed.touchOpacity)) {
      validated.touchOpacity = Math.max(0.2, Math.min(1.0, parsed.touchOpacity));
    }
    if (['small', 'medium', 'large'].includes(parsed.touchButtonSize)) {
      validated.touchButtonSize = parsed.touchButtonSize as TouchButtonSize;
    }
    if (typeof parsed.touchHaptics === 'boolean') {
      validated.touchHaptics = parsed.touchHaptics;
    }

    // Core settings validation
    if (['low', 'medium', 'high', 'very_high'].includes(parsed.graphicsQuality)) {
      validated.graphicsQuality = parsed.graphicsQuality as GraphicsQuality;
    }
    if ([30, 60, 120].includes(parsed.targetFps)) {
      validated.targetFps = parsed.targetFps as TargetFps;
    }
    if (['short', 'medium', 'far', 'ultra'].includes(parsed.drawDistance)) {
      validated.drawDistance = parsed.drawDistance as DrawDistance;
    }
    if (['off', 'smaa', 'msaa'].includes(parsed.antiAliasing)) {
      validated.antiAliasing = parsed.antiAliasing as AntiAliasingMode;
    }
    if (typeof parsed.resolutionScale === 'number' && Number.isFinite(parsed.resolutionScale)) {
      validated.resolutionScale = parsed.resolutionScale;
    }
    if (typeof parsed.dynamicResolution === 'boolean') {
      validated.dynamicResolution = parsed.dynamicResolution;
    }
    if (typeof parsed.shadowsEnabled === 'boolean') {
      validated.shadowsEnabled = isAndroidDevice ? false : parsed.shadowsEnabled;
    }
    if (typeof parsed.postProcessingEnabled === 'boolean') {
      validated.postProcessingEnabled = parsed.postProcessingEnabled;
    }
    if (['automatic', 'manual'].includes(parsed.transmissionMode)) {
      validated.transmissionMode = parsed.transmissionMode as TransmissionMode;
    }
    if (typeof parsed.sensitivity === 'number' && Number.isFinite(parsed.sensitivity)) {
      validated.sensitivity = Math.max(MIN_STEERING_SENSITIVITY, Math.min(MAX_STEERING_SENSITIVITY, parsed.sensitivity));
    }
    if (typeof parsed.debugPhysics === 'boolean') {
      validated.debugPhysics = parsed.debugPhysics;
    }
    if (typeof parsed.sfxVolume === 'number' && Number.isFinite(parsed.sfxVolume)) {
      validated.sfxVolume = parsed.sfxVolume;
    }
    if (typeof parsed.menuMusicVolume === 'number' && Number.isFinite(parsed.menuMusicVolume)) {
      validated.menuMusicVolume = parsed.menuMusicVolume;
    }
    if (typeof parsed.gameMusicVolume === 'number' && Number.isFinite(parsed.gameMusicVolume)) {
      validated.gameMusicVolume = parsed.gameMusicVolume;
    }
    if (typeof parsed.vibrationEnabled === 'boolean') {
      validated.vibrationEnabled = parsed.vibrationEnabled;
    }
    if (typeof parsed.vibrationIntensity === 'number' && Number.isFinite(parsed.vibrationIntensity)) {
      validated.vibrationIntensity = parsed.vibrationIntensity;
    }
    if (typeof parsed.absEnabled === 'boolean') {
      validated.absEnabled = parsed.absEnabled;
    }
    if (typeof parsed.tcsEnabled === 'boolean') {
      validated.tcsEnabled = parsed.tcsEnabled;
    }
    if (typeof parsed.espEnabled === 'boolean') {
      validated.espEnabled = parsed.espEnabled;
    }

    // Migration of legacy stale desktop defaults on Android / mobile:
    if (isAndroidDevice) {
      if (validated.graphicsConfiguredByUser !== true) {
        if (validated.graphicsQuality === 'very_high' || !validated.graphicsQuality) {
          validated.graphicsQuality = 'medium';
          validated.antiAliasing = 'off';
          validated.resolutionScale = 1.0;
          validated.shadowsEnabled = false;
          validated.postProcessingEnabled = false;
          validated.graphicsConfiguredByUser = false;
          saveSettingsToStorage({
            graphicsQuality: 'medium',
            antiAliasing: 'off',
            resolutionScale: 1.0,
            shadowsEnabled: false,
            postProcessingEnabled: false,
            graphicsConfiguredByUser: false,
          });
        }
      }
    }

    return validated;
  } catch {
    return {};
  }
}

/**
 * Persists updated settings to localStorage.
 */
export function saveSettingsToStorage(settings: Partial<GameSettings>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    const merged = { ...(typeof existing === 'object' && existing !== null ? existing : {}), ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Gracefully handle storage errors / quota exceptions
  }
}

/**
 * Settings store — graphics quality, controls sensitivity, toggles, and touch controls.
 */
export interface SettingsStore extends GameSettings {
  // Actions
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setTargetFps: (targetFps: TargetFps) => void;
  setDrawDistance: (drawDistance: DrawDistance) => void;
  setAntiAliasing: (antiAliasing: AntiAliasingMode) => void;
  setResolutionScale: (scale: number) => void;
  toggleDynamicResolution: () => void;
  setDynamicResolution: (enabled: boolean) => void;
  toggleShadows: () => void;
  togglePostProcessing: () => void;
  setSensitivity: (sensitivity: number) => void;
  setTransmissionMode: (mode: TransmissionMode) => void;
  toggleDebugPhysics: () => void;
  setSfxVolume: (vol: number) => void;
  setMenuMusicVolume: (vol: number) => void;
  setGameMusicVolume: (vol: number) => void;
  toggleVibration: () => void;
  setVibrationIntensity: (intensity: number) => void;
  toggleAbs: () => void;
  setAbsEnabled: (enabled: boolean) => void;
  toggleTcs: () => void;
  setTcsEnabled: (enabled: boolean) => void;
  toggleEsp: () => void;
  setEspEnabled: (enabled: boolean) => void;

  // Touch Actions
  setTouchControlMode: (mode: TouchControlMode) => void;
  setTouchSteeringScheme: (scheme: TouchSteeringScheme) => void;
  setTouchOpacity: (opacity: number) => void;
  setTouchButtonSize: (size: TouchButtonSize) => void;
  setTouchHaptics: (enabled: boolean) => void;
}

const defaultSettings = getDefaultSettings();
const initialSaved = loadSettingsFromStorage();

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...defaultSettings,
  ...initialSaved,
  shadowsEnabled: isMobileOrAndroid() ? false : (initialSaved.shadowsEnabled ?? defaultSettings.shadowsEnabled),

  setGraphicsQuality: (graphicsQuality) => {
    let appliedUpdates: Partial<SettingsStore> = {};
    const isMobile = isMobileOrAndroid();
    set(() => {
      const updates: Partial<SettingsStore> = {
        graphicsQuality,
        graphicsConfiguredByUser: true,
      };
      if (graphicsQuality === 'low') {
        updates.postProcessingEnabled = false;
        updates.antiAliasing = 'off';
        updates.shadowsEnabled = false;
        updates.drawDistance = 'short';
      } else if (graphicsQuality === 'medium') {
        updates.shadowsEnabled = isMobile ? false : true;
        updates.postProcessingEnabled = false;
        updates.antiAliasing = 'off';
        updates.drawDistance = 'medium';
      } else if (graphicsQuality === 'high') {
        updates.shadowsEnabled = isMobile ? false : true;
        updates.postProcessingEnabled = isMobile ? false : true;
        updates.antiAliasing = isMobile ? 'off' : 'smaa';
        updates.drawDistance = isMobile ? 'medium' : 'far';
      } else {
        // 'very_high' preset enables rich visual fidelity
        updates.shadowsEnabled = isMobile ? false : true;
        updates.postProcessingEnabled = isMobile ? false : true;
        updates.antiAliasing = isMobile ? 'off' : 'smaa';
        updates.drawDistance = isMobile ? 'far' : 'ultra';
      }
      appliedUpdates = updates;
      return updates;
    });
    saveSettingsToStorage(appliedUpdates);
  },
  setTargetFps: (targetFps) => {
    set({ targetFps, graphicsConfiguredByUser: true });
    saveSettingsToStorage({ targetFps, graphicsConfiguredByUser: true });
  },
  setDrawDistance: (drawDistance) => {
    set({ drawDistance, graphicsConfiguredByUser: true });
    saveSettingsToStorage({ drawDistance, graphicsConfiguredByUser: true });
  },
  setAntiAliasing: (antiAliasing) => {
    set({ antiAliasing, graphicsConfiguredByUser: true });
    saveSettingsToStorage({ antiAliasing, graphicsConfiguredByUser: true });
  },
  setResolutionScale: (resolutionScale) => {
    set({ resolutionScale, graphicsConfiguredByUser: true });
    saveSettingsToStorage({ resolutionScale, graphicsConfiguredByUser: true });
  },
  toggleDynamicResolution: () =>
    set((s) => {
      const next = !s.dynamicResolution;
      saveSettingsToStorage({ dynamicResolution: next, graphicsConfiguredByUser: true });
      return { dynamicResolution: next, graphicsConfiguredByUser: true };
    }),
  setDynamicResolution: (dynamicResolution) => {
    set({ dynamicResolution, graphicsConfiguredByUser: true });
    saveSettingsToStorage({ dynamicResolution, graphicsConfiguredByUser: true });
  },
  toggleShadows: () =>
    set((s) => {
      if (isMobileOrAndroid()) {
        return { shadowsEnabled: false };
      }
      const next = !s.shadowsEnabled;
      saveSettingsToStorage({ shadowsEnabled: next, graphicsConfiguredByUser: true });
      return { shadowsEnabled: next, graphicsConfiguredByUser: true };
    }),
  togglePostProcessing: () =>
    set((s) => {
      const next = !s.postProcessingEnabled;
      saveSettingsToStorage({ postProcessingEnabled: next, graphicsConfiguredByUser: true });
      return { postProcessingEnabled: next, graphicsConfiguredByUser: true };
    }),
  setSensitivity: (sensitivity) => {
    const clamped = Math.max(
      MIN_STEERING_SENSITIVITY,
      Math.min(MAX_STEERING_SENSITIVITY, Math.round(sensitivity * 100) / 100),
    );
    set({ sensitivity: clamped });
    saveSettingsToStorage({ sensitivity: clamped });
  },
  toggleDebugPhysics: () =>
    set((s) => {
      const next = !s.debugPhysics;
      saveSettingsToStorage({ debugPhysics: next });
      return { debugPhysics: next };
    }),
  setSfxVolume: (sfxVolume) => {
    set({ sfxVolume });
    saveSettingsToStorage({ sfxVolume });
  },
  setMenuMusicVolume: (menuMusicVolume) => {
    set({ menuMusicVolume });
    saveSettingsToStorage({ menuMusicVolume });
  },
  setGameMusicVolume: (gameMusicVolume) => {
    set({ gameMusicVolume });
    saveSettingsToStorage({ gameMusicVolume });
  },
  toggleVibration: () =>
    set((s) => {
      const next = !s.vibrationEnabled;
      saveSettingsToStorage({ vibrationEnabled: next });
      return { vibrationEnabled: next };
    }),
  setVibrationIntensity: (vibrationIntensity) => {
    set({ vibrationIntensity });
    saveSettingsToStorage({ vibrationIntensity });
  },
  setTransmissionMode: (transmissionMode) => {
    set({ transmissionMode });
    saveSettingsToStorage({ transmissionMode });
  },
  toggleAbs: () =>
    set((s) => {
      const next = !s.absEnabled;
      saveSettingsToStorage({ absEnabled: next });
      return { absEnabled: next };
    }),
  setAbsEnabled: (absEnabled) => {
    const next = Boolean(absEnabled);
    set({ absEnabled: next });
    saveSettingsToStorage({ absEnabled: next });
  },
  toggleTcs: () =>
    set((s) => {
      const next = !s.tcsEnabled;
      saveSettingsToStorage({ tcsEnabled: next });
      return { tcsEnabled: next };
    }),
  setTcsEnabled: (tcsEnabled) => {
    const next = Boolean(tcsEnabled);
    set({ tcsEnabled: next });
    saveSettingsToStorage({ tcsEnabled: next });
  },
  toggleEsp: () =>
    set((s) => {
      const next = !s.espEnabled;
      saveSettingsToStorage({ espEnabled: next });
      return { espEnabled: next };
    }),
  setEspEnabled: (espEnabled) => {
    const next = Boolean(espEnabled);
    set({ espEnabled: next });
    saveSettingsToStorage({ espEnabled: next });
  },

  // Touch Actions
  setTouchControlMode: (touchControlMode) => {
    set({ touchControlMode });
    saveSettingsToStorage({ touchControlMode });
  },
  setTouchSteeringScheme: (touchSteeringScheme) => {
    set({ touchSteeringScheme });
    saveSettingsToStorage({ touchSteeringScheme });
  },
  setTouchOpacity: (opacity) => {
    const touchOpacity = Number.isFinite(opacity)
      ? Math.max(0.2, Math.min(1.0, opacity))
      : 0.7;
    set({ touchOpacity });
    saveSettingsToStorage({ touchOpacity });
  },
  setTouchButtonSize: (touchButtonSize) => {
    set({ touchButtonSize });
    saveSettingsToStorage({ touchButtonSize });
  },
  setTouchHaptics: (touchHaptics) => {
    const enabled = Boolean(touchHaptics);
    set({ touchHaptics: enabled });
    saveSettingsToStorage({ touchHaptics: enabled });
  },
}));
