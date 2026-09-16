import { describe, it, expect } from 'vitest';
import {
  calculateCornerMasses,
  calculateCriticalDamping,
  calculateDamping,
  calculateNaturalFrequencyHz,
  calculateStiffnessForFrequency,
  calculateDampingRatio,
  tuneSuspensionForMass,
  tuneBrakesForMass,
  tuneAntiRollBars,
  applyHandlingProfile,
} from '../tuningHelpers';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';

describe('tuningHelpers — AI Physical Suspension & Dynamics Math', () => {
  it('accurately calculates front and rear corner masses based on weight bias', () => {
    const masses = calculateCornerMasses(140, { frontBias: 0.54, engineOffsetZ: 0.8 });
    expect(masses.totalMass).toBe(140);
    expect(masses.frontBias).toBe(0.54);
    // Front corner = (140 * 0.54) / 2 = 37.8 kg
    expect(masses.frontCornerMass).toBeCloseTo(37.8, 1);
    // Rear corner = (140 * 0.46) / 2 = 32.2 kg
    expect(masses.rearCornerMass).toBeCloseTo(32.2, 1);
  });

  it('calculates harmonic oscillator critical damping and damping ratios correctly', () => {
    const stiffness = 36;
    const cornerMass = 36;
    // Rapier normalized corner mass: c_crit = 2 * sqrt(36 * (36 / 37.5)) = 2 * sqrt(34.56) ~= 11.76
    const cCrit = calculateCriticalDamping(stiffness, cornerMass);
    expect(cCrit).toBeCloseTo(11.76, 1);

    const damp80 = calculateDamping(stiffness, cornerMass, 0.80);
    expect(damp80).toBeCloseTo(9.41, 1);

    const zeta = calculateDampingRatio(stiffness, damp80, cornerMass);
    expect(zeta).toBeCloseTo(0.80, 2);
  });

  it('calculates natural bounce frequency in Hertz (Hz) and stiffness inversion', () => {
    const cornerMass = 35; // kg
    const targetHz = 2.2; // Hz

    const stiffness = calculateStiffnessForFrequency(targetHz, cornerMass);
    expect(stiffness).toBeGreaterThan(0);

    const calculatedHz = calculateNaturalFrequencyHz(stiffness, cornerMass);
    expect(calculatedHz).toBeCloseTo(targetHz, 1);
  });

  it('scales all 4 wheels proportionally when adapting to new vehicle mass', () => {
    const initialWheels = DEFAULT_VEHICLE_CONFIG.wheels;
    const heavyMass = 220; // Heavier raid vehicle

    const tunedWheels = tuneSuspensionForMass(initialWheels, heavyMass, {
      frontBias: 0.53,
      targetFrequencyFrontHz: 2.0,
      targetFrequencyRearHz: 2.1,
      dampingRatio: 0.85,
    });

    expect(tunedWheels.length).toBe(4);
    // Heavier vehicle requires stiffer springs to maintain 2.0 Hz bounce frequency
    expect(tunedWheels[0].suspensionStiffness).toBeGreaterThan(initialWheels[0].suspensionStiffness);
    expect(tunedWheels[0].suspensionDamping).toBeGreaterThan(initialWheels[0].suspensionDamping);
    expect(tunedWheels[0].maxSuspensionForce).toBeGreaterThan(initialWheels[0].maxSuspensionForce ?? 10000);
  });

  it('tunes brakes and handbrake to match vehicle mass and max speed', () => {
    const brakesLight = tuneBrakesForMass(110, 200);
    const brakesHeavy = tuneBrakesForMass(200, 260);

    expect(brakesHeavy.maxForce).toBeGreaterThan(brakesLight.maxForce);
    expect(brakesHeavy.handbrakeForce).toBeGreaterThan(brakesLight.handbrakeForce);
    expect(brakesHeavy.handbrakeForce).toBeGreaterThanOrEqual(50);
  });

  it('tunes Anti-Roll Bars according to requested handling balance profile', () => {
    const mass = 140;
    const oversteerARB = tuneAntiRollBars(mass, 0.52, 'oversteer_drift');
    const understeerARB = tuneAntiRollBars(mass, 0.52, 'understeer_safe');

    // Oversteer profile has stiffer rear ARB than front ARB
    expect(oversteerARB.rearAntiRollBarStiffness).toBeGreaterThan(oversteerARB.frontAntiRollBarStiffness);

    // Understeer profile has stiffer front ARB than rear ARB
    expect(understeerARB.frontAntiRollBarStiffness).toBeGreaterThan(understeerARB.rearAntiRollBarStiffness);
  });

  it('applies handling profiles seamlessly onto an existing VehicleConfig', () => {
    const driftConfig = applyHandlingProfile(DEFAULT_VEHICLE_CONFIG, 'agile_drift');
    expect(driftConfig.drivetrain.frontBias).toBeLessThan(0.5); // Rear-biased AWD
    expect(driftConfig.handling.assists.driftGripMultiplier).toBeLessThanOrEqual(0.65);

    const gripConfig = applyHandlingProfile(DEFAULT_VEHICLE_CONFIG, 'planted_grip');
    expect(gripConfig.drivetrain.frontBias).toBe(0.5);
    expect(gripConfig.aerodynamics.downforceFactor).toBeGreaterThan(DEFAULT_VEHICLE_CONFIG.aerodynamics.downforceFactor);
  });
});
