import type {
  ClientMessage,
  ServerMessage,
  VehicleTelemetryPayload,
  RoomSummary,
  RemotePlayerSummary,
  EntitySnapshot,
} from '@/types/network';
import type { SurfaceType } from '@/types/vehicle';
import type { GameMode } from '@/types/game';

export const VALID_LEVEL_IDS: ReadonlySet<string> = new Set([
  'level1_island',
  'level2_desert',
  'level3_sweden',
  'level4_britain',
  'level5_gymkhana',
]);

export const VALID_GAME_MODES: ReadonlySet<GameMode> = new Set([
  'freeroam',
  'timeattack',
  'gymkhana_blitz',
  'tag',
]);

export const VALID_SURFACES: ReadonlySet<SurfaceType> = new Set([
  'tarmac',
  'gravel',
  'mud',
  'sand',
  'grass',
  'snow',
]);

export const VALID_VEHICLE_IDS: ReadonlySet<string> = new Set([
  // Primary Championship Roster
  'zephyr_wr4',
  'apex_phantom_b',
  'bantam_turbo',
  'vortex_b',
  'vanguard_gt',
  'shadowfire_rs',
  'kodiak_raid',
  // Backward-compatibility aliases
  'rally_hatchback',
  'rally_wrc',
  'rally_cyclone_b',
  'cyclone_rs',
  'ignis_sprint',
  'rally_titan_b',
]);

/**
 * Validates and sanitizes a player's nickname.
 * Returns trimmed string if valid, null otherwise.
 */
