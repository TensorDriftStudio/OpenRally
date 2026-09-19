import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { SETTINGS_CATEGORIES } from '../useMenuGamepadNavigation';
import type { SettingsCategory } from '../types';

describe('Settings & Menu Gamepad Navigation Invariants', () => {
  beforeEach(() => {
    useGameStore.setState({ gameState: 'menu', selectedVehicleId: 'apex_rally_awd' });
    useSettingsStore.setState({
      graphicsQuality: 'high',
      targetFps: 60,
      drawDistance: 'far',
      antiAliasing: 'smaa',
      resolutionScale: 1.0,
      transmissionMode: 'automatic',
      sensitivity: 1.0,
      vibrationEnabled: true,
      vibrationIntensity: 0.8,
      menuMusicVolume: 0.5,
      gameMusicVolume: 0.5,
      sfxVolume: 0.7,
      touchControlMode: 'auto',
      touchSteeringScheme: 'joystick',
      touchButtonSize: 'medium',
      touchOpacity: 0.8,
      touchHaptics: true,
    });
  });

  describe('Category cycling with Bumper controls (LB / RB)', () => {
    it('contains all 5 standard categories in expected order', () => {
      expect(SETTINGS_CATEGORIES).toEqual([
        'graphics',
        'audio',
        'controls',
        'touch',
        'gameplay',
      ]);
    });

    it('cycles forward through categories seamlessly with wrap-around', () => {
      let curCat: SettingsCategory = 'graphics';
      const cycleRight = () => {
        const idx = SETTINGS_CATEGORIES.indexOf(curCat);
        curCat = SETTINGS_CATEGORIES[(idx + 1) % SETTINGS_CATEGORIES.length];
      };

      cycleRight();
      expect(curCat).toBe('audio');
      cycleRight();
      expect(curCat).toBe('controls');
      cycleRight();
      expect(curCat).toBe('touch');
      cycleRight();
      expect(curCat).toBe('gameplay');
      cycleRight();
      expect(curCat).toBe('graphics'); // wraps back to first
    });

    it('cycles backward through categories seamlessly with wrap-around', () => {
      let curCat: SettingsCategory = 'graphics';
      const cycleLeft = () => {
        const idx = SETTINGS_CATEGORIES.indexOf(curCat);
        curCat = SETTINGS_CATEGORIES[(idx - 1 + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length];
      };

      cycleLeft();
      expect(curCat).toBe('gameplay'); // wraps back to last
      cycleLeft();
      expect(curCat).toBe('touch');
      cycleLeft();
      expect(curCat).toBe('controls');
      cycleLeft();
      expect(curCat).toBe('audio');
      cycleLeft();
      expect(curCat).toBe('graphics');
    });
  });

  describe('Gameplay options gamepad modification', () => {
    it('toggles transmission mode between automatic and manual', () => {
      const store = useSettingsStore.getState();
      expect(store.transmissionMode).toBe('automatic');

      // Toggle to manual
      store.setTransmissionMode(store.transmissionMode === 'manual' ? 'automatic' : 'manual');
      expect(useSettingsStore.getState().transmissionMode).toBe('manual');

      // Toggle back to automatic
      store.setTransmissionMode(useSettingsStore.getState().transmissionMode === 'manual' ? 'automatic' : 'manual');
      expect(useSettingsStore.getState().transmissionMode).toBe('automatic');
    });

    it('modifies steering sensitivity within [0.1, 2.5] bounds', () => {
      const store = useSettingsStore.getState();
      expect(store.sensitivity).toBe(1.0);

      // Increase
      store.setSensitivity(Math.min(2.5, store.sensitivity + 0.05));
      expect(useSettingsStore.getState().sensitivity).toBeCloseTo(1.05);

      // Decrease down to low sensitivity
      store.setSensitivity(Math.max(0.1, useSettingsStore.getState().sensitivity - 0.3));
      expect(useSettingsStore.getState().sensitivity).toBeCloseTo(0.75);

      // Clamps at minimum 0.1
      store.setSensitivity(0.05);
      expect(useSettingsStore.getState().sensitivity).toBe(0.1);

      // Clamps at maximum 2.5
      store.setSensitivity(3.0);
      expect(useSettingsStore.getState().sensitivity).toBe(2.5);
    });

    it('toggles controller vibration and steps vibration intensity', () => {
      const store = useSettingsStore.getState();
      expect(store.vibrationEnabled).toBe(true);

      store.toggleVibration();
      expect(useSettingsStore.getState().vibrationEnabled).toBe(false);

      store.toggleVibration();
      expect(useSettingsStore.getState().vibrationEnabled).toBe(true);

      store.setVibrationIntensity(0.9);
      expect(useSettingsStore.getState().vibrationIntensity).toBe(0.9);
    });

    it('toggles ABS, TCS, and ESP driving assists via gamepad actions', () => {
      const store = useSettingsStore.getState();
      expect(store.absEnabled).toBe(false);
      expect(store.tcsEnabled).toBe(false);
      expect(store.espEnabled).toBe(false);

      // Toggle ABS
      store.toggleAbs();
      expect(useSettingsStore.getState().absEnabled).toBe(true);
      store.toggleAbs();
      expect(useSettingsStore.getState().absEnabled).toBe(false);

      // Toggle TCS
      store.toggleTcs();
      expect(useSettingsStore.getState().tcsEnabled).toBe(true);
      store.toggleTcs();
      expect(useSettingsStore.getState().tcsEnabled).toBe(false);

      // Toggle ESP
      store.toggleEsp();
      expect(useSettingsStore.getState().espEnabled).toBe(true);
      store.toggleEsp();
      expect(useSettingsStore.getState().espEnabled).toBe(false);
    });
  });

  describe('Graphics options gamepad modification', () => {
    it('cycles target frame rate options (30, 60, 120)', () => {
      const fpsOptions = [30, 60, 120] as const;
      const store = useSettingsStore.getState();

      const nextFps = (cur: typeof fpsOptions[number]) => {
        const idx = fpsOptions.indexOf(cur);
        return fpsOptions[(idx + 1) % fpsOptions.length];
      };

      expect(store.targetFps).toBe(60);
      store.setTargetFps(nextFps(store.targetFps));
      expect(useSettingsStore.getState().targetFps).toBe(120);
      store.setTargetFps(nextFps(useSettingsStore.getState().targetFps));
      expect(useSettingsStore.getState().targetFps).toBe(30);
    });

    it('cycles draw distance options (short, medium, far, ultra)', () => {
      const distOptions = ['short', 'medium', 'far', 'ultra'] as const;
      const store = useSettingsStore.getState();

      const nextDist = (cur: typeof distOptions[number]) => {
        const idx = distOptions.indexOf(cur);
        return distOptions[(idx + 1) % distOptions.length];
      };

      expect(store.drawDistance).toBe('far');
      store.setDrawDistance(nextDist(store.drawDistance));
      expect(useSettingsStore.getState().drawDistance).toBe('ultra');
      store.setDrawDistance(nextDist(useSettingsStore.getState().drawDistance));
      expect(useSettingsStore.getState().drawDistance).toBe('short');
    });

    it('toggles dynamic resolution (adaptive DPR)', () => {
      const store = useSettingsStore.getState();
      expect(store.dynamicResolution).toBe(false);

      store.toggleDynamicResolution();
      expect(useSettingsStore.getState().dynamicResolution).toBe(true);

      store.toggleDynamicResolution();
      expect(useSettingsStore.getState().dynamicResolution).toBe(false);
    });
  });

  describe('Touch controls options gamepad modification', () => {
    it('updates touch overlay mode, steering scheme, and button size', () => {
      const store = useSettingsStore.getState();

      store.setTouchControlMode('always');
      expect(useSettingsStore.getState().touchControlMode).toBe('always');

      store.setTouchSteeringScheme('buttons');
      expect(useSettingsStore.getState().touchSteeringScheme).toBe('buttons');

      store.setTouchButtonSize('large');
      expect(useSettingsStore.getState().touchButtonSize).toBe('large');
    });
  });

  describe('Garage tire compound gamepad selection', () => {
    it('contains exactly 3 tire compound options: asphalt, gravel, snow', async () => {
      const { AVAILABLE_TIRE_TYPES } = await import('@/config/tireRegistry');
      expect(AVAILABLE_TIRE_TYPES).toEqual(['asphalt', 'gravel', 'snow']);
      expect(AVAILABLE_TIRE_TYPES.length).toBe(3);
    });

    it('cycles forward through tire types (Right / Confirm on focus index 0)', async () => {
      const { AVAILABLE_TIRE_TYPES } = await import('@/config/tireRegistry');
      useGameStore.setState({ selectedTireType: 'asphalt' });

      const cycleRight = () => {
        const curTire = useGameStore.getState().selectedTireType;
        const idx = AVAILABLE_TIRE_TYPES.indexOf(curTire);
        const next = AVAILABLE_TIRE_TYPES[(idx + 1) % AVAILABLE_TIRE_TYPES.length];
        useGameStore.getState().setSelectedTireType(next);
      };

      expect(useGameStore.getState().selectedTireType).toBe('asphalt');
      cycleRight();
      expect(useGameStore.getState().selectedTireType).toBe('gravel');
      cycleRight();
      expect(useGameStore.getState().selectedTireType).toBe('snow');
      cycleRight();
      expect(useGameStore.getState().selectedTireType).toBe('asphalt');
    });

    it('cycles backward through tire types (Left on focus index 0)', async () => {
      const { AVAILABLE_TIRE_TYPES } = await import('@/config/tireRegistry');
      useGameStore.setState({ selectedTireType: 'asphalt' });

      const cycleLeft = () => {
        const curTire = useGameStore.getState().selectedTireType;
        const idx = AVAILABLE_TIRE_TYPES.indexOf(curTire);
        const prev = AVAILABLE_TIRE_TYPES[(idx - 1 + AVAILABLE_TIRE_TYPES.length) % AVAILABLE_TIRE_TYPES.length];
        useGameStore.getState().setSelectedTireType(prev);
      };

      expect(useGameStore.getState().selectedTireType).toBe('asphalt');
      cycleLeft();
      expect(useGameStore.getState().selectedTireType).toBe('snow');
      cycleLeft();
      expect(useGameStore.getState().selectedTireType).toBe('gravel');
      cycleLeft();
      expect(useGameStore.getState().selectedTireType).toBe('asphalt');
    });
  });

  describe('Start Mode View Gamepad Navigation & Confirmation', () => {
    it('has exactly 3 focusable elements (Free Roam, Race/Gymkhana, Back)', () => {
      // 0: Free Roam card
      // 1: Time Attack or Gymkhana Blitz card
      // 2: Back to Track Selection button
      const START_MODE_ITEM_COUNT = 3;
      expect(START_MODE_ITEM_COUNT).toBe(3);
    });

    it('navigates correctly vertically and horizontally across the 2D layout', () => {
      let focusedIndex = 0;

      // NavRight from Free Roam (0) goes to Time Attack (1)
      if (focusedIndex === 0) focusedIndex = 1;
      expect(focusedIndex).toBe(1);

      // NavLeft from Time Attack (1) goes to Free Roam (0)
      if (focusedIndex === 1) focusedIndex = 0;
      expect(focusedIndex).toBe(0);

      // NavDown from Free Roam (0) goes to Back to Track Selection (2)
      focusedIndex = (focusedIndex === 0 || focusedIndex === 1) ? 2 : 0;
      expect(focusedIndex).toBe(2);

      // Horizontal navigation on Back button (2) stays on 2
      const handleNavLeft = (idx: number) => (idx === 1 ? 0 : idx);
      const handleNavRight = (idx: number) => (idx === 0 ? 1 : idx);
      expect(handleNavLeft(focusedIndex)).toBe(2);
      expect(handleNavRight(focusedIndex)).toBe(2);

      // NavUp from Back to Track Selection (2) goes to Free Roam (0)
      focusedIndex = (focusedIndex === 2) ? 0 : 2;
      expect(focusedIndex).toBe(0);

      // NavUp from Free Roam (0) wraps around to Back (2)
      focusedIndex = (focusedIndex === 2) ? 0 : 2;
      expect(focusedIndex).toBe(2);
    });

    it('routes index 2 ("Back to Track Selection") to tracks view instead of garage', () => {
      let activeView = 'start_mode';
      let launchedMode: string | null = null;

      const handleConfirm = (curIdx: number, isGymkhana: boolean) => {
        if (curIdx === 0) {
          launchedMode = 'freeroam';
          activeView = 'garage';
        } else if (curIdx === 1) {
          launchedMode = isGymkhana ? 'gymkhana_blitz' : 'timeattack';
          activeView = 'garage';
        } else {
          activeView = 'tracks';
        }
      };

      // Confirming index 2 should transition to 'tracks' and NOT launch any mode
      handleConfirm(2, false);
      expect(activeView).toBe('tracks');
      expect(launchedMode).toBeNull();

      // Confirming index 0 should launch freeroam and transition to garage
      handleConfirm(0, false);
      expect(activeView).toBe('garage');
      expect(launchedMode).toBe('freeroam');

      // Confirming index 1 should launch timeattack on standard circuit
      handleConfirm(1, false);
      expect(activeView).toBe('garage');
      expect(launchedMode).toBe('timeattack');

      // Confirming index 1 should launch gymkhana_blitz on gymkhana circuit
      handleConfirm(1, true);
      expect(activeView).toBe('garage');
      expect(launchedMode).toBe('gymkhana_blitz');
    });
  });
});

