import { create } from 'zustand';
import type { ConnectionStatus, RemotePlayerSummary, RoomSummary } from '@/types/network';

const NICKNAME_STORAGE_KEY = 'openrally_mp_nickname';

export const CURATED_RACER_ADJECTIVES = [
  'Apex', 'Swift', 'Turbo', 'Alpine', 'Desert',
  'Neon', 'Phantom', 'Wild', 'Blaze', 'Storm',
  'Rapid', 'Vortex', 'Shadow', 'Cobalt', 'Hyper',
] as const;

export const CURATED_RACER_MASCOTS = [
  'Fox', 'Falcon', 'Lynx', 'Badger', 'Wolf',
  'Raptor', 'Viper', 'Bear', 'Comet', 'Arrow',
  'Hawk', 'Cobra', 'Titan', 'Ghost', 'Stag',
] as const;

export function generateCuratedNickname(): string {
  const adj = CURATED_RACER_ADJECTIVES[Math.floor(Math.random() * CURATED_RACER_ADJECTIVES.length)];
  const masc = CURATED_RACER_MASCOTS[Math.floor(Math.random() * CURATED_RACER_MASCOTS.length)];
  const num = String(Math.floor(1 + Math.random() * 99)).padStart(2, '0');
  return `${adj}_${masc}_${num}`;
}

function loadSavedNickname(): string {
  try {
    const saved = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (saved && saved.trim().length >= 3 && /^[A-Za-z0-9_]{3,16}$/.test(saved.trim())) {
      return saved.trim().slice(0, 16);
    }
  } catch {
    // Suppress storage error (private browsing / security sandbox)
  }
  const generated = generateCuratedNickname();
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, generated);
  } catch {
    // Suppress
  }
  return generated;
}

export interface GymkhanaLeaderboardEntry {
  id: string;
  nickname: string;
  vehicleId: string;
  score: number;
}

export interface MultiplayerState {
  status: ConnectionStatus;
  nickname: string;
  selfId: string | null;
  roomName: string;
  slotIndex: number;
  rooms: RoomSummary[];
  currentRoom: RoomSummary | null;
  isHost: boolean;
  remotePlayers: Record<string, RemotePlayerSummary>;
  ping: number;
  serverClockOffset: number;
  error: string | null;
  versionMismatch: { serverVersion: string; clientVersion: string } | null;

  // Gymkhana Blitz Matchmaking & Spectator State
  isSpectating: boolean;
  spectateTargetId: string | null;
  spectateTargetNickname: string | null;
  spectateRoundRemaining: number;
  gymkhanaIntermissionRemaining: number | null;
  gymkhanaLeaderboard: GymkhanaLeaderboardEntry[];

