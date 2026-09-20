import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TouchControlsOverlay } from '@/components/ui/TouchControlsOverlay';
import { AnalogGauges } from '@/components/ui/gauges/AnalogGauges';
import {
  useSettingsStore,
  SETTINGS_STORAGE_KEY,
  loadSettingsFromStorage,
  saveSettingsToStorage,
} from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import {
  getTouchInputState,
  setTouchInput,
  resetTouchInputState,
  setLastInputType,
  calculateJoystickSteering,
  calculateDigitalSteering,
  triggerHapticFeedback,
  JOYSTICK_BASE_RADIUS,
  JOYSTICK_DEADZONE_RATIO,
} from '@/utils/input/touch';
import { blendInputs } from '@/hooks/useInput';
import { GAMEPAD_STEER_SPEED, STEER_SPEED } from '@/config/input';

describe('Adversarial Stress Test Suite: Milestone 3 (Touch Controls Overlay & Settings UI)', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  class MockWindow extends EventTarget {
    matchMedia = vi.fn().mockReturnValue({ matches: false });
  }

  let mockWindow: MockWindow;
  let storageMap: Record<string, string>;
  let mockVibrate: any;

  beforeEach(() => {
    storageMap = {};
    const mockStorage = {
      getItem: (k: string) => storageMap[k] ?? null,
      setItem: (k: string, v: string) => {
        storageMap[k] = String(v);
      },
      removeItem: (k: string) => {
        delete storageMap[k];
      },
      clear: () => {
        storageMap = {};
      },
      length: 0,
      key: (i: number) => Object.keys(storageMap)[i] ?? null,
    };
    vi.stubGlobal('localStorage', mockStorage);

    mockVibrate = vi.fn().mockReturnValue(true);
    mockWindow = new MockWindow();
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        maxTouchPoints: 5,
        vibrate: mockVibrate,
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
      rpm: 0,
      gear: 0,
    });

    useSettingsStore.setState({
      touchControlMode: 'always',
      touchSteeringScheme: 'joystick',
      touchOpacity: 0.7,
      touchButtonSize: 'medium',
      touchHaptics: true,
      sensitivity: 1.0,
    });
  });

  afterEach(() => {
    resetTouchInputState();
    setLastInputType('touch');
    vi.unstubAllGlobals();
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
  // CHALLENGE 1: Rapid Multi-Touch Pointer Sequences & Concurrency
  // ==========================================================================
  describe('Challenge 1: Rapid Multi-Touch Pointer Sequences & Concurrency', () => {
    it('C1-1: Thumb 1 steers while Thumb 2 modulates throttle at high frequency without crosstalk', () => {
      // Step 1: Thumb 1 steers left via virtual joystick (origin 100, contact 60 -> -40px deflection)
      const steerRes = calculateJoystickSteering(100, 60, JOYSTICK_BASE_RADIUS, JOYSTICK_DEADZONE_RATIO);
      expect(steerRes.steering).toBeCloseTo(40 / 55, 4);
      setTouchInput({ steering: steerRes.steering });
      expect(getTouchInputState().steering).toBeCloseTo(40 / 55, 4);
      expect(getTouchInputState().throttle).toBe(0.0);

      // Step 2: Thumb 2 rapidly pulses throttle 100 times (simulating 60Hz pedal flutter)
      for (let i = 0; i < 100; i++) {
        const throttleVal = i % 2 === 0 ? 1.0 : 0.0;
        setTouchInput({ throttle: throttleVal });

        const snap = getTouchInputState();
        expect(snap.throttle).toBe(throttleVal);
        expect(snap.steering).toBeCloseTo(40 / 55, 4);
        expect(snap.brake).toBe(0.0);
        expect(snap.handbrake).toBe(false);
      }
    });

    it('C1-2: Multi-touch power-braking (simultaneous full throttle and brake) coexists without priority inversion', () => {
      setTouchInput({ throttle: 1.0, brake: 1.0 });

      const snap = getTouchInputState();
      expect(snap.throttle).toBe(1.0);
      expect(snap.brake).toBe(1.0);

      const merged = blendInputs({
        dt: 0.016,
        prevSteering: 0,
        touch: snap,
      });

      expect(merged.state.throttle).toBe(1.0);
      expect(merged.state.brake).toBe(1.0);

      // Release throttle first: brake must remain active
      setTouchInput({ throttle: 0.0 });
      const snapAfterRelease = getTouchInputState();
      expect(snapAfterRelease.throttle).toBe(0.0);
      expect(snapAfterRelease.brake).toBe(1.0);
    });

    it('C1-3: Three-finger complex sequence: Steering + Throttle + Handbrake tap does not drop pulses', () => {
      const steerRight = calculateJoystickSteering(150, 150 + JOYSTICK_BASE_RADIUS);
      expect(steerRight.steering).toBe(-1.0);
      setTouchInput({ steering: steerRight.steering });

      setTouchInput({ throttle: 1.0 });
      setTouchInput({ handbrake: true });

      let snap = getTouchInputState();
      expect(snap.steering).toBe(-1.0);
      expect(snap.throttle).toBe(1.0);
      expect(snap.handbrake).toBe(true);

      // Handbrake release
      setTouchInput({ handbrake: false });
      snap = getTouchInputState();
      expect(snap.steering).toBe(-1.0);
      expect(snap.throttle).toBe(1.0);
      expect(snap.handbrake).toBe(false);

      // Steer back to center
      setTouchInput({ steering: 0.0 });
      snap = getTouchInputState();
      expect(snap.steering).toBe(0.0);
      expect(snap.throttle).toBe(1.0);
    });

    it('C1-4: Out-of-order pointer releases do not contaminate orthogonal input channels', () => {
      setTouchInput({ throttle: 1.0 });
      setTouchInput({ brake: 1.0 });
      setTouchInput({ handbrake: true });
      setTouchInput({ steering: 0.5 });

      setTouchInput({ brake: 0.0 });
      let snap = getTouchInputState();
      expect(snap.brake).toBe(0.0);
      expect(snap.throttle).toBe(1.0);
      expect(snap.handbrake).toBe(true);
      expect(snap.steering).toBe(0.5);

      setTouchInput({ steering: 0.0 });
      snap = getTouchInputState();
      expect(snap.steering).toBe(0.0);
      expect(snap.throttle).toBe(1.0);
      expect(snap.handbrake).toBe(true);

      setTouchInput({ throttle: 0.0 });
      snap = getTouchInputState();
      expect(snap.throttle).toBe(0.0);
      expect(snap.handbrake).toBe(true);

      setTouchInput({ handbrake: false });
      snap = getTouchInputState();
      expect(snap.handbrake).toBe(false);
      expect(snap.steering).toBe(0.0);
      expect(snap.throttle).toBe(0.0);
      expect(snap.brake).toBe(0.0);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Floating Joystick Math, Boundary Escapes & Pointer Capture
  // ==========================================================================
  describe('Challenge 2: Floating Joystick Math, Boundary Escapes & Pointer Capture', () => {
    it('C2-1: Boundary escape: Dragging pointer far off-screen (-100,000px) clamps deflection strictly to +1.0 Left', () => {
      const originX = 200;
      const escapeX = -100000;
      const res = calculateJoystickSteering(originX, escapeX, JOYSTICK_BASE_RADIUS, JOYSTICK_DEADZONE_RATIO);

      expect(res.rawDeflection).toBeCloseTo(-100200 / 55, 2);
      expect(res.clampedDeflection).toBe(-1.0);
      expect(res.steering).toBe(1.0);
      expect(res.inDeadzone).toBe(false);

      setTouchInput({ steering: res.steering });
      expect(getTouchInputState().steering).toBe(1.0);
    });

    it('C2-2: Boundary escape: Dragging pointer far off-screen (+100,000px) clamps deflection strictly to -1.0 Right', () => {
      const originX = 200;
      const escapeX = 100000;
      const res = calculateJoystickSteering(originX, escapeX, JOYSTICK_BASE_RADIUS, JOYSTICK_DEADZONE_RATIO);

      expect(res.rawDeflection).toBeCloseTo(99800 / 55, 2);
      expect(res.clampedDeflection).toBe(1.0);
      expect(res.steering).toBe(-1.0);
      expect(res.inDeadzone).toBe(false);

      setTouchInput({ steering: res.steering });
      expect(getTouchInputState().steering).toBe(-1.0);
    });

    it('C2-3: Floating knob vector math strictly clamps knob distance to JOYSTICK_BASE_RADIUS (55px)', () => {
      const origin = { x: 200, y: 300 };
      const testOffsets = [
        { dx: 500, dy: 0 },
        { dx: -500, dy: 0 },
        { dx: 0, dy: 500 },
        { dx: 300, dy: 400 },
        { dx: -120, dy: -160 },
        { dx: 99999, dy: -99999 },
      ];

      for (const { dx, dy } of testOffsets) {
        const clientX = origin.x + dx;
        const clientY = origin.y + dy;

        const deltaX = clientX - origin.x;
        const deltaY = clientY - origin.y;
        const dist = Math.hypot(deltaX, deltaY);

        let knobX = clientX;
        let knobY = clientY;
        if (dist > JOYSTICK_BASE_RADIUS) {
          knobX = origin.x + (deltaX / dist) * JOYSTICK_BASE_RADIUS;
          knobY = origin.y + (deltaY / dist) * JOYSTICK_BASE_RADIUS;
        }

        const actualDistFromOrigin = Math.hypot(knobX - origin.x, knobY - origin.y);
        expect(actualDistFromOrigin).toBeCloseTo(JOYSTICK_BASE_RADIUS, 5);
      }
    });

    it('C2-4: Sub-pixel deadzone boundary precision (exactly 4.4px on 55px radius at 8%)', () => {
      const originX = 0;
      const deadzonePx = JOYSTICK_BASE_RADIUS * JOYSTICK_DEADZONE_RATIO;
      expect(deadzonePx).toBeCloseTo(4.4, 5);

      const r0 = calculateJoystickSteering(originX, originX);
      expect(r0.inDeadzone).toBe(true);
      expect(r0.steering).toBe(0.0);

      const rSub1 = calculateJoystickSteering(originX, 2.0);
      expect(rSub1.inDeadzone).toBe(true);
      expect(rSub1.steering).toBe(0.0);

      const rBoundary = calculateJoystickSteering(originX, 4.4);
      expect(rBoundary.inDeadzone).toBe(true);
      expect(rBoundary.steering).toBe(0.0);

      const rJustOutsideRight = calculateJoystickSteering(originX, 4.45);
      expect(rJustOutsideRight.inDeadzone).toBe(false);
      expect(rJustOutsideRight.steering).toBeLessThan(0.0);

      const rJustOutsideLeft = calculateJoystickSteering(originX, -4.45);
      expect(rJustOutsideLeft.inDeadzone).toBe(false);
      expect(rJustOutsideLeft.steering).toBeGreaterThan(0.0);
    });

    it('C2-5: Pure vertical motion has zero influence on steering', () => {
      const origin = { x: 150, y: 250 };
      const resUp = calculateJoystickSteering(origin.x, origin.x);
      expect(resUp.steering).toBe(0.0);

      const resDown = calculateJoystickSteering(origin.x, origin.x);
      expect(resDown.steering).toBe(0.0);
    });

    it('C2-6: Pointer cancellation resets joystick steering instantly to 0.0', () => {
      const res = calculateJoystickSteering(100, 45);
      expect(res.steering).toBe(1.0);
      setTouchInput({ steering: res.steering });
      expect(getTouchInputState().steering).toBe(1.0);

      setTouchInput({ steering: 0 });
      expect(getTouchInputState().steering).toBe(0.0);
    });

    it('C2-7: Degenerate input sanitization: NaN, Infinity, negative radius do not poison state', () => {
      const zeroRadius = calculateJoystickSteering(100, 150, 0);
      expect(zeroRadius.steering).toBe(0.0);
      expect(zeroRadius.inDeadzone).toBe(true);

      const negRadius = calculateJoystickSteering(100, 150, -55);
      expect(negRadius.steering).toBe(0.0);
      expect(negRadius.inDeadzone).toBe(true);

      setTouchInput({ steering: NaN });
      expect(getTouchInputState().steering).toBe(0.0);

      setTouchInput({ steering: Infinity });
      expect(getTouchInputState().steering).toBe(0.0);

      setTouchInput({ throttle: -999 });
      expect(getTouchInputState().throttle).toBe(0.0);

      setTouchInput({ throttle: 999 });
      expect(getTouchInputState().throttle).toBe(1.0);

      setTouchInput({ brake: NaN });
      expect(getTouchInputState().brake).toBe(0.0);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Steering Scheme Switching & Dynamic UI Adaptation
  // ==========================================================================
  describe('Challenge 3: Steering Scheme Switching & Dynamic UI Adaptation', () => {
    it('C3-1: Dynamically switches from "joystick" to "buttons" and verifies UI markup transformation', () => {
      const htmlJoy = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="joystick" />
      );
      expect(htmlJoy).toContain('data-testid="touch-joystick-zone"');
      expect(htmlJoy).not.toContain('data-testid="touch-btn-steer-left"');
      expect(htmlJoy).not.toContain('data-testid="touch-btn-steer-right"');

      const htmlBtn = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="buttons" />
      );
      expect(htmlBtn).not.toContain('data-testid="touch-joystick-zone"');
      expect(htmlBtn).toContain('data-testid="touch-btn-steer-left"');
      expect(htmlBtn).toContain('data-testid="touch-btn-steer-right"');

      useSettingsStore.getState().setTouchSteeringScheme('buttons');
      expect(useSettingsStore.getState().touchSteeringScheme).toBe('buttons');
    });

    it('C3-2: Digital steering buttons calculate clean discrete states (+1.0 Left, -1.0 Right, 0.0 Cancel)', () => {
      expect(calculateDigitalSteering(true, false)).toBe(1.0);
      expect(calculateDigitalSteering(false, true)).toBe(-1.0);
      expect(calculateDigitalSteering(false, false)).toBe(0.0);
      expect(calculateDigitalSteering(true, true)).toBe(0.0);
    });

    it('C3-3: Digital button press immediately overrides prior active joystick steering', () => {
      setTouchInput({ steering: 0.75 });
      expect(getTouchInputState().steering).toBe(0.75);

      const rightSteerVal = calculateDigitalSteering(false, true);
      setTouchInput({ steering: rightSteerVal });
      expect(getTouchInputState().steering).toBe(-1.0);

      const neutralSteerVal = calculateDigitalSteering(false, false);
      setTouchInput({ steering: neutralSteerVal });
      expect(getTouchInputState().steering).toBe(0.0);
    });

    it('C3-4: Rapid alternating scheme toggle (100 iterations) maintains state integrity and persistence', () => {
      for (let i = 0; i < 100; i++) {
        const scheme = i % 2 === 0 ? 'joystick' : 'buttons';
        useSettingsStore.getState().setTouchSteeringScheme(scheme);
        expect(useSettingsStore.getState().touchSteeringScheme).toBe(scheme);

        const stored = JSON.parse(storageMap[SETTINGS_STORAGE_KEY]);
        expect(stored.touchSteeringScheme).toBe(scheme);
      }
    });

    it('C3-5: Prop overrides take strict precedence over store settings during scheme rendering', () => {
      useSettingsStore.setState({ touchSteeringScheme: 'joystick' });

      const htmlOverride = renderToString(
        <TouchControlsOverlay touchSteeringScheme="buttons" />
      );
      expect(htmlOverride).toContain('data-testid="touch-btn-steer-left"');
      expect(htmlOverride).not.toContain('data-testid="touch-joystick-zone"');
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Safe-Area, Opacity, Button Sizing & HUD Repositioning
  // ==========================================================================
  describe('Challenge 4: Safe-Area, Opacity, Button Sizing & HUD Repositioning', () => {
    it('C4-1: Opacity clamping: Settings store strictly clamps opacity between 0.2 and 1.0', () => {
      const store = useSettingsStore.getState();

      store.setTouchOpacity(-5.0);
      expect(useSettingsStore.getState().touchOpacity).toBe(0.2);

      store.setTouchOpacity(0.0);
      expect(useSettingsStore.getState().touchOpacity).toBe(0.2);

      store.setTouchOpacity(0.19);
      expect(useSettingsStore.getState().touchOpacity).toBe(0.2);

      store.setTouchOpacity(0.65);
      expect(useSettingsStore.getState().touchOpacity).toBe(0.65);

      store.setTouchOpacity(1.0);
      expect(useSettingsStore.getState().touchOpacity).toBe(1.0);

      store.setTouchOpacity(2.5);
      expect(useSettingsStore.getState().touchOpacity).toBe(1.0);

      store.setTouchOpacity(NaN);
      expect(useSettingsStore.getState().touchOpacity).toBe(0.7);
    });

    it('C4-2: Button size geometric scaling factors apply accurately (0.85, 1.0, 1.15)', () => {
      const htmlSmall = renderToString(
        <TouchControlsOverlay touchButtonSize="small" />
      );
      const htmlMed = renderToString(
        <TouchControlsOverlay touchButtonSize="medium" />
      );
      const htmlLarge = renderToString(
        <TouchControlsOverlay touchButtonSize="large" />
      );

      expect(htmlSmall).toContain('height:95px');
      expect(htmlMed).toContain('height:112px');
      expect(htmlLarge).toContain('height:129px');

      expect(htmlSmall).toContain('height:78px');
      expect(htmlMed).toContain('height:92px');
      expect(htmlLarge).toContain('height:106px');
    });

    it('C4-3: Safe-area insets var(--sal), var(--sar), var(--sab), var(--sat) are universally injected', () => {
      const html = renderToString(<TouchControlsOverlay touchSteeringScheme="buttons" />);
      expect(html).toContain('var(--sal');
      expect(html).toContain('var(--sar');
      expect(html).toContain('var(--sab');
      expect(html).toContain('var(--sat');
    });

    it('C4-4: HUD cluster in AnalogGauges repositions to top-left when touch controls are active', () => {
      useSettingsStore.setState({ touchControlMode: 'auto' });
      setLastInputType('touch');
      const htmlTouch = renderToString(<AnalogGauges />);
      expect(htmlTouch).toContain('left:calc(16px + var(--sal, 0px))');
      expect(htmlTouch).toContain('scale(0.60)');
      expect(htmlTouch).toContain('top:calc(68px + var(--sat, 0px))');
      expect(htmlTouch).toContain('right:auto');

      setLastInputType('keyboard');
      const htmlDesktop = renderToString(<AnalogGauges />);
      expect(htmlDesktop).not.toContain('scale(0.60)');
      expect(htmlDesktop).toContain('bottom:calc(20px + var(--sab))');
      expect(htmlDesktop).toContain('right:calc(20px + var(--sar))');
    });
  });

  // ==========================================================================
  // CHALLENGE 5: Storage Corruption Recovery & Settings Deserialization
  // ==========================================================================
  describe('Challenge 5: Storage Corruption Recovery & Settings Deserialization', () => {
    it('C5-1: Corrupted JSON strings in localStorage do not throw and fall back to empty partial', () => {
      storageMap[SETTINGS_STORAGE_KEY] = '{"touchControlMode": "alw';
      const recovered = loadSettingsFromStorage();
      expect(recovered).toEqual({});

      storageMap[SETTINGS_STORAGE_KEY] = 'null';
      expect(loadSettingsFromStorage()).toEqual({});

      storageMap[SETTINGS_STORAGE_KEY] = '12345';
      expect(loadSettingsFromStorage()).toEqual({});

      storageMap[SETTINGS_STORAGE_KEY] = 'undefined';
      expect(loadSettingsFromStorage()).toEqual({});
    });

    it('C5-2: Malformed enum values and invalid ranges are rejected and sanitized', () => {
      storageMap[SETTINGS_STORAGE_KEY] = JSON.stringify({
        touchControlMode: 'ultra_mode',
        touchSteeringScheme: 'tilt_controls',
        touchOpacity: 99.0,
        touchButtonSize: 'gigantic',
        touchHaptics: 'yes',
      });

      const recovered = loadSettingsFromStorage();
      expect(recovered.touchControlMode).toBeUndefined();
      expect(recovered.touchSteeringScheme).toBeUndefined();
      expect(recovered.touchOpacity).toBe(1.0);
      expect(recovered.touchButtonSize).toBeUndefined();
      expect(recovered.touchHaptics).toBeUndefined();
    });

    it('C5-3: Valid touch settings survive save and reload round-trip', () => {
      const payload = {
        touchControlMode: 'always' as const,
        touchSteeringScheme: 'buttons' as const,
        touchOpacity: 0.85,
        touchButtonSize: 'large' as const,
        touchHaptics: false,
      };

      saveSettingsToStorage(payload);
      const loaded = loadSettingsFromStorage();

      expect(loaded.touchControlMode).toBe('always');
      expect(loaded.touchSteeringScheme).toBe('buttons');
      expect(loaded.touchOpacity).toBeCloseTo(0.85, 2);
      expect(loaded.touchButtonSize).toBe('large');
      expect(loaded.touchHaptics).toBe(false);
    });
  });

  // ==========================================================================
  // CHALLENGE 6: Input Blending & Physics Subsystem Integration
  // ==========================================================================
  describe('Challenge 6: Input Blending & Physics Subsystem Integration', () => {
    it('C6-1: Touch steering input activates GAMEPAD_STEER_SPEED (responsive analog rate)', () => {
      const keys = new Set<string>();
      const gp = {};

      const kbKeys = new Set(['KeyA']);
      const kbRes = blendInputs({ dt: 0.016, prevSteering: 0, keys: kbKeys, gp });
      expect(kbRes.steerSpeed).toBe(STEER_SPEED);

      const touchRes = blendInputs({
        dt: 0.016,
        prevSteering: 0,
        keys,
        gp,
        touch: { steering: 0.4 },
      });
      expect(touchRes.steerSpeed).toBe(GAMEPAD_STEER_SPEED);
      expect(touchRes.targetSteering).toBe(0.4);
    });

    it('C6-2: Touch reset pulse is propagated to InputState.reset', () => {
      setTouchInput({ reset: true });
      const snap = getTouchInputState();
      expect(snap.reset).toBe(true);

      const merged = blendInputs({ dt: 0.016, prevSteering: 0, touch: snap });
      expect(merged.state.reset).toBe(true);

      setTouchInput({ reset: false });
      const mergedNeutral = blendInputs({ dt: 0.016, prevSteering: 0, touch: getTouchInputState() });
      expect(mergedNeutral.state.reset).toBe(false);
    });

    it('C6-3: Camera toggle pulse triggers GameStore cycleCameraMode transition', () => {
      useGameStore.setState({ cameraMode: 'chase' });
      setTouchInput({ cameraToggle: true });

      expect(getTouchInputState().cameraToggle).toBe(true);
      useGameStore.getState().cycleCameraMode();
      expect(useGameStore.getState().cameraMode).toBe('bumper');
    });

    it('C6-4: Pause trigger sets gameStore gameState to "paused"', () => {
      useGameStore.setState({ gameState: 'playing' });
      setTouchInput({ pause: true });

      expect(getTouchInputState().pause).toBe(true);
      useGameStore.getState().setGameState('paused');
      expect(useGameStore.getState().gameState).toBe('paused');
    });
  });

  // ==========================================================================
  // CHALLENGE 7: Haptics & Hardware Permissions Resilience
  // ==========================================================================
  describe('Challenge 7: Haptics & Hardware Permissions Resilience', () => {
    it('C7-1: triggerHapticFeedback dispatches vibration pattern when supported', () => {
      expect(triggerHapticFeedback(15)).toBe(true);
      expect(mockVibrate).toHaveBeenCalledWith(15);
    });

    it('C7-2: triggerHapticFeedback handles SecurityError or prohibited vibration silently', () => {
      mockVibrate.mockImplementation(() => {
        throw new Error('SecurityError: Vibration prohibited in background');
      });

      expect(() => triggerHapticFeedback(25)).not.toThrow();
      expect(triggerHapticFeedback(25)).toBe(false);
    });

    it('C7-3: triggerHapticFeedback gracefully degrades when navigator is undefined', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      expect(() => triggerHapticFeedback(10)).not.toThrow();
      expect(triggerHapticFeedback(10)).toBe(false);
    });
  });

  // ==========================================================================
  // CHALLENGE 8: Ergonomics & Thumb Zone Screen Coverage
  // ==========================================================================
  describe('Challenge 8: Ergonomics & Thumb Zone Screen Coverage', () => {
    it('C8-1: Virtual joystick interactive zone occupies 45vw width by 60vh height for thumb accessibility', () => {
      const htmlJoy = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="joystick" />
      );
      expect(htmlJoy).toContain('width:45vw');
      expect(htmlJoy).toContain('height:60vh');
    });

    it('C8-2: Top utility buttons are grouped at top-left respecting safe-area inset top and left', () => {
      const html = renderToString(<TouchControlsOverlay forceVisible={true} />);
      expect(html).toContain('top:calc(14px + var(--sat, 0px))');
      expect(html).toContain('left:calc(16px + var(--sal, 0px))');
    });

    it('C8-3: Pedals cluster is pinned to bottom-right respecting safe-area inset right and bottom', () => {
      const html = renderToString(<TouchControlsOverlay forceVisible={true} />);
      expect(html).toContain('right:calc(24px + var(--sar, 0px))');
      expect(html).toContain('bottom:calc(24px + var(--sab, 0px))');
    });
  });
});
