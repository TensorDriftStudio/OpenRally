import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateTiltSteering,
  extractRawTiltAngle,
  getScreenOrientationAngle,
  startTiltSensorListener,
  stopTiltSensorListener,
  calibrateTiltCenter,
  resetTiltCenter,
  getTiltCenterOffset,
  setTiltTouchOverride,
  isTiltTouchOverrideActive,
  getLiveTiltAngle,
  sampleTiltSteering,
  isMotionSensorSupported,
  isIosMotionPermissionRequired,
  requestTiltPermission,
  getTiltPermissionState,
  DEFAULT_TILT_DEADZONE_DEG,
  DEFAULT_TILT_MAX_ANGLE_DEG,
} from '../tilt';

describe('Mobile Motion Sensor (Tilt) Steering Subsystem', () => {
  const originalWindow = globalThis.window;
  let listeners: Record<string, ((e: unknown) => void)[]> = {};

  beforeEach(() => {
    listeners = {};
    const mockWindow = {
      DeviceOrientationEvent: class DeviceOrientationEvent {
        type: string;
        beta?: number;
        gamma?: number;
        constructor(type: string, init?: { beta?: number; gamma?: number }) {
          this.type = type;
          this.beta = init?.beta;
          this.gamma = init?.gamma;
        }
      },
      DeviceMotionEvent: class DeviceMotionEvent {},
      screen: {
        orientation: {
          angle: 90,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      addEventListener: vi.fn((event: string, cb: (e: unknown) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: (e: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((fn) => fn !== cb);
        }
      }),
      dispatchEvent: vi.fn((event: unknown) => {
        const type = (event as { type: string }).type;
        listeners[type]?.forEach((fn) => fn(event));
        return true;
      }),
    };

    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    resetTiltCenter();
    setTiltTouchOverride(false);
    stopTiltSensorListener();
  });

  afterEach(() => {
    stopTiltSensorListener();
    resetTiltCenter();
    setTiltTouchOverride(false);

    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  // --------------------------------------------------------------------------
  // 1. Pure Steering Math (calculateTiltSteering)
  // --------------------------------------------------------------------------
  describe('calculateTiltSteering', () => {
    it('returns 0 when within default symmetrical deadzone (+/- 2.5 deg)', () => {
      expect(calculateTiltSteering(0)).toBe(0);
      expect(calculateTiltSteering(1.5)).toBe(0);
      expect(calculateTiltSteering(-1.5)).toBe(0);
      expect(calculateTiltSteering(DEFAULT_TILT_DEADZONE_DEG)).toBe(0);
      expect(calculateTiltSteering(-DEFAULT_TILT_DEADZONE_DEG)).toBe(0);
    });

    it('returns positive steering (+Left) for positive tilt angles above deadzone', () => {
      const steer = calculateTiltSteering(10.0);
      expect(steer).toBeGreaterThan(0);
      expect(steer).toBeLessThanOrEqual(1.0);
    });

    it('returns negative steering (-Right) for negative tilt angles below deadzone', () => {
      const steer = calculateTiltSteering(-10.0);
      expect(steer).toBeLessThan(0);
      expect(steer).toBeGreaterThanOrEqual(-1.0);
    });

    it('reaches exactly +1.0 (full left lock) at default maxAngle (28.0 deg)', () => {
      const steer = calculateTiltSteering(DEFAULT_TILT_MAX_ANGLE_DEG);
      expect(steer).toBeCloseTo(1.0, 4);
    });

    it('reaches exactly -1.0 (full right lock) at -maxAngle (-28.0 deg)', () => {
      const steer = calculateTiltSteering(-DEFAULT_TILT_MAX_ANGLE_DEG);
      expect(steer).toBeCloseTo(-1.0, 4);
    });

    it('clamps angles beyond maxAngle without overflow (> +1.0 or < -1.0)', () => {
      expect(calculateTiltSteering(45.0)).toBe(1.0);
      expect(calculateTiltSteering(90.0)).toBe(1.0);
      expect(calculateTiltSteering(-45.0)).toBe(-1.0);
      expect(calculateTiltSteering(-90.0)).toBe(-1.0);
    });

    it('inverts steering direction when invert option is true', () => {
      const normalLeft = calculateTiltSteering(15.0, { invert: false });
      const invertedLeft = calculateTiltSteering(15.0, { invert: true });
      expect(normalLeft).toBeGreaterThan(0);
      expect(invertedLeft).toBeLessThan(0);
      expect(invertedLeft).toBeCloseTo(-normalLeft, 4);
    });

    it('applies calibrated center offset angle correctly', () => {
      // With a +5.0 deg resting offset, 5.0 deg should be treated as neutral (0)
      const offset = 5.0;
      expect(calculateTiltSteering(5.0, { centerOffsetDeg: offset })).toBe(0);

      // 5.0 + 28.0 = 33.0 deg reaches full lock +1.0
      expect(calculateTiltSteering(33.0, { centerOffsetDeg: offset })).toBeCloseTo(1.0, 4);
    });

    it('applies progressive non-linear response curve (gamma = 1.35)', () => {
      const linearSteer = calculateTiltSteering(15.25, { gamma: 1.0 });
      const curvedSteer = calculateTiltSteering(15.25, { gamma: 1.35 });
      // Progressive curve should be calmer/smaller near the center than purely linear
      expect(curvedSteer).toBeLessThan(linearSteer);
      expect(curvedSteer).toBeGreaterThan(0);
    });

    it('scales output with sensitivity multiplier', () => {
      const base = calculateTiltSteering(12.0, { sensitivity: 1.0 });
      const boosted = calculateTiltSteering(12.0, { sensitivity: 1.5 });
      expect(boosted).toBeGreaterThan(base);
    });

    it('safely handles non-finite / NaN inputs gracefully', () => {
      expect(calculateTiltSteering(NaN)).toBe(0);
      expect(calculateTiltSteering(Infinity)).toBe(0);
      expect(calculateTiltSteering(-Infinity)).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Coordinate Extraction & Screen Orientation Compensation
  // --------------------------------------------------------------------------
  describe('extractRawTiltAngle', () => {
    it('inverts beta in landscape-primary (90 deg CCW) so tilting left produces positive steering', () => {
      // In landscape-primary, tilting left raises raw beta towards negative, so -beta is positive (+Left)
      expect(extractRawTiltAngle(-15.0, -40.0, 90)).toBe(15.0);
      expect(extractRawTiltAngle(12.5, -40.0, 90)).toBe(-12.5);
    });

    it('returns raw beta in landscape-secondary (270 deg CW) to preserve positive left steer', () => {
      expect(extractRawTiltAngle(15.0, -40.0, 270)).toBe(15.0);
      expect(extractRawTiltAngle(-12.5, -40.0, 270)).toBe(-12.5);
    });

    it('handles portrait fallback orientations (0 deg and 180 deg)', () => {
      // In portrait (0 deg), left roll is negative gamma -> returns -gamma
      expect(extractRawTiltAngle(45.0, -18.0, 0)).toBe(18.0);
      // In inverted portrait (180 deg), returns gamma
      expect(extractRawTiltAngle(45.0, 18.0, 180)).toBe(18.0);
    });

    it('normalizes wrapped rotation angles (e.g. 450 deg = 90 deg)', () => {
      expect(extractRawTiltAngle(-20.0, 0, 450)).toBe(20.0);
      expect(extractRawTiltAngle(20.0, 0, -90)).toBe(20.0); // -90 deg = 270 deg
    });
  });

  // --------------------------------------------------------------------------
  // 3. Screen Orientation Angle Detection
  // --------------------------------------------------------------------------
  describe('getScreenOrientationAngle', () => {
    it('returns screen.orientation.angle when available', () => {
      expect(getScreenOrientationAngle()).toBe(90);

      window.screen = {
        orientation: {
          angle: 270,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      } as unknown as Screen;

      expect(getScreenOrientationAngle()).toBe(270);
    });

    it('falls back to window.orientation when screen.orientation is absent (iOS legacy)', () => {
      // @ts-expect-error delete for fallback test
      delete window.screen.orientation;
      (window as unknown as { orientation: number }).orientation = -90;

      expect(getScreenOrientationAngle()).toBe(270);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Center Calibration & Live Angle Tracking
  // --------------------------------------------------------------------------
  describe('Calibration & Live Angle', () => {
    it('initializes with 0 center offset and tracks calibration changes', () => {
      expect(getTiltCenterOffset()).toBe(0);
      expect(getLiveTiltAngle()).toBe(0);

      // Simulate a sensor event updating internal raw angle (beta = -8.5 in landscape yields +8.5 deg tilt)
      const cleanup = startTiltSensorListener();
      window.dispatchEvent(
        new (window.DeviceOrientationEvent as unknown as new (type: string, init: unknown) => Event)(
          'deviceorientation',
          { beta: -8.5, gamma: 0 }
        )
      );

      // Calibrate current angle as center
      const offset = calibrateTiltCenter();
      expect(offset).toBe(8.5);
      expect(getTiltCenterOffset()).toBe(8.5);

      // Live angle should now be 0 after calibration
      expect(getLiveTiltAngle()).toBe(0);

      // Reset calibration
      resetTiltCenter();
      expect(getTiltCenterOffset()).toBe(0);
      expect(getLiveTiltAngle()).toBe(8.5);

      cleanup();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Touch Override & Safety Net
  // --------------------------------------------------------------------------
  describe('Touch Override & Sampling Loop', () => {
    it('toggles touch override state cleanly', () => {
      expect(isTiltTouchOverrideActive()).toBe(false);
      setTiltTouchOverride(true);
      expect(isTiltTouchOverrideActive()).toBe(true);
      setTiltTouchOverride(false);
      expect(isTiltTouchOverrideActive()).toBe(false);
    });

    it('yields to touch override during sampling by returning null', () => {
      setTiltTouchOverride(true);
      const sampled = sampleTiltSteering(1 / 60);
      expect(sampled).toBeNull();
    });

    it('returns calculated steering when touch override is not active', () => {
      setTiltTouchOverride(false);
      const sampled = sampleTiltSteering(1 / 60);
      expect(typeof sampled === 'number').toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Permission & Platform Detection
  // --------------------------------------------------------------------------
  describe('Permissions & Platform Detection', () => {
    it('identifies sensor availability in browser environment', () => {
      expect(isMotionSensorSupported()).toBe(true);
    });

    it('detects standard non-iOS environment where permission is granted by default', async () => {
      if (!isIosMotionPermissionRequired()) {
        expect(getTiltPermissionState()).toBe('granted');
        const state = await requestTiltPermission();
        expect(state).toBe('granted');
      }
    });

    it('handles iOS requestPermission API when present', async () => {
      const mockRequest = vi.fn().mockResolvedValue('granted');
      (window.DeviceOrientationEvent as unknown as { requestPermission: typeof mockRequest }).requestPermission =
        mockRequest;

      expect(isIosMotionPermissionRequired()).toBe(true);
      const state = await requestTiltPermission();
      expect(state).toBe('granted');
      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
