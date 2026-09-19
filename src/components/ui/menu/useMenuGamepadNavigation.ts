import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { sampleGamepad } from '@/utils/input/gamepad';
import { isTextEditingActive } from '@/utils/input/textInput';
import { getAvailableLevels, getLevelPreset } from '@/config/levelRegistry';
import { getAvailableVehicles } from '@/config/vehicleRegistry';
import { AVAILABLE_TIRE_TYPES } from '@/config/tireRegistry';
import { MIN_STEERING_SENSITIVITY, MAX_STEERING_SENSITIVITY, STEERING_SENSITIVITY_STEP } from '@/config/input';
import { unlockSharedAudioContext } from '@/utils/audio/audioContext';
import { getMenuGamepadDelegate } from './menuGamepadRegistry';
import type {
  GraphicsQuality,
  AntiAliasingMode,
  TargetFps,
  DrawDistance,
  TouchControlMode,
  TouchSteeringScheme,
  TouchButtonSize,
  TransmissionMode,
  GameMode,
} from '@/types';
import type { MenuView, ControlsTab, ResetConfirmState, SettingsCategory } from './types';

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  'graphics',
  'audio',
  'controls',
  'touch',
  'gameplay',
] as const;

export interface MenuNavigationOptions {
  readonly view: MenuView;
  readonly focusedIndex: number;
  readonly previewVehicleId: string;
  readonly controlsTab: ControlsTab;
  readonly resetConfirmState: ResetConfirmState;
  readonly settingsCategory?: SettingsCategory;
  readonly onSetSettingsCategory?: (cat: SettingsCategory) => void;
  readonly setView: (v: MenuView) => void;
  readonly setFocusedIndex: (idx: number) => void;
  readonly setPreviewVehicleId: (id: string) => void;
  readonly setControlsTab: (tab: ControlsTab) => void;
  readonly handleLaunchMode: (mode: GameMode) => void;
  readonly handleStartRace?: (vehicleId: string) => void;
  readonly handleReset: () => void;
  readonly handleSelectTrack: (levelId: string) => void;
  readonly handleReturnToMainMenu: () => void;
  readonly handleResetRecordsAction: () => void;
}

/**
 * Custom hook isolating gamepad and keyboard menu navigation loops and direction handlers.
 * Supports D-Pad, Left Stick, Bumpers (LB/RB), Action Buttons (A/B), and Keyboard (Arrows/WASD/QE/Enter/Esc).
 */