export function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 16) return null;
  // Allow unicode letters, numbers, underscores, hyphens, and spaces
  const validPattern = /^[\p{L}\p{N}_\- ]+$/u;
  if (!validPattern.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates and sanitizes a user-created room name.
 */
export function sanitizeRoomName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 24) return null;
  // Allow unicode letters, numbers, spaces, and safe punctuation including apostrophes
  const validPattern = /^[\p{L}\p{N}_\- !?#()'".]+$/u;
  if (!validPattern.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validates a vehicle ID against the registered championship roster.
 */
export function isValidVehicleId(vehicleId: unknown): boolean {
  return typeof vehicleId === 'string' && VALID_VEHICLE_IDS.has(vehicleId);
}

/**
 * Validates a finite floating point number within an inclusive range.
 */
export function isValidNumber(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val >= min && val <= max;
}

/**
 * Validates a 3D coordinate vector [x, y, z].
 */
export function isValidVector3(val: unknown, maxCoord: number = 2000): val is [number, number, number] {
  if (!Array.isArray(val) || val.length !== 3) return false;
  return (
    isValidNumber(val[0], -maxCoord, maxCoord) &&
    isValidNumber(val[1], -maxCoord, maxCoord) &&
    isValidNumber(val[2], -maxCoord, maxCoord)
  );
}

/**
 * Validates a 4D quaternion [x, y, z, w].
 */
export function isValidQuaternion(val: unknown): val is [number, number, number, number] {
  if (!Array.isArray(val) || val.length !== 4) return false;
  const [x, y, z, w] = val;
  if (
    !isValidNumber(x, -1.05, 1.05) ||
    !isValidNumber(y, -1.05, 1.05) ||
    !isValidNumber(z, -1.05, 1.05) ||
    !isValidNumber(w, -1.05, 1.05)
  ) {
    return false;
  }
  const normSq = x * x + y * y + z * z + w * w;
  return normSq >= 0.5 && normSq <= 1.5;
}

/**
 * Validates an incoming vehicle telemetry payload.
 */
export function validateTelemetryPayload(raw: unknown): VehicleTelemetryPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  if (!isValidNumber(p.seq, 0, 1e9)) return null;
  if (!isValidNumber(p.time, 0, 1e15)) return null;
  if (!isValidVector3(p.pos, 1000)) return null;
  if (!isValidQuaternion(p.rot)) return null;
  if (!isValidVector3(p.linVel, 200)) return null;
  if (!isValidVector3(p.angVel, 100)) return null;
  if (!isValidNumber(p.steer, -1.5, 1.5)) return null;

  if (!Array.isArray(p.wheelRots) || p.wheelRots.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (!isValidNumber(p.wheelRots[i], -1e7, 1e7)) return null;
  }

  if (!isValidNumber(p.rpm, 0, 15000)) return null;
  if (!isValidNumber(p.gear, -1, 8)) return null;
  if (typeof p.isDrifting !== 'boolean') return null;

  const surface = typeof p.surface === 'string' && VALID_SURFACES.has(p.surface as SurfaceType)
    ? (p.surface as SurfaceType)
    : 'tarmac';

  return {
    seq: p.seq as number,
    time: p.time as number,
    pos: p.pos as [number, number, number],
    rot: p.rot as [number, number, number, number],
    linVel: p.linVel as [number, number, number],
    angVel: p.angVel as [number, number, number],
    steer: p.steer as number,
    wheelRots: p.wheelRots as [number, number, number, number],
    rpm: p.rpm as number,
    gear: p.gear as number,
    isDrifting: p.isDrifting,
    surface,
    score: isValidNumber(p.score, 0, 1e8) ? p.score : undefined,
  };
}

/**
 * Validates an entity snapshot received from server in world_snapshot.
 * Note: EntitySnapshot does not contain seq, only physical state.
 */
export function validateEntitySnapshot(raw: unknown): EntitySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  if (!isValidNumber(p.time, 0, 1e15)) return null;
  if (!isValidVector3(p.pos, 2000)) return null;
  if (!isValidQuaternion(p.rot)) return null;
  if (!isValidVector3(p.linVel, 500)) return null;
  if (!isValidVector3(p.angVel, 200)) return null;
  if (!isValidNumber(p.steer, -2.5, 2.5)) return null;

  if (!Array.isArray(p.wheelRots) || p.wheelRots.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (!isValidNumber(p.wheelRots[i], -1e8, 1e8)) return null;
  }

  if (!isValidNumber(p.rpm, 0, 20000)) return null;
  if (!isValidNumber(p.gear, -2, 10)) return null;
  if (typeof p.isDrifting !== 'boolean') return null;

  const surface =
    typeof p.surface === 'string' && VALID_SURFACES.has(p.surface as SurfaceType)
      ? (p.surface as SurfaceType)
      : 'tarmac';

  return {
    time: p.time,
    pos: p.pos as [number, number, number],
    rot: p.rot as [number, number, number, number],
    linVel: p.linVel as [number, number, number],
    angVel: p.angVel as [number, number, number],
    steer: p.steer,
    wheelRots: p.wheelRots as [number, number, number, number],
    rpm: p.rpm,
    gear: p.gear,
    isDrifting: p.isDrifting,
    surface,
    score: isValidNumber(p.score, 0, 1e8) ? p.score : undefined,
  };
}

