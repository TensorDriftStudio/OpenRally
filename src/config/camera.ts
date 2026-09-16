import { Vector3 } from 'three';

// ─── Chase Camera Offsets ────────────────────────────────────────────
/** Camera position offset behind and above the vehicle (chassis-local) */
export const CHASE_OFFSET = new Vector3(0, 4.58, -14);

/** Camera position offset closer behind the vehicle (chassis-local) */
export const CHASE_CLOSE_OFFSET = new Vector3(0, 2.17, -7);

/** Look-at target offset ahead of the vehicle (chassis-local) */
export const LOOK_AHEAD_OFFSET = new Vector3(0, 1.27, 5);

// ─── FOV ─────────────────────────────────────────────────────────────
/** Minimum field of view (degrees) at standstill */
export const MIN_FOV = 60;

/** Maximum field of view (degrees) at top speed */
export const MAX_FOV = 85;

/** Speed (km/h) at which FOV reaches MAX_FOV */
export const MAX_SPEED_FOR_FOV = 200;

/** Maximum dynamic FOV expansion delta for chase_close mode (degrees) */
export const DYNAMIC_FOV_DELTA_CLOSE = 15;

/** Maximum dynamic FOV expansion delta for standard chase mode (degrees) */
export const DYNAMIC_FOV_DELTA_NORMAL = 18;

/** Speed (km/h) where dynamic FOV reaches full expansion */
export const DYNAMIC_FOV_MAX_SPEED = 180;

/** Speed threshold (km/h) above which high-speed camera micro-rumble begins */
export const SPEED_RUMBLE_MIN_SPEED = 70;

/** Speed (km/h) where high-speed camera micro-rumble reaches maximum intensity */
export const SPEED_RUMBLE_MAX_SPEED = 180;

/** Maximum camera elevation drop (meters) at top speed for ground texture velocity perception */
export const SPEED_HEIGHT_DROP_CLOSE = 0.22;
export const SPEED_HEIGHT_DROP_NORMAL = 0.38;

// ─── Smoothing ───────────────────────────────────────────────────────
/** Exponential decay rate for camera position smoothing (lower = lazier) */
export const POSITION_SMOOTH_RATE = 5;

/** Exponential decay rate for camera look-at smoothing (higher = snappier) */
export const LOOK_SMOOTH_RATE = 10;

/** FOV smoothing factor base (per-second decay). Closer to 0 = snappier. */
export const FOV_SMOOTH_BASE = 0.1;

/** Smoothing rate for the car pitch tracking (prevents camera shake on bumps) */
export const PITCH_SMOOTH_RATE = 5;

/** How much the vehicle's pitch affects the camera's tilt (0.0 to 1.0) */
export const PITCH_INFLUENCE = 0.5;

// ─── Constraints ─────────────────────────────────────────────────────
/** Minimum camera Y offset above the vehicle body position */
export const MIN_CAM_Y_OFFSET = 1.5;