export function useMenuGamepadNavigation({
  view,
  focusedIndex,
  previewVehicleId,
  controlsTab,
  settingsCategory = 'graphics',
  onSetSettingsCategory,
  setView,
  setFocusedIndex,
  setPreviewVehicleId,
  setControlsTab,
  handleLaunchMode,
  handleStartRace,
  handleReset,
  handleSelectTrack,
  handleReturnToMainMenu,
  handleResetRecordsAction,
}: MenuNavigationOptions) {
  const gameState = useGameStore((s) => s.gameState);
  const setGameState = useGameStore((s) => s.setGameState);
  const setSelectedVehicleId = useGameStore((s) => s.setSelectedVehicleId);

  const availableVehicles = getAvailableVehicles();
  const availableLevels = getAvailableLevels();

  const viewRef = useRef(view);
  viewRef.current = view;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const controlsTabRef = useRef(controlsTab);
  controlsTabRef.current = controlsTab;
  const previewVehicleIdRef = useRef(previewVehicleId);
  previewVehicleIdRef.current = previewVehicleId;
  const settingsCategoryRef = useRef(settingsCategory);
  settingsCategoryRef.current = settingsCategory;
  const onSetSettingsCategoryRef = useRef(onSetSettingsCategory);
  onSetSettingsCategoryRef.current = onSetSettingsCategory;

  const getItemCount = useCallback((): number => {
    const curView = viewRef.current;
    if (curView === 'main') {
      return useGameStore.getState().gameState === 'paused' ? 4 : 4;
    }
    if (curView === 'tracks') return availableLevels.length + 1;
    if (curView === 'start_mode') return 3;
    if (curView === 'garage') return 3;
    if (curView === 'multiplayer') return 2;
    if (curView === 'options') {
      const cat = settingsCategoryRef.current;
      if (cat === 'graphics') return 10; // 0: Tabs, 1: Quality, 2: FPS, 3: DrawDist, 4: AA, 5: Res, 6: DynamicRes, 7: Shadows, 8: PP, 9: Back
      if (cat === 'audio') return 5; // 0: Tabs, 1: MenuMusic, 2: GameMusic, 3: SFX, 4: Back
      if (cat === 'controls') return 3; // 0: Tabs, 1: TabSelector, 2: Back
      if (cat === 'touch') return 7; // 0: Tabs, 1: OverlayMode, 2: Scheme, 3: Size, 4: Opacity, 5: Haptics, 6: Back
      if (cat === 'gameplay') {
        const isVib = useSettingsStore.getState().vibrationEnabled;
        return isVib ? 10 : 9; // 0: Tabs, 1: Transmission, 2: ABS, 3: TCS, 4: ESP, 5: Sens, 6: VibToggle, [7: VibInt], 7/8: Reset, 8/9: Back
      }
      return 2;
    }
    if (curView === 'controls') return 1;
    if (curView === 'credits') return 2;
    return 1;
  }, [availableLevels.length]);

  const handleTabLeft = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleTabLeft) {
      delegate.handleTabLeft();
      return;
    }

    if (curView === 'options') {
      const curCat = settingsCategoryRef.current;
      const idx = SETTINGS_CATEGORIES.indexOf(curCat);
      const nextIdx = (idx - 1 + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length;
      onSetSettingsCategoryRef.current?.(SETTINGS_CATEGORIES[nextIdx]);
      setFocusedIndex(0);
    } else if (curView === 'controls') {
      const tabs: ControlsTab[] = ['dualsense', 'xbox', 'keyboard'];
      const tabIdx = tabs.indexOf(controlsTabRef.current);
      setControlsTab(tabs[(tabIdx - 1 + tabs.length) % tabs.length]);
    } else if (curView === 'garage') {
      const currentIndex = availableVehicles.findIndex((v) => v.id === previewVehicleIdRef.current);
      const nextIdx = (currentIndex - 1 + availableVehicles.length) % availableVehicles.length;
      setPreviewVehicleId(availableVehicles[nextIdx].id);
    }
  }, [availableVehicles, setControlsTab, setFocusedIndex, setPreviewVehicleId]);

  const handleTabRight = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleTabRight) {
      delegate.handleTabRight();
      return;
    }

    if (curView === 'options') {
      const curCat = settingsCategoryRef.current;
      const idx = SETTINGS_CATEGORIES.indexOf(curCat);
      const nextIdx = (idx + 1) % SETTINGS_CATEGORIES.length;
      onSetSettingsCategoryRef.current?.(SETTINGS_CATEGORIES[nextIdx]);
      setFocusedIndex(0);
    } else if (curView === 'controls') {
      const tabs: ControlsTab[] = ['dualsense', 'xbox', 'keyboard'];
      const tabIdx = tabs.indexOf(controlsTabRef.current);
      setControlsTab(tabs[(tabIdx + 1) % tabs.length]);
    } else if (curView === 'garage') {
      const currentIndex = availableVehicles.findIndex((v) => v.id === previewVehicleIdRef.current);
      const nextIdx = (currentIndex + 1) % availableVehicles.length;
      setPreviewVehicleId(availableVehicles[nextIdx].id);
    }
  }, [availableVehicles, setControlsTab, setFocusedIndex, setPreviewVehicleId]);

  const handleNavUp = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleNavUp) {
      delegate.handleNavUp();
      return;
    }

    if (curView === 'start_mode') {
      const curIdx = focusedIndexRef.current;
      if (curIdx === 2) {
        setFocusedIndex(0);
      } else {
        setFocusedIndex(2);
      }
      return;
    }

    const count = getItemCount();
    const next = (focusedIndexRef.current - 1 + count) % count;
    setFocusedIndex(next);
  }, [getItemCount, setFocusedIndex]);

  const handleNavDown = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleNavDown) {
      delegate.handleNavDown();
      return;
    }

    if (curView === 'start_mode') {
      const curIdx = focusedIndexRef.current;
      if (curIdx === 0 || curIdx === 1) {
        setFocusedIndex(2);
      } else {
        setFocusedIndex(0);
      }
      return;
    }

    const count = getItemCount();
    const next = (focusedIndexRef.current + 1) % count;
    setFocusedIndex(next);
  }, [getItemCount, setFocusedIndex]);

  const handleNavLeft = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleNavLeft) {
      delegate.handleNavLeft();
      return;
    }

    const curIdx = focusedIndexRef.current;

    if (curView === 'start_mode') {
      if (curIdx === 1) {
        setFocusedIndex(0);
      }
    } else if (curView === 'garage') {
      if (curIdx === 0) {
        const currentTire = useGameStore.getState().selectedTireType;
        const tireIdx = AVAILABLE_TIRE_TYPES.indexOf(currentTire);
        const prevTireIdx = (tireIdx - 1 + AVAILABLE_TIRE_TYPES.length) % AVAILABLE_TIRE_TYPES.length;
        useGameStore.getState().setSelectedTireType(AVAILABLE_TIRE_TYPES[prevTireIdx]);
      } else {
        const currentIndex = availableVehicles.findIndex((v) => v.id === previewVehicleIdRef.current);
        const nextIdx = (currentIndex - 1 + availableVehicles.length) % availableVehicles.length;
        setPreviewVehicleId(availableVehicles[nextIdx].id);
      }
    } else if (curView === 'controls') {
      handleTabLeft();
    } else if (curView === 'options') {
      if (curIdx === 0) {
        handleTabLeft();
        return;
      }
      const cat = settingsCategoryRef.current;
      const settings = useSettingsStore.getState();

      if (cat === 'graphics') {
        const qualities: GraphicsQuality[] = ['low', 'medium', 'high', 'very_high'];
        const targetFpsList: TargetFps[] = [30, 60, 120];
        const drawDistances: DrawDistance[] = ['short', 'medium', 'far', 'ultra'];
        const aaModes: AntiAliasingMode[] = ['off', 'smaa', 'msaa'];
        const scales = [0.5, 0.75, 1.0, 1.25, 1.5];

        if (curIdx === 1) {
          const qIdx = qualities.indexOf(settings.graphicsQuality);
          if (qIdx > 0) settings.setGraphicsQuality(qualities[qIdx - 1]);
        } else if (curIdx === 2) {
          const fIdx = targetFpsList.indexOf(settings.targetFps);
          if (fIdx > 0) settings.setTargetFps(targetFpsList[fIdx - 1]);
        } else if (curIdx === 3) {
          const dIdx = drawDistances.indexOf(settings.drawDistance);
          if (dIdx > 0) settings.setDrawDistance(drawDistances[dIdx - 1]);
        } else if (curIdx === 4) {
          const aaIdx = aaModes.indexOf(settings.antiAliasing);
          if (aaIdx > 0) settings.setAntiAliasing(aaModes[aaIdx - 1]);
        } else if (curIdx === 5) {
          const sIdx = scales.indexOf(settings.resolutionScale);
          if (sIdx > 0) settings.setResolutionScale(scales[sIdx - 1]);
        } else if (curIdx === 6) {
          settings.toggleDynamicResolution();
        } else if (curIdx === 7) {
          settings.toggleShadows();
        } else if (curIdx === 8) {
          settings.togglePostProcessing();
        }
      } else if (cat === 'audio') {
        if (curIdx === 1) {
          settings.setMenuMusicVolume(Math.max(0, Math.min(1, Math.round((settings.menuMusicVolume - 0.05) * 100) / 100)));
        } else if (curIdx === 2) {
          settings.setGameMusicVolume(Math.max(0, Math.min(1, Math.round((settings.gameMusicVolume - 0.05) * 100) / 100)));
        } else if (curIdx === 3) {
          settings.setSfxVolume(Math.max(0, Math.min(1, Math.round((settings.sfxVolume - 0.05) * 100) / 100)));
        }
      } else if (cat === 'controls') {
        if (curIdx === 1) {
          const tabs: ControlsTab[] = ['dualsense', 'xbox', 'keyboard'];
          const tabIdx = tabs.indexOf(controlsTabRef.current);
          setControlsTab(tabs[(tabIdx - 1 + tabs.length) % tabs.length]);
        }
      } else if (cat === 'touch') {
        const modes: TouchControlMode[] = ['auto', 'always', 'off'];
        const schemes: TouchSteeringScheme[] = ['joystick', 'buttons', 'tilt'];
        const sizes: TouchButtonSize[] = ['small', 'medium', 'large'];

        if (curIdx === 1) {
          const mIdx = modes.indexOf(settings.touchControlMode);
          if (mIdx > 0) settings.setTouchControlMode(modes[mIdx - 1]);
        } else if (curIdx === 2) {
          const scIdx = schemes.indexOf(settings.touchSteeringScheme);
          if (scIdx > 0) settings.setTouchSteeringScheme(schemes[scIdx - 1]);
        } else if (curIdx === 3) {
          const szIdx = sizes.indexOf(settings.touchButtonSize);
          if (szIdx > 0) settings.setTouchButtonSize(sizes[szIdx - 1]);
        } else if (curIdx === 4) {
          settings.setTouchOpacity(Math.max(0.2, Math.min(1.0, Math.round((settings.touchOpacity - 0.05) * 100) / 100)));
        } else if (curIdx === 5) {
          settings.setTouchHaptics(!settings.touchHaptics);
        }
      } else if (cat === 'gameplay') {
        const isVib = settings.vibrationEnabled;
        if (curIdx === 1) {
          const next: TransmissionMode = settings.transmissionMode === 'manual' ? 'automatic' : 'manual';
          settings.setTransmissionMode(next);
        } else if (curIdx === 2) {
          settings.toggleAbs();
        } else if (curIdx === 3) {
          settings.toggleTcs();
        } else if (curIdx === 4) {
          settings.toggleEsp();
        } else if (curIdx === 5) {
          settings.setSensitivity(Math.max(MIN_STEERING_SENSITIVITY, Math.min(MAX_STEERING_SENSITIVITY, Math.round((settings.sensitivity - STEERING_SENSITIVITY_STEP) * 100) / 100)));
        } else if (curIdx === 6) {
          settings.toggleVibration();
        } else if (isVib && curIdx === 7) {
          settings.setVibrationIntensity(Math.max(0.1, Math.min(1.0, Math.round((settings.vibrationIntensity - 0.05) * 100) / 100)));
        }
      }
    }
  }, [availableVehicles, handleTabLeft, setControlsTab, setFocusedIndex, setPreviewVehicleId]);

  const handleNavRight = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleNavRight) {
      delegate.handleNavRight();
      return;
    }

    const curIdx = focusedIndexRef.current;

    if (curView === 'start_mode') {
      if (curIdx === 0) {
        setFocusedIndex(1);
      }
    } else if (curView === 'garage') {
      if (curIdx === 0) {
        const currentTire = useGameStore.getState().selectedTireType;
        const tireIdx = AVAILABLE_TIRE_TYPES.indexOf(currentTire);
        const nextTireIdx = (tireIdx + 1) % AVAILABLE_TIRE_TYPES.length;
        useGameStore.getState().setSelectedTireType(AVAILABLE_TIRE_TYPES[nextTireIdx]);
      } else {
        const currentIndex = availableVehicles.findIndex((v) => v.id === previewVehicleIdRef.current);
        const nextIdx = (currentIndex + 1) % availableVehicles.length;
        setPreviewVehicleId(availableVehicles[nextIdx].id);
      }
    } else if (curView === 'controls') {
      handleTabRight();
    } else if (curView === 'options') {
      if (curIdx === 0) {
        handleTabRight();
        return;
      }
      const cat = settingsCategoryRef.current;
      const settings = useSettingsStore.getState();

      if (cat === 'graphics') {
        const qualities: GraphicsQuality[] = ['low', 'medium', 'high', 'very_high'];
        const targetFpsList: TargetFps[] = [30, 60, 120];
        const drawDistances: DrawDistance[] = ['short', 'medium', 'far', 'ultra'];
        const aaModes: AntiAliasingMode[] = ['off', 'smaa', 'msaa'];
        const scales = [0.5, 0.75, 1.0, 1.25, 1.5];

        if (curIdx === 1) {
          const qIdx = qualities.indexOf(settings.graphicsQuality);
          if (qIdx < qualities.length - 1) settings.setGraphicsQuality(qualities[qIdx + 1]);
        } else if (curIdx === 2) {
          const fIdx = targetFpsList.indexOf(settings.targetFps);
          if (fIdx < targetFpsList.length - 1) settings.setTargetFps(targetFpsList[fIdx + 1]);
        } else if (curIdx === 3) {
          const dIdx = drawDistances.indexOf(settings.drawDistance);
          if (dIdx < drawDistances.length - 1) settings.setDrawDistance(drawDistances[dIdx + 1]);
        } else if (curIdx === 4) {
          const aaIdx = aaModes.indexOf(settings.antiAliasing);
          if (aaIdx < aaModes.length - 1) settings.setAntiAliasing(aaModes[aaIdx + 1]);
        } else if (curIdx === 5) {
          const sIdx = scales.indexOf(settings.resolutionScale);
          if (sIdx < scales.length - 1) settings.setResolutionScale(scales[sIdx + 1]);
        } else if (curIdx === 6) {
          settings.toggleDynamicResolution();
        } else if (curIdx === 7) {
          settings.toggleShadows();
        } else if (curIdx === 8) {
          settings.togglePostProcessing();
        }
      } else if (cat === 'audio') {
        if (curIdx === 1) {
          settings.setMenuMusicVolume(Math.max(0, Math.min(1, Math.round((settings.menuMusicVolume + 0.05) * 100) / 100)));
        } else if (curIdx === 2) {
          settings.setGameMusicVolume(Math.max(0, Math.min(1, Math.round((settings.gameMusicVolume + 0.05) * 100) / 100)));
        } else if (curIdx === 3) {
          settings.setSfxVolume(Math.max(0, Math.min(1, Math.round((settings.sfxVolume + 0.05) * 100) / 100)));
        }
      } else if (cat === 'controls') {
        if (curIdx === 1) {
          const tabs: ControlsTab[] = ['dualsense', 'xbox', 'keyboard'];
          const tabIdx = tabs.indexOf(controlsTabRef.current);
          setControlsTab(tabs[(tabIdx + 1) % tabs.length]);
        }
      } else if (cat === 'touch') {
        const modes: TouchControlMode[] = ['auto', 'always', 'off'];
        const schemes: TouchSteeringScheme[] = ['joystick', 'buttons', 'tilt'];
        const sizes: TouchButtonSize[] = ['small', 'medium', 'large'];

        if (curIdx === 1) {
          const mIdx = modes.indexOf(settings.touchControlMode);
          if (mIdx < modes.length - 1) settings.setTouchControlMode(modes[mIdx + 1]);
        } else if (curIdx === 2) {
          const scIdx = schemes.indexOf(settings.touchSteeringScheme);
          if (scIdx < schemes.length - 1) settings.setTouchSteeringScheme(schemes[scIdx + 1]);
        } else if (curIdx === 3) {
          const szIdx = sizes.indexOf(settings.touchButtonSize);
          if (szIdx < sizes.length - 1) settings.setTouchButtonSize(sizes[szIdx + 1]);
        } else if (curIdx === 4) {
          settings.setTouchOpacity(Math.max(0.2, Math.min(1.0, Math.round((settings.touchOpacity + 0.05) * 100) / 100)));
        } else if (curIdx === 5) {
          settings.setTouchHaptics(!settings.touchHaptics);
        }
      } else if (cat === 'gameplay') {
        const isVib = settings.vibrationEnabled;
        if (curIdx === 1) {
          const next: TransmissionMode = settings.transmissionMode === 'manual' ? 'automatic' : 'manual';
          settings.setTransmissionMode(next);
        } else if (curIdx === 2) {
          settings.toggleAbs();
        } else if (curIdx === 3) {
          settings.toggleTcs();
        } else if (curIdx === 4) {
          settings.toggleEsp();
        } else if (curIdx === 5) {
          settings.setSensitivity(Math.max(MIN_STEERING_SENSITIVITY, Math.min(MAX_STEERING_SENSITIVITY, Math.round((settings.sensitivity + STEERING_SENSITIVITY_STEP) * 100) / 100)));
        } else if (curIdx === 6) {
          settings.toggleVibration();
        } else if (isVib && curIdx === 7) {
          settings.setVibrationIntensity(Math.max(0.1, Math.min(1.0, Math.round((settings.vibrationIntensity + 0.05) * 100) / 100)));
        }
      }
    }
  }, [availableVehicles, handleTabRight, setControlsTab, setFocusedIndex, setPreviewVehicleId]);

  const handleConfirm = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleConfirm) {
      delegate.handleConfirm();
      return;
    }

    const curIdx = focusedIndexRef.current;
    const isPaused = useGameStore.getState().gameState === 'paused';

    if (curView === 'main') {
      if (isPaused) {
        if (curIdx === 0) {
          unlockSharedAudioContext().catch(() => {});
          setGameState('playing');
        }
        else if (curIdx === 1) handleReset();
        else if (curIdx === 2) setView('options');
        else if (curIdx === 3) handleReturnToMainMenu();
      } else {
        if (curIdx === 0) setView('tracks');
        else if (curIdx === 1) setView('multiplayer');
        else if (curIdx === 2) setView('options');
        else if (curIdx === 3) setView('credits');
      }
    } else if (curView === 'tracks') {
      if (curIdx < availableLevels.length) {
        handleSelectTrack(availableLevels[curIdx].id);
      } else {
        setView('main');
      }
    } else if (curView === 'start_mode') {
      const selectedLevelId = useGameStore.getState().selectedLevelId;
      const currentLevelPreset = getLevelPreset(selectedLevelId);
      const isGymkhana = currentLevelPreset.supportedModes?.includes('gymkhana_blitz') ?? false;

      if (curIdx === 0) {
        handleLaunchMode('freeroam');
      } else if (curIdx === 1) {
        handleLaunchMode(isGymkhana ? 'gymkhana_blitz' : 'timeattack');
      } else {
        setFocusedIndex(0);
        setView('tracks');
      }
    } else if (curView === 'garage') {
      if (curIdx === 0) {
        const currentTire = useGameStore.getState().selectedTireType;
        const tireIdx = AVAILABLE_TIRE_TYPES.indexOf(currentTire);
        const nextTireIdx = (tireIdx + 1) % AVAILABLE_TIRE_TYPES.length;
        useGameStore.getState().setSelectedTireType(AVAILABLE_TIRE_TYPES[nextTireIdx]);
      } else if (curIdx === 1) {
        if (handleStartRace) {
          handleStartRace(previewVehicleIdRef.current);
        } else {
          setSelectedVehicleId(previewVehicleIdRef.current);
          useGameStore.getState().triggerReset(true);
          setView('main');
          unlockSharedAudioContext().catch(() => {});
          setGameState('playing');
        }
      } else if (curIdx === 2) {
        setView('start_mode');
      }
    } else if (curView === 'multiplayer') {
      setView('main');
    } else if (curView === 'options') {
      const cat = settingsCategoryRef.current;
      const count = getItemCount();
      const backIndex = count - 1;

      if (curIdx === backIndex) {
        setView('main');
        return;
      }

      if (curIdx === 0) {
        handleTabRight();
        return;
      }

      if (cat === 'graphics') {
        if (curIdx === 6) useSettingsStore.getState().toggleDynamicResolution();
        else if (curIdx === 7) useSettingsStore.getState().toggleShadows();
        else if (curIdx === 8) useSettingsStore.getState().togglePostProcessing();
      } else if (cat === 'touch') {
        if (curIdx === 5) useSettingsStore.getState().setTouchHaptics(!useSettingsStore.getState().touchHaptics);
      } else if (cat === 'gameplay') {
        const isVib = useSettingsStore.getState().vibrationEnabled;
        const resetIdx = isVib ? 8 : 7;
        if (curIdx === 1) {
          const current = useSettingsStore.getState().transmissionMode;
          useSettingsStore.getState().setTransmissionMode(current === 'manual' ? 'automatic' : 'manual');
        } else if (curIdx === 2) {
          useSettingsStore.getState().toggleAbs();
        } else if (curIdx === 3) {
          useSettingsStore.getState().toggleTcs();
        } else if (curIdx === 4) {
          useSettingsStore.getState().toggleEsp();
        } else if (curIdx === 6) {
          useSettingsStore.getState().toggleVibration();
        } else if (curIdx === resetIdx) {
          handleResetRecordsAction();
        }
      }
    } else if (curView === 'controls') {
      setView('main');
    } else if (curView === 'credits') {
      if (curIdx === 0) {
        window.open('https://github.com/TensorDriftStudio/OpenRally', '_blank', 'noopener,noreferrer');
      } else {
        setView('main');
      }
    }
  }, [
    availableLevels,
    getItemCount,
    handleLaunchMode,
    handleReset,
    handleResetRecordsAction,
    handleReturnToMainMenu,
    handleSelectTrack,
    handleStartRace,
    handleTabRight,
    setGameState,
    setSelectedVehicleId,
    setView,
  ]);

  const handleBack = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    if (delegate?.handleBack) {
      const handled = delegate.handleBack();
      if (handled === true) {
        return;
      }
    }

    const isPaused = useGameStore.getState().gameState === 'paused';

    if (curView === 'garage') {
      setView('start_mode');
    } else if (curView === 'start_mode') {
      setFocusedIndex(0);
      setView('tracks');
    } else if (curView !== 'main') {
      setView('main');
    } else if (isPaused) {
      unlockSharedAudioContext().catch(() => {});
      setGameState('playing');
    }
  }, [setGameState, setView]);

  const handleSpecialX = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    delegate?.handleSpecialX?.();
  }, []);

  const handleSpecialY = useCallback(() => {
    const curView = viewRef.current;
    const delegate = getMenuGamepadDelegate(curView);
    delegate?.handleSpecialY?.();
  }, []);

  const actionsRef = useRef({
    handleNavUp,
    handleNavDown,
    handleNavLeft,
    handleNavRight,
    handleTabLeft,
    handleTabRight,
    handleConfirm,
    handleBack,
    handleSpecialX,
    handleSpecialY,
  });
  actionsRef.current = {
    handleNavUp,
    handleNavDown,
    handleNavLeft,
    handleNavRight,
    handleTabLeft,
    handleTabRight,
    handleConfirm,
    handleBack,
    handleSpecialX,
    handleSpecialY,
  };

  // Keyboard navigation listener across all menus
  useEffect(() => {
    if (gameState === 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingActive(e)) {
        if (e.code === 'Escape') {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
        return;
      }

      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        actionsRef.current.handleNavUp();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        actionsRef.current.handleNavDown();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        actionsRef.current.handleNavLeft();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        actionsRef.current.handleNavRight();
      } else if (e.code === 'KeyQ' || e.code === 'PageUp') {
        e.preventDefault();
        actionsRef.current.handleTabLeft();
      } else if (e.code === 'KeyE' || e.code === 'PageDown') {
        e.preventDefault();
        actionsRef.current.handleTabRight();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        actionsRef.current.handleConfirm();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        actionsRef.current.handleBack();
      } else if (e.code === 'Delete' || e.code === 'KeyX') {
        actionsRef.current.handleSpecialX();
      } else if (e.code === 'KeyR') {
        actionsRef.current.handleSpecialY();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Gamepad navigation controller loop across all menus
  useEffect(() => {
    if (gameState === 'playing') return;

    let animId: number;
    const pollMenuGamepad = () => {
      const gp = sampleGamepad();
      if (gp.connected) {
        if (gp.menuConfirm) {
          actionsRef.current.handleConfirm();
        } else if (gp.menuBack) {
          actionsRef.current.handleBack();
        } else if (gp.pauseToggle && useGameStore.getState().gameState === 'paused') {
          actionsRef.current.handleBack();
        }

        if (gp.menuTabLeft) {
          actionsRef.current.handleTabLeft();
        } else if (gp.menuTabRight) {
          actionsRef.current.handleTabRight();
        }

        if (gp.menuSpecialX) {
          actionsRef.current.handleSpecialX();
        } else if (gp.menuSpecialY) {
          actionsRef.current.handleSpecialY();
        }

        if (gp.menuUp) {
          actionsRef.current.handleNavUp();
        } else if (gp.menuDown) {
          actionsRef.current.handleNavDown();
        }

        if (gp.menuLeft) {
          actionsRef.current.handleNavLeft();
        } else if (gp.menuRight) {
          actionsRef.current.handleNavRight();
        }
      }
      animId = requestAnimationFrame(pollMenuGamepad);
    };

    animId = requestAnimationFrame(pollMenuGamepad);
    return () => cancelAnimationFrame(animId);
  }, [gameState]);

  return {
    handleNavUp,
    handleNavDown,
    handleNavLeft,
    handleNavRight,
    handleTabLeft,
    handleTabRight,
    handleConfirm,
    handleBack,
  };
}
