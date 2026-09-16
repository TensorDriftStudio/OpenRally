import { describe, it, expect } from 'vitest';
import {
  GAME_MODE_REGISTRY,
  getGameModeDefinition,
  getAvailableGameModes,
} from '@/config/gameModeRegistry';
import type { GameMode } from '@/types/game';

describe('GameModeRegistry Integrity', () => {
  const expectedModes: GameMode[] = ['freeroam', 'timeattack', 'gymkhana_blitz', 'tag'];

  it('contains definitions for all expected GameModes', () => {
    expectedModes.forEach((mode) => {
      const def = GAME_MODE_REGISTRY[mode];
      expect(def).toBeDefined();
      expect(def.id).toBe(mode);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.badgeLabel.length).toBeGreaterThan(0);
      expect(def.badgeColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.description.length).toBeGreaterThan(0);
    });
  });

  it('returns all modes via getAvailableGameModes()', () => {
    const modes = getAvailableGameModes();
    expect(modes.length).toBe(4);
    expect(modes.map((m) => m.id)).toEqual(expect.arrayContaining(expectedModes));
  });

  it('falls back to freeroam for invalid mode in getGameModeDefinition()', () => {
    const fallback = getGameModeDefinition('unknown_mode' as GameMode);
    expect(fallback.id).toBe('freeroam');
  });
});
