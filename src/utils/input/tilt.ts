/**
 * Mobile Motion Sensor (Tilt) Steering Subsystem for OpenRally.
 *
 * Provides high-frequency sensor capture (DeviceOrientationEvent with DeviceMotionEvent fallback),
 * landscape-aware coordinate transformation, zero-allocation runtime sampling,
 * iOS 13+ permission workflow, calibrated neutral center offsets, progressive sensitivity curves,
 * and touch-override safety mechanics.
 */

export type TiltPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface CalculateTiltSteeringOptions {
  /** Deadzone threshold in degrees below which steering remains 0 (default: 2.5) */
  deadzoneDeg?: number;
  /** Maximum physical tilt angle in degrees corresponding to full +/-1.0 steering lock (default: 28.0) */
  maxAngleDeg?: number;
  /** Sensitivity multiplier scaling the steering output (default: 1.0) */
  sensitivity?: number;
  /** Whether to invert left and right steering direction (default: false) */
  invert?: boolean;
  /** Calibrated neutral center angle offset in degrees (default: 0.0) */
  centerOffsetDeg?: number;
  /** Progressive response curve exponent (default: 1.35) */
  gamma?: number;
}

export const DEFAULT_TILT_DEADZONE_DEG = 2.5;
export const DEFAULT_TILT_MAX_ANGLE_DEG = 28.0;
export const DEFAULT_TILT_SENSITIVITY = 1.0;
export const DEFAULT_TILT_GAMMA = 1.35;

/**
 * Returns the current screen rotation angle in degrees (0, 90, 180, 270).
 * Handles standard ScreenOrientation API with fallback to legacy window.orientation.
 */
export function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') {
    return 90;
  }

  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return window.screen.orientation.angle;
  }

  // Fallback for older WebKit / iOS Safari (where window.orientation was 0, 90, -90, 180)
  if (typeof window.orientation === 'number') {
    return window.orientation === -90 ? 270 : window.orientation;
  }

  // Default to landscape-primary (90 deg) for OpenRally mobile gameplay
  return 90;
}

/**
 * Extracts the raw tilt steering angle in degrees from device orientation Euler angles (beta, gamma)
 * taking into account screen rotation angle (landscape-primary 90deg, landscape-secondary 270deg, portrait 0deg/180deg).
 *
 * OpenRally Convention:
 * Positive angle (> 0) corresponds to tilting Left (+1.0 Left steer).
 * Negative angle (< 0) corresponds to tilting Right (-1.0 Right steer).
 */
export function extractRawTiltAngle(
  beta: number,
  gamma: number,
  screenAngle: number
): number {
  const normalizedScreenAngle = ((screenAngle % 360) + 360) % 360;

  let angle: number;

  // In landscape-primary (90 deg CCW rotation, top of phone on Left):
  // Physical tilt left (left hand down) produces negative beta on mobile devices.
  // Inverting (-beta) produces a positive angle, correctly yielding +1.0 Left steer.
  if (normalizedScreenAngle === 90) {
    angle = -beta;
  } else if (normalizedScreenAngle === 270) {
    // In landscape-secondary (270 deg CW rotation, top of phone on Right):
    // Physical tilt left (left hand down) produces positive beta.
    // Returning beta produces a positive angle, correctly yielding +1.0 Left steer.
    angle = beta;
  } else if (normalizedScreenAngle === 0) {
    // Fallback for portrait (0 deg):
    // Roll around Y axis is gamma. Tilting Left rolls towards negative gamma.
    angle = -gamma;
  } else if (normalizedScreenAngle === 180) {
    // Inverted portrait (180 deg):
    angle = gamma;
  } else {
    angle = -beta;
  }

  // Prevent IEEE-754 negative zero (-0)
  return angle === 0 ? 0 : angle;
}

/**
 * Calculates normalized steering value [-1.0, 1.0] from a raw physical tilt angle in degrees.
 *
 * OpenRally steering convention:
 * +1.0 = Full Left
 * -1.0 = Full Right
 *  0.0 = Deadzone / Center
 *
 * Applies:
 * 1. Center calibration offset subtraction
 * 2. Invert toggle
 * 3. Symmetrical deadzone gating
 * 4. Normalization between deadzone and maxAngle
 * 5. Progressive non-linear gamma curve (fine precision around center, responsive at lock)
 * 6. Sensitivity scaling & clamping to [-1.0, 1.0]
 */
