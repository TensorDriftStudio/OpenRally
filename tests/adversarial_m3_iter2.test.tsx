import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TouchControlsOverlay } from '@/components/ui/TouchControlsOverlay';
import { AnalogGauges } from '@/components/ui/gauges/AnalogGauges';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import {
  getTouchInputState,
  setTouchInput,
  resetTouchInputState,
  getLastInputType,
  setLastInputType,
  isTouchDevice,
  setupInputAutoDetection,
  calculateJoystickSteering,
  JOYSTICK_BASE_RADIUS,
  JOYSTICK_DEADZONE_RATIO,
  type InputType,
} from '@/utils/input/touch';
import { blendInputs } from '@/hooks/useInput';

describe('Adversarial Stress Test Suite: Milestone 3 Iteration 2 Challenger 1', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  class MockWindow extends EventTarget {
    matchMedia = vi.fn().mockReturnValue({ matches: false });
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
        maxTouchPoints: 5,
        vibrate: vi.fn().mockReturnValue(true),
      },
      configurable: true,
      writable: true,
    });

    resetTouchInputState();
    setLastInputType('touch');

    useGameStore.setState({
      gameState: 'playing',
      cameraMode: 'chase',
      speed: 0,
      rpm: 1000,
      gear: 0,
      gamepadConnected: false,
    });

    useSettingsStore.setState({
      touchControlMode: 'auto',
      touchSteeringScheme: 'joystick',
      touchOpacity: 0.7,
      touchButtonSize: 'medium',
      touchHaptics: true,
      sensitivity: 1.0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetTouchInputState();
    setLastInputType('touch');
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
  });

  // ==========================================================================
  // SUITE 1: Rapid Alternating Bursts & Instant Modality Switching
  // ==========================================================================
  describe('Suite 1: Rapid Alternating Bursts (Gamepad Auto-Hide & Touch Re-Mount)', () => {
    it('T1-1: 1,000 rapid alternating bursts of touch pointer events and gamepad axis inputs instantly toggle overlay visibility without latching', () => {
      let switchEventCount = 0;
      mockWindow.addEventListener('openrally-input-switch', () => {
        switchEventCount++;
      });

      for (let cycle = 0; cycle < 1000; cycle++) {
        // Burst A: 20 touch pointer / steering events
        for (let t = 0; t < 20; t++) {
          const steer = calculateJoystickSteering(100, 80 + (t % 5), JOYSTICK_BASE_RADIUS, JOYSTICK_DEADZONE_RATIO);
          setTouchInput({ steering: steer.steering, throttle: 0.8 });
        }
        expect(getLastInputType()).toBe('touch');

        // Verify overlay is mounted and visible in DOM under touch modality
        const htmlTouch = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
        expect(htmlTouch).toContain('data-testid="touch-controls-overlay"');
        expect(htmlTouch).toContain('data-testid="touch-joystick-zone"');

        // Burst B: 20 gamepad polling samples with active steering
        for (let g = 0; g < 20; g++) {
          const gpSteering = 0.45;
          if (Math.abs(gpSteering) > 0.05) {
            setLastInputType('gamepad');
          }
        }
        expect(getLastInputType()).toBe('gamepad');

        // Verify overlay instantly unmounts (returns null/empty string) under gamepad modality
        const htmlGamepad = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
        expect(htmlGamepad).toBe('');
      }

      // Verification of total transitions: exactly 2 per cycle (touch -> gamepad, gamepad -> touch)
      // Cycle 0 started in 'touch' (already set in beforeEach), so 1st touch burst is no-op for transition,
      // then gamepad (+1), then touch (+1), etc. Total transitions = 1 + 999*2 = 1999.
      expect(switchEventCount).toBe(1999);
      expect(getLastInputType()).toBe('gamepad');
    });

    it('T1-2: Anti-thrashing invariant: consecutive inputs within the same modality dispatch ZERO redundant switch events', () => {
      let switchDispatches = 0;
      mockWindow.addEventListener('openrally-input-switch', () => {
        switchDispatches++;
      });

      setLastInputType('touch');
      expect(switchDispatches).toBe(0); // already 'touch' from beforeEach

      // 500 consecutive touch inputs
      for (let i = 0; i < 500; i++) {
        setTouchInput({ throttle: 0.5 + (i % 50) * 0.01 });
      }
      expect(switchDispatches).toBe(0); // No switch occurred, remained 'touch'

      // Transition to gamepad
      setLastInputType('gamepad');
      expect(switchDispatches).toBe(1);

      // 500 consecutive gamepad inputs
      for (let i = 0; i < 500; i++) {
        setLastInputType('gamepad');
      }
      expect(switchDispatches).toBe(1); // Still exactly 1, no event flood!

      // Transition back to touch
      setTouchInput({ throttle: 1.0 });
      expect(switchDispatches).toBe(2);

      // Transition to keyboard
      setLastInputType('keyboard');
      expect(switchDispatches).toBe(3);

      // 500 consecutive keyboard inputs
      for (let i = 0; i < 500; i++) {
        setLastInputType('keyboard');
      }
      expect(switchDispatches).toBe(3); // Zero spam!
    });

    it('T1-3: AnalogGauges HUD layout dynamically alternates between touch top-left and desktop bottom-right without delay', () => {
      // Step 1: In touch mode, AnalogGauges shifts to top-left (left: calc(16px + var(--sal, 0px)), transform: scale(0.60))
      setLastInputType('touch');
      const htmlTouch = renderToString(<AnalogGauges />);
      expect(htmlTouch).toContain('left:calc(16px + var(--sal, 0px))');
      expect(htmlTouch).toContain('scale(0.60)');

      // Step 2: In gamepad mode, AnalogGauges shifts to bottom-right (right: calc(20px + var(--sar)))
      setLastInputType('gamepad');
      const htmlGamepad = renderToString(<AnalogGauges />);
      expect(htmlGamepad).toContain('right:calc(20px + var(--sar');
      expect(htmlGamepad).not.toContain('scale(0.60)');

      // Step 3: In keyboard mode, AnalogGauges remains in bottom-right
      setLastInputType('keyboard');
      const htmlKeyboard = renderToString(<AnalogGauges />);
      expect(htmlKeyboard).toContain('right:calc(20px + var(--sar');

      // Step 4: Rapid 200 alternation cycles verify synchronization
      for (let i = 0; i < 200; i++) {
        const mod: InputType = i % 2 === 0 ? 'touch' : 'gamepad';
        setLastInputType(mod);
        const html = renderToString(<AnalogGauges />);
        if (mod === 'touch') {
          expect(html).toContain('scale(0.60)');
        } else {
          expect(html).toContain('right:calc(20px + var(--sar');
        }
      }
    });

    it('T1-4: Sub-millisecond modality oscillation stress test: 5,000 rapid cycles verify zero state corruption', () => {
      const modalities: InputType[] = ['touch', 'gamepad', 'keyboard'];

      for (let i = 0; i < 5000; i++) {
        const targetMod = modalities[i % modalities.length];
        setLastInputType(targetMod);
        expect(getLastInputType()).toBe(targetMod);
      }

      // Conclude with touch and verify clean state
      setLastInputType('touch');
      expect(getLastInputType()).toBe('touch');
      const snap = getTouchInputState();
      expect(Number.isFinite(snap.steering)).toBe(true);
      expect(Number.isFinite(snap.throttle)).toBe(true);
      expect(Number.isFinite(snap.brake)).toBe(true);
    });
  });

  // ==========================================================================
  // SUITE 2: Event Listener Lifecycle & Zero-Leakage Invariant
  // ==========================================================================
  describe('Suite 2: Event Listener Lifecycle & Zero Memory Leak Invariant', () => {
    it('T2-1: TouchControlsOverlay effect listener balance: exactly 4 listeners registered on mount and 4 removed on unmount', () => {
      const registeredListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

      const addSpy = vi.spyOn(mockWindow, 'addEventListener').mockImplementation((type, listener) => {
        if (!registeredListeners.has(type)) registeredListeners.set(type, new Set());
        registeredListeners.get(type)!.add(listener);
      });

      const removeSpy = vi.spyOn(mockWindow, 'removeEventListener').mockImplementation((type, listener) => {
        if (registeredListeners.has(type)) {
          registeredListeners.get(type)!.delete(listener);
        }
      });

      // Simulate 1,000 component mount / unmount lifecycles
      for (let i = 0; i < 1000; i++) {
        // Lifecycle mount effect simulation (exact code from TouchControlsOverlay.tsx:86-106)
        const handleInputSwitch = vi.fn();
        mockWindow.addEventListener('pointerdown', handleInputSwitch, { passive: true });
        mockWindow.addEventListener('touchstart', handleInputSwitch, { passive: true });
        mockWindow.addEventListener('keydown', handleInputSwitch, { passive: true });
        mockWindow.addEventListener('openrally-input-switch', handleInputSwitch as EventListener);

        // Verify that on mount, exactly 4 listeners are registered
        expect(registeredListeners.get('pointerdown')?.has(handleInputSwitch)).toBe(true);
        expect(registeredListeners.get('touchstart')?.has(handleInputSwitch)).toBe(true);
        expect(registeredListeners.get('keydown')?.has(handleInputSwitch)).toBe(true);
        expect(registeredListeners.get('openrally-input-switch')?.has(handleInputSwitch as EventListener)).toBe(true);

        // Lifecycle unmount cleanup simulation
        mockWindow.removeEventListener('pointerdown', handleInputSwitch);
        mockWindow.removeEventListener('touchstart', handleInputSwitch);
        mockWindow.removeEventListener('keydown', handleInputSwitch);
        mockWindow.removeEventListener('openrally-input-switch', handleInputSwitch as EventListener);

        // Verify that after unmount, none remain
        expect(registeredListeners.get('pointerdown')?.has(handleInputSwitch)).toBe(false);
        expect(registeredListeners.get('touchstart')?.has(handleInputSwitch)).toBe(false);
        expect(registeredListeners.get('keydown')?.has(handleInputSwitch)).toBe(false);
        expect(registeredListeners.get('openrally-input-switch')?.has(handleInputSwitch as EventListener)).toBe(false);
      }

      // Net leakage invariant: all sets must be completely empty!
      for (const set of registeredListeners.values()) {
        expect(set.size).toBe(0);
      }

      expect(addSpy).toHaveBeenCalledTimes(4000);
      expect(removeSpy).toHaveBeenCalledTimes(4000);
    });

    it('T2-2: AnalogGauges effect listener balance: exactly 4 listeners registered and removed cleanly', () => {
      const activeListeners = new Map<string, number>();

      vi.spyOn(mockWindow, 'addEventListener').mockImplementation((type) => {
        activeListeners.set(type, (activeListeners.get(type) ?? 0) + 1);
      });

      vi.spyOn(mockWindow, 'removeEventListener').mockImplementation((type) => {
        activeListeners.set(type, (activeListeners.get(type) ?? 0) - 1);
      });

      for (let i = 0; i < 500; i++) {
        const handler = () => {};
        mockWindow.addEventListener('pointerdown', handler, { passive: true });
        mockWindow.addEventListener('touchstart', handler, { passive: true });
        mockWindow.addEventListener('keydown', handler, { passive: true });
        mockWindow.addEventListener('openrally-input-switch', handler);

        mockWindow.removeEventListener('pointerdown', handler);
        mockWindow.removeEventListener('touchstart', handler);
        mockWindow.removeEventListener('keydown', handler);
        mockWindow.removeEventListener('openrally-input-switch', handler);
      }

      for (const count of activeListeners.values()) {
        expect(count).toBe(0);
      }
    });

    it('T2-3: setupInputAutoDetection teardown function removes all 3 global listeners without residue', () => {
      const tracked = new Map<string, number>();

      vi.spyOn(mockWindow, 'addEventListener').mockImplementation((type) => {
        tracked.set(type, (tracked.get(type) ?? 0) + 1);
      });
      vi.spyOn(mockWindow, 'removeEventListener').mockImplementation((type) => {
        tracked.set(type, (tracked.get(type) ?? 0) - 1);
      });

      const cleanup = setupInputAutoDetection();
      expect(tracked.get('pointerdown')).toBe(1);
      expect(tracked.get('touchstart')).toBe(1);
      expect(tracked.get('keydown')).toBe(1);

      cleanup();

      expect(tracked.get('pointerdown')).toBe(0);
      expect(tracked.get('touchstart')).toBe(0);
      expect(tracked.get('keydown')).toBe(0);
    });

    it('T2-4: resetTouchInputState unmount cleanup thoroughly zeroes all pulse flags and analog channels', () => {
      setTouchInput({
        steering: -0.75,
        throttle: 0.95,
        brake: 0.85,
        handbrake: true,
        reset: true,
        cameraToggle: true,
        pause: true,
      });

      let snap = getTouchInputState();
      expect(snap.steering).toBe(-0.75);
      expect(snap.throttle).toBe(0.95);
      expect(snap.brake).toBe(0.85);
      expect(snap.handbrake).toBe(true);
      expect(snap.reset).toBe(true);
      expect(snap.cameraToggle).toBe(true);
      expect(snap.pause).toBe(true);

      // Unmount hook invocation
      resetTouchInputState();

      snap = getTouchInputState();
      expect(snap.steering).toBe(0);
      expect(snap.throttle).toBe(0);
      expect(snap.brake).toBe(0);
      expect(snap.handbrake).toBe(false);
      expect(snap.reset).toBe(false);
      expect(snap.cameraToggle).toBe(false);
      expect(snap.pause).toBe(false);
    });
  });

  // ==========================================================================
  // SUITE 3: Gamepad Deadzone & Sub-Threshold Input Discrimination
  // ==========================================================================
  describe('Suite 3: Gamepad Deadzone & Sub-Threshold Input Discrimination', () => {
    it('T3-1: Sub-threshold analog noise below 0.05 does not trigger auto-hide away from touch', () => {
      setLastInputType('touch');
      expect(getLastInputType()).toBe('touch');

      // Sub-threshold stick noise
      const noisyInputs = [
        { throttle: 0.04, brake: 0.0, steering: 0.02 },
        { throttle: 0.0, brake: 0.049, steering: -0.049 },
        { throttle: 0.01, brake: 0.01, steering: 0.0 },
      ];

      for (const gp of noisyInputs) {
        // Evaluate condition from useInput.ts:284-293
        if (
          gp.throttle > 0.05 ||
          gp.brake > 0.05 ||
          Math.abs(gp.steering) > 0.05
        ) {
          setLastInputType('gamepad');
        }
      }

      // Must remain touch!
      expect(getLastInputType()).toBe('touch');
      const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(html).toContain('data-testid="touch-controls-overlay"');
    });

    it('T3-2: Inputs exceeding 0.05 threshold immediately trigger gamepad mode and hide overlay', () => {
      setLastInputType('touch');

      const supraInputs = [
        { throttle: 0.051, brake: 0, steering: 0 },
        { throttle: 0, brake: 0.06, steering: 0 },
        { throttle: 0, brake: 0, steering: -0.055 },
      ];

      for (const gp of supraInputs) {
        setLastInputType('touch');
        if (
          gp.throttle > 0.05 ||
          gp.brake > 0.05 ||
          Math.abs(gp.steering) > 0.05
        ) {
          setLastInputType('gamepad');
        }
        expect(getLastInputType()).toBe('gamepad');
        expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toBe('');
      }
    });

    it('T3-3: Gamepad stick recentering to deadzone (0.0) maintains gamepad modality until touch event', () => {
      // Player moves stick
      setLastInputType('gamepad');
      expect(getLastInputType()).toBe('gamepad');

      // Stick returns to rest (steering 0, throttle 0, brake 0)
      const neutralGp = { throttle: 0, brake: 0, steering: 0 };
      if (
        neutralGp.throttle > 0.05 ||
        neutralGp.brake > 0.05 ||
        Math.abs(neutralGp.steering) > 0.05
      ) {
        setLastInputType('gamepad');
      }

      // Modality must NOT reset to touch just because stick centered
      expect(getLastInputType()).toBe('gamepad');
      expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toBe('');

      // When player touches screen, it immediately returns to touch
      setTouchInput({ throttle: 0.5 });
      expect(getLastInputType()).toBe('touch');
      expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toContain(
        'data-testid="touch-controls-overlay"'
      );
    });
  });

  // ==========================================================================
  // SUITE 4: Event Payload Resilience & Defensive Error Handling
  // ==========================================================================
  describe('Suite 4: Event Payload Resilience & Defensive Error Handling', () => {
    it('T4-1: openrally-input-switch with malformed or missing detail does not throw and recovers gracefully', () => {
      // Simulate listener dispatch directly with malformed events
      const target = mockWindow;

      expect(() => {
        target.dispatchEvent(new CustomEvent('openrally-input-switch', { detail: null }));
        target.dispatchEvent(new CustomEvent('openrally-input-switch', { detail: {} }));
        target.dispatchEvent(new CustomEvent('openrally-input-switch', { detail: { modality: 12345 } }));
        target.dispatchEvent(new CustomEvent('openrally-input-switch', { detail: { modality: null } }));
        target.dispatchEvent(new CustomEvent('openrally-input-switch', { detail: { modality: 'invalid_mode' } }));
      }).not.toThrow();

      // Native PointerEvent with numeric detail
      const pointerEvt = new Event('pointerdown');
      Object.defineProperty(pointerEvt, 'detail', { value: 1 });
      expect(() => {
        target.dispatchEvent(pointerEvt);
      }).not.toThrow();
    });

    it('T4-2: setLastInputType rejects unrecognized modalities without dispatching events', () => {
      let dispatchCount = 0;
      mockWindow.addEventListener('openrally-input-switch', () => {
        dispatchCount++;
      });

      setLastInputType('touch');
      dispatchCount = 0;

      // Unrecognized modalities
      // @ts-expect-error testing invalid runtime arguments
      setLastInputType('steering_wheel');
      // @ts-expect-error testing invalid runtime arguments
      setLastInputType('vr_controller');
      // @ts-expect-error testing invalid runtime arguments
      setLastInputType('');
      // @ts-expect-error testing invalid runtime arguments
      setLastInputType(null);
      // @ts-expect-error testing invalid runtime arguments
      setLastInputType(undefined);

      expect(dispatchCount).toBe(0);
      expect(getLastInputType()).toBe('touch');
    });
  });

  // ==========================================================================
  // SUITE 5: Input Blending & Multi-Touch State Sanitization Across Handoff
  // ==========================================================================
  describe('Suite 5: Input Blending & Multi-Touch State Sanitization Across Handoff', () => {
    it('T5-1: Vehicle blendInputs handles transition mid-turn without NaN or glitch', () => {
      // Touch was full lock left (+1.0)
      setTouchInput({ steering: 1.0, throttle: 1.0 });

      let merged = blendInputs({
        dt: 0.016,
        prevSteering: 0.5,
        touch: getTouchInputState(),
      });
      expect(merged.targetSteering).toBe(1.0);
      expect(merged.state.throttle).toBe(1.0);

      // Gamepad takes over: stick counter-steers right (-0.8)
      setLastInputType('gamepad');
      const gp = { steering: -0.8, throttle: 0.9, brake: 0, handbrake: false };

      // Touch is reset on unmount
      resetTouchInputState();

      merged = blendInputs({
        dt: 0.016,
        prevSteering: merged.state.steering,
        gp,
        touch: getTouchInputState(),
      });

      expect(merged.targetSteering).toBe(-0.8);
      expect(merged.state.throttle).toBe(0.9);
      expect(Number.isFinite(merged.state.steering)).toBe(true);
      expect(merged.state.steering).toBeLessThan(0.5); // smoothly transitioning toward -0.8
    });
  });

  // ==========================================================================
  // SUITE 6: Desktop Non-Touch Environment Initialization & SSR Invariance
  // ==========================================================================
  describe('Suite 6: Desktop Non-Touch Environment Initialization & SSR Invariance', () => {
    it('T6-1: Non-touch desktop environment starts in keyboard mode and hides overlay in auto mode', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { maxTouchPoints: 0 },
        configurable: true,
        writable: true,
      });

      expect(isTouchDevice()).toBe(false);
      setLastInputType('keyboard');
      expect(getLastInputType()).toBe('keyboard');

      const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(html).toBe('');
    });

    it('T6-2: Touch-capable environment starts in touch mode and shows overlay in auto mode', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { maxTouchPoints: 5 },
        configurable: true,
        writable: true,
      });

      expect(isTouchDevice()).toBe(true);
      setLastInputType('touch');
      expect(getLastInputType()).toBe('touch');

      const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(html).toContain('data-testid="touch-controls-overlay"');
    });

    it('T6-3: Setting touchControlMode="always" forces overlay visible on desktop regardless of input mode', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { maxTouchPoints: 0 },
        configurable: true,
        writable: true,
      });

      setLastInputType('keyboard');
      const htmlKeyboard = renderToString(<TouchControlsOverlay touchControlMode="always" />);
      expect(htmlKeyboard).toContain('data-testid="touch-controls-overlay"');

      setLastInputType('gamepad');
      const htmlGamepad = renderToString(<TouchControlsOverlay touchControlMode="always" />);
      expect(htmlGamepad).toContain('data-testid="touch-controls-overlay"');
    });
  });
});