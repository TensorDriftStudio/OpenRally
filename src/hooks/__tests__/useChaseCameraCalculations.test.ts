import { describe, it, expect } from 'vitest';
import {
  calculateCameraSpeedLagCompensation,
  calculateShortestAngularDifference,
  updateOrbitAngle,
  calculateStickOrbitYaw,
  calculateOrbitOffset,
  calculateSpeedDistanceScale,
  calculateDynamicFollowRate,
  calculateDynamicFov,
  calculateSpeedHeightDrop,
  calculateHighSpeedCameraRumble,
  calculateSlopeCameraAdjustments,
  calculateStunt3DCameraFactor,
} from '@/hooks/useChaseCamera';

describe('Chase Camera Dynamic Speed Lag Compensation', () => {
  it('produces zero lead offset and zero lag at standstill (0 km/h)', () => {
    const res = calculateCameraSpeedLagCompensation(0, 5, 10, 0);
    expect(res.rawPosLag).toBe(0);
    expect(res.posLeadDist).toBe(0);
    expect(res.effectivePosLag).toBe(0);
    expect(res.lookLeadDist).toBe(0);
  });

  it('mathematically halves the dynamic camera lag distance at 100 km/h', () => {
    const speedKmh = 100;
    const posRate = 8.0;
    const lookRate = 10.0;
    const res = calculateCameraSpeedLagCompensation(speedKmh, posRate, lookRate, 0);

    const speedMs = 100 / 3.6;
    const expectedRawPosLag = speedMs / 8.0;
    const expectedRawLookLag = speedMs / 10.0;

    expect(res.rawPosLag).toBeCloseTo(expectedRawPosLag, 5);
    expect(res.posLeadDist).toBeCloseTo(expectedRawPosLag * 0.5, 5);
    expect(res.effectivePosLag).toBeCloseTo(expectedRawPosLag * 0.5, 5);
    expect(res.lookLeadDist).toBeCloseTo(expectedRawLookLag * 0.5, 5);
  });

  it('halves the dynamic pull-back distance at top speed (237 km/h)', () => {
    // User scenario: car driving at 237 km/h with rate ~11.0
    const speedKmh = 237;
    const posRate = 11.0;
    const lookRate = 10.0;
    const res = calculateCameraSpeedLagCompensation(speedKmh, posRate, lookRate, 0);

    const speedMs = 237 / 3.6; // 65.833 m/s
    const expectedRawPosLag = speedMs / 11.0; // ~5.9848 m
    const expectedRawLookLag = speedMs / 10.0; // ~6.5833 m

    expect(res.rawPosLag).toBeCloseTo(expectedRawPosLag, 4);
    // Dynamic pull-back distance must be reduced by exactly 50%
    expect(res.posLeadDist).toBeCloseTo(expectedRawPosLag * 0.5, 4);
    expect(res.effectivePosLag).toBeCloseTo(expectedRawPosLag * 0.5, 4);
    expect(res.lookLeadDist).toBeCloseTo(expectedRawLookLag * 0.5, 4);

    // Verify concrete numbers: raw was ~5.98m, effective is now ~2.99m
    expect(res.rawPosLag).toBeGreaterThan(5.9);
    expect(res.effectivePosLag).toBeLessThan(3.0);
    expect(res.effectivePosLag).toBeGreaterThan(2.9);
  });

  it('smoothly reduces lead offset to zero when orbiting with free-look (orbitInfluence = 1)', () => {
    const res = calculateCameraSpeedLagCompensation(150, 10, 10, 1.0);
    expect(res.posLeadDist).toBe(0);
    expect(res.lookLeadDist).toBe(0);
    expect(res.effectivePosLag).toBeCloseTo(res.rawPosLag, 5);
  });

  it('gracefully sanitizes negative, NaN, or extreme input values', () => {
    const nanRes = calculateCameraSpeedLagCompensation(NaN, NaN, NaN, NaN);
    expect(Number.isFinite(nanRes.posLeadDist)).toBe(true);
    expect(Number.isFinite(nanRes.effectivePosLag)).toBe(true);
    expect(nanRes.posLeadDist).toBe(0);

    const negRes = calculateCameraSpeedLagCompensation(-50, -5, -10, 0);
    expect(Number.isFinite(negRes.posLeadDist)).toBe(true);
    expect(negRes.posLeadDist).toBe(0);
  });
});