/**
 * Validates a client-originated network message.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = msg.type;

  if (type === 'request_rooms') {
    return { type: 'request_rooms' };
  }

  if (type === 'create_room') {
    const name = sanitizeRoomName(msg.name);
    if (!name) return null;
    const nick = sanitizeNickname(msg.nickname);
    if (!nick) return null;
    const vehicleId = isValidVehicleId(msg.vehicleId) ? (msg.vehicleId as string) : 'zephyr_wr4';
    const rawLevelId = typeof msg.levelId === 'string' ? msg.levelId : 'level1_island';
    const levelId = VALID_LEVEL_IDS.has(rawLevelId) ? rawLevelId : 'level1_island';

    let gameMode: GameMode =
      typeof msg.gameMode === 'string' && VALID_GAME_MODES.has(msg.gameMode as GameMode)
        ? (msg.gameMode as GameMode)
        : 'freeroam';

    // Enforce map compatibility: gymkhana_blitz on gymkhana, timeattack on circuit/rally, tag on all maps
    if (levelId === 'level5_gymkhana') {
      if (gameMode !== 'freeroam' && gameMode !== 'gymkhana_blitz' && gameMode !== 'tag') {
        gameMode = 'freeroam';
      }
    } else {
      if (gameMode !== 'freeroam' && gameMode !== 'timeattack' && gameMode !== 'tag') {
        gameMode = 'freeroam';
      }
    }

    return {
      type: 'create_room',
      name,
      nickname: nick,
      vehicleId,
      levelId,
      gameMode,
    };
  }

  if (type === 'join_room') {
    if (typeof msg.roomId !== 'string' || msg.roomId.length === 0) return null;
    const nick = sanitizeNickname(msg.nickname);
    if (!nick) return null;
    const vehicleId = isValidVehicleId(msg.vehicleId) ? (msg.vehicleId as string) : 'zephyr_wr4';
    return {
      type: 'join_room',
      roomId: msg.roomId as string,
      nickname: nick,
      vehicleId,
    };
  }

  if (type === 'delete_room') {
    if (typeof msg.roomId !== 'string' || msg.roomId.length === 0) return null;
    return { type: 'delete_room', roomId: msg.roomId as string };
  }

  if (type === 'leave_room') {
    if (typeof msg.roomId !== 'string' || msg.roomId.length === 0) return null;
    return { type: 'leave_room', roomId: msg.roomId as string };
  }

  // Legacy fallback
  if (type === 'join_lobby') {
    const nick = sanitizeNickname(msg.nickname);
    if (!nick) return null;
    const vehicleId = isValidVehicleId(msg.vehicleId) ? (msg.vehicleId as string) : 'zephyr_wr4';
    const levelId = typeof msg.levelId === 'string' && msg.levelId.length > 0 ? msg.levelId : 'level5_gymkhana';
    return {
      type: 'join_lobby',
      nickname: nick,
      vehicleId,
      levelId,
    };
  }

  if (type === 'leave_lobby') {
    return { type: 'leave_lobby' };
  }

  if (type === 'telemetry') {
    const payload = validateTelemetryPayload(msg.payload);
    if (!payload) return null;
    return { type: 'telemetry', payload };
  }

  if (type === 'ping') {
    if (!isValidNumber(msg.clientTime, 0, 1e15)) return null;
    return { type: 'ping', clientTime: msg.clientTime as number };
  }

  if (type === 'client_ready') {
    return { type: 'client_ready' };
  }

  if (type === 'tag_touch') {
    if (typeof msg.targetPlayerId !== 'string' || msg.targetPlayerId.length === 0) return null;
    return { type: 'tag_touch', targetPlayerId: msg.targetPlayerId as string };
  }

  return null;
}

export function isValidRoomSummary(val: unknown): val is RoomSummary {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.hostId === 'string' &&
    typeof r.hostNickname === 'string' &&
    typeof r.levelId === 'string' &&
    typeof r.gameMode === 'string' &&
    VALID_GAME_MODES.has(r.gameMode as GameMode) &&
    isValidNumber(r.playerCount, 0, 100) &&
    isValidNumber(r.maxPlayers, 1, 100) &&
    isValidNumber(r.createdAt, 0, 1e15)
  );
}

export function isValidRemotePlayer(val: unknown): val is RemotePlayerSummary {
  if (!val || typeof val !== 'object') return false;
  const p = val as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.nickname === 'string' &&
    typeof p.vehicleId === 'string' &&
    isValidNumber(p.slotIndex, 0, 100) &&
    isValidNumber(p.ping, 0, 1e6)
  );
}

/**
 * Validates a server-originated network message received by client.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = msg.type;

  if (type === 'rooms_list') {
    if (!Array.isArray(msg.rooms)) return null;
    const rooms: RoomSummary[] = [];
    for (const r of msg.rooms) {
      if (isValidRoomSummary(r)) {
        rooms.push(r);
      }
    }
    return {
      type: 'rooms_list',
      rooms,
    };
  }

  if (type === 'room_created') {
    if (!isValidRoomSummary(msg.room)) return null;
    return {
      type: 'room_created',
      room: msg.room,
    };
  }

  if (type === 'room_joined') {
    if (typeof msg.selfId !== 'string' || !isValidRoomSummary(msg.room) || !Array.isArray(msg.players)) {
      return null;
    }
    const players: RemotePlayerSummary[] = [];
    for (const p of msg.players) {
      if (isValidRemotePlayer(p)) {
        players.push(p);
      }
    }
    return {
      type: 'room_joined',
      selfId: msg.selfId,
      room: msg.room,
      players,
    };
  }

  if (type === 'room_deleted') {
    if (typeof msg.roomId !== 'string') return null;
    return {
      type: 'room_deleted',
      roomId: msg.roomId,
      reason: typeof msg.reason === 'string' ? msg.reason : 'closed',
    };
  }

  if (type === 'lobby_joined') {
    if (typeof msg.selfId !== 'string' || typeof msg.room !== 'string' || !Array.isArray(msg.players)) {
      return null;
    }
    const players: RemotePlayerSummary[] = [];
    for (const p of msg.players) {
      if (isValidRemotePlayer(p)) {
        players.push(p);
      }
    }
    return {
      type: 'lobby_joined',
      selfId: msg.selfId,
      room: msg.room,
      players,
    };
  }

  if (type === 'player_joined') {
    if (!isValidRemotePlayer(msg.player)) return null;
    return {
      type: 'player_joined',
      player: msg.player,
    };
  }

  if (type === 'player_left') {
    if (typeof msg.playerId !== 'string') return null;
    return {
      type: 'player_left',
      playerId: msg.playerId,
      reason: typeof msg.reason === 'string' ? msg.reason : 'disconnected',
    };
  }

  if (type === 'world_snapshot') {
    if (!isValidNumber(msg.serverTime, 0, 1e15) || !msg.entities || typeof msg.entities !== 'object') {
      return null;
    }
    const rawEntities = msg.entities as Record<string, unknown>;
    const entities: Record<string, EntitySnapshot> = {};
    for (const key in rawEntities) {
      const snap = validateEntitySnapshot(rawEntities[key]);
      if (snap) {
        entities[key] = snap;
      }
    }
    return {
      type: 'world_snapshot',
      serverTime: msg.serverTime,
      entities,
    };
  }

  if (type === 'pong') {
    if (!isValidNumber(msg.clientTime, 0, 1e15) || !isValidNumber(msg.serverTime, 0, 1e15)) {
      return null;
    }
    return {
      type: 'pong',
      clientTime: msg.clientTime,
      serverTime: msg.serverTime,
    };
  }

  if (type === 'gymkhana_spectate') {
    if (typeof msg.isSpectator !== 'boolean') return null;
    const targetId = typeof msg.targetId === 'string' ? msg.targetId : null;
    const targetNickname = typeof msg.targetNickname === 'string' ? msg.targetNickname : null;
    const roundTimeRemaining = isValidNumber(msg.roundTimeRemaining, 0, 3600) ? msg.roundTimeRemaining : 60;
    return {
      type: 'gymkhana_spectate',
      isSpectator: msg.isSpectator,
      targetId,
      targetNickname,
      roundTimeRemaining,
    };
  }

  if (type === 'gymkhana_round_ended') {
    const intermissionRemaining = isValidNumber(msg.intermissionRemaining, 0, 3600)
      ? msg.intermissionRemaining
      : 20;
    if (!Array.isArray(msg.leaderboard)) return null;
    const leaderboard: Array<{ id: string; nickname: string; vehicleId: string; score: number }> = [];
    for (const entry of msg.leaderboard as Array<Record<string, unknown>>) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.nickname === 'string' &&
        typeof entry.vehicleId === 'string' &&
        isValidNumber(entry.score, 0, 1e9)
      ) {
        leaderboard.push({
          id: entry.id,
          nickname: entry.nickname,
          vehicleId: entry.vehicleId,
          score: entry.score,
        });
      }
    }
    return {
      type: 'gymkhana_round_ended',
      intermissionRemaining,
      leaderboard,
    };
  }

  if (type === 'gymkhana_round_start') {
    const duration = isValidNumber(msg.duration, 1, 3600) ? msg.duration : 60;
    const countdown = isValidNumber(msg.countdown, 0, 10) ? msg.countdown : 3;
    return {
      type: 'gymkhana_round_start',
      duration,
      countdown,
    };
  }

  if (type === 'tag_match_countdown') {
    const countdown = isValidNumber(msg.countdown, 0, 60) ? msg.countdown : 15;
    const assignedSpawnIndex = isValidNumber(msg.assignedSpawnIndex, 0, 11) ? msg.assignedSpawnIndex : 0;
    return {
      type: 'tag_match_countdown',
      countdown,
      assignedSpawnIndex,
    };
  }

  if (type === 'tag_match_start') {
    const roundDuration = isValidNumber(msg.roundDuration, 1, 3600) ? msg.roundDuration : 180;
    const taggerId = typeof msg.taggerId === 'string' ? msg.taggerId : '';
    const assignedSpawnIndex = isValidNumber(msg.assignedSpawnIndex, 0, 11) ? msg.assignedSpawnIndex : 0;
    return {
      type: 'tag_match_start',
      roundDuration,
      taggerId,
      assignedSpawnIndex,
    };
  }

  if (type === 'tag_passed') {
    const oldTaggerId = typeof msg.oldTaggerId === 'string' ? msg.oldTaggerId : '';
    const newTaggerId = typeof msg.newTaggerId === 'string' ? msg.newTaggerId : '';
    const freezeDurationMs = isValidNumber(msg.freezeDurationMs, 0, 30000) ? msg.freezeDurationMs : 2500;
    return {
      type: 'tag_passed',
      oldTaggerId,
      newTaggerId,
      freezeDurationMs,
    };
  }

  if (type === 'tag_match_ended') {
    const intermissionRemaining = isValidNumber(msg.intermissionRemaining, 0, 3600)
      ? msg.intermissionRemaining
      : 20;
    if (!Array.isArray(msg.leaderboard)) return null;
    const leaderboard: Array<{
      id: string;
      nickname: string;
      vehicleId: string;
      timeClean: number;
      tagsMade: number;
    }> = [];
    for (const entry of msg.leaderboard as Array<Record<string, unknown>>) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.nickname === 'string' &&
        typeof entry.vehicleId === 'string' &&
        isValidNumber(entry.timeClean, 0, 1e9) &&
        isValidNumber(entry.tagsMade, 0, 1e6)
      ) {
        leaderboard.push({
          id: entry.id,
          nickname: entry.nickname,
          vehicleId: entry.vehicleId,
          timeClean: entry.timeClean,
          tagsMade: entry.tagsMade,
        });
      }
    }
    return {
      type: 'tag_match_ended',
      intermissionRemaining,
      leaderboard,
    };
  }

  if (type === 'tag_spectate') {
    if (typeof msg.isSpectator !== 'boolean') return null;
    const targetId = typeof msg.targetId === 'string' ? msg.targetId : null;
    const targetNickname = typeof msg.targetNickname === 'string' ? msg.targetNickname : null;
    const roundTimeRemaining = isValidNumber(msg.roundTimeRemaining, 0, 3600) ? msg.roundTimeRemaining : 180;
    return {
      type: 'tag_spectate',
      isSpectator: msg.isSpectator,
      targetId,
      targetNickname,
      roundTimeRemaining,
    };
  }

  if (type === 'version_mismatch') {
    return {
      type: 'version_mismatch',
      serverVersion: typeof msg.serverVersion === 'string' ? msg.serverVersion : 'unknown',
      clientVersion: typeof msg.clientVersion === 'string' ? msg.clientVersion : 'unknown',
      message: typeof msg.message === 'string' ? msg.message : 'Version mismatch detected. Please update your game.',
    };
  }

  if (type === 'error') {
    return {
      type: 'error',
      code: typeof msg.code === 'string' ? msg.code : 'UNKNOWN',
      message: typeof msg.message === 'string' ? msg.message : 'An error occurred',
    };
  }

  return null;
}
