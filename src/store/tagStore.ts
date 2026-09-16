import { create } from 'zustand';
import type { TagStore, TagMatchPhase } from '@/types/tag';
import type { TagLeaderboardEntry } from '@/types/network';
import { useMultiplayerStore } from './multiplayerStore';
import { playCountdownBeep } from '@/utils/countdownSound';

const INITIAL_STATE = {
  phase: 'waiting' as TagMatchPhase,
  countdownRemaining: 0,
  roundRemaining: 180,
  intermissionRemaining: 0,
  taggerId: null,
  taggerNickname: null,
  isTagger: false,
  isFrozen: false,
  freezeRemaining: 0,
  immunityRemaining: 0,
  assignedSpawnIndex: 0,
  timeClean: 0,
  tagsMade: 0,
  leaderboard: [] as TagLeaderboardEntry[],
  showResultsModal: false,
};

function getNicknameForId(id: string | null): string | null {
  if (!id) return null;
  const mpState = useMultiplayerStore.getState();
  if (id === mpState.selfId) return mpState.nickname;
  return mpState.remotePlayers[id]?.nickname ?? 'Hunter';
}

export const useTagStore = create<TagStore>((set, get) => ({
  ...INITIAL_STATE,

  setCountdown: (seconds: number, assignedSpawnIndex: number) => {
    const prevCountdown = get().countdownRemaining;
    const newPhase: TagMatchPhase = seconds > 0 ? 'countdown' : 'waiting';

    if (seconds > 0 && seconds <= 5 && seconds !== prevCountdown) {
      playCountdownBeep(false);
    }

    set({
      phase: newPhase,
      countdownRemaining: seconds,
      assignedSpawnIndex,
      showResultsModal: false,
    });
  },

  startMatch: (duration: number, taggerId: string, assignedSpawnIndex: number) => {
    const selfId = useMultiplayerStore.getState().selfId;
    const isTagger = selfId === taggerId;
    const taggerNick = getNicknameForId(taggerId);

    // High pitch beep for match start
    playCountdownBeep(true);

    set({
      phase: 'active',
      roundRemaining: duration,
      taggerId,
      taggerNickname: taggerNick,
      isTagger,
      isFrozen: false,
      freezeRemaining: 0,
      immunityRemaining: 0,
      assignedSpawnIndex,
      timeClean: 0,
      tagsMade: 0,
      showResultsModal: false,
    });
  },

  setTagPassed: (oldTaggerId: string, newTaggerId: string, freezeDurationMs: number) => {
    const selfId = useMultiplayerStore.getState().selfId;
    const wasTagger = get().isTagger;
    const nowTagger = selfId === newTaggerId;
    const taggerNick = getNicknameForId(newTaggerId);

    const isFrozen = nowTagger && freezeDurationMs > 0;
    const freezeRemaining = isFrozen ? freezeDurationMs / 1000 : 0;
    const immunityRemaining = wasTagger && !nowTagger ? 3.0 : get().immunityRemaining;

    set((state) => ({
      taggerId: newTaggerId,
      taggerNickname: taggerNick,
      isTagger: nowTagger,
      isFrozen,
      freezeRemaining,
      immunityRemaining,
      tagsMade: oldTaggerId === selfId ? state.tagsMade + 1 : state.tagsMade,
    }));
  },

  endMatch: (intermissionRemaining: number, leaderboard: TagLeaderboardEntry[]) => {
    set({
      phase: 'intermission',
      intermissionRemaining,
      leaderboard,
      showResultsModal: true,
      isFrozen: false,
      freezeRemaining: 0,
      immunityRemaining: 0,
    });
  },

  tickSecond: () => {
    get().tickDelta(1.0);
  },

  tickDelta: (dt: number) => {
    const {
      phase,
      roundRemaining,
      isTagger,
      timeClean,
      intermissionRemaining,
      freezeRemaining,
      immunityRemaining,
      isFrozen,
    } = get();

    let nextRoundRemaining = roundRemaining;
    let nextTimeClean = timeClean;
    let nextIntermission = intermissionRemaining;

    if (phase === 'active') {
      nextRoundRemaining = Math.max(0, roundRemaining - dt);
      if (!isTagger) {
        nextTimeClean = timeClean + dt;
      }
    } else if (phase === 'intermission') {
      nextIntermission = Math.max(0, intermissionRemaining - dt);
    }

    let nextFreeze = Math.max(0, freezeRemaining - dt);
    let nextImmunity = Math.max(0, immunityRemaining - dt);
    let stillFrozen = isFrozen;

    if (isFrozen && nextFreeze <= 0) {
      stillFrozen = false;
      nextFreeze = 0;
    }

    set({
      roundRemaining: nextRoundRemaining,
      timeClean: nextTimeClean,
      intermissionRemaining: nextIntermission,
      freezeRemaining: nextFreeze,
      immunityRemaining: nextImmunity,
      isFrozen: stillFrozen,
    });
  },

  dismissResultsModal: () => {
    set({ showResultsModal: false });
  },

  reset: () => {
    set({ ...INITIAL_STATE });
  },
}));
