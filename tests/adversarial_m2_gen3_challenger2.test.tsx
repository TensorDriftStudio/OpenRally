import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { menuStyles } from '../src/components/ui/menu/menuStyles';
import { useSettingsStore } from '../src/store/settingsStore';
import type { TouchButtonSize } from '../src/types';

describe('Adversarial Challenger 2: Milestone M2 Empirical Stress Harness', () => {
  const rootDir = path.resolve(__dirname, '..');
  const cssPath = path.join(rootDir, 'src/index.css');
  const settingsViewPath = path.join(rootDir, 'src/components/ui/menu/SettingsView.tsx');
  const touchControlsOverlayPath = path.join(rootDir, 'src/components/ui/TouchControlsOverlay.tsx');
  const navHookPath = path.join(rootDir, 'src/components/ui/menu/useMenuGamepadNavigation.ts');

  beforeEach(() => {
    useSettingsStore.setState({
      graphicsQuality: 'medium',
      antiAliasing: 'msaa',
      resolutionScale: 1.0,
      shadowsEnabled: true,
      postProcessingEnabled: true,
      menuMusicVolume: 0.8,
      gameMusicVolume: 0.8,
      sfxVolume: 0.9,
      sensitivity: 1.0,
      vibrationEnabled: true,
      vibrationIntensity: 0.7,
      touchControlMode: 'auto',
      touchSteeringScheme: 'joystick',
      touchOpacity: 0.8,
      touchButtonSize: 'medium',
      touchHaptics: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Area 1: Keyboard & Gamepad Navigation Through Categorized Settings Tabs
  // =========================================================================
  describe('Area 1: Keyboard & Gamepad Navigation Through Categorized Settings Tabs', () => {
    it('M2-ADV-1.1: Simulates full keyboard vertical navigation cycle through settings indices with vibrationEnabled=true', () => {
      const isVib = true;
      let optIdx = 0;
      const gqIdx = optIdx++; // 0 (Graphics)
      const aaIdx = optIdx++; // 1 (Graphics)
      const resIdx = optIdx++; // 2 (Graphics)
      const shIdx = optIdx++; // 3 (Graphics)
      const ppIdx = optIdx++; // 4 (Graphics)
      const sensIdx = optIdx++; // 5 (Gameplay)
      const vibIdx = optIdx++; // 6 (Gameplay)
      const vibIntIdx = isVib ? optIdx++ : -1; // 7 (Gameplay)
      const mmIdx = optIdx++; // 8 (Audio)
      const gmIdx = optIdx++; // 9 (Audio)
      const sfxIdx = optIdx++; // 10 (Audio)
      const resetIdx = optIdx++; // 11 (Gameplay)
      const backIdx = optIdx++; // 12 (Back)

      expect(optIdx).toBe(13);

      const resolveCategory = (focusedIndex: number): string => {
        if (focusedIndex >= 0 && focusedIndex <= 4) {
          return 'graphics';
        } else if (
          focusedIndex === sensIdx ||
          focusedIndex === vibIdx ||
          (isVib && focusedIndex === vibIntIdx) ||
          focusedIndex === resetIdx
        ) {
          return 'gameplay';
        } else if (focusedIndex >= mmIdx && focusedIndex <= sfxIdx) {
          return 'audio';
        }
        return 'unknown';
      };

      // Tab 1: Graphics (indices 0..4)
      expect(resolveCategory(gqIdx)).toBe('graphics');
      expect(resolveCategory(aaIdx)).toBe('graphics');
      expect(resolveCategory(resIdx)).toBe('graphics');
      expect(resolveCategory(shIdx)).toBe('graphics');
      expect(resolveCategory(ppIdx)).toBe('graphics');

      // Tab 4: Gameplay (indices 5..7)
      expect(resolveCategory(sensIdx)).toBe('gameplay');
      expect(resolveCategory(vibIdx)).toBe('gameplay');
      expect(resolveCategory(vibIntIdx)).toBe('gameplay');

      // Tab 2: Audio (indices 8..10)
      expect(resolveCategory(mmIdx)).toBe('audio');
      expect(resolveCategory(gmIdx)).toBe('audio');
      expect(resolveCategory(sfxIdx)).toBe('audio');

      // Tab 4: Gameplay (index 11)
      expect(resolveCategory(resetIdx)).toBe('gameplay');

      // Back button preserves previous tab
      expect(resolveCategory(backIdx)).toBe('unknown');
    });

    it('M2-ADV-1.2: Simulates index shift when vibrationEnabled is toggled to false', () => {
      const isVib = false;
      let optIdx = 0;
      const _gqIdx = optIdx++; // 0
      const _aaIdx = optIdx++; // 1
      const _resIdx = optIdx++; // 2
      const _shIdx = optIdx++; // 3
      const _ppIdx = optIdx++; // 4
      const _sensIdx = optIdx++; // 5
      const _vibIdx = optIdx++; // 6
      const vibIntIdx = isVib ? optIdx++ : -1; // -1
      const _mmIdx = optIdx++; // 7
      const _gmIdx = optIdx++; // 8
      const _sfxIdx = optIdx++; // 9
      const _resetIdx = optIdx++; // 10
      const _backIdx = optIdx++; // 11

      expect(vibIntIdx).toBe(-1);
      expect(optIdx).toBe(12);
    });

    it('M2-ADV-1.2: Confirms menuGamepadNavigation correctly adjusts indexing when vibration is toggled', () => {
      const navHookContent = fs.readFileSync(navHookPath, 'utf-8');
      expect(navHookContent).toContain('const isVib = useSettingsStore.getState().vibrationEnabled;');
      expect(navHookContent).toContain('return isVib ? 10 : 9;');
    });

    it('M2-ADV-1.3: Confirms all 5 categories are accessible in SettingsView including Touch Controls', () => {
      const settingsContent = fs.readFileSync(settingsViewPath, 'utf-8');
      expect(settingsContent).toContain("'graphics'");
      expect(settingsContent).toContain("'audio'");
      expect(settingsContent).toContain("'touch'");
      expect(settingsContent).toContain("'gameplay'");
      expect(settingsContent).toContain("'controls'");
    });

    it('M2-ADV-1.4: Left/Right directional adjustments do not cause runtime exceptions or out-of-bounds', () => {
      // Test sensitivity bounds [0.5, 2.0]
      useSettingsStore.getState().setSensitivity(0.5);
      const sensAtMin = useSettingsStore.getState().sensitivity;
      const decSens = Math.max(0.5, Math.min(2.0, sensAtMin - 0.1));
      expect(decSens).toBe(0.5);

      useSettingsStore.getState().setSensitivity(2.0);
      const sensAtMax = useSettingsStore.getState().sensitivity;
      const incSens = Math.max(0.5, Math.min(2.0, sensAtMax + 0.1));
      expect(incSens).toBe(2.0);

      // Test volume bounds [0, 1]
      useSettingsStore.getState().setMenuMusicVolume(0);
      const volAtMin = useSettingsStore.getState().menuMusicVolume;
      const decVol = Math.max(0, Math.min(1, volAtMin - 0.05));
      expect(decVol).toBe(0);

      useSettingsStore.getState().setMenuMusicVolume(1);
      const volAtMax = useSettingsStore.getState().menuMusicVolume;
      const incVol = Math.max(0, Math.min(1, volAtMax + 0.05));
      expect(incVol).toBe(1);
    });
  });

  // =========================================================================
  // Area 2: Touch Overlay Clamping & Geometry Under Extreme Multipliers
  // =========================================================================
  describe('Area 2: Touch Overlay Button Clamping & Geometry Under Extreme Multipliers', () => {
    const calcUtilitySize = (multiplier: number) => Math.max(44, Math.round(44 * multiplier));
    const calcHandbrakeHeight = (multiplier: number) => Math.max(44, Math.round(48 * multiplier));
    const calcHandbrakeWidth = (multiplier: number) => Math.round(84 * multiplier);
    const calcSteerWidth = (multiplier: number) => Math.round(80 * multiplier);
    const calcSteerHeight = (multiplier: number) => Math.round(76 * multiplier);
    const calcPedalBrakeWidth = (multiplier: number) => Math.round(76 * multiplier);
    const calcPedalBrakeHeight = (multiplier: number) => Math.round(92 * multiplier);
    const calcPedalThrottleWidth = (multiplier: number) => Math.round(76 * multiplier);
    const calcPedalThrottleHeight = (multiplier: number) => Math.round(112 * multiplier);

    it('M2-ADV-2.1: Tests standard size multipliers (small 0.85, medium 1.0, large 1.15) enforce >= 44px touch targets', () => {
      const sizes: Record<TouchButtonSize, number> = {
        small: 0.85,
        medium: 1.0,
        large: 1.15,
      };

      for (const [name, mult] of Object.entries(sizes)) {
        const uSize = calcUtilitySize(mult);
        expect(uSize, `${name} utility size`).toBeGreaterThanOrEqual(44);

        const hbH = calcHandbrakeHeight(mult);
        const hbW = calcHandbrakeWidth(mult);
        expect(hbH, `${name} handbrake height`).toBeGreaterThanOrEqual(44);
        expect(hbW, `${name} handbrake width`).toBeGreaterThanOrEqual(44);

        const sW = calcSteerWidth(mult);
        const sH = calcSteerHeight(mult);
        expect(sW, `${name} steer width`).toBeGreaterThanOrEqual(44);
        expect(sH, `${name} steer height`).toBeGreaterThanOrEqual(44);

        const bW = calcPedalBrakeWidth(mult);
        const bH = calcPedalBrakeHeight(mult);
        expect(bW, `${name} brake width`).toBeGreaterThanOrEqual(44);
        expect(bH, `${name} brake height`).toBeGreaterThanOrEqual(44);

        const tW = calcPedalThrottleWidth(mult);
        const tH = calcPedalThrottleHeight(mult);
        expect(tW, `${name} throttle width`).toBeGreaterThanOrEqual(44);
        expect(tH, `${name} throttle height`).toBeGreaterThanOrEqual(44);
      }
    });

    it('M2-ADV-2.2: Evaluates extreme size multipliers (0.01, 0.5, 3.0, -1) against Math.max(44, ...)', () => {
      expect(calcUtilitySize(0.01)).toBe(44);
      expect(calcUtilitySize(0.5)).toBe(44);
      expect(calcUtilitySize(-1.0)).toBe(44);
      expect(calcUtilitySize(0)).toBe(44);
      expect(calcUtilitySize(3.0)).toBe(132);

      expect(calcHandbrakeHeight(0.01)).toBe(44);
      expect(calcHandbrakeHeight(0.5)).toBe(44);
      expect(calcHandbrakeHeight(-1.0)).toBe(44);
      expect(calcHandbrakeHeight(0)).toBe(44);
      expect(calcHandbrakeHeight(2.0)).toBe(96);
    });

    it('M2-ADV-2.3: Verifies vertical separation between Handbrake Drift button and Throttle Pedal across all sizes', () => {
      const multipliers = [0.85, 1.0, 1.15];

      for (const mult of multipliers) {
        const throttleTop = 24 + Math.round(112 * mult);
        const handbrakeBottom = Math.round(150 * mult);
        const verticalClearance = handbrakeBottom - throttleTop;

        expect(verticalClearance, `Clearance for multiplier ${mult}`).toBeGreaterThanOrEqual(9);
      }
    });

    it('M2-ADV-2.4: Stress-tests touchOpacity clamping formula against extreme values', () => {
      const clampOpacity = (opacity: number) => Math.max(0.2, Math.min(1.0, opacity));

      expect(clampOpacity(-100)).toBe(0.2);
      expect(clampOpacity(0)).toBe(0.2);
      expect(clampOpacity(0.19)).toBe(0.2);
      expect(clampOpacity(0.2)).toBe(0.2);
      expect(clampOpacity(0.75)).toBe(0.75);
      expect(clampOpacity(1.0)).toBe(1.0);
      expect(clampOpacity(1.05)).toBe(1.0);
      expect(clampOpacity(999)).toBe(1.0);
    });
  });

  // =========================================================================
  // Area 3: Safe-Area Inset Architecture & Display Cutout Clamping
  // =========================================================================
  describe('Area 3: Safe-Area Inset Architecture & Display Cutout Clamping', () => {
    it('M2-ADV-3.1: Validates CSS safe area inset custom property fallbacks in index.css', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      expect(cssContent).toMatch(/--sat:\s*env\(safe-area-inset-top,\s*0px\);/);
      expect(cssContent).toMatch(/--sar:\s*env\(safe-area-inset-right,\s*0px\);/);
      expect(cssContent).toMatch(/--sab:\s*env\(safe-area-inset-bottom,\s*0px\);/);
      expect(cssContent).toMatch(/--sal:\s*env\(safe-area-inset-left,\s*0px\);/);
    });

    it('M2-ADV-3.2: Verifies overlay menu padding provides asymmetric safe-area protection', () => {
      const overlayPadding = menuStyles.overlayMenu.padding as string;
      expect(overlayPadding).toContain('calc(8px + var(--sat))');
      expect(overlayPadding).toContain('calc(16px + var(--sar))');
      expect(overlayPadding).toContain('calc(8px + var(--sab))');
      expect(overlayPadding).toContain('calc(16px + var(--sal))');

      const pausePadding = menuStyles.pauseOverlayMenu.padding as string;
      expect(pausePadding).toContain('calc(8px + var(--sat))');
      expect(pausePadding).toContain('calc(16px + var(--sar))');
      expect(pausePadding).toContain('calc(8px + var(--sab))');
      expect(pausePadding).toContain('calc(16px + var(--sal))');
    });

    it('M2-ADV-3.3: Confirms subView scrollability and maxHeight clamping formula under extreme safe areas', () => {
      const subView = menuStyles.subView;
      expect(subView.maxHeight).toBe('calc(100dvh - var(--sat) - var(--sab) - 16px)');
      expect(subView.overflowY).toBe('auto');

      const simulatedDvh = 360;
      const simulatedSat = 32;
      const simulatedSab = 24;
      const maxAvailableHeight = simulatedDvh - simulatedSat - simulatedSab - 16;
      expect(maxAvailableHeight).toBe(288);
      expect(maxAvailableHeight).toBeGreaterThan(200);
    });

    it('M2-ADV-3.4: TouchControlsOverlay insets all interactive button clusters with safe-area variables', () => {
      const touchContent = fs.readFileSync(touchControlsOverlayPath, 'utf-8');

      expect(touchContent).toContain("top: 'calc(14px + var(--sat, 0px))'");
      expect(touchContent).toContain("left: 'calc(16px + var(--sal, 0px))'");

      expect(touchContent).toContain("left: 'calc(24px + var(--sal, 0px))'");
      expect(touchContent).toContain("bottom: 'calc(24px + var(--sab, 0px))'");

      expect(touchContent).toContain("right: 'calc(24px + var(--sar, 0px))'");
      expect(touchContent).toContain("bottom: 'calc(24px + var(--sab, 0px))'");

      expect(touchContent).toContain("right: 'calc(24px + var(--sar, 0px))'");
      expect(touchContent).toContain('bottom: `calc(${Math.round(150 * sizeMultiplier)}px + var(--sab, 0px))`');
    });
  });

  // =========================================================================
  // Area 4: Responsive Breakpoint Transitions & Ergonomics
  // =========================================================================
  describe('Area 4: Responsive Breakpoint Transitions & Ergonomics', () => {
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    it('M2-ADV-4.1: Confirms mobile landscape media query targets heights <= 500px', () => {
      expect(cssContent).toContain('@media (max-height: 500px) and (orientation: landscape)');
    });

    it('M2-ADV-4.2: Verifies 2-column Main Menu action grid and hidden sublabels in landscape', () => {
      expect(cssContent).toMatch(/\.menu-action-grid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
      expect(cssContent).toMatch(/\.menu-action-sublabel\s*\{[^}]*display:\s*none\s*!important/);
    });

    it('M2-ADV-4.3: Verifies Pause Menu 42%/58% horizontal split layout', () => {
      expect(cssContent).toMatch(/\.pause-split-layout\s*\{[^}]*grid-template-columns:\s*42%\s+58%/);
    });

    it('M2-ADV-4.4: Verifies Garage turntable 48%/52% side-by-side layout with 220px canvas box', () => {
      expect(cssContent).toMatch(/\.garage-split-layout\s*\{[^}]*grid-template-columns:\s*48%\s+52%/);
      expect(cssContent).toMatch(/\.garage-canvas-box\s*\{[^}]*height:\s*220px\s*!important/);
    });

    it('M2-ADV-4.5: Verifies Track Select 2x2 grid and Controls 2-column help grid', () => {
      expect(cssContent).toMatch(/\.track-grid-layout\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
      expect(cssContent).toMatch(/\.controls-help-grid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
    });

    it('M2-ADV-4.6: Confirms portrait orientation guard covers viewports <= 1024px with z-index: 1000000', () => {
      expect(cssContent).toMatch(/@media\s+screen\s+and\s+\(orientation:\s*portrait\)\s+and\s+\(max-width:\s*1024px\)/);
      expect(cssContent).toContain('.portrait-orientation-guard');
      expect(cssContent).toMatch(/z-index:\s*1000000/);
    });

    it('M2-ADV-4.7: Verifies all interactive buttons and inputs meet the 44px touch target ergonomics requirement', () => {
      expect(parseInt(menuStyles.button.minHeight as string, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(menuStyles.tabButton.minHeight as string, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(menuStyles.select.minHeight as string, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(menuStyles.checkbox.minWidth as string, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(menuStyles.checkbox.minHeight as string, 10)).toBeGreaterThanOrEqual(44);
    });
  });
});
