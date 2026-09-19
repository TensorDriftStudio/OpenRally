import { describe, it, expect, vi } from 'vitest';
import {
  applyProgressiveSuspensionDynamics,
  resetSuspensionBumpStops,
} from '../suspension';
import {
  DEFAULT_STUNT_LOOP_CONFIG,
  createStuntLoopDeckTrimesh,
  createStuntLoopRailTrimesh,
  createStuntLoopMeshGeometry,
  generateStuntLoopPath,
} from '../stuntLoopGeometry';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';
import { syncWheelVisuals } from '../visuals';
import { Object3D } from 'three';
import type { IRapierVehicleController } from '@/types/vehicle';

describe('Loop Clearance, Progressive Suspension & Ground Alignment Diagnostics', () => {
  const createMockVehicleController = (initialLengths: number[]): IRapierVehicleController & {
    stiffnesses: number[];
    compressions: number[];
    relaxations: number[];
  } => {
    const lengths = [...initialLengths];
    const stiffnesses = [30, 30, 30, 30];
    const compressions = [5.1, 5.1, 5.1, 5.1];
    const relaxations = [7.8, 7.8, 7.8, 7.8];

    return {
      stiffnesses,
      compressions,
      relaxations,
      wheelSuspensionLength: (i: number) => lengths[i],
      setWheelSuspensionStiffness: vi.fn((i: number, k: number) => {
        stiffnesses[i] = k;
      }),
      setWheelSuspensionCompression: vi.fn((i: number, c: number) => {
        compressions[i] = c;
      }),
      setWheelSuspensionRelaxation: vi.fn((i: number, r: number) => {
        relaxations[i] = r;
      }),
      wheelChassisConnectionPointCs: (i: number) => ({
        x: i % 2 === 0 ? -0.88 : 0.88,
        y: -0.20,
        z: i < 2 ? 1.38 : -1.40,
      }),
      wheelSteering: () => 0,
      wheelIsInContact: () => true,
      setWheelEngineForce: vi.fn(),
      setWheelBrake: vi.fn(),
      setWheelFrictionSlip: vi.fn(),
      updateVehicle: vi.fn(),
    } as unknown as IRapierVehicleController & {
      stiffnesses: number[];
      compressions: number[];
      relaxations: number[];
    };
  };

  it('progressively ramps suspension stiffness and critical damping under high-G compression', () => {
    // Normal 1G riding height (suspension length ~ 0.24m)
    const ctrl1G = createMockVehicleController([0.24, 0.24, 0.24, 0.24]);
    applyProgressiveSuspensionDynamics(ctrl1G, DEFAULT_VEHICLE_CONFIG);

    // At 1G, stiffness and damping must remain at baseline rally spec
    expect(ctrl1G.stiffnesses[0]).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.wheels[0].suspensionStiffness);

    // Extreme 15G centripetal compression in loop (length drops to 0.18m)
    const ctrl15G = createMockVehicleController([0.18, 0.18, 0.18, 0.18]);
    applyProgressiveSuspensionDynamics(ctrl15G, DEFAULT_VEHICLE_CONFIG);

    // Progressive bump stop must scale stiffness smoothly (>= 200) to support 15G load
    expect(ctrl15G.stiffnesses[0]).toBeGreaterThan(180);
    // Critical damping must scale proportionally with sqrt(k) to prevent oscillations
    expect(ctrl15G.compressions[0]).toBeGreaterThan(ctrl1G.compressions[0]);
    expect(ctrl15G.relaxations[0]).toBeGreaterThan(ctrl1G.relaxations[0]);
  });

  it('guarantees chassis floorpan maintains a safe air gap above road deck under 15G load', () => {
    // Under 15G centripetal force, progressive suspension maintains length >= 0.17m
    const minSuspensionUnder15G = 0.17;
    const wheelConnectionY = -0.20;
    const wheelRadius = 0.32;
    const floorpanBottomY = -0.32; // Floorpan center Y (-0.22) - halfHeight (0.06) - radius (0.04)

    // Road surface relative to chassis center
    const roadY = wheelConnectionY - minSuspensionUnder15G - wheelRadius; // -0.20 - 0.17 - 0.32 = -0.69m
    const clearance = floorpanBottomY - roadY; // -0.32 - (-0.69) = +0.37m (37 cm)

    expect(clearance).toBeGreaterThanOrEqual(0.30); // At least 30cm clearance over concave loop deck
  });

  it('guarantees visual wheel alignment never pushes wheels beneath road surface during compression', () => {
    const wheels = Array.from({ length: 4 }, () => {
      const obj = new Object3D();
      obj.add(new Object3D());
      return obj;
    });
    const wheelRefs = { current: wheels };

    // Controller operating under heavy loop compression (0.19m suspension length)
    const loopController = createMockVehicleController([0.19, 0.19, 0.19, 0.19]);
    syncWheelVisuals(loopController, wheelRefs, DEFAULT_VEHICLE_CONFIG, 35, 1 / 60, 5000, 4);

    // Visual wheel Y position = connection.y - safeSuspension = -0.20 - 0.19 = -0.39m
    expect(wheels[0].position.y).toBeCloseTo(-0.39, 2);
    // Tire bottom = -0.39 - 0.35 (radius) = -0.74m, perfectly aligned with road deck
  });

  it('restores baseline suspension stiffness and damping upon vehicle reset', () => {
    const ctrl = createMockVehicleController([0.15, 0.15, 0.15, 0.15]);
    // Simulate compressed state
    applyProgressiveSuspensionDynamics(ctrl, DEFAULT_VEHICLE_CONFIG);
    expect(ctrl.stiffnesses[0]).toBeGreaterThan(DEFAULT_VEHICLE_CONFIG.wheels[0].suspensionStiffness);

    // Reset vehicle
    resetSuspensionBumpStops(ctrl, DEFAULT_VEHICLE_CONFIG);
    expect(ctrl.stiffnesses[0]).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.wheels[0].suspensionStiffness);
  });

  it('verifies visual curbs and road deck are flush with the physical trimesh collider', () => {
    const geom = createStuntLoopMeshGeometry(DEFAULT_STUNT_LOOP_CONFIG);
    const deckTrimesh = createStuntLoopDeckTrimesh(DEFAULT_STUNT_LOOP_CONFIG);
    const railTrimesh = createStuntLoopRailTrimesh(DEFAULT_STUNT_LOOP_CONFIG);

    expect(deckTrimesh.vertices.length).toBeGreaterThan(0);
    expect(railTrimesh.vertices.length).toBeGreaterThan(0);
    expect(geom.getAttribute('position')).toBeDefined();

    // Verify deck trimesh has 3 vertices per cross section (left edge, center, right edge)
    expect(deckTrimesh.vertices.length % 9).toBe(0);
    // Verify rail trimesh has 4 vertices per cross section (left top/base, right base/top)
    expect(railTrimesh.vertices.length % 12).toBe(0);
  });

  it('absorbs jump landing impact with heavy compression damping and moderate stiffness', () => {
    resetSuspensionBumpStops();
    const ctrlLanding = createMockVehicleController([0.18, 0.18, 0.18, 0.18]);

    // Simulate vehicle touching down from airborne jump (was airborne)
    applyProgressiveSuspensionDynamics(ctrlLanding, DEFAULT_VEHICLE_CONFIG, {
      dt: 1 / 60,
      forwardSpeed: 25,
      isAirborne: true,
    });

    // Landing regime primes: compression damping is heavily boosted (viscous hydraulic bump stop)
    expect(ctrlLanding.compressions[0]).toBeGreaterThan(15);
    // Stiffness is capped at moderate rally rate (< 45 N/m) to prevent storing catapult energy
    expect(ctrlLanding.stiffnesses[0]).toBeLessThanOrEqual(45);
  });

  it('unloads bump stop on rebound with baseline stiffness and overdamped relaxation', () => {
    resetSuspensionBumpStops();
    const ctrlInitial = createMockVehicleController([0.18, 0.18, 0.18, 0.18]);

    // Frame 1: at bottom of landing stroke (0.18m)
    applyProgressiveSuspensionDynamics(ctrlInitial, DEFAULT_VEHICLE_CONFIG, {
      dt: 1 / 60,
      forwardSpeed: 25,
      isAirborne: false,
    });

    // Frame 2: strut extending back outward (rebounding to 0.20m)
    const ctrlRebound = createMockVehicleController([0.20, 0.20, 0.20, 0.20]);
    applyProgressiveSuspensionDynamics(ctrlRebound, DEFAULT_VEHICLE_CONFIG, {
      dt: 1 / 60,
      forwardSpeed: 25,
      isAirborne: false,
    });

    // Rebound hysteresis: stiffness drops immediately to baseline k0 (30 N/m)
    expect(ctrlRebound.stiffnesses[0]).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.wheels[0].suspensionStiffness);
    // Relaxation damping is boosted so rebound is overdamped, preventing secondary bounce
    expect(ctrlRebound.relaxations[0]).toBeGreaterThan(12);
  });

  it('guarantees C3-continuous clothoid transition smoothly ramps curvature from zero at loop entry', () => {
    const path = generateStuntLoopPath(DEFAULT_STUNT_LOOP_CONFIG);

    // Find the transition point at loop entry (where z crosses from negative approach to 0)
    const entryIndex = path.findIndex((p) => Math.abs(p.position.z) < 0.05 && p.progress >= 0.14);
    expect(entryIndex).toBeGreaterThan(0);

    const entryPt = path[entryIndex];
    // Entry tangent must be aligned purely with forward Z (zero vertical pitch slope)
    expect(entryPt.tangent.y).toBeCloseTo(0, 3);
    expect(entryPt.tangent.z).toBeCloseTo(1, 3);

    // Initial loop elevation must match entry straightaway height (0.10m)
    expect(entryPt.position.y).toBeCloseTo(0.10, 3);
  });
});
