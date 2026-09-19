import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion } from 'three';
import type { VehicleConfig } from '@/types/vehicle';
import {
  AIR_DENSITY,
  DEFAULT_DRAG_COEFFICIENT,
  DEFAULT_FRONTAL_AREA,
  AERO_FORCE_SCALE,
} from '@/config/vehicle';

const _bodyQuat = new Quaternion();
const _downVector = new Vector3();
const _waterDragImpulse = new Vector3();
const _aeroDragImpulse = new Vector3();

export function applyAerodynamics(
  body: RapierRigidBody,
  config: VehicleConfig,
  forwardSpeed: number,
  velocity: Vector3,
  posY: number,
  dt: number,
  aeroDragMultiplier: number = 1.0,
) {
  // Apply aerodynamic downforce along the local down axis to keep the car grounded without crushing it
  const bodyRot = body.rotation();
  _bodyQuat.set(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
  _downVector.set(0, -1, 0).applyQuaternion(_bodyQuat);

  const safeSpeed = Number.isFinite(forwardSpeed) ? Math.abs(forwardSpeed) : 0;
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const rawDownforce = safeSpeed * config.aerodynamics.downforceFactor * safeDt;
  // Safety clamp: downforce impulse per frame should not exceed 70% of vehicle gravity weight
  const mass = typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 150);
  const maxDownforce = mass * 9.81 * 0.7 * safeDt;
  const clampedDownforce = Math.min(rawDownforce, maxDownforce);

  if (Number.isFinite(clampedDownforce) && clampedDownforce > 0) {
    _downVector.multiplyScalar(clampedDownforce);
    if (
      Number.isFinite(_downVector.x) &&
      Number.isFinite(_downVector.y) &&
      Number.isFinite(_downVector.z)
    ) {
      body.applyImpulse(_downVector, true);
    }
  }

  // Apply water drag if partially submerged
  const WATER_SURFACE_CHASSIS_Y = -7.15; // Chassis Y when wheels just touch water
  if (Number.isFinite(posY) && posY < WATER_SURFACE_CHASSIS_Y) {
    const depth = Math.max(0, WATER_SURFACE_CHASSIS_Y - posY);
    // Increased drag based on depth (zero GC allocation with preallocated scratch vector)
    const dragFactor = depth * 80 * safeDt;
    _waterDragImpulse.set(-velocity.x * dragFactor, 0, -velocity.z * dragFactor);
    if (
      Number.isFinite(_waterDragImpulse.x) &&
      Number.isFinite(_waterDragImpulse.z)
    ) {
      body.applyImpulse(_waterDragImpulse, true);
    }
  }

  // Apply atmospheric aerodynamic drag opposing planar motion (Fd = 0.5 * rho * Cd * A * v^2)
  const planarSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
  if (planarSpeedSq > 0.25 && safeDt > 0) {
    const planarSpeed = Math.sqrt(planarSpeedSq);
    const cd = config.aerodynamics.dragCoefficient ?? DEFAULT_DRAG_COEFFICIENT;
    const area = config.aerodynamics.frontalArea ?? DEFAULT_FRONTAL_AREA;
    const customMult = config.aerodynamics.dragMultiplier ?? 1.0;
    const totalMultiplier = customMult * aeroDragMultiplier;

    // F_drag = 0.5 * rho * Cd * A * v^2 * AERO_FORCE_SCALE
    const rawDragForce = 0.5 * AIR_DENSITY * cd * area * planarSpeedSq * AERO_FORCE_SCALE * totalMultiplier;
    const dragImpulseMag = rawDragForce * safeDt;

    // Numerical safety guard: aerodynamic drag impulse cannot exceed 85% of vehicle's current planar momentum
    const maxDragImpulse = mass * planarSpeed * 0.85;
    const clampedDrag = Math.min(dragImpulseMag, maxDragImpulse);

    _aeroDragImpulse.set(
      -(velocity.x / planarSpeed) * clampedDrag,
      0,
      -(velocity.z / planarSpeed) * clampedDrag,
    );

    if (
      Number.isFinite(_aeroDragImpulse.x) &&
      Number.isFinite(_aeroDragImpulse.z)
    ) {
      body.applyImpulse(_aeroDragImpulse, true);
    }
  }
}
