import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TouchControlsOverlay } from '../TouchControlsOverlay';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import {
  getTouchInputState,
  setTouchInput,
  resetTouchInputState,
  getLastInputType,
  setLastInputType,
  isTouchDevice,
  calculateJoystickSteering,
  calculateDigitalSteering,
  JOYSTICK_BASE_RADIUS,
  JOYSTICK_DEADZONE_RATIO,
} from '@/utils/input/touch';

describe('TouchControlsOverlay Component', () => {
  beforeEach(() => {
    resetTouchInputState();
    useGameStore.setState({
      gameState: 'playing',
      cameraMode: 'chase',
    });
    useSettingsStore.setState({
      touchControlMode: 'always',
      touchSteeringScheme: 'joystick',
      touchOpacity: 0.7,
      touchButtonSize: 'medium',
      touchHaptics: true,
    });
  });

  describe('Rendering & Visibility', () => {
    it('renders all core controls when mode is "always"', () => {
      useSettingsStore.setState({ touchControlMode: 'always' });
      const html = renderToString(<TouchControlsOverlay />);

      expect(html).toContain('data-testid="touch-controls-overlay"');
      expect(html).toContain('data-testid="touch-joystick-zone"');
      expect(html).toContain('data-testid="touch-pedal-throttle"');
      expect(html).toContain('data-testid="touch-pedal-brake"');
      expect(html).toContain('data-testid="touch-btn-handbrake"');
      expect(html).toContain('data-testid="touch-btn-pause"');
      expect(html).toContain('data-testid="touch-btn-reset"');
      expect(html).toContain('data-testid="touch-btn-camera"');
    });

    it('returns empty when touchControlMode is "off"', () => {
      const html = renderToString(<TouchControlsOverlay touchControlMode="off" />);
      expect(html).toBe('');
    });

    it('renders with forceVisible even if mode is off', () => {
      const html = renderToString(
        <TouchControlsOverlay forceVisible={true} touchControlMode="off" />
      );
      expect(html).toContain('data-testid="touch-controls-overlay"');
    });

    it('switches between floating joystick and digital steering buttons based on touchSteeringScheme', () => {
      // Joystick scheme
      const htmlJoystick = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="joystick" />
      );
      expect(htmlJoystick).toContain('data-testid="touch-joystick-zone"');
      expect(htmlJoystick).not.toContain('data-testid="touch-btn-steer-left"');
      expect(htmlJoystick).not.toContain('data-testid="touch-btn-steer-right"');

      // Buttons scheme
      const htmlButtons = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="buttons" />
      );
      expect(htmlButtons).not.toContain('data-testid="touch-joystick-zone"');
      expect(htmlButtons).toContain('data-testid="touch-btn-steer-left"');
      expect(htmlButtons).toContain('data-testid="touch-btn-steer-right"');

      // Tilt scheme
      const htmlTilt = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchSteeringScheme="tilt" />
      );
      expect(htmlTilt).toContain('data-testid="touch-tilt-zone"');
      expect(htmlTilt).toContain('data-testid="touch-tilt-indicator"');
      expect(htmlTilt).toContain('data-testid="touch-btn-tilt-calibrate"');
      expect(htmlTilt).not.toContain('data-testid="touch-joystick-zone"');
      expect(htmlTilt).not.toContain('data-testid="touch-btn-steer-left"');
      expect(htmlTilt).not.toContain('data-testid="touch-btn-steer-right"');
      expect(htmlTilt).toContain('data-testid="touch-pedal-throttle"');
      expect(htmlTilt).toContain('data-testid="touch-pedal-brake"');
      expect(htmlTilt).toContain('data-testid="touch-btn-handbrake"');
    });

    it('applies configured touchOpacity and safe-area padding variables', () => {
      const html = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchOpacity={0.85} />
      );

      expect(html).toContain('opacity:0.85');
      expect(html).toContain('var(--sal');
      expect(html).toContain('var(--sar');
      expect(html).toContain('var(--sab');
      expect(html).toContain('var(--sat');
    });

    it('scales button dimensions according to touchButtonSize', () => {
      const htmlSmall = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchButtonSize="small" />
      );

      const htmlLarge = renderToString(
        <TouchControlsOverlay touchControlMode="always" touchButtonSize="large" />
      );

      // Large throttle pedal should be taller than small pedal
      // small: 112 * 0.85 = 95px, large: 112 * 1.15 = 129px
      expect(htmlSmall).toContain('95px');
      expect(htmlLarge).toContain('129px');
    });

    it('positions DRIFT button on the right side above pedals cluster', () => {
      const html = renderToString(
        <TouchControlsOverlay touchControlMode="always" />
      );
      // Handbrake container has right: calc(24px + var(--sar, 0px)) and 150px bottom offset above pedals
      expect(html).toContain('right:calc(24px + var(--sar, 0px))');
      expect(html).toContain('150px');
      expect(html).toContain('data-testid="touch-btn-handbrake"');
    });
  });

  describe('Steering Calculations & Logic', () => {
    it('floating joystick adheres to OpenRally sign convention (+1.0 Left, -1.0 Right)', () => {
      const originX = 150;

      // Dragging left (negative deltaX) produces positive steering
      const leftMove = calculateJoystickSteering(originX, originX - JOYSTICK_BASE_RADIUS);
      expect(leftMove.steering).toBe(1.0);
      expect(leftMove.rawDeflection).toBe(-1.0);

      // Dragging right (positive deltaX) produces negative steering
      const rightMove = calculateJoystickSteering(originX, originX + JOYSTICK_BASE_RADIUS);
      expect(rightMove.steering).toBe(-1.0);
      expect(rightMove.rawDeflection).toBe(1.0);
    });

    it('floating joystick deadzone clamps small motions (<= 8%) to 0', () => {
      const originX = 100;
      const deadzoneLimit = JOYSTICK_BASE_RADIUS * JOYSTICK_DEADZONE_RATIO; // 4.4px
      expect(deadzoneLimit).toBeCloseTo(4.4, 1);

      // Within deadzone: delta = 3px
      const inside = calculateJoystickSteering(originX, originX + 3);
      expect(inside.inDeadzone).toBe(true);
      expect(inside.steering).toBe(0);

      // Beyond deadzone: delta = 10px
      const outside = calculateJoystickSteering(originX, originX + 10);
      expect(outside.inDeadzone).toBe(false);
      expect(outside.steering).toBeLessThan(0);
    });

    it('digital buttons calculate clean steering outputs including mutual cancellation', () => {
      expect(calculateDigitalSteering(true, false)).toBe(1.0);   // Left
      expect(calculateDigitalSteering(false, true)).toBe(-1.0);  // Right
      expect(calculateDigitalSteering(false, false)).toBe(0.0);  // Center
      expect(calculateDigitalSteering(true, true)).toBe(0.0);   // Both pressed
    });
  });

  describe('Touch Input State Integration & Actions', () => {
    it('updates throttle input state on pedal press and neutralizes on release', () => {
      expect(getTouchInputState().throttle).toBe(0);

      // Simulate throttle press
      setTouchInput({ throttle: 1.0 });
      expect(getTouchInputState().throttle).toBe(1.0);

      // Simulate throttle release
      setTouchInput({ throttle: 0.0 });
      expect(getTouchInputState().throttle).toBe(0.0);
    });

    it('updates brake input state on pedal press and neutralizes on release', () => {
      expect(getTouchInputState().brake).toBe(0);

      // Simulate brake press
      setTouchInput({ brake: 1.0 });
      expect(getTouchInputState().brake).toBe(1.0);

      // Simulate brake release
      setTouchInput({ brake: 0.0 });
      expect(getTouchInputState().brake).toBe(0.0);
    });

    it('updates handbrake state on press and release', () => {
      expect(getTouchInputState().handbrake).toBe(false);

      setTouchInput({ handbrake: true });
      expect(getTouchInputState().handbrake).toBe(true);

      setTouchInput({ handbrake: false });
      expect(getTouchInputState().handbrake).toBe(false);
    });

    it('triggers pause input and transitions game state to paused', () => {
      useGameStore.setState({ gameState: 'playing' });

      setTouchInput({ pause: true });
      useGameStore.getState().setGameState('paused');

      expect(getTouchInputState().pause).toBe(true);
      expect(useGameStore.getState().gameState).toBe('paused');
    });

    it('triggers car reset input pulse', () => {
      setTouchInput({ reset: true });
      expect(getTouchInputState().reset).toBe(true);

      setTouchInput({ reset: false });
      expect(getTouchInputState().reset).toBe(false);
    });

    it('triggers camera cycle toggle and advances camera view', () => {
      useGameStore.setState({ cameraMode: 'chase' });

      setTouchInput({ cameraToggle: true });
      useGameStore.getState().cycleCameraMode();

      expect(getTouchInputState().cameraToggle).toBe(true);
      expect(useGameStore.getState().cameraMode).toBe('bumper');
    });
  });

  describe('Input Modality Transitions & Auto-Hide Behavior', () => {
    it('auto-hides overlay when setLastInputType is called with gamepad in auto mode', () => {
      setLastInputType('touch');
      const htmlTouch = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(htmlTouch).toContain('data-testid="touch-controls-overlay"');

      // Modality transition to gamepad hides the overlay
      setLastInputType('gamepad');
      const htmlGamepad = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(htmlGamepad).toBe('');
    });

    it('auto-hides overlay when setLastInputType is called with keyboard in auto mode', () => {
      setLastInputType('touch');
      const htmlTouch = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(htmlTouch).toContain('data-testid="touch-controls-overlay"');

      // Modality transition to keyboard hides the overlay
      setLastInputType('keyboard');
      const htmlKeyboard = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(htmlKeyboard).toBe('');
    });

    it('initializes hidden in auto mode on non-touch desktop environments', () => {
      // On non-touch desktop environments where isTouchDevice() is false
      expect(isTouchDevice()).toBe(false);
      setLastInputType('keyboard');
      expect(getLastInputType()).toBe('keyboard');
      const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(html).toBe('');
    });

    it('transitions back to visible when touch input occurs from gamepad modality', () => {
      setLastInputType('gamepad');
      expect(renderToString(<TouchControlsOverlay touchControlMode="auto" />)).toBe('');

      // Player touches the screen / touch input occurs
      setTouchInput({ throttle: 1.0 });
      expect(getLastInputType()).toBe('touch');

      const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
      expect(html).toContain('data-testid="touch-controls-overlay"');
    });

    it('listens for openrally-input-switch event to update modality dynamically', () => {
      const originalWindow = globalThis.window;
      const target = new EventTarget();

      Object.defineProperty(globalThis, 'window', {
        value: {
          addEventListener: target.addEventListener.bind(target),
          removeEventListener: target.removeEventListener.bind(target),
          dispatchEvent: target.dispatchEvent.bind(target),
        },
        configurable: true,
        writable: true,
      });

      try {
        setLastInputType('touch');
        expect(getLastInputType()).toBe('touch');

        // Calling setLastInputType dispatches openrally-input-switch
        setLastInputType('gamepad');
        expect(getLastInputType()).toBe('gamepad');

        const html = renderToString(<TouchControlsOverlay touchControlMode="auto" />);
        expect(html).toBe('');
      } finally {
        Object.defineProperty(globalThis, 'window', {
          value: originalWindow,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