export function calculateTiltSteering(
  rawAngleDeg: number,
  options?: CalculateTiltSteeringOptions
): number {
  if (!Number.isFinite(rawAngleDeg)) {
    return 0;
  }

  const deadzone = Math.max(0, options?.deadzoneDeg ?? DEFAULT_TILT_DEADZONE_DEG);
  const maxAngle = Math.max(deadzone + 1.0, options?.maxAngleDeg ?? DEFAULT_TILT_MAX_ANGLE_DEG);
  const sensitivity = Math.max(0.1, Math.min(3.0, options?.sensitivity ?? DEFAULT_TILT_SENSITIVITY));
  const invert = Boolean(options?.invert);
  const centerOffset = Number.isFinite(options?.centerOffsetDeg) ? (options?.centerOffsetDeg as number) : 0;
  const gamma = Math.max(1.0, options?.gamma ?? DEFAULT_TILT_GAMMA);

  // 1. Apply calibrated center offset
  let angle = rawAngleDeg - centerOffset;

  // 2. Invert if requested
  if (invert) {
    angle = -angle;
  }

  const absAngle = Math.abs(angle);

  // 3. Deadzone thresholding
  if (absAngle <= deadzone) {
    return 0;
  }

  // 4. Normalize between deadzone and max lock angle [0.0, 1.0]
  const normalized = Math.min(1.0, (absAngle - deadzone) / (maxAngle - deadzone));

  // 5. Progressive non-linear curve & sensitivity
  const curved = Math.pow(normalized, gamma) * sensitivity;
  const clamped = Math.max(0.0, Math.min(1.0, curved));

  // 6. Apply sign convention (+1.0 Left, -1.0 Right)
  return angle > 0 ? clamped : -clamped;
}

// ----------------------------------------------------------------------------
// Decoupled Hardware Event Sampler (Zero-GC Producer-Consumer Loop)
// ----------------------------------------------------------------------------

let _rawBeta = 0;
let _rawGamma = 0;
let _lastSensorEventTimestamp = 0;
let _calibratedCenterOffsetDeg = 0;
let _screenAngle = 90;
let _lastOrientationChangeTimestamp = 0;
let _isTouchOverrideActive = false;
let _listenerActive = false;
let _listenerRefCount = 0;
let _permissionState: TiltPermissionState = 'prompt';

// Debounce interval after orientation flips (90 <-> 270) to prevent steering pulse
const ORIENTATION_FLIP_DEBOUNCE_MS = 150;

/**
 * Checks if motion sensors are supported in the current environment.
 */
export function isMotionSensorSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window;
}

/**
 * Detects if the current platform is iOS 13+ requiring explicit user gesture permission.
 */
export function isIosMotionPermissionRequired(): boolean {
  if (typeof window === 'undefined') return false;
  const doe = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  return typeof doe?.requestPermission === 'function';
}

/**
 * Returns the current cached permission state.
 */
export function getTiltPermissionState(): TiltPermissionState {
  if (!isMotionSensorSupported()) return 'unsupported';
  if (!isIosMotionPermissionRequired()) return 'granted';
  return _permissionState;
}

/**
 * Requests motion sensor permission on iOS 13+.
 * Must be triggered from a synchronous user interaction (button click / tap).
 */
export async function requestTiltPermission(): Promise<TiltPermissionState> {
  if (!isMotionSensorSupported()) {
    _permissionState = 'unsupported';
    return 'unsupported';
  }

  if (!isIosMotionPermissionRequired()) {
    _permissionState = 'granted';
    return 'granted';
  }

  try {
    const doe = window.DeviceOrientationEvent as unknown as {
      requestPermission: () => Promise<string>;
    };
    const res = await doe.requestPermission();
    if (res === 'granted') {
      _permissionState = 'granted';
      return 'granted';
    }
    _permissionState = 'denied';
    return 'denied';
  } catch {
    _permissionState = 'denied';
    return 'denied';
  }
}

/**
 * Producer listener: updates raw numbers on incoming DeviceOrientation events.
 * Performs zero object allocations and zero trigonometry.
 */
function handleDeviceOrientation(e: DeviceOrientationEvent): void {
  if (typeof e.beta === 'number' && Number.isFinite(e.beta)) {
    _rawBeta = e.beta;
  }
  if (typeof e.gamma === 'number' && Number.isFinite(e.gamma)) {
    _rawGamma = e.gamma;
  }
  _lastSensorEventTimestamp = performance.now();
}

/**
 * Producer fallback listener: updates from DeviceMotionEvent if orientation is unavailable.
 */
