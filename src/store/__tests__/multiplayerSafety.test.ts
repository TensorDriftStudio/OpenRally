import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useMultiplayerStore,
  generateCuratedNickname,
  CURATED_RACER_ADJECTIVES,
  CURATED_RACER_MASCOTS,
} from '../multiplayerStore';

describe('multiplayerSafety & curated identity', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    useMultiplayerStore.getState().reset();
  });

  it('generates child-safe curated nicknames matching the strict format', () => {
    for (let i = 0; i < 50; i++) {
      const nick = generateCuratedNickname();
      expect(nick).toMatch(/^[A-Za-z]+_[A-Za-z]+_\d{2}$/);
      expect(nick.length).toBeLessThanOrEqual(24);

      const parts = nick.split('_');
      expect(parts).toHaveLength(3);
      expect(CURATED_RACER_ADJECTIVES).toContain(parts[0]);
      expect(CURATED_RACER_MASCOTS).toContain(parts[1]);
      const num = parseInt(parts[2], 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(99);
      expect(parts[2]).toHaveLength(2);
    }
  });

  it('contains zero profanity, abuse, or offensive terms in word lists', () => {
    const combined = [...CURATED_RACER_ADJECTIVES, ...CURATED_RACER_MASCOTS];
    const forbiddenPatterns = [/fuck/i, /shit/i, /bitch/i, /cunt/i, /ass/i, /dick/i, /nazi/i, /kill/i, /hate/i];

    for (const word of combined) {
      for (const pattern of forbiddenPatterns) {
        expect(word).not.toMatch(pattern);
      }
    }
  });

  it('updates and persists curated nickname safely in store', () => {
    const testNick = 'Apex_Falcon_77';
    useMultiplayerStore.getState().setNickname(testNick);
    expect(useMultiplayerStore.getState().nickname).toBe(testNick);
  });

  it('tracks server clock offset for jitter-compensated remote extrapolation', () => {
    expect(useMultiplayerStore.getState().serverClockOffset).toBe(0);

    useMultiplayerStore.getState().updateServerClockOffset(-25.5);
    expect(useMultiplayerStore.getState().serverClockOffset).toBeCloseTo(-25.5, 2);

    useMultiplayerStore.getState().updateServerClockOffset(14.2);
    expect(useMultiplayerStore.getState().serverClockOffset).toBeCloseTo(14.2, 2);
  });
});
