import { Vector3 } from 'three';
import type { IRapierVehicleController, SurfaceType } from '@/types/vehicle';
import type { SurfaceDefinition } from '@/types/surface';

const _dragImpulse = new Vector3();

/**
 * Result of vehicle ground contact evaluation.
 */
export interface GroundContactState {
  readonly groundedCount: number;
  readonly groundedRatio: number;
  readonly isAirborne: boolean;
}

/**
 * Evaluates tire contact points against terrain to determine grounded ratio and airborne status.
 */
export function calculateGroundContact(
  controller: IRapierVehicleController,
  wheelCount: number,
): GroundContactState {
  let groundedCount = 0;
  for (let i = 0; i < wheelCount; i++) {
    if (controller.wheelIsInContact ? controller.wheelIsInContact(i) : true) {
      groundedCount++;
    }
  }

  const groundedRatio = wheelCount > 0 ? groundedCount / wheelCount : 0;
  return {
    groundedCount,
    groundedRatio,
    isAirborne: groundedCount === 0,
  };
}

/**
 * Result of vehicle rollover detection step.
 */
export interface RolloverDetectionResult {
  readonly isRolledOver: boolean;
  readonly newTimer: number;
  readonly stateChanged: boolean;
}

/**
 * Evaluates whether vehicle is inverted or resting upside down on its roof/side.
 * Uses hysteresis: triggering after 0.55s below 15% upward projection, recovering above 35%.
 */
export function updateRolloverDetection(
  upVectorY: number,
  speedKmh: number,
  currentTimer: number,
  dt: number,
  wasRolledOver: boolean,
): RolloverDetectionResult {
  const isUpsideDown = upVectorY < 0.15 && speedKmh < 24;

  if (isUpsideDown) {
    const newTimer = currentTimer + dt;
    if (newTimer >= 0.55) {
      return {
        isRolledOver: true,
        newTimer,
        stateChanged: !wasRolledOver,
      };
    }
    return {
      isRolledOver: wasRolledOver,
      newTimer,
      stateChanged: false,
    };
  }

  if (upVectorY >= 0.35) {
    return {
      isRolledOver: false,
      newTimer: 0,
      stateChanged: wasRolledOver,
    };
  }

  return {
    isRolledOver: wasRolledOver,
    newTimer: currentTimer,
    stateChanged: false,
  };
}

/**
 * Calculates physical rolling drag impulse applied by the ground surface.
 * During active throttle drifts, reduces rolling drag so spinning tires do not bleed forward speed.
 */
export function calculateRollingResistanceImpulse(
  surfaceDef: SurfaceDefinition,
  bodyMass: number,
  forwardVector: Vector3,
  forwardSpeed: number,
  groundedRatio: number,
  slipAngle: number,
  throttle: number,
  dt: number,
): Vector3 | null {
  if (groundedRatio <= 0 || Math.abs(forwardSpeed) <= 0.1) {
    return null;
  }

  const isDriftingUnderPower = Math.abs(slipAngle) > 0.18 && throttle > 0.15;
  const driftDragReduction = isDriftingUnderPower ? 0.05 : 1.0;
  const rollingResistance = (surfaceDef.rollingResistance ?? 0.005) * driftDragReduction;
  const dragImpulseMagnitude = rollingResistance * bodyMass * 9.81 * groundedRatio * dt;
  const clampedDrag = Math.min(dragImpulseMagnitude, Math.abs(forwardSpeed) * bodyMass);

  _dragImpulse.copy(forwardVector).multiplyScalar(-Math.sign(forwardSpeed) * clampedDrag);

  if (
    Number.isFinite(_dragImpulse.x) &&
    Number.isFinite(_dragImpulse.y) &&
    Number.isFinite(_dragImpulse.z)
  ) {
    return _dragImpulse;
  }

  return null;
}

/**
 * Sanitizes and formats telemetry values into a reusable telemetry state object.
 */
export function populateTelemetryState<T extends {
  speed: number;
  lateralSpeed: number;
  slipAngle: number;
  rpm: number;
  gear: number;
  heading: number;
  position: [number, number, number];
  tireGrips: number[];
  surface: SurfaceType;
  isAirborne: boolean;
}>(
  target: T,
  speedKmh: number,
  lateralSpeed: number,
  slipAngle: number,
  rpm: number,
  gear: number,
  headingY: number,
  posX: number,
  posY: number,
  posZ: number,
  tireGrips: number[],
  surface: SurfaceType,
  isAirborne: boolean,
): void {
  target.speed = Number.isFinite(speedKmh) ? Math.round(speedKmh) : 0;
  target.lateralSpeed = Number.isFinite(lateralSpeed) ? lateralSpeed : 0;
  target.slipAngle = Number.isFinite(slipAngle) ? slipAngle : 0;
  target.rpm = Number.isFinite(rpm) ? Math.round(rpm) : 1000;
  target.gear = gear;
  target.heading = Number.isFinite(headingY) ? headingY : 0;
  target.position[0] = Number.isFinite(posX) ? posX : 0;
  target.position[1] = Number.isFinite(posY) ? posY : 0;
  target.position[2] = Number.isFinite(posZ) ? posZ : 0;
  target.tireGrips = tireGrips;
  target.surface = surface;
  target.isAirborne = isAirborne;
}
