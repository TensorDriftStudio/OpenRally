import { Object3D } from 'three';
import type { VehicleConfig, IRapierVehicleController } from '@/types/vehicle';
import type { InputState } from '@/types/game';
import { SHIFT_UP_SPEEDS } from '@/config/vehicle';

export function syncWheelVisuals(
  controller: IRapierVehicleController,
  wheelRefs: React.RefObject<(Object3D | null)[]>,
  config: VehicleConfig,
  forwardSpeed: number,
  dt: number,
  rpm: number = 1000,
  currentGear: number = 1,
  input?: Pick<InputState, 'handbrake' | 'throttle'>,
): void {
  const wheels = wheelRefs.current;
  if (!wheels) return;

  for (let i = 0; i < config.wheels.length; i++) {
    const wheelObj = wheels[i];
    if (!wheelObj) continue;

    const connection = controller.wheelChassisConnectionPointCs(i);
    const suspension = controller.wheelSuspensionLength(i);
    const steer = controller.wheelSteering(i);
    const wheelConfig = config.wheels[i];

    // Defensive NaN and null guards: fall back to configured rest geometry if physics returns invalid numbers
    const safeConnX = Number.isFinite(connection?.x) ? connection.x : wheelConfig.position[0];
    const safeConnY = Number.isFinite(connection?.y) ? connection.y : wheelConfig.position[1];
    const safeConnZ = Number.isFinite(connection?.z) ? connection.z : wheelConfig.position[2];

    const rawSusp = Number.isFinite(suspension) ? suspension : wheelConfig.suspensionRestLength;

    // Hard mechanical bump stop clearance guard:
    // Even under extreme jump landings or physics solver compressions, prevent wheel from traveling
    // higher than the wheel arch / fender clearance line.
    const minLength =
      wheelConfig.minSuspensionLength ??
      Math.max(0.18, wheelConfig.suspensionRestLength - wheelConfig.suspensionTravel);
    const safeSuspension = Math.max(minLength, Math.min(wheelConfig.suspensionRestLength + 0.05, rawSusp));

    // Position: connection point - suspension compression (guaranteed 100% mathematically finite)
    wheelObj.position.set(
      safeConnX,
      safeConnY - safeSuspension,
      safeConnZ,
    );

    // Steering rotation (Y axis) strictly guarded against NaN
    if (Number.isFinite(steer)) {
      wheelObj.rotation.y = steer;
    }

    // Check if wheel has ground contact
    const isContact = controller.wheelIsInContact ? controller.wheelIsInContact(i) : true;
    wheelObj.userData.isGrounded = Boolean(isContact);

    let effectiveSpeed = forwardSpeed;
    const isLockedByHandbrake = Boolean(input?.handbrake && !wheelConfig.steerable);

    if (isLockedByHandbrake) {
      // Handbrake mechanically locks rear wheels: zero spin rotation
      effectiveSpeed = 0;
    } else if (!isContact && wheelConfig.powered) {
      // When airborne and powered, wheel spin speed reflects engine RPM in current gear
      const sign = currentGear === -1 ? -1 : 1;
      const maxGearSpeed = currentGear === -1 ? 40 : (SHIFT_UP_SPEEDS[currentGear] ?? 240);
      const effectiveMaxSpeed = maxGearSpeed === 999 ? 240 : maxGearSpeed;
      const rpmFraction = Math.max(0, (rpm - 1000) / 7000);
      const freeWheelSpeedMps = (sign * (rpmFraction * effectiveMaxSpeed)) / 3.6;
      effectiveSpeed = Math.abs(freeWheelSpeedMps) > Math.abs(forwardSpeed) ? freeWheelSpeedMps : forwardSpeed;
    } else if (input?.handbrake && input?.throttle && input.throttle > 0.1 && wheelConfig.steerable && wheelConfig.powered) {
      // Standing handbrake burnout / launch: front wheels spin under throttle while rear is locked
      const rpmFraction = Math.max(0, (rpm - 1000) / 7000);
      const frontBurnoutSpeed = (rpmFraction * 80) / 3.6;
      if (frontBurnoutSpeed > Math.abs(forwardSpeed)) {
        effectiveSpeed = frontBurnoutSpeed;
      }
    }

    // Spin rotation (X axis) based on speed with division-by-zero & NaN sanity guards
    const safeRadius = typeof wheelConfig.radius === 'number' && wheelConfig.radius > 0 ? wheelConfig.radius : 0.35;
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
    const safeSpeed = Number.isFinite(effectiveSpeed) ? effectiveSpeed : 0;
    const spinSpeed = (safeSpeed / safeRadius) * safeDt;
    if (Number.isFinite(spinSpeed)) {
      wheelObj.children[0]?.rotateX(spinSpeed);
    }
  }
}
