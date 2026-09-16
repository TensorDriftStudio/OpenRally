import type { GameMode } from '@/types/game';

/**
 * Definition and presentation metadata for a playable OpenRally game mode.
 */
export interface GameModeDefinition {
  /** Unique game mode identifier */
  readonly id: GameMode;
  /** Human-readable title */
  readonly name: string;
  /** High-contrast uppercase badge label for HUD / Menu cards */
  readonly badgeLabel: string;
  /** Primary accent color */
  readonly badgeColor: string;
  /** Semi-transparent badge background */
  readonly badgeBg: string;
  /** Badge border color */
  readonly badgeBorder: string;
  /** Brief mode description */
  readonly description: string;
  /** Whether online multiplayer rooms support this mode */
  readonly isMultiplayerSupported: boolean;
  /** Whether this mode requires closed circuit checkpoints/track spline */
  readonly requiresTrackSpline: boolean;
}

/**
 * Centralized Game Mode Registry.
 * Eliminates ad-hoc if/else checks and nested ternaries across the UI and gameplay systems.
 */
export const GAME_MODE_REGISTRY: Record<GameMode, GameModeDefinition> = {
  timeattack: {
    id: 'timeattack',
    name: 'Time Attack',
    badgeLabel: 'TIME ATTACK',
    badgeColor: '#E31837',
    badgeBg: 'rgba(227, 24, 55, 0.15)',
    badgeBorder: 'rgba(227, 24, 55, 0.35)',
    description: 'Championship checkpoint sprint racing against the clock.',
    isMultiplayerSupported: false,
    requiresTrackSpline: true,
  },
  gymkhana_blitz: {
    id: 'gymkhana_blitz',
    name: 'Gymkhana Blitz',
    badgeLabel: 'GYMKHANA BLITZ',
    badgeColor: '#F59E0B',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeBorder: 'rgba(245, 158, 11, 0.35)',
    description: 'Drift combos, 360 donuts, speed runs, and airtime scoring.',
    isMultiplayerSupported: true,
    requiresTrackSpline: false,
  },
  freeroam: {
    id: 'freeroam',
    name: 'Free Roam',
    badgeLabel: 'FREE ROAM',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: 'rgba(16, 185, 129, 0.35)',
    description: 'Casual open world exploration with zero timers or restrictions.',
    isMultiplayerSupported: true,
    requiresTrackSpline: false,
  },
  tag: {
    id: 'tag',
    name: 'Rally Tag',
    badgeLabel: 'RALLY TAG',
    badgeColor: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    badgeBorder: 'rgba(56, 189, 248, 0.35)',
    description: 'High-speed multiplayer pursuit: survive as a runner or hunt as the tagger.',
    isMultiplayerSupported: true,
    requiresTrackSpline: false,
  },
};

/**
 * Retrieves game mode metadata, falling back to Free Roam if unrecognized.
 */
export function getGameModeDefinition(mode: GameMode): GameModeDefinition {
  return GAME_MODE_REGISTRY[mode] ?? GAME_MODE_REGISTRY.freeroam;
}

/**
 * Returns an array of all registered game mode definitions.
 */
export function getAvailableGameModes(): GameModeDefinition[] {
  return Object.values(GAME_MODE_REGISTRY);
}
