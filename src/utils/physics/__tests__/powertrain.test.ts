import { describe, it, expect } from 'vitest';
import { updateGearbox, calculateRPM, handleManualGearShift, IDLE_RPM, MAX_RPM } from '../powertrain';

describe('powertrain physics', () => {
  const baseInput = {
    throttle: 0,
    brake: 0,
    reset: false,
    steering: 0,
    handbrake: false,
    gearUp: false,
    gearDown: false,
  };

  describe('updateGearbox', () => {
    it('selects reverse gear (-1) when braking at low or negative speed', () => {
      const gear = updateGearbox(0, 0, { ...baseInput, brake: 1 }, 1);
      expect(gear).toBe(-1);
    });

    it('stays in forward gear when braking at high forward speed', () => {
      const gear = updateGearbox(60, 16.6, { ...baseInput, brake: 1 }, 2);
      expect(gear).toBe(2);
    });

    it('defaults to 1st gear when stationary with no input', () => {
      const gear = updateGearbox(0.5, 0, baseInput, -1);
      expect(gear).toBe(1);
    });

    it('shifts up as speed exceeds gear thresholds', () => {
      let gear = 1;
      // 1st to 2nd (threshold: 40 km/h)
      gear = updateGearbox(45, 12.5, { ...baseInput, throttle: 1 }, gear);
      expect(gear).toBe(2);

      // 2nd to 3rd (threshold: 80 km/h)
      gear = updateGearbox(85, 23.6, { ...baseInput, throttle: 1 }, gear);
      expect(gear).toBe(3);

      // 3rd to 4th (threshold: 130 km/h)
      gear = updateGearbox(135, 37.5, { ...baseInput, throttle: 1 }, gear);
      expect(gear).toBe(4);

      // 4th to 5th (threshold: 180 km/h)
      gear = updateGearbox(185, 51.4, { ...baseInput, throttle: 1 }, gear);
      expect(gear).toBe(5);
    });

    it('shifts down as speed drops below gear downshift thresholds', () => {
      let gear = 5;
      // 5th to 4th (threshold: 170 km/h)
      gear = updateGearbox(160, 44.4, baseInput, gear);
      expect(gear).toBe(4);

      // 4th to 3rd (threshold: 120 km/h)
      gear = updateGearbox(110, 30.5, baseInput, gear);
      expect(gear).toBe(3);
    });

    it('locks gear when airborne regardless of speed changes', () => {
      // Car in 3rd gear jumping at high or low speed should maintain 3rd gear
      expect(updateGearbox(200, 55, { ...baseInput, throttle: 1 }, 3, true)).toBe(3);
      expect(updateGearbox(20, 5, baseInput, 3, true)).toBe(3);
    });

    it('triggers sport kickdown under full throttle when entering the lower speed range of a gear', () => {
      // 3rd gear normally downshifts below 70 km/h; with full throttle, kickdown downshifts below 80 km/h
      const gear = updateGearbox(75, 20.8, { ...baseInput, throttle: 1 }, 3);
      expect(gear).toBe(2);
    });

    it('triggers aggressive downshift kickdown during slides and drifts to sustain wheel torque', () => {
      // Car in 3rd gear sliding sideways: forward velocity is 12 m/s (43 km/h), slipAngle is 0.45 rad (~26 deg)
      // Even with total speed magnitude of 50 km/h, automatic transmission downshifts to 2nd gear to keep drift alive
      const gear = updateGearbox(50, 12.0, { ...baseInput, throttle: 1 }, 3, false, {
        slipAngle: 0.45,
      });
      expect(gear).toBe(2);
    });

    it('suppresses premature upshift into 3rd or 4th gear while sideways in a drift slide', () => {
      // Car in 2nd gear at 85 km/h with high slip angle (0.35 rad) and full throttle
      // Normally 85 km/h upshifts to 3rd gear (>80 km/h), but during a drift, 2nd gear is held for maximum wheel spin
      const gear = updateGearbox(85, 18.0, { ...baseInput, throttle: 1 }, 2, false, {
        slipAngle: 0.35,
      });
      expect(gear).toBe(2);
    });

    it('holds 2nd gear during a power drift at 45-60 km/h instead of downshifting to 1st gear', () => {
      // Car in 2nd gear sliding at 55 km/h with 40-degree slip angle
      const gear = updateGearbox(55, 11.5, { ...baseInput, throttle: 1 }, 2, false, {
        slipAngle: 0.70,
      });
      expect(gear).toBe(2);
    });

    it('upshifts from 1st to 2nd gear above 40 km/h during a drift to prevent rev-limiter bogging', () => {
      // Car in 1st gear accelerating out of a tight hairpin at 44 km/h with slip angle
      const gear = updateGearbox(44, 11.0, { ...baseInput, throttle: 1 }, 1, false, {
        slipAngle: 0.40,
      });
      expect(gear).toBe(2);
    });

    it('downshifts to 1st gear during a slide only when speed drops below 18 km/h', () => {
      // Car spinning out or coming to a halt: at 15 km/h, safely drops to 1st
      const gear = updateGearbox(15, 3.5, { ...baseInput, throttle: 0.5 }, 2, false, {
        slipAngle: 0.50,
      });
      expect(gear).toBe(1);
    });
  });

  describe('handleManualGearShift', () => {
    it('shifts up sequentially from Neutral (0) to 1st gear and up to 5th gear', () => {
      let gear = 0;
      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(1);

      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(2);

      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(3);

      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(4);

      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(5);

      // Clamps at 5th gear
      gear = handleManualGearShift(gear, { ...baseInput, gearUp: true });
      expect(gear).toBe(5);
    });

    it('shifts down sequentially from 5th gear to 1st, Neutral (0), and Reverse (-1)', () => {
      let gear = 5;
      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(4);

      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(3);

      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(2);

      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(1);

      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(0);

      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(-1);

      // Clamps at -1 (Reverse)
      gear = handleManualGearShift(gear, { ...baseInput, gearDown: true });
      expect(gear).toBe(-1);
    });

    it('ignores gear shift requests while vehicle is airborne', () => {
      const currentGear = 3;
      const shiftedUpAirborne = handleManualGearShift(currentGear, { ...baseInput, gearUp: true }, true);
      expect(shiftedUpAirborne).toBe(3);

      const shiftedDownAirborne = handleManualGearShift(currentGear, { ...baseInput, gearDown: true }, true);
      expect(shiftedDownAirborne).toBe(3);
    });

    it('maintains current gear when no gear shift input is triggered', () => {
      expect(handleManualGearShift(3, baseInput)).toBe(3);
    });
  });

  describe('calculateRPM', () => {
    it('returns idle RPM when vehicle is stationary with no throttle', () => {
      const rpm = calculateRPM(0, 1, baseInput);
      expect(rpm).toBeGreaterThanOrEqual(800);
      expect(rpm).toBeLessThan(1200);
    });

    it('blips RPM when throttle is pressed from standstill', () => {
      const rpm = calculateRPM(0, 1, { ...baseInput, throttle: 1 });
      expect(rpm).toBeGreaterThan(2000);
    });

    it('clamps RPM within realistic limits (800 - 8000 RPM)', () => {
      const highRpm = calculateRPM(300, 5, { ...baseInput, throttle: 1 });
      expect(highRpm).toBeLessThanOrEqual(MAX_RPM);

      const lowRpm = calculateRPM(0, 1, baseInput);
      expect(lowRpm).toBeGreaterThanOrEqual(800);
    });

    it('calculates RPM for reverse gear appropriately', () => {
      const reverseRpm = calculateRPM(20, -1, { ...baseInput, brake: 1 });
      expect(reverseRpm).toBeGreaterThan(1500);
      expect(reverseRpm).toBeLessThanOrEqual(MAX_RPM);
    });

    it('hits redline rev limiter at maximum gear speed under full throttle', () => {
      // 1st gear maximum speed is 52 km/h; at 51 km/h under full throttle, RPM should hit rev limiter
      const revLimiterRpm = calculateRPM(51, 1, { ...baseInput, throttle: 1 });
      expect(revLimiterRpm).toBeGreaterThanOrEqual(7400);
      expect(revLimiterRpm).toBeLessThanOrEqual(MAX_RPM);
    });

    describe('rally cornering and loose surface dynamics', () => {
      it('maintains high RPM in powerband during hard cornering under full throttle', () => {
        // Vehicle cornering at 50 km/h in 3rd gear with full throttle and sharp steering
        const corneringRpm = calculateRPM(50, 3, { ...baseInput, throttle: 1, steering: 1 }, {
          slipAngle: 0.4,
          steering: 1,
        });

        // Engine should rev high in the powerband (> 6500 RPM) rather than bogging down to idle
        expect(corneringRpm).toBeGreaterThan(6500);
        expect(corneringRpm).toBeLessThanOrEqual(MAX_RPM);
      });

      it('flares RPM with wheelspin when driving on loose sand under full throttle', () => {
        // Vehicle at 40 km/h in 2nd gear on beach sand (looseSurfaceTractionLoss = 0.45)
        const sandRpm = calculateRPM(40, 2, { ...baseInput, throttle: 1 }, {
          looseSurfaceTractionLoss: 0.45,
        });

        expect(sandRpm).toBeGreaterThan(6500);
        expect(sandRpm).toBeLessThanOrEqual(MAX_RPM);
      });

      it('smoothly pulls down RPM under off-throttle engine braking when slowing down in gear', () => {
        // Driving in 3rd gear at 60 km/h with 0 throttle
        const coastingRpm = calculateRPM(60, 3, baseInput);
        // Off-throttle in 3rd gear at 60 km/h should be around ~4000-4500 RPM, not 1000 RPM idle
        expect(coastingRpm).toBeGreaterThan(3800);
        expect(coastingRpm).toBeLessThan(5000);
      });
    });

    describe('airborne dynamics', () => {
      it('revs up to redline when airborne with throttle pressed', () => {
        // Airborne in 2nd gear at 40 km/h with 100% throttle
        const airborneRpm = calculateRPM(40, 2, { ...baseInput, throttle: 1 }, { isAirborne: true });
        expect(airborneRpm).toBeGreaterThanOrEqual(7500);
        expect(airborneRpm).toBeLessThanOrEqual(MAX_RPM);
      });

      it('drops to idle RPM when airborne with no throttle', () => {
        // Airborne with 0 throttle should decay towards idle
        const airborneIdleRpm = calculateRPM(100, 4, baseInput, { isAirborne: true });
        expect(airborneIdleRpm).toBeGreaterThanOrEqual(800);
        expect(airborneIdleRpm).toBeLessThanOrEqual(1200);
      });

      it('integrates RPM over time smoothly during a jump', () => {
        let currentRpm = IDLE_RPM;
        const dt = 0.016; // ~60fps step

        // Accelerate in air for 15 frames (~0.25s) with full throttle
        for (let i = 0; i < 15; i++) {
          currentRpm = calculateRPM(60, 3, { ...baseInput, throttle: 1 }, {
            currentRpm,
            dt,
            isAirborne: true,
          });
        }

        // RPM should have climbed significantly above grounded gear RPM (60kmh in 3rd gear is ~2000-3000 RPM)
        expect(currentRpm).toBeGreaterThan(4000);

        // Continue holding throttle in air for another 20 frames -> reaches redline
        for (let i = 0; i < 20; i++) {
          currentRpm = calculateRPM(60, 3, { ...baseInput, throttle: 1 }, {
            currentRpm,
            dt,
            isAirborne: true,
          });
        }
        expect(currentRpm).toBeGreaterThanOrEqual(7500);
      });

      it('revs up in reverse when airborne with brake applied', () => {
        const reverseAirRpm = calculateRPM(10, -1, { ...baseInput, brake: 1 }, { isAirborne: true });
        expect(reverseAirRpm).toBeGreaterThanOrEqual(7500);
      });

      it('smoothly pulls down to grounded gear speed upon touchdown', () => {
        let currentRpm = 7900; // was revving at redline in air
        const dt = 0.016;

        // Vehicle touches down at 50 km/h in 3rd gear (normal grounded RPM is ~2500-4000)
        for (let i = 0; i < 30; i++) {
          currentRpm = calculateRPM(50, 3, baseInput, {
            currentRpm,
            dt,
            isAirborne: false,
            groundedRatio: 1.0,
          });
        }

        // RPM should have settled back down to transmission speed (~4000 RPM)
        expect(currentRpm).toBeLessThan(4500);
        expect(currentRpm).toBeGreaterThanOrEqual(800);
      });
    });
  });
});
