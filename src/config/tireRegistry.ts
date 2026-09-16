import type { TireType, SurfaceType } from '@/types/vehicle';

/**
 * Complete definition of a tire compound type in OpenRally.
 * Unifies compound naming, visual UI badges/colors, surface grip multipliers,
 * and terrain resistance characteristics.
 */
export interface TireTypeDefinition {
  readonly id: TireType;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly badge: string;
  readonly icon: string;
  readonly color: string;
  readonly badgeBg: string;
  readonly badgeBorder: string;
  readonly surfaceGripMultipliers: Record<SurfaceType, number>;
  readonly looseTractionLossMultiplier: number;
  readonly rollingResistanceMultiplier: number;
}

/**
 * Centralized tire compound registry defining physics multipliers and UI styling
 * for all 3 supported tire types in OpenRally:
 * - 'asphalt': Tarmac / Slick performance compound
 * - 'gravel': Open-block all-terrain rally compound
 * - 'snow': High-sipe soft winter compound
 */
export const TIRE_REGISTRY: Record<TireType, TireTypeDefinition> = {
  asphalt: {
    id: 'asphalt',
    name: 'Asphalt / Tarmac',
    label: 'Asphalt',
    description: 'Optimal grip and precision on dry tarmac. Substantial traction loss on loose dirt, gravel, and snow.',
    badge: 'TARMAC SPEC',
    icon: '🛣️',
    color: '#EF4444',
    badgeBg: 'rgba(239, 68, 68, 0.18)',
    badgeBorder: 'rgba(239, 68, 68, 0.45)',
    surfaceGripMultipliers: {
      tarmac: 1.0,
      gravel: 0.75,
      mud: 0.72,
      sand: 0.75,
      snow: 0.52,
      grass: 0.75,
    },
    looseTractionLossMultiplier: 1.35,
    rollingResistanceMultiplier: 0.95,
  },
  gravel: {
    id: 'gravel',
    name: 'Gravel / Dirt',
    label: 'Gravel',
    description: 'Aggressive open-block tread biting into loose gravel, sand, and mud. Superb slide control.',
    badge: 'GRAVEL SPEC',
    icon: '🪨',
    color: '#F59E0B',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeBorder: 'rgba(245, 158, 11, 0.45)',
    surfaceGripMultipliers: {
      tarmac: 0.85,
      gravel: 1.25,
      mud: 1.22,
      sand: 1.20,
      snow: 0.82,
      grass: 1.08,
    },
    looseTractionLossMultiplier: 0.35,
    rollingResistanceMultiplier: 1.05,
  },
  snow: {
    id: 'snow',
    name: 'Snow / Winter',
    label: 'Snow',
    description: 'High-density sipes and soft rubber compound delivering maximum bite on snow and ice surfaces.',
    badge: 'SNOW SPEC',
    icon: '❄️',
    color: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.18)',
    badgeBorder: 'rgba(56, 189, 248, 0.45)',
    surfaceGripMultipliers: {
      tarmac: 0.76,
      gravel: 0.90,
      mud: 0.92,
      sand: 0.85,
      snow: 1.40,
      grass: 0.90,
    },
    looseTractionLossMultiplier: 0.35,
    rollingResistanceMultiplier: 1.12,
  },
};

/** Default tire compound for standard vehicle setup */
export const DEFAULT_TIRE_TYPE: TireType = 'asphalt';

/** Array of all 3 available tire types in canonical selection order */
export const AVAILABLE_TIRE_TYPES: readonly TireType[] = ['asphalt', 'gravel', 'snow'] as const;

/**
 * Returns the definition for a given tire compound type.
 * Falls back safely to DEFAULT_TIRE_TYPE if unrecognised.
 */
export function getTireDefinition(type: TireType): TireTypeDefinition {
  return TIRE_REGISTRY[type] ?? TIRE_REGISTRY[DEFAULT_TIRE_TYPE];
}

/**
 * Returns all tire compound definitions as an array.
 */
export function getAllTireDefinitions(): TireTypeDefinition[] {
  return AVAILABLE_TIRE_TYPES.map((t) => TIRE_REGISTRY[t]);
}
