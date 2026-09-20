import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TouchControlsOverlay } from '@/components/ui/TouchControlsOverlay';
import { AnalogGauges } from '@/components/ui/gauges/AnalogGauges';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import {
  setTouchInput,
  resetTouchInputState,
  getLastInputType,
  setLastInputType,
  type InputType,
} from '@/utils/input/touch';

// @ts-expect-error polyfill isolateModules for Vitest
vi.isolateModules = async (fn: () => Promise<void> | void) => {
  vi.resetModules();
  await fn();
};

describe('Adversarial Challenge M3 Iteration 2 (Challenger 2): Desktop Initial Modality, SSR & Gauge Repositioning', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  class MockWindow extends EventTarget {
    matchMedia = vi.fn().mockReturnValue({ matches: false });
    innerWidth = 1920;
    innerHeight = 1080;
  }

  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = new MockWindow();
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      },
      configurable: true,
      writable: true,
    });

    resetTouchInputState();
    useGameStore.setState({
      gameState: 'playing',
      speed: 85,
      rpm: 4200,
      gear: 3,
      cameraMode: 'chase',
    });
    useSettingsStore.setState({
      touchControlMode: 'auto',
      touchSteeringScheme: 'joystick',
      touchOpacity: 0.7,
      touchButtonSize: 'medium',
      touchHaptics: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Fresh Desktop Environment Simulation (isTouchDevice === false)
  // ==========================================================================
  describe('1. Fresh Desktop Environment Simulation (Zero-Touch Initial Modality)', () => {
    it('initializes module with modality "keyboard" on a fresh desktop window load', async () => {
      // Simulate fresh isolated module execution in a pure desktop environment
      await vi.isolateModules(async () => {
        // Ensure desktop environment before module executes
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
            maxTouchPoints: 0,
          },
          configurable: true,
          writable: true,
        });

        const touchModule = await import('@/utils/input/touch');

        expect(touchModule.isTouchDevice()).toBe(false);
        // CRITICAL CHECK: In fresh desktop environment, modality MUST be 'keyboard'
        expect(touchModule.getLastInputType()).toBe('keyboard');
      });
    });

    it('renders null for TouchControlsOverlay in auto mode on fresh desktop load', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            maxTouchPoints: 0,
          },
          configurable: true,
          writable: true,
        });

        const touchModule = await import('@/utils/input/touch');
        const overlayModule = await import('@/components/ui/TouchControlsOverlay');

        expect(touchModule.isTouchDevice()).toBe(false);
        expect(touchModule.getLastInputType()).toBe('keyboard');

        // On initial render with auto mode, overlay must evaluate isVisible = false and render null
        const html = renderToString(
          React.createElement(overlayModule.TouchControlsOverlay, { touchControlMode: 'auto' })
        );
        expect(html).toBe('');
      });
    });

    it('renders null for default TouchControlsOverlay without props on desktop load', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            maxTouchPoints: 0,
          },
          configurable: true,
          writable: true,
        });

        const settingsModule = await import('@/store/settingsStore');
        settingsModule.useSettingsStore.setState({ touchControlMode: 'auto' });

        const touchModule = await import('@/utils/input/touch');
        const overlayModule = await import('@/components/ui/TouchControlsOverlay');

        expect(touchModule.isTouchDevice()).toBe(false);
        expect(touchModule.getLastInputType()).toBe('keyboard');

        const html = renderToString(React.createElement(overlayModule.TouchControlsOverlay));
        expect(html).toBe('');
      });
    });

    it('positions AnalogGauges at bottom-right on fresh desktop load without centering transform', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0',
            maxTouchPoints: 0,
          },
          configurable: true,
          writable: true,
        });

        const settingsModule = await import('@/store/settingsStore');
        settingsModule.useSettingsStore.setState({ touchControlMode: 'auto' });

        const touchModule = await import('@/utils/input/touch');
        const gaugesModule = await import('@/components/ui/gauges/AnalogGauges');

        expect(touchModule.isTouchDevice()).toBe(false);
        expect(touchModule.getLastInputType()).toBe('keyboard');

        const html = renderToString(React.createElement(gaugesModule.AnalogGauges));
        // Cluster must be anchored to bottom-right for desktop/keyboard
        expect(html).toContain('right:calc(20px + var(--sar))');
        expect(html).toContain('bottom:calc(20px + var(--sab))');
        expect(html).toContain('left:auto');
        expect(html).not.toContain('translateX(-50%)');
      });
    });
  });

  // ==========================================================================
  // 2. Fresh Mobile/Touch Environment Simulation (isTouchDevice === true)
  // ==========================================================================
  describe('2. Fresh Mobile/Touch Environment Simulation (Touch-First Initial Modality)', () => {
    it('initializes module with modality "touch" on fresh touch-device load', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro Build/AP3A.240905.015) AppleWebKit/537.36 Mobile Safari/537.36',
            maxTouchPoints: 10,
          },
          configurable: true,
          writable: true,
        });

        const touchModule = await import('@/utils/input/touch');

        expect(touchModule.isTouchDevice()).toBe(true);
        // On touch device, modality MUST initialize to 'touch'
        expect(touchModule.getLastInputType()).toBe('touch');
      });
    });

    it('renders TouchControlsOverlay on fresh touch-device load in auto mode', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) Mobile Safari/537.36',
            maxTouchPoints: 5,
          },
          configurable: true,
          writable: true,
        });

        const touchModule = await import('@/utils/input/touch');
        const overlayModule = await import('@/components/ui/TouchControlsOverlay');

        expect(touchModule.isTouchDevice()).toBe(true);
        expect(touchModule.getLastInputType()).toBe('touch');

        const html = renderToString(
          React.createElement(overlayModule.TouchControlsOverlay, { touchControlMode: 'auto' })
        );
        expect(html).toContain('data-testid="touch-controls-overlay"');
        expect(html).toContain('data-testid="touch-joystick-zone"');
      });
    });

    it('positions AnalogGauges at top-left on fresh touch-device load in auto mode', async () => {
      await vi.isolateModules(async () => {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) Mobile Safari/537.36',
            maxTouchPoints: 5,
          },
          configurable: true,
          writable: true,
        });

        const settingsModule = await import('@/store/settingsStore');
        settingsModule.useSettingsStore.setState({ touchControlMode: 'auto' });

        const touchModule = await import('@/utils/input/touch');
        const gaugesModule = await import('@/components/ui/gauges/AnalogGauges');

        expect(touchModule.isTouchDevice()).toBe(true);
        expect(touchModule.getLastInputType()).toBe('touch');

        const html = renderToString(React.createElement(gaugesModule.AnalogGauges));
        expect(html).toContain('left:calc(16px + var(--sal, 0px))');
        expect(html).toContain('transform:scale(0.60)');
        expect(html).toContain('top:calc(68px + var(--sat, 0px))');
        expect(html).toContain('right:auto');
      });
    });
  });

  // ==========================================================================
  // 3. SSR / Node Compatibility (typeof window === 'undefined')
  // ==========================================================================
  describe('3. SSR & Headless Node Compatibility (Window Undefined)', () => {
    it('safely imports touch module and executes core utilities when window is undefined', async () => {
      await vi.isolateModules(async () => {
        // Explicitly undefine window and navigator for pure SSR / Node environment
        // @ts-expect-error test undefined window
        delete globalThis.window;

        const touchModule = await import('@/utils/input/touch');

        // Verify guard does not throw
        expect(touchModule.isTouchDevice()).toBe(false);
        expect(touchModule.getLastInputType()).toBe('keyboard');

        // State access and mutations in SSR
        const initialSnapshot = touchModule.getTouchInputState();
        expect(initialSnapshot.throttle).toBe(0);

        // setTouchInput without window must not throw on event dispatch
        expect(() => touchModule.setTouchInput({ throttle: 0.8 })).not.toThrow();
        expect(touchModule.getTouchInputState().throttle).toBe(0.8);
        expect(touchModule.getLastInputType()).toBe('touch');

        // setLastInputType without window must not throw
        expect(() => touchModule.setLastInputType('gamepad')).not.toThrow();
        expect(touchModule.getLastInputType()).toBe('gamepad');

        // resetTouchInputState without window
        expect(() => touchModule.resetTouchInputState()).not.toThrow();
        expect(touchModule.getTouchInputState().throttle).toBe(0);
      });
    });

    it('renders TouchControlsOverlay via renderToString without throwing when window is undefined', async () => {
      await vi.isolateModules(async () => {
        // @ts-expect-error test undefined window
        delete globalThis.window;

        const overlayModule = await import('@/components/ui/TouchControlsOverlay');

        // Auto mode in SSR -> returns null (empty string)
        let html = '';
        expect(() => {
          html = renderToString(
            React.createElement(overlayModule.TouchControlsOverlay, { touchControlMode: 'auto' })
          );
        }).not.toThrow();
        expect(html).toBe('');

        // Always mode in SSR -> renders markup
        expect(() => {
          html = renderToString(
            React.createElement(overlayModule.TouchControlsOverlay, { touchControlMode: 'always' })
          );
        }).not.toThrow();
        expect(html).toContain('data-testid="touch-controls-overlay"');
      });
    });

    it('renders AnalogGauges via renderToString without throwing when window is undefined', async () => {
      await vi.isolateModules(async () => {
        // @ts-expect-error test undefined window
        delete globalThis.window;

        const gaugesModule = await import('@/components/ui/gauges/AnalogGauges');

        let html = '';
        expect(() => {
          html = renderToString(React.createElement(gaugesModule.AnalogGauges));
        }).not.toThrow();

        // In SSR without window, cluster defaults to bottom-right keyboard/gamepad layout
        expect(html).toContain('right:calc(20px + var(--sar))');
        expect(html).toContain('bottom:calc(20px + var(--sab))');
      });
    });
  });

  // ==========================================================================
  // 4. HUD Gauge Repositioning & Live Modality Reactivity
  // ==========================================================================
  describe('4. HUD Gauge Repositioning & Live Modality Reactivity', () => {
    it('shifts AnalogGauges dynamically from bottom-right to top-left when touch is triggered', () => {
      // Start in keyboard mode
      setLastInputType('keyboard');
      const htmlDesktop = renderToString(<AnalogGauges />);
      expect(htmlDesktop).toContain('right:calc(20px + var(--sar))');
      expect(htmlDesktop).toContain('left:auto');
      expect(htmlDesktop).not.toContain('scale(0.60)');

      // Touch input arrives
      setTouchInput({ throttle: 1.0 });
      expect(getLastInputType()).toBe('touch');

      const htmlTouch = renderToString(<AnalogGauges />);
      expect(htmlTouch).toContain('left:calc(16px + var(--sal, 0px))');
      expect(htmlTouch).toContain('transform:scale(0.60)');
      expect(htmlTouch).toContain('top:calc(68px + var(--sat, 0px))');
      expect(htmlTouch).toContain('right:auto');
    });

    it('shifts AnalogGauges from top-left back to bottom-right when gamepad input is detected', () => {
      // Start in touch mode
      setTouchInput({ throttle: 0.5 });
      expect(getLastInputType()).toBe('touch');
      const htmlTouch = renderToString(<AnalogGauges />);
      expect(htmlTouch).toContain('left:calc(16px + var(--sal, 0px))');

      // Polled Gamepad input detected in useInput calls setLastInputType('gamepad')
      setLastInputType('gamepad');
      expect(getLastInputType()).toBe('gamepad');

      const htmlGamepad = renderToString(<AnalogGauges />);
      expect(htmlGamepad).toContain('right:calc(20px + var(--sar))');
      expect(htmlGamepad).toContain('left:auto');
      expect(htmlGamepad).not.toContain('scale(0.60)');
    });

    it('shifts AnalogGauges from top-left back to bottom-right when keyboard key is pressed', () => {
      setTouchInput({ steering: 0.5 });
      expect(getLastInputType()).toBe('touch');
      expect(renderToString(<AnalogGauges />)).toContain('left:calc(16px + var(--sal, 0px))');

      // Keyboard input
      setLastInputType('keyboard');
      expect(getLastInputType()).toBe('keyboard');

      const htmlKeyboard = renderToString(<AnalogGauges />);
      expect(htmlKeyboard).toContain('right:calc(20px + var(--sar))');
      expect(htmlKeyboard).not.toContain('scale(0.60)');
    });

    it('respects touchControlMode: "always" override regardless of gamepad or keyboard modality', () => {
      useSettingsStore.setState({ touchControlMode: 'always' });

      setLastInputType('keyboard');
      let html = renderToString(<AnalogGauges />);
      expect(html).toContain('left:calc(16px + var(--sal, 0px))');
      expect(html).toContain('transform:scale(0.60)');

      setLastInputType('gamepad');
      html = renderToString(<AnalogGauges />);
      expect(html).toContain('left:calc(16px + var(--sal, 0px))');
      expect(html).toContain('transform:scale(0.60)');

      // TouchControlsOverlay is also always visible
      expect(renderToString(<TouchControlsOverlay />)).toContain('data-testid="touch-controls-overlay"');
    });

    it('respects touchControlMode: "off" override regardless of touch inputs', () => {
      useSettingsStore.setState({ touchControlMode: 'off' });

      setTouchInput({ throttle: 1.0 });
      expect(getLastInputType()).toBe('touch');

      // In 'off' mode, gauges stay at bottom-right
      const html = renderToString(<AnalogGauges />);
      expect(html).toContain('right:calc(20px + var(--sar))');
      expect(html).not.toContain('translateX(-50%)');

      // In 'off' mode, overlay renders null
      expect(renderToString(<TouchControlsOverlay />)).toBe('');
    });
  });

  // ==========================================================================
  // 5. Event Deduping, Modality Transition Broadcast & Stress Oscillation
  // ==========================================================================
  describe('5. Event Deduping, Broadcast & Modality Stress Oscillation', () => {
    it('dispatches openrally-input-switch only on genuine modality transitions and suppresses duplicates', () => {
      const dispatchSpy = vi.spyOn(mockWindow, 'dispatchEvent');

      setLastInputType('keyboard');
      dispatchSpy.mockClear();

      // Same modality -> NO event
      setLastInputType('keyboard');
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Transition to gamepad -> 1 event
      setLastInputType('gamepad');
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const call1 = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(call1.type).toBe('openrally-input-switch');
      expect(call1.detail).toEqual({ modality: 'gamepad' });

      // Repeat gamepad -> NO duplicate event
      dispatchSpy.mockClear();
      setLastInputType('gamepad');
      expect(dispatchSpy).not.toHaveBeenCalled();

      // Transition to touch via setTouchInput -> 1 event
      dispatchSpy.mockClear();
      setTouchInput({ throttle: 1.0 });
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const call2 = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(call2.type).toBe('openrally-input-switch');
      expect(call2.detail).toEqual({ modality: 'touch' });

      // Further touch updates while modality is already touch -> NO extra events
      dispatchSpy.mockClear();
      setTouchInput({ steering: -0.5 });
      setTouchInput({ brake: 0.2 });
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('survives 2,000 rapid modality oscillations between touch, gamepad, and keyboard without state desynchronization', () => {
      const modalities: InputType[] = ['touch', 'gamepad', 'keyboard'];
      const dispatchSpy = vi.spyOn(mockWindow, 'dispatchEvent');

      let transitionCount = 0;
      let currentExpectedModality = getLastInputType();

      for (let i = 0; i < 2000; i++) {
        const nextModality = modalities[i % modalities.length];
        if (nextModality !== currentExpectedModality) {
          transitionCount++;
          currentExpectedModality = nextModality;
        }

        if (nextModality === 'touch') {
          setTouchInput({ throttle: (i % 10) / 10 });
        } else {
          setLastInputType(nextModality);
        }

        expect(getLastInputType()).toBe(nextModality);
      }

      expect(dispatchSpy).toHaveBeenCalledTimes(transitionCount);

      // Final state evaluation
      const finalModality = getLastInputType();
      if (finalModality === 'touch') {
        expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toContain(
          'data-testid="touch-controls-overlay"'
        );
        expect(renderToString(<AnalogGauges />)).toContain('left:calc(16px + var(--sal, 0px))');
      } else {
        expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toBe('');
        expect(renderToString(<AnalogGauges />)).toContain('right:calc(20px + var(--sar))');
      }
    });

    it('gracefully tolerates corrupted or hostile openrally-input-switch events', () => {
      // Dispatches events with abnormal or corrupted detail payloads
      const hostileEvents = [
        new CustomEvent('openrally-input-switch', { detail: null }),
        new CustomEvent('openrally-input-switch', { detail: undefined }),
        new CustomEvent('openrally-input-switch', { detail: {} }),
        new CustomEvent('openrally-input-switch', { detail: { modality: 12345 } }),
        new CustomEvent('openrally-input-switch', { detail: { modality: { attack: true } } }),
        new CustomEvent('openrally-input-switch', { detail: { modality: 'unsupported_device' } }),
        new Event('openrally-input-switch'),
      ];

      for (const evt of hostileEvents) {
        expect(() => mockWindow.dispatchEvent(evt)).not.toThrow();
        // Renders must continue to function without throwing
        expect(() => renderToString(<TouchControlsOverlay touchControlMode="auto" />)).not.toThrow();
        expect(() => renderToString(<AnalogGauges />)).not.toThrow();
      }
    });
  });
});