function handleDeviceMotion(e: DeviceMotionEvent): void {
  // If DeviceOrientation is already actively firing, skip motion fallback
  if (performance.now() - _lastSensorEventTimestamp < 500) {
    return;
  }

  const acc = e.accelerationIncludingGravity;
  if (!acc) return;

  const ax = acc.x ?? 0;
  const ay = acc.y ?? 0;
  const az = acc.z ?? 9.8;

  // Approximate pitch (beta) and roll (gamma) from gravity vector
  const radToDeg = 180 / Math.PI;
  _rawBeta = Math.atan2(ay, Math.hypot(ax, az)) * radToDeg;
  _rawGamma = Math.atan2(-ax, az) * radToDeg;
  _lastSensorEventTimestamp = performance.now();
}

function handleOrientationChange(): void {
  _screenAngle = getScreenOrientationAngle();
  _lastOrientationChangeTimestamp = performance.now();
}

/**
 * Starts global motion sensor event listeners.
 * Reference-counted so multiple consumers (overlay, inspector) can safely subscribe.
 * Returns a teardown function.
 */
export function startTiltSensorListener(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  _listenerRefCount++;

  if (!_listenerActive) {
    _listenerActive = true;
    _screenAngle = getScreenOrientationAngle();

    window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });

    if (window.screen?.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }
  }

  return () => {
    _listenerRefCount = Math.max(0, _listenerRefCount - 1);
    if (_listenerRefCount === 0 && _listenerActive) {
      _listenerActive = false;
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      window.removeEventListener('devicemotion', handleDeviceMotion);
      window.removeEventListener('orientationchange', handleOrientationChange);

      if (window.screen?.orientation?.removeEventListener) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
    }
  };
}

/**
 * Force stops tilt listeners and resets internal reference count.
 */
export function stopTiltSensorListener(): void {
  _listenerRefCount = 1;
  const stop = startTiltSensorListener();
  stop();
  stop();
}

/**
 * Calibrates the current physical phone tilt angle as neutral center (0 deg steering).
 * Returns the recorded calibration offset angle in degrees.
 */
export function calibrateTiltCenter(): number {
  _calibratedCenterOffsetDeg = extractRawTiltAngle(_rawBeta, _rawGamma, _screenAngle);
  return _calibratedCenterOffsetDeg;
}

/**
 * Resets the neutral center angle calibration offset back to 0.
 */
export function resetTiltCenter(): void {
  _calibratedCenterOffsetDeg = 0;
}

/**
 * Returns the current calibrated center offset in degrees.
 */
export function getTiltCenterOffset(): number {
  return _calibratedCenterOffsetDeg;
}

/**
 * Enables or disables the touch override safety net.
 * When true, touch input temporarily takes priority over tilt steering.
 */
export function setTiltTouchOverride(active: boolean): void {
  _isTouchOverrideActive = Boolean(active);
}

/**
 * Returns whether touch override is currently active.
 */
export function isTiltTouchOverrideActive(): boolean {
  return _isTouchOverrideActive;
}

/**
 * Returns the live physical tilt angle in degrees (compensated for orientation and calibration offset).
 * Used by UI HUD gauges and spirit level indicators.
 */
export function getLiveTiltAngle(): number {
  const raw = extractRawTiltAngle(_rawBeta, _rawGamma, _screenAngle);
  return raw - _calibratedCenterOffsetDeg;
}

/**
 * Checks whether valid motion sensor data has been received within the last 500ms.
 */
export function isTiltSensorLive(): boolean {
  return performance.now() - _lastSensorEventTimestamp < 500;
}

/**
 * Consumer calculation called once per physics/input frame inside useInputUpdater.
 *
 * Checks:
 * 1. Touch override: if active, yields to touch steering (returns null so touch value persists).
 * 2. Orientation flip debounce: if orientation just changed within 150ms, holds neutral 0.
 * 3. Calculates normalized steering with progressive curve, deadzone, sensitivity, and calibration offset.
 */
export function sampleTiltSteering(
  _dt: number,
  options?: CalculateTiltSteeringOptions
): number | null {
  if (_isTouchOverrideActive) {
    return null;
  }

  // Debounce orientation flips
  if (performance.now() - _lastOrientationChangeTimestamp < ORIENTATION_FLIP_DEBOUNCE_MS) {
    return 0;
  }

  const rawAngle = extractRawTiltAngle(_rawBeta, _rawGamma, _screenAngle);
  const effectiveOptions: CalculateTiltSteeringOptions = {
    ...options,
    centerOffsetDeg: options?.centerOffsetDeg ?? _calibratedCenterOffsetDeg,
  };

  return calculateTiltSteering(rawAngle, effectiveOptions);
}
