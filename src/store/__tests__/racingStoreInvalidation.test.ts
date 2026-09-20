import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRacingStore } from '../racingStore';

describe('racingStore lap invalidation upon track recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    useRacingStore.setState({
      raceStatus: 'idle',
      currentCheckpoint: 0,
      totalCheckpoints: 3,
      currentLapTime: 0,
      bestLapTime: null,
      lastLapTime: null,
      splitDelta: null,
      lapCount: 0,
      showStageComplete: false,
      countdown: null,
      countdownTimer: 0,
      isLapInvalidated: false,
    });
  });

  it('marks lap as invalidated when invalidateCurrentLap() is called', () => {
    expect(useRacingStore.getState().isLapInvalidated).toBe(false);

    useRacingStore.getState().invalidateCurrentLap();
    expect(useRacingStore.getState().isLapInvalidated).toBe(true);
  });

  it('does not record new best lap or persist track record if lap was invalidated', () => {
    useRacingStore.getState().startRace();
    useRacingStore.getState().updateTimer(20.0);

    // Car recovers to track mid-lap (incurring lap invalidation)
    useRacingStore.getState().invalidateCurrentLap();
    expect(useRacingStore.getState().isLapInvalidated).toBe(true);

    // Pass checkpoint 1 and 2
    useRacingStore.getState().passCheckpoint(1);
    useRacingStore.getState().passCheckpoint(2);

    // Pass finish line
    useRacingStore.getState().passCheckpoint(0);

    const state = useRacingStore.getState();
    expect(state.lapCount).toBe(1);
    expect(state.lastLapTime).toBe(20.0);
    // Best lap should remain null because the lap was invalidated!
    expect(state.bestLapTime).toBeNull();
    // After completing the lap, invalidation resets for next lap
    expect(state.isLapInvalidated).toBe(false);
  });

  it('resets lap invalidation on race reset or countdown start', () => {
    useRacingStore.getState().invalidateCurrentLap();
    expect(useRacingStore.getState().isLapInvalidated).toBe(true);

    useRacingStore.getState().resetRace();
    expect(useRacingStore.getState().isLapInvalidated).toBe(false);

    useRacingStore.getState().invalidateCurrentLap();
    expect(useRacingStore.getState().isLapInvalidated).toBe(true);

    useRacingStore.getState().startCountdown();
    expect(useRacingStore.getState().isLapInvalidated).toBe(false);
  });
});
