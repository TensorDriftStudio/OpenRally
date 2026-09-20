import { create } from 'zustand';
import type { RacingStore } from '@/types/racing';
import { emitGameEvent } from '@/utils/events';
import { useGameStore } from '@/store/gameStore';
import { playCountdownBeep } from '@/utils/countdownSound';

const TRACK_RECORDS_KEY = 'openrally_track_records';
const LEGACY_BEST_LAP_KEY = 'openrally_best_lap';

function loadTrackRecords(): Record<string, number> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(TRACK_RECORDS_KEY);
    if (raw) {
      return JSON.parse(raw) as Record<string, number>;
    }
    // Fallback/migration for single legacy best lap
    const legacy = localStorage.getItem(LEGACY_BEST_LAP_KEY);
    if (legacy) {
      const parsed = parseFloat(legacy);
      if (!isNaN(parsed)) {
        return { level1: parsed };
      }
    }
    return {};
  } catch {
    return {};
  }
}

function saveTrackRecords(records: Record<string, number>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TRACK_RECORDS_KEY, JSON.stringify(records));
    }
  } catch {
    // ignore
  }
}

const initialRecords = loadTrackRecords();
const initialLevel = useGameStore.getState().selectedLevelId;

export const useRacingStore = create<RacingStore>((set, get) => ({
  raceStatus: 'idle',
  currentCheckpoint: 0,
  totalCheckpoints: 10,
  currentLapTime: 0,
  bestLapTimes: initialRecords,
  bestLapTime: initialRecords[initialLevel] ?? null,
  lastLapTime: null,
  splitDelta: null,
  lapCount: 0,
  showStageComplete: false,
  countdown: null,
  countdownTimer: 0,
  isLapInvalidated: false,

  invalidateCurrentLap: () => set({ isLapInvalidated: true }),

  getBestLapForLevel: (levelId: string) => {
    return get().bestLapTimes[levelId] ?? null;
  },

  syncBestLapForLevel: (levelId: string) => {
    const records = get().bestLapTimes;
    set({ bestLapTime: records[levelId] ?? null });
  },

  startCountdown: () => {
    playCountdownBeep(false);
    set({
      raceStatus: 'countdown',
      countdown: 3,
      countdownTimer: 0,
      currentCheckpoint: 1,
      currentLapTime: 0,
      splitDelta: null,
      showStageComplete: false,
      isLapInvalidated: false,
    });
  },

  tickCountdown: (dt: number) => {
    const { raceStatus, countdownTimer, countdown } = get();
    if (raceStatus !== 'countdown' && countdown === null) return;

    const newTimer = countdownTimer + dt;

    if (newTimer < 1.0) {
      if (countdown !== 3) {
        playCountdownBeep(false);
        set({ countdown: 3, countdownTimer: newTimer });
      } else {
        set({ countdownTimer: newTimer });
      }
    } else if (newTimer < 2.0) {
      if (countdown !== 2) {
        playCountdownBeep(false);
        set({ countdown: 2, countdownTimer: newTimer });
      } else {
        set({ countdownTimer: newTimer });
      }
    } else if (newTimer < 3.0) {
      if (countdown !== 1) {
        playCountdownBeep(false);
        set({ countdown: 1, countdownTimer: newTimer });
      } else {
        set({ countdownTimer: newTimer });
      }
    } else if (newTimer < 3.7) {
      if (countdown !== 0) {
        playCountdownBeep(true);
        set({
          raceStatus: 'racing',
          countdown: 0, // 0 corresponds to "START!" badge
          countdownTimer: newTimer,
          currentLapTime: newTimer - 3.0,
        });
      } else {
        set({
          countdownTimer: newTimer,
          currentLapTime: newTimer - 3.0,
        });
      }
    } else {
      set({
        countdown: null,
        countdownTimer: newTimer,
      });
    }
  },

  startRace: () => {
    set({
      raceStatus: 'racing',
      countdown: null,
      countdownTimer: 0,
      currentCheckpoint: 1, // Heading towards checkpoint 1
      currentLapTime: 0,
      splitDelta: null,
      showStageComplete: false,
    });
  },

  updateTimer: (dt: number) => {
    const { raceStatus, currentLapTime } = get();
    if (raceStatus === 'racing') {
      set({ currentLapTime: currentLapTime + dt });
    }
  },

  passCheckpoint: (index: number) => {
    const { raceStatus, currentCheckpoint, totalCheckpoints, currentLapTime, bestLapTimes, lapCount, isLapInvalidated } = get();

    // Crossing start line from idle starts the race countdown
    if (index === 0 && raceStatus === 'idle') {
      get().startCountdown();
      return;
    }

    if (index === currentCheckpoint) {
      emitGameEvent('checkpoint_passed', {
        checkpointIndex: index,
        totalCheckpoints,
      });

      // If we are racing and crossed checkpoint 0 (Start/Finish gantry after completing circuit), finish the lap!
      if (index === 0 && raceStatus === 'racing') {
        const finalTime = currentLapTime;
        const currentLevelId = useGameStore.getState().selectedLevelId;
        const previousBest = bestLapTimes[currentLevelId] ?? null;
        const isBest = (!previousBest || finalTime < previousBest) && !isLapInvalidated;

        let newRecords = bestLapTimes;
        let newBest = previousBest;

        if (isBest) {
          newBest = finalTime;
          newRecords = { ...bestLapTimes, [currentLevelId]: finalTime };
          saveTrackRecords(newRecords);
        }

        set({
          raceStatus: 'racing',
          currentCheckpoint: 1,
          currentLapTime: 0,
          lastLapTime: finalTime,
          bestLapTime: newBest,
          bestLapTimes: newRecords,
          lapCount: lapCount + 1,
          showStageComplete: false,
          isLapInvalidated: false,
        });

        emitGameEvent('lap_completed', {
          lap: lapCount + 1,
          lapTime: finalTime,
          isBest,
        });
      } else {
        // Advance to next checkpoint along the closed loop (1 -> 2 -> ... -> N-1 -> 0)
        const nextCp = (currentCheckpoint + 1) % totalCheckpoints;
        set({ currentCheckpoint: nextCp });
      }
    }
  },

  resetRace: () => {
    set({
      raceStatus: 'idle',
      currentCheckpoint: 0,
      currentLapTime: 0,
      splitDelta: null,
      showStageComplete: false,
      countdown: null,
      countdownTimer: 0,
      isLapInvalidated: false,
    });
  },

  resetAllTrackRecords: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TRACK_RECORDS_KEY);
        localStorage.removeItem(LEGACY_BEST_LAP_KEY);
      }
    } catch {
      // ignore
    }
    set({
      bestLapTimes: {},
      bestLapTime: null,
      splitDelta: null,
    });
    emitGameEvent('track_records_reset', {
      timestamp: Date.now(),
    });
  },
}));