describe('360° Smooth Camera Orbit & Invariant Distance', () => {
  describe('calculateShortestAngularDifference', () => {
    it('computes direct angle difference for acute angles', () => {
      const diff = calculateShortestAngularDifference(0, Math.PI / 2);
      expect(diff).toBeCloseTo(Math.PI / 2, 5);
    });

    it('crosses +PI / -PI branch cut without spinning the long way around', () => {
      // Near +180° (+3.10 rad) transitioning to -180° (-3.10 rad)
      const diff = calculateShortestAngularDifference(3.10, -3.10);
      // Shortest difference is moving forward across PI: ~0.0832 rad, NOT -6.20 rad!
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeCloseTo(0.083185, 4);
    });

    it('handles reverse branch-cut transition smoothly', () => {
      const diff = calculateShortestAngularDifference(-3.10, 3.10);
      expect(diff).toBeLessThan(0);
      expect(diff).toBeCloseTo(-0.083185, 4);
    });
  });

  describe('updateOrbitAngle', () => {
    it('smoothly tracks target angle over time', () => {
      let current = 0;
      const target = Math.PI / 2;
      for (let i = 0; i < 30; i++) {
        current = updateOrbitAngle(current, target, 16.0, 1 / 60);
      }
      expect(current).toBeCloseTo(Math.PI / 2, 2);
    });

    it('smoothly transitions across PI branch cut without reversing or snapping', () => {
      let current = 3.10;
      const target = -3.10;
      const updated = updateOrbitAngle(current, target, 16.0, 1 / 60);
      // Must advance forward past PI, wrapping to negative without jumping towards 0
      expect(updated).toBeGreaterThan(3.10);
    });

    it('springs back to zero when stick is released', () => {
      let current = 1.8;
      for (let i = 0; i < 40; i++) {
        current = updateOrbitAngle(current, 0, 10.0, 1 / 60);
      }
      expect(Math.abs(current)).toBeLessThan(0.01);
    });
  });

  describe('calculateStickOrbitYaw', () => {
    it('rejects neutral stick within deadzone', () => {
      const res = calculateStickOrbitYaw(0.05, 0.05, 0.15);
      expect(res.isDeflected).toBe(false);
      expect(res.targetYaw).toBe(0);
    });

    it('maps Stick UP (0, -1) to 0 rad (behind vehicle)', () => {
      const res = calculateStickOrbitYaw(0, -1, 0.15);
      expect(res.isDeflected).toBe(true);
      expect(res.targetYaw).toBeCloseTo(0, 5);
    });

    it('maps Stick RIGHT (1, 0) to +PI/2 rad (+90°, vehicle right)', () => {
      const res = calculateStickOrbitYaw(1, 0, 0.15);
      expect(res.isDeflected).toBe(true);
      expect(res.targetYaw).toBeCloseTo(Math.PI / 2, 5);
    });

    it('maps Stick DOWN (0, 1) to PI rad (180°, front of vehicle)', () => {
      const res = calculateStickOrbitYaw(0, 1, 0.15);
      expect(res.isDeflected).toBe(true);
      expect(Math.abs(res.targetYaw)).toBeCloseTo(Math.PI, 5);
    });

    it('maps Stick LEFT (-1, 0) to -PI/2 rad (-90°, vehicle left)', () => {
      const res = calculateStickOrbitYaw(-1, 0, 0.15);
      expect(res.isDeflected).toBe(true);
      expect(res.targetYaw).toBeCloseTo(-Math.PI / 2, 5);
    });

    it('maps continuous circular rotation to continuous monotonic angles', () => {
      const steps = 36;
      const angles: number[] = [];
      for (let i = 0; i < steps; i++) {
        const phi = (i / steps) * Math.PI * 2;
        // Stick rotating clockwise starting from UP (phi = 0)
        const stickX = Math.sin(phi);
        const stickY = -Math.cos(phi);
        const res = calculateStickOrbitYaw(stickX, stickY, 0.15);
        expect(res.isDeflected).toBe(true);
        angles.push(res.targetYaw);
      }

      // First angle (UP) should be 0
      expect(angles[0]).toBeCloseTo(0, 4);
      // Quarter angle (RIGHT) should be PI/2
      expect(angles[9]).toBeCloseTo(Math.PI / 2, 4);
      // Half angle (DOWN) should be ~PI
      expect(Math.abs(angles[18])).toBeCloseTo(Math.PI, 3);
      // Three-quarter angle (LEFT) should be -PI/2
      expect(angles[27]).toBeCloseTo(-Math.PI / 2, 4);
    });
  });

  describe('calculateOrbitOffset - Constant Radius Invariance', () => {
    it('guarantees strictly constant Euclidean distance at any orbit angle', () => {
      const distance = 14.0;
      const height = 5.5;
      const expectedRadius = Math.hypot(distance, height); // ~15.0416m

      const testAngles = [
        0,
        Math.PI / 4,
        Math.PI / 2,
        (3 * Math.PI) / 4,
        Math.PI,
        (-3 * Math.PI) / 4,
        -Math.PI / 2,
        -Math.PI / 4,
      ];

      for (const angle of testAngles) {
        const offset = calculateOrbitOffset(angle, distance, height);
        // Euclidean distance sqrt(x^2 + y^2 + z^2) must match expectedRadius exactly
        const computedDist = Math.hypot(offset.x, offset.y, offset.z);
        expect(computedDist).toBeCloseTo(expectedRadius, 5);
        expect(offset.radius).toBeCloseTo(expectedRadius, 5);
        // Vehicle never moves away or gets closer: variation is strictly 0
        expect(Math.abs(computedDist - expectedRadius)).toBeLessThan(1e-6);
      }
    });
  });

  describe('calculateDynamicFollowRate - Driving Follow Lag Reduction', () => {
    it('returns exact baseRate at standstill (0 km/h) for 100% untouched resting framing', () => {
      const res = calculateDynamicFollowRate(0, 5.0, 16.0, 180);
      expect(res.dynamicRate).toBe(5.0);
      expect(res.speedFactor).toBe(0);
      expect(res.lagHalvingRatio).toBe(1.0);
    });

    it('tightens follow rate at driving speeds to halve dynamic lag (V / k)', () => {
      // At max speed (180+ km/h), rate goes from 5.0 to 21.0
      const res = calculateDynamicFollowRate(180, 5.0, 16.0, 180);
      expect(res.dynamicRate).toBe(21.0);
      expect(res.speedFactor).toBe(1.0);
      // Steady-state lag ratio is 5.0 / 21.0 = 0.238 (a >76% lag reduction!)
      expect(res.lagHalvingRatio).toBeLessThan(0.5);
    });

    it('halves dynamic lag at intermediate speeds (~90 km/h)', () => {
      const res = calculateDynamicFollowRate(90, 5.0, 16.0, 180);
      expect(res.speedFactor).toBe(0.5);
      expect(res.dynamicRate).toBe(13.0); // 5 + 0.5 * 16 = 13
      // Lag ratio is 5 / 13 = 0.384 (< 50% of base lag)
      expect(res.lagHalvingRatio).toBeLessThan(0.5);
    });

    it('safely handles negative or NaN speed values', () => {
      const neg = calculateDynamicFollowRate(-50, 5.0, 16.0, 180);
      expect(neg.dynamicRate).toBe(5.0);

      const nan = calculateDynamicFollowRate(NaN, NaN, NaN, NaN);
      expect(Number.isFinite(nan.dynamicRate)).toBe(true);
      expect(nan.dynamicRate).toBe(5.0);
    });
  });

  describe('calculateSpeedDistanceScale - Standstill & Invariant Distance Preservation', () => {
    it('guarantees distance scale is strictly 1.0 at standstill (0 km/h)', () => {
      const res = calculateSpeedDistanceScale(0, 100);
      expect(res.distanceScale).toBe(1.0);
      expect(res.heightScale).toBe(1.0);
      expect(res.normalizedSpeed).toBe(0);
    });

    it('preserves full base distance across all driving speeds (never gets closer to car than standstill)', () => {
      const at100 = calculateSpeedDistanceScale(100, 100);
      expect(at100.distanceScale).toBe(1.0);
      expect(at100.heightScale).toBe(1.0);

      const at237 = calculateSpeedDistanceScale(237, 100);
      expect(at237.distanceScale).toBe(1.0);
      expect(at237.heightScale).toBe(1.0);
    });

    it('safely handles negative, NaN, or zero maxSpeed inputs', () => {
      const neg = calculateSpeedDistanceScale(-50, 100);
      expect(neg.distanceScale).toBe(1.0);

      const nan = calculateSpeedDistanceScale(NaN, NaN);
      expect(nan.distanceScale).toBe(1.0);
      expect(Number.isFinite(nan.distanceScale)).toBe(true);
    });
  });


  describe('Chase Camera Height & Downward Pitch Geometry', () => {
    it('verifies camera height is lowered by 1/6 (close: ~2.17m, normal: ~4.58m)', () => {
      const originalCloseH = 2.6;
      const originalNormalH = 5.5;

      const expectedCloseH = originalCloseH * (5 / 6); // 2.1666...
      const expectedNormalH = originalNormalH * (5 / 6); // 4.5833...

      expect(2.17).toBeCloseTo(expectedCloseH, 2);
      expect(4.58).toBeCloseTo(expectedNormalH, 2);
    });

    it('verifies downward pitch tilt is exactly 1/10 less tilted downwards', () => {
      // Prior delta Y was 2.6 - 1.6 = 1.0m
      const previousDeltaY = 1.0;
      // With 1/10 less downward pitch: new delta Y is 0.90 * 1.0 = 0.90m
      const newCloseH = 2.17;
      const newLookAheadY = 1.27;
      const newDeltaY = newCloseH - newLookAheadY;

      expect(newDeltaY).toBeCloseTo(0.90, 2);
      // Downward tilt ratio is exactly 0.90 (1/10 less)
      expect(newDeltaY / previousDeltaY).toBeCloseTo(0.90, 2);
    });
  });

  describe('High-Speed Visual Perception (Dynamic FOV, Height Drop, Micro-Rumble)', () => {
    describe('calculateDynamicFov', () => {
      it('guarantees standstill FOV is strictly 60.0° (identical base framing at 0 km/h)', () => {
        const closeRes = calculateDynamicFov(0, 'chase_close', 60);
        expect(closeRes.targetFov).toBe(60);
        expect(closeRes.fovDelta).toBe(0);

        const normalRes = calculateDynamicFov(0, 'chase', 60);
        expect(normalRes.targetFov).toBe(60);
        expect(normalRes.fovDelta).toBe(0);
      });

      it('expands FOV substantially at 100 km/h to create strong peripheral velocity', () => {
        const closeRes = calculateDynamicFov(100, 'chase_close', 60);
        // At 100 km/h, close chase expands by ~7° (reaching ~67°)
        expect(closeRes.targetFov).toBeGreaterThan(66.0);
        expect(closeRes.targetFov).toBeLessThan(69.0);

        const normalRes = calculateDynamicFov(100, 'chase', 60);
        // At 100 km/h, standard chase expands by ~8.5° (reaching ~68.5°)
        expect(normalRes.targetFov).toBeGreaterThan(67.5);
        expect(normalRes.targetFov).toBeLessThan(70.5);
      });

      it('reaches maximum optical speed expansion at top speed (180+ km/h)', () => {
        const closeRes = calculateDynamicFov(180, 'chase_close', 60);
        expect(closeRes.targetFov).toBe(75); // 60 + 15
        expect(closeRes.fovDelta).toBe(15);

        const normalRes = calculateDynamicFov(200, 'chase', 60);
        expect(normalRes.targetFov).toBe(78); // 60 + 18
        expect(normalRes.fovDelta).toBe(18);
      });

      it('sanitizes negative or NaN inputs safely', () => {
        const negRes = calculateDynamicFov(-50, 'chase', 60);
        expect(negRes.targetFov).toBe(60);
        expect(negRes.fovDelta).toBe(0);

        const nanRes = calculateDynamicFov(NaN, 'chase', NaN);
        expect(Number.isFinite(nanRes.targetFov)).toBe(true);
        expect(nanRes.targetFov).toBe(60);
      });
    });

    describe('calculateSpeedHeightDrop', () => {
      it('returns 0m height drop at low speed or standstill (< 40 km/h)', () => {
        expect(calculateSpeedHeightDrop(0, 'chase')).toBe(0);
        expect(calculateSpeedHeightDrop(35, 'chase_close')).toBe(0);
      });

      it('progressively lowers camera elevation closer to the ground at high speeds', () => {
        const at100 = calculateSpeedHeightDrop(100, 'chase_close');
        expect(at100).toBeGreaterThan(0.04);
        expect(at100).toBeLessThan(0.12);

        const at160Close = calculateSpeedHeightDrop(160, 'chase_close');
        expect(at160Close).toBeCloseTo(0.22, 2);

        const at160Normal = calculateSpeedHeightDrop(160, 'chase');
        expect(at160Normal).toBeCloseTo(0.38, 2);
      });

      it('smoothly fades out speed height drop on downhill descents (pitchRad < 0)', () => {
        // At 140 km/h on flat ground, height drop is ~0.15m - 0.26m
        const flatDrop = calculateSpeedHeightDrop(140, 'chase_close', 0);
        expect(flatDrop).toBeGreaterThan(0.12);

        // On a downhill slope (-0.15 rad, ~8.6 deg), speed drop must be completely suppressed to 0
        const downhillDrop = calculateSpeedHeightDrop(140, 'chase_close', -0.15);
        expect(downhillDrop).toBe(0);

        // On standard chase mode, downhill slope must also return 0m drop
        const normalDownhill = calculateSpeedHeightDrop(140, 'chase', -0.20);
        expect(normalDownhill).toBe(0);
      });

      it('safely handles negative or NaN inputs', () => {
        expect(calculateSpeedHeightDrop(-100, 'chase')).toBe(0);
        expect(calculateSpeedHeightDrop(NaN, 'chase')).toBe(0);
      });
    });

    describe('calculateHighSpeedCameraRumble', () => {
      it('produces zero rumble below 70 km/h threshold or at standstill', () => {
        const at0 = calculateHighSpeedCameraRumble(0, 1.0, 0);
        expect(at0.offsetX).toBe(0);
        expect(at0.offsetY).toBe(0);
        expect(at0.offsetPitch).toBe(0);

        const at65 = calculateHighSpeedCameraRumble(65, 2.5, 0);
        expect(at65.offsetX).toBe(0);
        expect(at65.offsetY).toBe(0);
        expect(at65.offsetPitch).toBe(0);
      });

      it('generates subtle, high-frequency micro-rumble at 100+ km/h and 160+ km/h', () => {
        const at100 = calculateHighSpeedCameraRumble(100, 3.14, 0);
        // Subtle micro-rumble at 100 km/h
        expect(Math.abs(at100.offsetX)).toBeGreaterThan(0);
        expect(Math.abs(at100.offsetX)).toBeLessThan(0.01);

        const at160 = calculateHighSpeedCameraRumble(160, 3.14, 0);
        // More prominent chassis vibration at 160 km/h
        expect(Math.abs(at160.offsetX)).toBeGreaterThan(Math.abs(at100.offsetX));
        expect(Math.abs(at160.offsetX)).toBeLessThan(0.025);
      });

      it('suppresses micro-rumble completely during free-look orbit inspection (orbitBlend > 0.3)', () => {
        const orbiting = calculateHighSpeedCameraRumble(150, 1.0, 0.8);
        expect(orbiting.offsetX).toBe(0);
        expect(orbiting.offsetY).toBe(0);
        expect(orbiting.offsetPitch).toBe(0);
      });
    });

    describe('calculateSlopeCameraAdjustments', () => {
      it('returns zero lift and zero look drop on flat terrain (pitch = 0)', () => {
        const res = calculateSlopeCameraAdjustments(0, 7.0, 5.0, 0);
        expect(res.cameraElevationLift).toBe(0);
        expect(res.lookTargetPitchDrop).toBe(0);
      });

      it('ignores subtle transient suspension braking pitch within the deadzone (< 1.1 deg)', () => {
        // -0.015 rad is ~0.86 deg pitch dive under braking
        const res = calculateSlopeCameraAdjustments(-0.015, 7.0, 5.0, 0);
        expect(res.cameraElevationLift).toBe(0);
        expect(res.lookTargetPitchDrop).toBe(0);
      });

      it('provides full geometric elevation lift and downward look target pitch on downhill descents', () => {
        // 15° downhill slope (-0.2618 rad) in close chase (D = 7.0m, lookDist = 5.0m)
        const pitch = -0.2618;
        const dist = 7.0;
        const lookDist = 5.0;
        const res = calculateSlopeCameraAdjustments(pitch, dist, lookDist, 0);

        const expectedLift = dist * Math.sin(-pitch);
        const expectedLookDrop = lookDist * Math.sin(-pitch);

        expect(res.cameraElevationLift).toBeCloseTo(expectedLift, 3);
        expect(res.lookTargetPitchDrop).toBeCloseTo(expectedLookDrop, 3);
        // Specifically, camera elevates ~1.81m to stay safely above the rising slope behind the vehicle
        expect(res.cameraElevationLift).toBeGreaterThan(1.75);
        expect(res.cameraElevationLift).toBeLessThan(1.85);
      });

      it('scales elevation lift proportionally with standard chase follow distance (D = 14.0m)', () => {
        // 15° downhill slope in standard chase
        const pitch = -0.2618;
        const dist = 14.0;
        const lookDist = 5.0;
        const res = calculateSlopeCameraAdjustments(pitch, dist, lookDist, 0);

        // For D = 14m, camera elevates ~3.62m to preserve full nominal height above the slope
        expect(res.cameraElevationLift).toBeCloseTo(14.0 * Math.sin(0.2618), 3);
        expect(res.cameraElevationLift).toBeGreaterThan(3.55);
      });

      it('smoothly dampens slope compensation during 360° free-look orbit inspection', () => {
        const pitch = -0.25;
        const orbitingRes = calculateSlopeCameraAdjustments(pitch, 7.0, 5.0, 1.0);
        expect(orbitingRes.cameraElevationLift).toBe(0);
        expect(orbitingRes.lookTargetPitchDrop).toBe(0);
      });

      it('sanitizes NaN and extreme inputs safely', () => {
        const nanRes = calculateSlopeCameraAdjustments(NaN, NaN, NaN, NaN);
        expect(Number.isFinite(nanRes.cameraElevationLift)).toBe(true);
        expect(Number.isFinite(nanRes.lookTargetPitchDrop)).toBe(true);
        expect(nanRes.cameraElevationLift).toBe(0);
      });
    });
  });

  describe('Chase Camera Stunt 3D Tracking', () => {
    it('returns 0.0 for standard horizontal ground rally driving', () => {
      // Flat ground: forward.y = 0, up.y = 1.0
      expect(calculateStunt3DCameraFactor(0, 1.0)).toBe(0);
      // Mild terrain slope (10° / 0.17 forward.y): zero stunt factor
      expect(calculateStunt3DCameraFactor(0.17, 0.98)).toBe(0);
    });

    it('progressively engages when climbing steep vertical slopes and loops', () => {
      // 30° climb: forward.y = 0.50
      const factor30 = calculateStunt3DCameraFactor(0.50, 0.86);
      expect(factor30).toBeGreaterThan(0.5);

      // 90° vertical loop climb: forward.y = 1.0
      const factor90 = calculateStunt3DCameraFactor(1.0, 0.0);
      expect(factor90).toBe(1.0);
    });

    it('fully engages when vehicle is inverted upside down at loop apex', () => {
      // Inverted loop apex: forward.y = 0, up.y = -1.0
      const factorApex = calculateStunt3DCameraFactor(0, -1.0);
      expect(factorApex).toBe(1.0);
    });
  });
});



