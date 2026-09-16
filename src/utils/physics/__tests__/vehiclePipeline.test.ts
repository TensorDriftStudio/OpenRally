import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  calculateGroundContact,
  updateRolloverDetection,
  calculateRollingResistanceImpulse,
  populateTelemetryState,
} from '../vehiclePipeline';
import type { IRapierVehicleController } from '@/types/vehicle';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';

describe('vehiclePipeline — Modular Physics Execution Subroutines', () => {
  it('calculates ground contact and airborne status correctly', () => {
    const mockController: IRapierVehicleController = {
      setWheelEngineForce: () => {},
      setWheelBrake: () => {},
      setWheelFrictionSlip: () => {},
      setWheelSteering: () => {},
      wheelSuspensionLength: () => 0.25,
      wheelChassisConnectionPointCs: () => ({ x: 0, y: 0, z: 0 }),
      wheelSteering: () => 0,
      wheelIsInContact: (idx) => idx < 2, // 2 front wheels in contact, 2 rear in air
    };

    const contact = calculateGroundContact(mockController, 4);
    expect(contact.groundedCount).toBe(2);
    expect(contact.groundedRatio).toBe(0.5);
    expect(contact.isAirborne).toBe(false);

    // All in air
    const airborneController: IRapierVehicleController = {
      ...mockController,
      wheelIsInContact: () => false,
    };
    const airborneContact = calculateGroundContact(airborneController, 4);
    expect(airborneContact.groundedCount).toBe(0);
    expect(airborneContact.groundedRatio).toBe(0);
    expect(airborneContact.isAirborne).toBe(true);
  });

  it('detects inverted rollover with hysteresis and prevents false triggers on slopes', () => {
    // Upward projection y < 0.15 indicates car on roof/side
    let res = updateRolloverDetection(0.05, 10, 0, 0.2, false);
    expect(res.isRolledOver).toBe(false); // < 0.55s threshold, not yet triggered
    expect(res.newTimer).toBeCloseTo(0.2, 2);

    // After 0.55s continuous upside-down pose
    res = updateRolloverDetection(0.05, 10, 0.5, 0.1, false);
    expect(res.isRolledOver).toBe(true);
    expect(res.stateChanged).toBe(true);

    // Car recovers upright (y >= 0.35)
    res = updateRolloverDetection(0.85, 10, 0.6, 0.016, true);
    expect(res.isRolledOver).toBe(false);
    expect(res.newTimer).toBe(0);
    expect(res.stateChanged).toBe(true);
  });

  it('calculates physical rolling resistance and reduces it during active throttle power slides', () => {
    const sandDef = getSurfaceDefinition('sand');
    const forwardVec = new Vector3(0, 0, 1);

    // Straight line off-road driving
    const normalDrag = calculateRollingResistanceImpulse(
      sandDef,
      150,
      forwardVec,
      15,
      1.0,
      0, // slipAngle = 0
      0.5,
      0.016,
    );
    expect(normalDrag).not.toBeNull();
    expect(normalDrag?.z).toBeLessThan(0); // Opposes forward motion
    const normalMagnitude = Math.abs(normalDrag!.z);

    // Active power slide (slipAngle > 0.18, throttle > 0.15)
    const driftDrag = calculateRollingResistanceImpulse(
      sandDef,
      150,
      forwardVec,
      15,
      1.0,
      0.35, // Drifting
      0.8,
      0.016,
    );
    expect(driftDrag).not.toBeNull();
    // Rolling drag magnitude during drift must be reduced so momentum is preserved
    expect(Math.abs(driftDrag!.z)).toBeLessThan(normalMagnitude);
  });

  it('populates telemetry data safely guarding against NaN', () => {
    const telemetry = {
      speed: 0,
      lateralSpeed: 0,
      slipAngle: 0,
      rpm: 0,
      gear: 1,
      heading: 0,
      position: [0, 0, 0] as [number, number, number],
      tireGrips: [1, 1, 1, 1],
      surface: 'tarmac' as const,
      isAirborne: false,
    };

    populateTelemetryState(
      telemetry,
      NaN, // Corrupted speed
      2.5,
      0.15,
      3500,
      2,
      0.4,
      10,
      2,
      30,
      [0.9, 0.9, 0.8, 0.8],
      'gravel',
      false,
    );

    expect(telemetry.speed).toBe(0); // NaN sanitized to 0
    expect(telemetry.lateralSpeed).toBe(2.5);
    expect(telemetry.gear).toBe(2);
    expect(telemetry.surface).toBe('gravel');
  });
});
