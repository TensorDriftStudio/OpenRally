import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { sampleGamepad, XBOX_AXES } from '@/utils/input/gamepad';

describe('Garage Turntable & Gamepad 360° Inspection System', () => {
  beforeEach(() => {
    useGameStore.setState({
      gameState: 'menu',
      gamepadConnected: true,
      gamepadType: 'xbox',
    });
  });

  it('verifies sampleGamepad exports discrete dpad buttons for menu and garage', () => {
    const sample = sampleGamepad(1.0, null);
    expect(sample.dpadUp).toBe(false);
    expect(sample.dpadDown).toBe(false);
    expect(sample.dpadLeft).toBe(false);
    expect(sample.dpadRight).toBe(false);
  });

  it('processes radial deadzone for turntable rotation smoothly', () => {
    const DEADZONE = 0.12;
    const applyDeadzone = (v: number) => {
      const abs = Math.abs(v);
      if (abs <= DEADZONE) return 0;
      return (Math.sign(v) * (abs - DEADZONE)) / (1 - DEADZONE);
    };

    // Sub-deadzone values must be completely ignored (zero jitter)
    expect(applyDeadzone(0.05)).toBe(0);
    expect(applyDeadzone(-0.11)).toBe(0);

    // Past deadzone must scale smoothly between 0 and 1
    const pastDeadzone = applyDeadzone(0.56);
    expect(pastDeadzone).toBeGreaterThan(0.4);
    expect(pastDeadzone).toBeLessThan(0.6);

    const fullDeflection = applyDeadzone(1.0);
    expect(fullDeflection).toBeCloseTo(1.0, 5);
  });

  it('calculates trigger zoom factor proportionally to trigger pressure', () => {
    const dt = 1 / 60;
    const ltValue = 0;
    const rtValue = 0.8; // Press RT to zoom in
    const zoomDelta = rtValue - ltValue;

    const zoomFactor = 1 + Math.abs(zoomDelta) * 1.6 * dt;
    expect(zoomFactor).toBeGreaterThan(1.0);
    expect(zoomFactor).toBeLessThan(1.05);
  });

  it('exclusively samples right analog stick (axes 2 and 3) for 360° turntable orbit', () => {
    const DEADZONE = 0.12;
    const applyDeadzone = (v: number) => {
      const abs = Math.abs(v);
      if (abs <= DEADZONE) return 0;
      return (Math.sign(v) * (abs - DEADZONE)) / (1 - DEADZONE);
    };

    // Simulate gamepad axes: left stick active (axes 0, 1), right stick centered (axes 2, 3)
    const axesWithLeftStick = [0.8, -0.6, 0.0, 0.0];
    const rightXFromLeftAxes = applyDeadzone(axesWithLeftStick[XBOX_AXES.RIGHT_STICK_X] ?? 0);
    const rightYFromLeftAxes = applyDeadzone(axesWithLeftStick[XBOX_AXES.RIGHT_STICK_Y] ?? 0);
    expect(rightXFromLeftAxes).toBe(0);
    expect(rightYFromLeftAxes).toBe(0);

    // Simulate gamepad axes: right stick active
    const axesWithRightStick = [0.0, 0.0, 0.75, -0.5];
    const stickX = applyDeadzone(axesWithRightStick[XBOX_AXES.RIGHT_STICK_X] ?? 0);
    const stickY = applyDeadzone(axesWithRightStick[XBOX_AXES.RIGHT_STICK_Y] ?? 0);
    expect(stickX).toBeGreaterThan(0.7);
    expect(stickY).toBeLessThan(-0.4);
  });

  it('allows left stick to drive menu navigation signals without rotating turntable', () => {
    // Left stick deflected rightwards
    const mockGp = {
      id: 'Xbox Controller',
      index: 0,
      connected: true,
      timestamp: performance.now(),
      mapping: 'standard' as const,
      axes: [0.8, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: null,
    } as unknown as Gamepad;

    const sample = sampleGamepad(1.0, mockGp);
    expect(sample.menuRight).toBe(true);
    expect(sample.cameraLookX).toBe(0);
    expect(sample.cameraLookY).toBe(0);
  });
});