  // Actions
  setNickname: (name: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setSelfId: (id: string, room: string, slotIndex?: number, roomSummary?: RoomSummary) => void;
  setRooms: (rooms: RoomSummary[]) => void;
  setCurrentRoom: (room: RoomSummary | null) => void;
  setPlayers: (players: RemotePlayerSummary[]) => void;
  addPlayer: (player: RemotePlayerSummary) => void;
  removePlayer: (playerId: string) => void;
  updatePing: (ping: number) => void;
  updateServerClockOffset: (offset: number) => void;
  setError: (error: string | null) => void;
  setVersionMismatch: (mismatch: { serverVersion: string; clientVersion: string } | null) => void;
  setSpectating: (
    isSpectating: boolean,
    targetId?: string | null,
    targetNickname?: string | null,
    remaining?: number
  ) => void;
  setGymkhanaRoundEnded: (intermissionRemaining: number, leaderboard: GymkhanaLeaderboardEntry[]) => void;
  setGymkhanaRoundStart: () => void;
  cycleSpectateTarget: (direction: 1 | -1) => void;
  reset: () => void;
}

export const useMultiplayerStore = create<MultiplayerState>((set) => ({
  status: 'disconnected',
  nickname: loadSavedNickname(),
  selfId: null,
  roomName: 'gymkhana_freeroam',
  slotIndex: 0,
  rooms: [],
  currentRoom: null,
  isHost: false,
  remotePlayers: {},
  ping: 0,
  serverClockOffset: 0,
  error: null,
  versionMismatch: null,

  isSpectating: false,
  spectateTargetId: null,
  spectateTargetNickname: null,
  spectateRoundRemaining: 60,
  gymkhanaIntermissionRemaining: null,
  gymkhanaLeaderboard: [],

  setNickname: (nickname: string) => {
    const sanitized = nickname.trim().slice(0, 16);
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, sanitized);
    } catch {
      // Ignore
    }
    set({ nickname: sanitized });
  },

  setStatus: (status: ConnectionStatus) => set({ status }),
  setVersionMismatch: (versionMismatch: { serverVersion: string; clientVersion: string } | null) =>
    set({ versionMismatch }),

  setSelfId: (selfId: string, roomName: string, slotIndex: number = 0, roomSummary?: RoomSummary) =>
    set((state) => {
      const isHost = roomSummary ? roomSummary.hostId === selfId : state.isHost;
      return {
        selfId,
        roomName,
        slotIndex,
        currentRoom: roomSummary ?? state.currentRoom,
        isHost,
        status: 'in_lobby',
        error: null,
      };
    }),

  setRooms: (rooms: RoomSummary[]) => set({ rooms }),

  setCurrentRoom: (currentRoom: RoomSummary | null) =>
    set((state) => ({
      currentRoom,
      isHost: currentRoom && state.selfId ? currentRoom.hostId === state.selfId : false,
    })),

  setPlayers: (players: RemotePlayerSummary[]) => {
    const map: Record<string, RemotePlayerSummary> = {};
    for (const p of players) {
      map[p.id] = p;
    }
    set({ remotePlayers: map });
  },

  addPlayer: (player: RemotePlayerSummary) =>
    set((state) => ({
      remotePlayers: {
        ...state.remotePlayers,
        [player.id]: player,
      },
    })),

  removePlayer: (playerId: string) =>
    set((state) => {
      const copy = { ...state.remotePlayers };
      delete copy[playerId];
      return { remotePlayers: copy };
    }),

  updatePing: (ping: number) => set({ ping }),

  updateServerClockOffset: (serverClockOffset: number) => set({ serverClockOffset }),

  setError: (error: string | null) => set({ error }),

  setSpectating: (
    isSpectating: boolean,
    targetId: string | null = null,
    targetNickname: string | null = null,
    remaining: number = 60
  ) =>
    set({
      isSpectating,
      spectateTargetId: targetId,
      spectateTargetNickname: targetNickname,
      spectateRoundRemaining: remaining,
    }),

  setGymkhanaRoundEnded: (intermissionRemaining: number, leaderboard: GymkhanaLeaderboardEntry[]) =>
    set({
      gymkhanaIntermissionRemaining: intermissionRemaining,
      gymkhanaLeaderboard: leaderboard,
    }),

  setGymkhanaRoundStart: () =>
    set({
      isSpectating: false,
      spectateTargetId: null,
      spectateTargetNickname: null,
      gymkhanaIntermissionRemaining: null,
    }),

  cycleSpectateTarget: (direction: 1 | -1) =>
    set((state) => {
      if (!state.isSpectating) return state;
      const playerIds = Object.keys(state.remotePlayers);
      if (playerIds.length === 0) return state;
      const currentIndex = state.spectateTargetId ? playerIds.indexOf(state.spectateTargetId) : -1;
      const nextIndex = (currentIndex + direction + playerIds.length) % playerIds.length;
      const nextId = playerIds[nextIndex];
      const nextPlayer = state.remotePlayers[nextId];
      return {
        spectateTargetId: nextId,
        spectateTargetNickname: nextPlayer ? nextPlayer.nickname : nextId,
      };
    }),

  reset: () =>
    set({
      status: 'disconnected',
      selfId: null,
      currentRoom: null,
      isHost: false,
      remotePlayers: {},
      ping: 0,
      serverClockOffset: 0,
      error: null,
      versionMismatch: null,
      isSpectating: false,
      spectateTargetId: null,
      spectateTargetNickname: null,
      spectateRoundRemaining: 60,
      gymkhanaIntermissionRemaining: null,
      gymkhanaLeaderboard: [],
    }),
}));
