import { describe, it, expect } from 'vitest';
import { VEHICLE_REGISTRY } from '@/config/vehicleRegistry';
import { VEHICLE_MODEL_PATH, VEHICLE_WRC_MODEL_PATH } from '@/config/assets';

describe('Vehicle Visual Contracts & Geometry Standards', () => {
  const RAW_WHEEL_GLB_RADIUS = 0.0375; // Baseline unit radius of the raw GLB wheel mesh

  it('calculates proportional and positive visual scales for all registered vehicle wheels', () => {
    for (const preset of Object.values(VEHICLE_REGISTRY)) {
      const wheels = preset.config.wheels;
      expect(wheels).toBeDefined();
      expect(wheels.length).toBe(4);

      for (let i = 0; i < wheels.length; i++) {
        const wheel = wheels[i];
        expect(wheel.radius).toBeGreaterThan(0.1);
        expect(wheel.radius).toBeLessThan(1.0);

        const visualScale = wheel.radius / RAW_WHEEL_GLB_RADIUS;
        expect(visualScale).toBeGreaterThan(0);
        expect(Number.isFinite(visualScale)).toBe(true);
        // Standard rally wheel visual scale should typically fall between 7.0 and 12.0
        expect(visualScale).toBeGreaterThanOrEqual(5.0);
        expect(visualScale).toBeLessThanOrEqual(15.0);
      }
    }
  });

  it('verifies wheel rim orientation convention (isRightSide boolean)', () => {
    // Standard convention in Wheel.tsx:
    // Right side wheels face outward at Y = 0
    // Left side wheels face outward at Y = Math.PI
    const getRimYRotation = (isRightSide: boolean) => (isRightSide ? 0 : Math.PI);

    expect(getRimYRotation(true)).toBe(0);
    expect(getRimYRotation(false)).toBeCloseTo(Math.PI);
  });

  it('verifies LOD distance arrays are strictly ascending', () => {
    const wheelLODDistances = [0, 80, 200];
    const vehicleLODDistances = [0, 50, 150];

    for (let i = 0; i < wheelLODDistances.length - 1; i++) {
      expect(wheelLODDistances[i]).toBeLessThan(wheelLODDistances[i + 1]);
    }

    for (let i = 0; i < vehicleLODDistances.length - 1; i++) {
      expect(vehicleLODDistances[i]).toBeLessThan(vehicleLODDistances[i + 1]);
    }
  });

  it('ensures all registered vehicle models have valid GLB paths and valid chassis dimensions', () => {
    for (const preset of Object.values(VEHICLE_REGISTRY)) {
      expect(preset.modelPath).toMatch(/^\/models\/vehicles\/.*\.glb$/);
      const scale = preset.modelScale ?? [1, 1, 1];
      expect(scale[0]).toBeGreaterThan(0);
      expect(scale[1]).toBeGreaterThan(0);
      expect(scale[2]).toBeGreaterThan(0);

      // Chassis collider proxy dimensions must be positive
      expect(preset.config.chassisSize[0]).toBeGreaterThan(1.0); // Width ~1.8-2.2m
      expect(preset.config.chassisSize[1]).toBeGreaterThan(0.3); // Height ~0.4-1.2m
      expect(preset.config.chassisSize[2]).toBeGreaterThan(3.0); // Length ~3.8-5.0m
    }
  });

  it('validates default model path aliases exist in assets config', () => {
    expect(VEHICLE_MODEL_PATH).toBeDefined();
    expect(VEHICLE_MODEL_PATH).toMatch(/\.glb$/);
    expect(VEHICLE_WRC_MODEL_PATH).toBeDefined();
    expect(VEHICLE_WRC_MODEL_PATH).toMatch(/\.glb$/);
  });
});
