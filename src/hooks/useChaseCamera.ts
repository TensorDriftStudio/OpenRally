import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { Vector3, Quaternion, MathUtils, Object3D, Euler } from 'three';
import { useGameStore } from '@/store/gameStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { getRemoteVehicleMesh } from '@/components/vehicle/remoteVehicleRegistry';
import { isLookBackActive, getCameraLook } from '@/hooks/useInput';
import { useOptionalTerrainData } from '@/components/terrain/TerrainContext';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import {
  CHASE_OFFSET,
  CHASE_CLOSE_OFFSET,
  LOOK_AHEAD_OFFSET,
  MIN_FOV,
  POSITION_SMOOTH_RATE,
  LOOK_SMOOTH_RATE,
  FOV_SMOOTH_BASE,
  MIN_CAM_Y_OFFSET,
  PITCH_SMOOTH_RATE,
  DYNAMIC_FOV_DELTA_CLOSE,
  DYNAMIC_FOV_DELTA_NORMAL,
  DYNAMIC_FOV_MAX_SPEED,
  SPEED_RUMBLE_MIN_SPEED,
  SPEED_RUMBLE_MAX_SPEED,
  SPEED_HEIGHT_DROP_CLOSE,
  SPEED_HEIGHT_DROP_NORMAL,
} from '@/config/camera';

// ─── Reusable Three.js objects (avoids per-frame GC pressure) ────────
const _bodyPos = new Vector3();
const _worldQuat = new Quaternion();
const _euler = new Euler();
const _yawQuat = new Quaternion();
const _offset = new Vector3();
const _idealPos = new Vector3();
const _lookOffset = new Vector3();
const _idealLook = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();
const _camUp = new Vector3();
const _offsetFlat = new Vector3();
const _offset3D = new Vector3();
const _lookOffsetFlat = new Vector3();
const _lookOffset3D = new Vector3();
const _worldUp = new Vector3(0, 1, 0);

/**
 * Evaluates the 3D stunt camera blend factor (0.0 to 1.0) based on vehicle pitch and roll departure
 * from standard horizontal terrain driving.
 * Smoothly activates 3D orientation tracking during steep climbs, vertical loops, and inversions
 * to eliminate Euler 'YXZ' gimbal lock and prevent camera clipping.
 */
export function calculateStunt3DCameraFactor(forwardY: number, upY: number): number {
  const pitchDeparture = Math.max(0, Math.abs(forwardY) - 0.25) / 0.30;
  const rollDeparture = Math.max(0, (1.0 - upY) - 0.18) / 0.35;
  const raw = Math.max(pitchDeparture, rollDeparture);
  return MathUtils.clamp(raw, 0, 1);
}

/**
 * Pure mathematical calculation of velocity lead compensation for the chase camera.
 * In an exponential filter (x' = k*(target - x)), steady-state lag at velocity V is V / k.
 * By advancing the target forward by 0.5 * (V / k), the dynamic camera pull-back distance
 * in motion is reduced by exactly 50% across all driving speeds while keeping standstill (0 km/h)
 * distance and framing 100% identical.
 */
export function calculateCameraSpeedLagCompensation(
  speedKmh: number,
  posRate: number,
  lookRate: number,
  orbitInfluence: number = 0,
): { posLeadDist: number; lookLeadDist: number; rawPosLag: number; effectivePosLag: number } {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const safePosRate = Number.isFinite(posRate) && posRate > 0 ? posRate : 1.0;
  const safeLookRate = Number.isFinite(lookRate) && lookRate > 0 ? lookRate : 1.0;
  const safeOrbitInfluence = Number.isFinite(orbitInfluence) ? Math.max(0, Math.min(1, orbitInfluence)) : 0;
  const speedMs = safeSpeed / 3.6;

  const rawPosLag = speedMs / safePosRate;
  const rawLookLag = speedMs / safeLookRate;

  const forwardInfluence = 1 - safeOrbitInfluence;
  const posLeadDist = 0.5 * rawPosLag * forwardInfluence;
  const lookLeadDist = 0.5 * rawLookLag * forwardInfluence;
  const effectivePosLag = rawPosLag - posLeadDist;

  return { posLeadDist, lookLeadDist, rawPosLag, effectivePosLag };
}

/**
 * Computes the signed shortest angular difference between two angles in radians.
 * Always returns a value in the range [-PI, PI], ensuring smooth interpolation
 * across the -PI / +PI branch cut without long-way-around spinning.
 */
