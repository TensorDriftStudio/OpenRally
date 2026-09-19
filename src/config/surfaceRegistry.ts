import type { SurfaceType, SurfaceDefinition } from '@/types';

/**
 * Centralized surface registry defining physics, audio, and visual characteristics
 * for every drivable terrain surface in OpenRally.
 */
export const SURFACE_REGISTRY: Record<SurfaceType, SurfaceDefinition> = {
  tarmac: {
    id: 'tarmac',
    name: 'Asphalt / Tarmac',
    tireModel: {
      front: { baseGrip: 2.10, peakSlipAngle: Math.PI / 7.5, slideGrip: 1.25 },
      rear: { baseGrip: 1.95, peakSlipAngle: Math.PI / 8.0, slideGrip: 1.10 },
    },
    particles: {
      color: '#e5e7eb',
      scale: 1.15,
      lifetime: 0.60,
      emitRateMultiplier: 1.2,
    },
    audio: {
      soundType: 'asphalt',
      basePitch: 1.1,
      volumeMultiplier: 0.75,
    },
    skidMarkOpacity: 0.9,
    rollingResistance: 0.002,
    looseSurfaceTractionLoss: 0.0,
    sideFrictionStiffness: 1.05,
  },
  mud: {
    id: 'mud',
    name: 'Mud / Track Dirt',
    tireModel: {
      front: { baseGrip: 1.42, peakSlipAngle: Math.PI / 5.6, slideGrip: 0.85 },
      rear: { baseGrip: 1.32, peakSlipAngle: Math.PI / 6.0, slideGrip: 0.78 },
    },
    particles: {
      color: '#8b6f4e',
      scale: 1.5,
      lifetime: 0.75,
      emitRateMultiplier: 1.5,
    },
    audio: {
      soundType: 'mud',
      basePitch: 0.85,
      volumeMultiplier: 1.2,
    },
    skidMarkOpacity: 0.7,
    rollingResistance: 0.007,
    looseSurfaceTractionLoss: 0.08,
    sideFrictionStiffness: 0.52,
  },
  grass: {
    id: 'grass',
    name: 'Grass / Meadow',
    tireModel: {
      front: { baseGrip: 1.35, peakSlipAngle: Math.PI / 6.0, slideGrip: 0.80 },
      rear: { baseGrip: 1.25, peakSlipAngle: Math.PI / 6.4, slideGrip: 0.74 },
    },
    particles: {
      color: '#856a4b',
      scale: 1.1,
      lifetime: 0.55,
      emitRateMultiplier: 1.0,
    },
    audio: {
      soundType: 'grass',
      basePitch: 0.95,
      volumeMultiplier: 1.0,
    },
    skidMarkOpacity: 0.4,
    rollingResistance: 0.008,
    looseSurfaceTractionLoss: 0.08,
    sideFrictionStiffness: 0.62,
  },
  sand: {
    id: 'sand',
    name: 'Beach Sand / Dunes',
    tireModel: {
      front: { baseGrip: 1.15, peakSlipAngle: Math.PI / 5.5, slideGrip: 0.72 },
      rear: { baseGrip: 1.05, peakSlipAngle: Math.PI / 5.8, slideGrip: 0.65 },
    },
    particles: {
      color: '#d4b483',
      scale: 1.7,
      lifetime: 0.9,
      emitRateMultiplier: 1.8,
    },
    audio: {
      soundType: 'sand',
      basePitch: 0.8,
      volumeMultiplier: 1.3,
    },
    skidMarkOpacity: 0.5,
    rollingResistance: 0.009,
    looseSurfaceTractionLoss: 0.18,
    sideFrictionStiffness: 0.48,
  },
  snow: {
    id: 'snow',
    name: 'Snow / Ice',
    tireModel: {
      front: { baseGrip: 0.98, peakSlipAngle: Math.PI / 5.2, slideGrip: 0.58 },
      rear: { baseGrip: 0.90, peakSlipAngle: Math.PI / 5.5, slideGrip: 0.52 },
    },
    particles: {
      color: '#f0f9ff',
      scale: 1.3,
      lifetime: 0.65,
      emitRateMultiplier: 1.3,
    },
    audio: {
      soundType: 'gravel',
      basePitch: 1.2,
      volumeMultiplier: 0.9,
    },
    skidMarkOpacity: 0.3,
    rollingResistance: 0.005,
    looseSurfaceTractionLoss: 0.06,
    sideFrictionStiffness: 0.40,
  },
  gravel: {
    id: 'gravel',
    name: 'Loose Gravel',
    tireModel: {
      front: { baseGrip: 1.55, peakSlipAngle: Math.PI / 5.4, slideGrip: 0.90 },
      rear: { baseGrip: 1.45, peakSlipAngle: Math.PI / 5.8, slideGrip: 0.82 },
    },
    particles: {
      color: '#a8a29e',
      scale: 1.4,
      lifetime: 0.7,
      emitRateMultiplier: 1.4,
    },
    audio: {
      soundType: 'gravel',
      basePitch: 1.05,
      volumeMultiplier: 1.1,
    },
    skidMarkOpacity: 0.6,
    rollingResistance: 0.004,
    looseSurfaceTractionLoss: 0.05,
    sideFrictionStiffness: 0.48,
  },
};

/**
 * Returns surface definition for a given surface type with fallback to grass.
 */
export function getSurfaceDefinition(surface: SurfaceType): SurfaceDefinition {
  return SURFACE_REGISTRY[surface] ?? SURFACE_REGISTRY.grass;
}

/**
 * Returns an array of all registered surfaces.
 */
export function getAllSurfaces(): SurfaceDefinition[] {
  return Object.values(SURFACE_REGISTRY);
}
