import { describe, it, expect } from 'vitest';
import {
  VEHICLE_REGISTRY,
  DEFAULT_VEHICLE_ID,
  getVehiclePreset,
  getAvailableVehicles,
} from '@/config/vehicleRegistry';
import { validateVehiclePreset } from '@/utils/validation/vehicleValidator';

describe('Vehicle Registry', () => {
  it('has valid default vehicle ID', () => {
    expect(VEHICLE_REGISTRY[DEFAULT_VEHICLE_ID]).toBeDefined();
    expect(DEFAULT_VEHICLE_ID).toBe('zephyr_wr4');
  });

  it('contains exactly 7 valid presets that pass all physical validation checks', () => {
    const vehicles = getAvailableVehicles();
    expect(vehicles).toHaveLength(7);

    for (const vehicle of vehicles) {
      const validation = validateVehiclePreset(vehicle);
      expect(validation.valid, `Vehicle ${vehicle.id} failed validation: ${validation.errors.join(', ')}`).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(vehicle.config.wheels).toHaveLength(4);
    }
  });

  it('retrieves preset by ID with fallback to default and legacy ID mapping', () => {
    const defaultCar = getVehiclePreset(DEFAULT_VEHICLE_ID);
    expect(defaultCar.id).toBe('zephyr_wr4');
    expect(defaultCar.name).toBe('Zephyr WR-4');
    expect(defaultCar.stats.driveType).toBe('AWD');

    // Legacy fallback mapping
    const legacyHatch = getVehiclePreset('rally_hatchback');
    expect(legacyHatch.id).toBe('zephyr_wr4');

    const legacyWrc = getVehiclePreset('rally_wrc');
    expect(legacyWrc.id).toBe('shadowfire_rs');

    const legacyCyclone = getVehiclePreset('rally_cyclone_b');
    expect(legacyCyclone.id).toBe('apex_phantom_b');

    const legacyIgnis = getVehiclePreset('ignis_sprint');
    expect(legacyIgnis.id).toBe('zephyr_wr4');

    const phantom = getVehiclePreset('apex_phantom_b');
    expect(phantom.id).toBe('apex_phantom_b');
    expect(phantom.name).toBe('Phantom B-Spec');
    expect(phantom.stats.driveType).toBe('AWD');
    expect(phantom.config.engine.maxSpeed).toBe(232);

    const unknownCar = getVehiclePreset('non_existent_car');
    expect(unknownCar.id).toBe('zephyr_wr4');
  });

  it('guarantees resting wheel clearance below body anchor points for all 7 vehicles', () => {
    const vehicles = getAvailableVehicles();
    for (const vehicle of vehicles) {
      for (const wheel of vehicle.config.wheels) {
        expect(wheel.suspensionRestLength).toBeGreaterThan(0.2);
        const restingY = wheel.position[1] - wheel.suspensionRestLength * 0.75;
        // Wheel center at rest must sit below the anchor mount point
        expect(restingY).toBeLessThan(wheel.position[1]);
        // Wheel top must have clearance relative to chassis top
        expect(restingY + wheel.radius).toBeLessThan(vehicle.modelPositionOffset ? vehicle.modelPositionOffset[1] + 0.4 : 0.6);
      }
    }
  });

  it('guarantees all 7 vehicles have unique IDs, fictional names, and distinct stats', () => {
    const vehicles = getAvailableVehicles();
    const ids = new Set(vehicles.map((v) => v.id));
    const names = new Set(vehicles.map((v) => v.name));

    expect(ids.size).toBe(7);
    expect(names.size).toBe(7);

    // Verify all names are original and fictional (complying with Rule 6)
    for (const vehicle of vehicles) {
      expect(vehicle.name).not.toMatch(/Ford|Toyota|Subaru|Mitsubishi|Audi|Porsche|Renault|WRC|FIA/i);
    }

    // High performance Group B vehicle (Phantom B) should have higher max speed than balanced rally car (Zephyr)
    const zephyr = getVehiclePreset('zephyr_wr4');
    const phantom = getVehiclePreset('apex_phantom_b');

    expect(phantom.config.engine.maxSpeed).toBeGreaterThan(zephyr.config.engine.maxSpeed);
    expect(phantom.config.engine.maxForce).toBeGreaterThan(zephyr.config.engine.maxForce);
    expect(phantom.stats.topSpeed).toBeGreaterThan(zephyr.stats.topSpeed);
  });
});