export function calculateShortestAngularDifference(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Updates an orbit angle smoothly using exponential decay along the shortest angular path.
 * Wraps the resulting angle cleanly into [-PI, PI].
 */
export function updateOrbitAngle(
  currentYaw: number,
  targetYaw: number,
  lerpSpeed: number,
  delta: number,
): number {
  const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 60;
  const factor = 1 - Math.exp(-lerpSpeed * safeDelta);
  const diff = calculateShortestAngularDifference(currentYaw, targetYaw);
  let nextYaw = currentYaw + diff * factor;

  // Wrap to [-PI, PI]
  nextYaw = ((nextYaw + Math.PI) % (Math.PI * 2));
  if (nextYaw < 0) nextYaw += Math.PI * 2;
  nextYaw -= Math.PI;

  return nextYaw;
}

/**
 * Converts analog stick X/Y deflection into an absolute 360° orbit azimuth angle (yaw)
 * around the vehicle.
 *
 * Stick Coordinates:
 * - Up (0, -1)    -> 0 rad (view from behind vehicle, standard chase)
 * - Right (+1, 0) -> +PI/2 rad (+90°, view vehicle from right side)
 * - Down (0, +1)  -> PI rad (view vehicle from front, looking rearward)
 * - Left (-1, 0)  -> -PI/2 rad (-90°, view vehicle from left side)
 *
 * A continuous 360° circular rotation of the analog stick maps directly
 * to a seamless 360° rotation of the camera around the vehicle.
 */
export function calculateStickOrbitYaw(
  stickX: number,
  stickY: number,
  deadzone: number = 0.15,
): { isDeflected: boolean; targetYaw: number; magnitude: number } {
  const safeX = Number.isFinite(stickX) ? stickX : 0;
  const safeY = Number.isFinite(stickY) ? stickY : 0;
  const magnitude = Math.hypot(safeX, safeY);

  if (magnitude < deadzone) {
    return { isDeflected: false, targetYaw: 0, magnitude };
  }

  // atan2(x, -y):
  // stick up (x=0, y=-1) -> atan2(0, 1) = 0 rad
  // stick right (x=1, y=0) -> atan2(1, 0) = +PI/2 rad
  // stick down (x=0, y=1) -> atan2(0, -1) = PI rad
  // stick left (x=-1, y=0) -> atan2(-1, 0) = -PI/2 rad
  const targetYaw = Math.atan2(safeX, -safeY);
  return { isDeflected: true, targetYaw, magnitude };
}

/**
 * Calculates the exact 3D camera offset for a given orbit yaw angle.
 * Guarantees that the Euclidean distance between camera and vehicle center
 * is strictly constant across all 360° angles: sqrt(distance^2 + height^2).
 */
export function calculateOrbitOffset(
  yaw: number,
  distance: number,
  height: number,
): { x: number; y: number; z: number; radius: number } {
  const safeDistance = Number.isFinite(distance) ? Math.abs(distance) : 14;
  const safeHeight = Number.isFinite(height) ? height : 5.5;
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;

  // Horizontal offset: -D in local coords rotated by yaw
  const x = -safeDistance * Math.sin(safeYaw);
  const z = -safeDistance * Math.cos(safeYaw);
  const y = safeHeight;
  const radius = Math.hypot(safeDistance, safeHeight);

  return { x, y, z, radius };
}

/**
 * Computes dynamic follow rate for position smoothing.
 * At standstill (0 km/h), returns baseRate (5.0) for 100% identical resting camera behavior.
 * When driving, dynamically tightens follow rate up to (baseRate + maxBoost) at max speed,
 * reducing dynamic follow lag (V / k) by more than 50% without pulling the camera closer than base distance.
 */
export function calculateDynamicFollowRate(
  speedKmh: number,
  baseRate: number = POSITION_SMOOTH_RATE,
  maxBoost: number = 16.0,
  maxSpeedKmh: number = 180,
): { dynamicRate: number; speedFactor: number; lagHalvingRatio: number } {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const safeBase = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 5.0;
  const safeMax = Number.isFinite(maxSpeedKmh) && maxSpeedKmh > 0 ? maxSpeedKmh : 180;
  const safeBoost = Number.isFinite(maxBoost) && maxBoost >= 0 ? maxBoost : 16.0;

  const speedFactor = Math.min(safeSpeed / safeMax, 1.0);
  const dynamicRate = safeBase + speedFactor * safeBoost;
  const lagHalvingRatio = safeBase / dynamicRate;

  return { dynamicRate, speedFactor, lagHalvingRatio };
}

/**
 * Calculates dynamic distance scaling based on driving speed.
 * Invariant distance contract: base distance is 100% preserved (scale = 1.0)
 * at all speeds so the camera never encroaches closer than the nominal resting framing.
 */
export function calculateSpeedDistanceScale(
  speedKmh: number,
  maxSpeedKmh: number = 100,
): { distanceScale: number; heightScale: number; normalizedSpeed: number } {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const safeMax = Number.isFinite(maxSpeedKmh) && maxSpeedKmh > 0 ? maxSpeedKmh : 100;

  const rawRatio = MathUtils.clamp(safeSpeed / safeMax, 0, 1);
  const normalizedSpeed = rawRatio * rawRatio * (3 - 2 * rawRatio);

  return { distanceScale: 1.0, heightScale: 1.0, normalizedSpeed };
}

/**
 * Computes progressive dynamic FOV scaling with vehicle speed.
 * Generates an ease-in curve that expands peripheral vision smoothly,
 * producing realistic optical speed stretching without distorting vehicle proportions.
 */
export function calculateDynamicFov(
  speedKmh: number,
  cameraMode: string = 'chase',
  minFov: number = MIN_FOV,
): { targetFov: number; fovDelta: number } {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const safeMinFov = Number.isFinite(minFov) && minFov > 0 ? minFov : MIN_FOV;

  const maxFovDelta = cameraMode === 'chase_close' ? DYNAMIC_FOV_DELTA_CLOSE : DYNAMIC_FOV_DELTA_NORMAL;
  const speedRatio = Math.min(safeSpeed / DYNAMIC_FOV_MAX_SPEED, 1.0);

  // Progressive ease curve: starts gently at low speed, expanding noticeably above 50 km/h
  const curvedFactor = Math.pow(speedRatio, 1.25);
  const fovDelta = curvedFactor * maxFovDelta;
  const targetFov = safeMinFov + fovDelta;

  return { targetFov, fovDelta };
}

/**
 * Computes dynamic camera elevation drop at speed to bring viewpoint closer to the ground,
 * increasing the optical scrolling rate of road surface textures for heightened speed perception.
 *
 * Automatically fades out on downhill descents (pitchRad < 0) so high-speed downhills
 * do not compress the camera into the rising roadbed behind the vehicle.
 */
export function calculateSpeedHeightDrop(
  speedKmh: number,
  cameraMode: string = 'chase',
  pitchRad: number = 0,
): number {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  if (safeSpeed < 40) return 0;

  // On downhill descents (negative pitch), smoothly fade out speed height drop
  const safePitch = Number.isFinite(pitchRad) ? pitchRad : 0;
  let downhillMultiplier = 1.0;
  if (safePitch < -0.02) {
    // Fades out between -0.02 rad (~1.1 deg) and -0.08 rad (~4.6 deg)
    downhillMultiplier = Math.max(0, Math.min(1, 1.0 - (-safePitch - 0.02) / 0.06));
    if (downhillMultiplier <= 0) return 0;
  }

  // Smooth quadratic ramp between 40 km/h and 160 km/h
  const speedFactor = Math.min((safeSpeed - 40) / 120, 1.0);
  const maxDrop = cameraMode === 'chase_close' ? SPEED_HEIGHT_DROP_CLOSE : SPEED_HEIGHT_DROP_NORMAL;
  return speedFactor * speedFactor * maxDrop * downhillMultiplier;
}

/**
 * Calculates dynamic slope elevation and look-at target adjustments for the chase camera.
 *
 * When driving downhill (pitchRad < 0, vehicle nose points downward):
 * The terrain surface behind the vehicle at distance D rises by approx `D * sin(-pitch)`.
 * Without compensation, the camera sinks toward the rising roadbed or even clips below ground.
 *
 * This function computes:
 * 1. cameraElevationLift: Vertical lift added to the camera position so it preserves its
 *    exact nominal height above the descending roadbed.
 * 2. lookTargetPitchDrop: Downward shift for the look-ahead target so the camera looks
 *    down the road descent ahead rather than pointing into the sky or car roof.
 *
 * A smooth deadzone filter (< 1.1° pitch) prevents transient suspension vibrations under braking
 * from triggering camera jumps, while engaging authoritatively on actual terrain descents.
 * When orbiting with free-look, slope adjustments smoothly blend to 0.
 */
export function calculateSlopeCameraAdjustments(
  pitchRad: number,
  followDistance: number,
  lookAheadDistance: number = 5.0,
  orbitBlend: number = 0,
): {
  cameraElevationLift: number;
  lookTargetPitchDrop: number;
} {
  const safePitch = Number.isFinite(pitchRad) ? pitchRad : 0;
  const safeDist = Number.isFinite(followDistance) ? Math.abs(followDistance) : 7.0;
  const safeLookDist = Number.isFinite(lookAheadDistance) ? Math.abs(lookAheadDistance) : 5.0;
  const safeOrbitBlend = Number.isFinite(orbitBlend) ? Math.max(0, Math.min(1, orbitBlend)) : 0;

  // During active free look orbit, smoothly blend out slope compensation so 360° inspection remains circular
  const orbitDampener = 1.0 - safeOrbitBlend;
  if (orbitDampener <= 0.001) {
    return { cameraElevationLift: 0, lookTargetPitchDrop: 0 };
  }

  // Downhill slope compensation: pitchRad < 0 (vehicle nose points downhill)
  if (safePitch < -0.02) {
    // Smoothstep ramp between -0.02 rad (~1.1 deg) and -0.08 rad (~4.6 deg)
    // to filter out minor suspension braking pitch while engaging fully on terrain descents
    const t = Math.min(1.0, (-safePitch - 0.02) / 0.06);
    const weight = t * t * (3.0 - 2.0 * t); // smoothstep
    const slopeSin = Math.sin(-safePitch);

    const cameraElevationLift = safeDist * slopeSin * weight * orbitDampener;
    const lookTargetPitchDrop = safeLookDist * slopeSin * weight * orbitDampener;

    return { cameraElevationLift, lookTargetPitchDrop };
  }

  // Uphill slope compensation: pitchRad > 0 (vehicle nose points uphill)
  if (safePitch > 0.02) {
    const t = Math.min(1.0, (safePitch - 0.02) / 0.06);
    const weight = t * t * (3.0 - 2.0 * t);
    const slopeSin = Math.sin(safePitch);

    // Soft tracking on climbs (35% gain) to avoid excessive camera drop while following crests
    const cameraElevationLift = -safeDist * slopeSin * 0.35 * weight * orbitDampener;
    const lookTargetPitchDrop = -safeLookDist * slopeSin * 0.35 * weight * orbitDampener;

    return { cameraElevationLift, lookTargetPitchDrop };
  }

  return { cameraElevationLift: 0, lookTargetPitchDrop: 0 };
}


/**
 * Computes high-speed camera micro-rumble (road & chassis vibration).
 * Conveys mechanical power and terrain contact at high velocity without causing motion sickness.
 */
export function calculateHighSpeedCameraRumble(
  speedKmh: number,
  timeSeconds: number,
  orbitBlend: number = 0,
): { offsetX: number; offsetY: number; offsetPitch: number } {
  const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  const safeOrbitBlend = Number.isFinite(orbitBlend) ? Math.max(0, Math.min(1, orbitBlend)) : 0;

  if (safeSpeed < SPEED_RUMBLE_MIN_SPEED || safeOrbitBlend > 0.3) {
    return { offsetX: 0, offsetY: 0, offsetPitch: 0 };
  }

  // Smooth quadratic intensity ramp above threshold
  const speedRatio = Math.min((safeSpeed - SPEED_RUMBLE_MIN_SPEED) / (SPEED_RUMBLE_MAX_SPEED - SPEED_RUMBLE_MIN_SPEED), 1.0);
  const factor = speedRatio * speedRatio * (1.0 - safeOrbitBlend / 0.3);

  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  // Multi-frequency harmonic micro-rumble (~18-35 Hz)
  const offsetX = (Math.sin(t * 110) * 0.55 + Math.sin(t * 185) * 0.45) * 0.022 * factor;
  const offsetY = (Math.cos(t * 135) * 0.60 + Math.sin(t * 220) * 0.40) * 0.018 * factor;
  const offsetPitch = Math.sin(t * 95) * 0.0025 * factor;

  return { offsetX, offsetY, offsetPitch };
}

/**
 * Chase camera hook — follows the vehicle with smooth interpolation,
 * dynamic speed-based FOV, and Forza Horizon style Right Stick 360° Free Look
 * with elastic spring return when released.
 *
 * @param targetRef - Ref to the vehicle's visual mesh (interpolated by R3F)
 */
export function useChaseCamera(
  targetRef: React.RefObject<Object3D | null>,
): void {
  const { camera } = useThree();
  const terrainCtx = useOptionalTerrainData();
  const idealPosRef = useRef(new Vector3());
  const idealLookRef = useRef(new Vector3());
  const currentFovRef = useRef(MIN_FOV);
  const smoothedPitchRef = useRef(0);
  const orbitYawRef = useRef(0);
  const orbitActiveBlendRef = useRef(0);
  const cameraMode = useGameStore((s) => s.cameraMode);

  useFrame((state, delta) => {
    const isSpectating = useMultiplayerStore.getState().isSpectating;
    const spectateTargetId = useMultiplayerStore.getState().spectateTargetId;
    const spectateTarget = isSpectating && spectateTargetId ? getRemoteVehicleMesh(spectateTargetId) : null;
    const target = spectateTarget ?? targetRef.current;
    if (!target) return;

    const gameState = useGameStore.getState().gameState;
    if (gameState === 'paused') return;

    const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 60;

    const loadingTarget = useGameStore.getState().loadingTarget;
    const isMenuOrbit =
      gameState === 'menu' ||
      gameState === 'title' ||
      (gameState === 'loading' && loadingTarget === 'menu');

    // ─── Live 3D Cinematic Showcase Orbit in Main Menu / Title / Menu Loading ───
    if (isMenuOrbit) {
      target.getWorldPosition(_bodyPos);

      const time = state.clock.elapsedTime;
      const orbitRadius = 5.2;
      const orbitAngle = time * 0.12; // slow majestic rotation

      const camX = _bodyPos.x + Math.sin(orbitAngle) * orbitRadius;
      const camZ = _bodyPos.z + Math.cos(orbitAngle) * orbitRadius;
      const camY = _bodyPos.y + 1.22 + Math.sin(time * 0.25) * 0.12;

      _idealPos.set(camX, camY, camZ);
      _idealLook.set(_bodyPos.x, _bodyPos.y + 0.55, _bodyPos.z);

      // On desktop / landscape displays, frame vehicle into right 60% of viewport
      // so left-aligned menu buttons never obscure the car
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        _offset.subVectors(_idealLook, _idealPos).normalize();
        const rightX = -_offset.z;
        const rightZ = _offset.x;
        _idealLook.x -= rightX * 0.95;
        _idealLook.z -= rightZ * 0.95;
      }

      // If camera was uninitialized, far away from vehicle, or transitioning to menu:
      // Snap camera directly to ideal orbit position instead of slowly dragging across the map
      if (
        idealPosRef.current.lengthSq() === 0 ||
        idealPosRef.current.distanceTo(_idealPos) > 10 ||
        (gameState === 'loading' && loadingTarget === 'menu')
      ) {
        idealPosRef.current.copy(_idealPos);
        idealLookRef.current.copy(_idealLook);
      } else {
        const menuSmoothFactor = 1 - Math.exp(-3.5 * safeDelta);
        idealPosRef.current.lerp(_idealPos, menuSmoothFactor);
        idealLookRef.current.lerp(_idealLook, menuSmoothFactor);
      }

      idealPosRef.current.y = Math.max(idealPosRef.current.y, _bodyPos.y + 0.5);

      if (
        Number.isFinite(idealPosRef.current.x) &&
        Number.isFinite(idealPosRef.current.y) &&
        Number.isFinite(idealPosRef.current.z) &&
        Number.isFinite(idealLookRef.current.x) &&
        Number.isFinite(idealLookRef.current.y) &&
        Number.isFinite(idealLookRef.current.z)
      ) {
        camera.up.set(0, 1, 0);
        camera.position.copy(idealPosRef.current);
        camera.lookAt(idealLookRef.current);
      }

      const menuFov = 52;
      currentFovRef.current = menuFov;
      if ('fov' in camera) {
        const persCamera = camera as PerspectiveCamera;
        if (Math.abs(persCamera.fov - menuFov) > 0.02) {
          persCamera.fov = menuFov;
          persCamera.updateProjectionMatrix();
        }
      }
      return;
    }

    if (!isSpectating && cameraMode !== 'chase' && cameraMode !== 'chase_close') return;

    // Read speed dynamically without causing React re-renders
    const speed = isSpectating ? 55 : useGameStore.getState().speed;
    const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;

    // Get interpolated world position and rotation of the visual mesh
    target.getWorldPosition(_bodyPos);
    target.getWorldQuaternion(_worldQuat);

    // Extract pitch from forward vector and orientation
    _forward.set(0, 0, 1).applyQuaternion(_worldQuat);
    _up.set(0, 1, 0).applyQuaternion(_worldQuat);
    const targetPitch = Math.asin(MathUtils.clamp(_forward.y, -0.99, 0.99));
    
    // Smooth the vehicle pitch
    const pitchSmoothFactor = 1 - Math.exp(-PITCH_SMOOTH_RATE * safeDelta);
    if (idealPosRef.current.lengthSq() === 0) {
      smoothedPitchRef.current = targetPitch;
    } else {
      smoothedPitchRef.current = MathUtils.lerp(smoothedPitchRef.current, targetPitch, pitchSmoothFactor);
    }

    // ─── 360° Free Look Orbit (Right Analog Stick & Look Back) ───
    const cameraLook = getCameraLook();
    const lookBack = isLookBackActive();
    const { isDeflected, targetYaw: stickTargetYaw } = calculateStickOrbitYaw(cameraLook.x, cameraLook.y, 0.15);
    const isOrbitActive = isDeflected || lookBack;

    let targetOrbitYaw = 0;
    if (lookBack) {
      targetOrbitYaw = Math.PI;
    } else if (isDeflected) {
      targetOrbitYaw = stickTargetYaw;
    }

    // Framerate-independent shortest-path exponential smoothing for orbit angle
    // Snappy responsiveness during active stick input, smooth elastic return when released
    const orbitLerpSpeed = isOrbitActive ? (lookBack ? 22.0 : 16.0) : 10.0;
    orbitYawRef.current = updateOrbitAngle(
      orbitYawRef.current,
      targetOrbitYaw,
      orbitLerpSpeed,
      safeDelta,
    );

    // Smoothly blend orbit active state [0.0 = pure chase follow, 1.0 = active 360° orbit inspection]
    const targetBlend = isOrbitActive ? 1.0 : (Math.abs(orbitYawRef.current) < 0.02 ? 0.0 : Math.min(1.0, Math.abs(orbitYawRef.current) / 0.4));
    const blendFactor = 1 - Math.exp((isOrbitActive ? 14.0 : 6.0) * -safeDelta);
    orbitActiveBlendRef.current = MathUtils.lerp(orbitActiveBlendRef.current, targetBlend, blendFactor);
    const orbitBlend = orbitActiveBlendRef.current;

    // 3D Stunt camera blend factor (smoothly tracks 3D chassis orientation during vertical loops and steep wall climbs)
    const stunt3DFactor = calculateStunt3DCameraFactor(_forward.y, _up.y);
    const effectiveStunt3D = stunt3DFactor * (1 - orbitBlend);

    // Extract vehicle yaw
    _euler.setFromQuaternion(_worldQuat, 'YXZ');
    const vehicleYaw = _euler.y;

    // Total azimuth angle around the vehicle
    const totalYaw = vehicleYaw + orbitYawRef.current;

    // Pitch influence: subtle orientation damping for free-look orbit
    const pitchDampener = Math.cos(orbitYawRef.current) * (1 - orbitBlend * 0.5);
    const effectivePitch = MathUtils.clamp(-smoothedPitchRef.current * 0.05, -0.02, 0.02) * pitchDampener;

    _euler.set(effectivePitch, totalYaw, 0, 'YXZ');
    _yawQuat.setFromEuler(_euler);

    // ─── Smooth Follow Rates (Exponential Filter Decay) ───
    const { dynamicRate: drivingPosRate } = calculateDynamicFollowRate(safeSpeed, POSITION_SMOOTH_RATE, 16.0, 180);
    const effectivePosRate = MathUtils.lerp(drivingPosRate, 26.0, orbitBlend);
    const posSmoothFactor = 1 - Math.exp(-effectivePosRate * safeDelta);

    const speedRatio = Math.min(safeSpeed / 180, 1.0);
    const drivingLookRate = LOOK_SMOOTH_RATE + speedRatio * 8.0;
    const effectiveLookRate = MathUtils.lerp(drivingLookRate, 28.0, orbitBlend);
    const lookSmoothFactor = 1 - Math.exp(-effectiveLookRate * safeDelta);

    // ─── Camera 3D Position with Dynamic Slope Elevation Compensation ───
    const activeOffset = cameraMode === 'chase_close' ? CHASE_CLOSE_OFFSET : CHASE_OFFSET;
    const baseD = Math.abs(activeOffset.z);
    const speedHeightDrop = calculateSpeedHeightDrop(safeSpeed, cameraMode, smoothedPitchRef.current);
    const baseH = activeOffset.y - speedHeightDrop * (1 - orbitBlend);

    const slopeAdjustments = calculateSlopeCameraAdjustments(
      smoothedPitchRef.current,
      baseD,
      LOOK_AHEAD_OFFSET.z,
      orbitBlend,
    );

    const effectiveH = baseH + slopeAdjustments.cameraElevationLift;

    // In stunt loops and steep vertical geometry, adapt follow distance to stay strictly inside the curvature
    // In a 9.5m radius loop, a 14m tangent distance punches 7.4m outside the road deck.
    // Tightening stunt follow distance to ~5.5m and elevation to ~2.2m mathematically guarantees
    // the camera stays strictly inside the concave track cylinder with zero clipping.
    const stuntD = MathUtils.lerp(baseD, 5.5, effectiveStunt3D);
    const stuntH = MathUtils.lerp(effectiveH, 2.2, effectiveStunt3D);

    // Base distance is invariant (never shrunk closer than standstill)
    _offsetFlat.set(0, effectiveH, -baseD).applyQuaternion(_yawQuat);
    _offset3D.set(0, stuntH, -stuntD).applyQuaternion(_worldQuat);
    _offset.lerpVectors(_offsetFlat, _offset3D, effectiveStunt3D);
    _idealPos.copy(_bodyPos).add(_offset);

    // ─── Look-At Target with Downhill Road Pitch Compensation ───
    const baseLookY = MathUtils.lerp(
      LOOK_AHEAD_OFFSET.y - slopeAdjustments.lookTargetPitchDrop,
      1.2,
      orbitBlend,
    );
    const baseLookZ = MathUtils.lerp(LOOK_AHEAD_OFFSET.z, 0, orbitBlend);
    const stuntLookZ = MathUtils.lerp(baseLookZ, 3.5, effectiveStunt3D);
    const stuntLookY = MathUtils.lerp(baseLookY, 1.0, effectiveStunt3D);

    _lookOffsetFlat.set(0, baseLookY, baseLookZ).applyQuaternion(_yawQuat);
    _lookOffset3D.set(0, stuntLookY, stuntLookZ).applyQuaternion(_worldQuat);
    _lookOffset.lerpVectors(_lookOffsetFlat, _lookOffset3D, effectiveStunt3D);
    _idealLook.copy(_bodyPos).add(_lookOffset);

    // ─── Dynamic Velocity Lead Compensation (Halves In-Motion Lag Pull-Back by 50%) ───
    // In an exponential filter (x' = k*(target - x)), steady-state lag at velocity V is V / k.
    // By advancing the target forward by 0.5 * (V / k), the dynamic camera pull-back distance
    // in motion is reduced by exactly 50% across all driving speeds while keeping standstill (0 km/h)
    // distance and framing 100% identical.
    const { posLeadDist, lookLeadDist } = calculateCameraSpeedLagCompensation(
      safeSpeed,
      effectivePosRate,
      effectiveLookRate,
      orbitBlend,
    );
    if (posLeadDist > 0) {
      _idealPos.addScaledVector(_forward, posLeadDist);
    }
    if (lookLeadDist > 0) {
      _idealLook.addScaledVector(_forward, lookLeadDist);
    }

    // ─── Dual-Layer Terrain Floor Clearance (Ideal Position Target) ───
    if (terrainCtx) {
      const { heightmapData, levelData } = terrainCtx;
      const camTerrainY = getInterpolatedHeight(
        _idealPos.x,
        _idealPos.z,
        heightmapData.heights,
        heightmapData.rows,
        heightmapData.cols,
        levelData.terrainBase.width,
        levelData.terrainBase.depth,
      );
      const baseTerrainClearance = cameraMode === 'chase_close' ? 1.7 : 2.8;
      const minTerrainClearance = MathUtils.lerp(baseTerrainClearance, 0.8, effectiveStunt3D);
      _idealPos.y = Math.max(_idealPos.y, camTerrainY + minTerrainClearance);

      const lookTerrainY = getInterpolatedHeight(
        _idealLook.x,
        _idealLook.z,
        heightmapData.heights,
        heightmapData.rows,
        heightmapData.cols,
        levelData.terrainBase.width,
        levelData.terrainBase.depth,
      );
      _idealLook.y = Math.max(_idealLook.y, lookTerrainY + 0.8);
    }

    if (idealPosRef.current.lengthSq() === 0 || idealPosRef.current.distanceTo(_idealPos) > 20) {
      idealPosRef.current.copy(_idealPos);
      idealLookRef.current.copy(_idealLook);
    } else {
      idealPosRef.current.lerp(_idealPos, posSmoothFactor);
      idealLookRef.current.lerp(_idealLook, lookSmoothFactor);
    }

    // Secondary floor check on actual smoothed position to prevent clipping during fast motion
    if (terrainCtx) {
      const { heightmapData, levelData } = terrainCtx;
      const smoothedTerrainY = getInterpolatedHeight(
        idealPosRef.current.x,
        idealPosRef.current.z,
        heightmapData.heights,
        heightmapData.rows,
        heightmapData.cols,
        levelData.terrainBase.width,
        levelData.terrainBase.depth,
      );
      const baseTerrainClearance = cameraMode === 'chase_close' ? 1.7 : 2.8;
      const minTerrainClearance = MathUtils.lerp(baseTerrainClearance, 0.8, effectiveStunt3D);
      idealPosRef.current.y = Math.max(idealPosRef.current.y, smoothedTerrainY + minTerrainClearance);
    }

    // Prevent camera from going below vehicle baseline (minimum Y, dynamically relaxed during 3D stunts & loops)
    const effectiveMinCamY = MathUtils.lerp(MIN_CAM_Y_OFFSET, -10.0, effectiveStunt3D);
    idealPosRef.current.y = Math.max(idealPosRef.current.y, _bodyPos.y + effectiveMinCamY);

    // Apply to camera with strict finite number check
    if (
      Number.isFinite(idealPosRef.current.x) &&
      Number.isFinite(idealPosRef.current.y) &&
      Number.isFinite(idealPosRef.current.z) &&
      Number.isFinite(idealLookRef.current.x) &&
      Number.isFinite(idealLookRef.current.y) &&
      Number.isFinite(idealLookRef.current.z)
    ) {
      _camUp.lerpVectors(_worldUp, _up, effectiveStunt3D).normalize();
      camera.up.copy(_camUp);
      camera.position.copy(idealPosRef.current);

      // High-speed chassis micro-rumble (road & aerodynamic vibration)
      // Applied directly to transient camera.position so idealPosRef smoothing is never mutated or polluted.
      // Smoothly faded to 0 during 3D stunts (effectiveStunt3D > 0) to prevent Euler gimbal-lock jitter at 90° pitch.
      if (effectiveStunt3D < 0.2) {
        const rumbleScale = 1.0 - effectiveStunt3D / 0.2;
        const rumble = calculateHighSpeedCameraRumble(safeSpeed, state.clock.elapsedTime, orbitBlend);
        if (rumble.offsetX !== 0 || rumble.offsetY !== 0) {
          _offset.set(rumble.offsetX * rumbleScale, rumble.offsetY * rumbleScale, 0).applyQuaternion(_yawQuat);
          camera.position.add(_offset);
        }
      }

      camera.lookAt(idealLookRef.current);
    }

    // Dynamic FOV based on speed — progressive expansion for authentic velocity sensation
    const { targetFov } = calculateDynamicFov(safeSpeed, cameraMode, MIN_FOV);
    currentFovRef.current = MathUtils.lerp(
      currentFovRef.current,
      targetFov,
      1 - Math.pow(FOV_SMOOTH_BASE, safeDelta * 60),
    );

    // Apply FOV if perspective camera and gate updateProjectionMatrix to avoid dirtying frustum planes every frame
    if ('fov' in camera && Number.isFinite(currentFovRef.current)) {
      const persCamera = camera as PerspectiveCamera;
      if (Math.abs(persCamera.fov - currentFovRef.current) > 0.02) {
        persCamera.fov = currentFovRef.current;
        persCamera.updateProjectionMatrix();
      }
    }
  });
}
