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
      front: { baseGrip: 2.52, peakSlipAngle: Math.PI / 6.8, slideGrip: 2.05 },
      rear: { baseGrip: 2.30, peakSlipAngle: Math.PI / 7.2, slideGrip: 1.82 },
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
  },
  mud: {
    id: 'mud',
    name: 'Mud / Track Dirt',
    tireModel: {
      front: { baseGrip: 1.95, peakSlipAngle: Math.PI / 6.4, slideGrip: 1.62 },
      rear: { baseGrip: 1.80, peakSlipAngle: Math.PI / 6.8, slideGrip: 1.50 },
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
    looseSurfaceTractionLoss: 0.14,
  },
  grass: {
    id: 'grass',
    name: 'Grass / Meadow',
    tireModel: {
      front: { baseGrip: 1.82, peakSlipAngle: Math.PI / 6.4, slideGrip: 1.42 },
      rear: { baseGrip: 1.62, peakSlipAngle: Math.PI / 6.8, slideGrip: 1.26 },
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
    looseSurfaceTractionLoss: 0.10,
  },
  sand: {
    id: 'sand',
    name: 'Beach Sand / Dunes',
    tireModel: {
      front: { baseGrip: 1.55, peakSlipAngle: Math.PI / 6.4, slideGrip: 1.25 },
      rear: { baseGrip: 1.45, peakSlipAngle: Math.PI / 6.8, slideGrip: 1.18 },
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
    looseSurfaceTractionLoss: 0.20,
  },
  snow: {
    id: 'snow',
    name: 'Snow / Ice',
    tireModel: {
      front: { baseGrip: 1.85, peakSlipAngle: Math.PI / 6.2, slideGrip: 1.55 },
      rear: { baseGrip: 1.75, peakSlipAngle: Math.PI / 6.6, slideGrip: 1.48 },
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
    rollingResistance: 0.006,
    looseSurfaceTractionLoss: 0.15,
  },
  gravel: {
    id: 'gravel',
    name: 'Loose Gravel',
    tireModel: {
      front: { baseGrip: 2.15, peakSlipAngle: Math.PI / 6.5, slideGrip: 1.82 },
      rear: { baseGrip: 2.00, peakSlipAngle: Math.PI / 7.0, slideGrip: 1.72 },
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
    rollingResistance: 0.005,
    looseSurfaceTractionLoss: 0.10,
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
