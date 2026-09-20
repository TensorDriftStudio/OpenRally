export interface CheckpointData {
  id: number;
  position: [number, number, number];
  rotationY: number;
  width: number;
  isStart: boolean;
  isFinish: boolean;
  leftGroundOffset?: number;
  rightGroundOffset?: number;
}

export type RaceStatus = 'idle' | 'countdown' | 'racing' | 'completed';

export interface RacingStore {
  raceStatus: RaceStatus;
  currentCheckpoint: number;
  totalCheckpoints: number;
  currentLapTime: number;
  bestLapTime: number | null;
  /** Best lap times indexed by level/track ID */
  bestLapTimes: Record<string, number>;
  lastLapTime: number | null;
  splitDelta: number | null; // delta to best lap in seconds (negative is faster)
  lapCount: number;
  showStageComplete: boolean;
  /** Active countdown digit (3, 2, 1, 0 for START, or null when inactive) */
  countdown: number | null;
  /** Elapsed time of the countdown sequence */
  countdownTimer: number;
  /** Whether the current lap was penalized or invalidated due to track recovery/shortcut */
  isLapInvalidated: boolean;

  // Actions
  startCountdown: () => void;
  tickCountdown: (dt: number) => void;
  startRace: () => void;
  updateTimer: (dt: number) => void;
  passCheckpoint: (index: number) => void;
  resetRace: () => void;
  invalidateCurrentLap: () => void;
  getBestLapForLevel: (levelId: string) => number | null;
  syncBestLapForLevel: (levelId: string) => void;
  resetAllTrackRecords: () => void;
}
