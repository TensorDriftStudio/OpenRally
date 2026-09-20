import type { WebSocket } from 'ws';
import type {
  EntitySnapshot,
  GameMode,
  RemotePlayerSummary,
  RoomSummary,
  ServerMessage,
  VehicleTelemetryPayload,
  TagLeaderboardEntry,
} from '../types.js';

export const DEFAULT_MAX_PLAYERS = 12;
export const BROADCAST_INTERVAL_MS = 33; // 30Hz broadcast rate (aligned with client telemetry rate)
export const HEARTBEAT_TIMEOUT_MS = 6000;

export interface PlayerSession {
  id: string;
  ws: WebSocket;
  nickname: string;
  vehicleId: string;
  slotIndex: number;
  lastPing: number;
  lastSeen: number;
  latestSnapshot: EntitySnapshot | null;
  score: number;
  isSpectator: boolean;
  spectateTargetId: string | null;

  // Rally Tag Mode Session Properties
  timeClean: number;
  tagsMade: number;
  isReady: boolean;
  tagGraceUntil: number;
  assignedTagSpawnIndex: number;
}

export interface GameRoomOptions {
  id: string;
  name: string;
  hostId: string;
  hostNickname: string;
  levelId?: string;
  gameMode?: GameMode;
  isPersistent?: boolean;
  maxPlayers?: number;
}

export class GameRoom {
  public readonly id: string;
  public readonly name: string;
  public readonly hostId: string;
  public readonly hostNickname: string;
  public readonly levelId: string;
  public readonly gameMode: GameMode;
  public readonly isPersistent: boolean;
  public readonly maxPlayers: number;
  public readonly createdAt: number;

  public roundPhase: 'active' | 'intermission' = 'active';
  public roundTimer: number = 60.0;

  // Rally Tag Mode Match State
  public tagPhase: 'waiting' | 'countdown' | 'active' | 'intermission' = 'waiting';
  public tagCountdownTimer: number = 15.0;
  public tagRoundTimer: number = 180.0;
  public tagIntermissionTimer: number = 20.0;
  public taggerId: string | null = null;
  public tagTaggerFrozenUntil: number = 0;
  private readonly usedTagSpawnSlots: Set<number> = new Set();
  private tagProximityInterval: NodeJS.Timeout | null = null;

  public readonly players: Map<string, PlayerSession> = new Map();
  private readonly usedSlots: Set<number> = new Set();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private matchLoopInterval: NodeJS.Timeout | null = null;
  private onPlayerLeftCallback: ((roomId: string, playerId: string, isHost: boolean) => void) | null = null;

  constructor(options: GameRoomOptions) {
    this.id = options.id;
    this.name = options.name;
    this.hostId = options.hostId;
    this.hostNickname = options.hostNickname;
    this.levelId = options.levelId ?? 'level5_gymkhana';
    this.gameMode = options.gameMode ?? 'freeroam';
    this.isPersistent = !!options.isPersistent;
    this.maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    this.createdAt = Date.now();

    this.startBroadcastLoop();
    this.startHeartbeatMonitor();
    this.startGymkhanaMatchLoop();
    this.startTagMatchLoop();
  }

  public setOnPlayerLeftCallback(cb: (roomId: string, playerId: string, isHost: boolean) => void): void {
    this.onPlayerLeftCallback = cb;
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  public getPlayer(id: string): PlayerSession | undefined {
    return this.players.get(id);
  }

  public isHost(playerId: string): boolean {
    return this.hostId === playerId;
  }

  public getSummary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      hostNickname: this.hostNickname,
      levelId: this.levelId,
      gameMode: this.gameMode,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
      isPersistent: this.isPersistent,
    };
  }

  /**
   * Registers a new player into the room.
   */
  public join(ws: WebSocket, nickname: string, vehicleId: string, customPlayerId?: string): PlayerSession | null {
    if (this.players.size >= this.maxPlayers) {
      this.sendToWs(ws, {
        type: 'error',
        code: 'ROOM_FULL',
        message: `Room "${this.name}" is currently full (max ${this.maxPlayers} drivers).`,
      });
      return null;
    }

    // Allocate lowest available slot
    let slotIndex = 0;
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!this.usedSlots.has(i)) {
        slotIndex = i;
        break;
      }
    }
    this.usedSlots.add(slotIndex);

    // Allocate safe static tag spawn index (0..11)
    let tagSlotIndex = 0;
    for (let i = 0; i < 12; i++) {
      if (!this.usedTagSpawnSlots.has(i)) {
        tagSlotIndex = i;
        break;
      }
    }
    this.usedTagSpawnSlots.add(tagSlotIndex);

    const playerId = customPlayerId || `p_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const session: PlayerSession = {
      id: playerId,
      ws,
      nickname,
      vehicleId,
      slotIndex,
      lastPing: 0,
      lastSeen: now,
      latestSnapshot: null,
      score: 0,
      isSpectator: false,
      spectateTargetId: null,
      timeClean: 0,
      tagsMade: 0,
      isReady: false,
      tagGraceUntil: 0,
      assignedTagSpawnIndex: tagSlotIndex,
    };

    this.players.set(playerId, session);

    // Send room_joined and lobby_joined state to the newly connected driver
    const playerSummaries: RemotePlayerSummary[] = [];
    for (const p of this.players.values()) {
      playerSummaries.push({
        id: p.id,
        nickname: p.nickname,
        vehicleId: p.vehicleId,
        slotIndex: p.slotIndex,
        ping: p.lastPing,
      });
    }

    const roomSummary = this.getSummary();

    // 1. Modern room_joined
    this.sendToWs(ws, {
      type: 'room_joined',
      selfId: playerId,
      room: roomSummary,
      players: playerSummaries,
    });

    // 2. Backwards-compatible lobby_joined
    this.sendToWs(ws, {
      type: 'lobby_joined',
      selfId: playerId,
      room: this.id,
      players: playerSummaries,
    });

    // 3. Gymkhana Blitz Mid-Match Spectator Logic
    if (this.gameMode === 'gymkhana_blitz') {
      if (this.roundPhase === 'active' && this.roundTimer < 57) {
        // Round is already underway! New player waits until the current 1-minute round ends
        const activeCandidates = Array.from(this.players.values()).filter(
          (p) => !p.isSpectator && p.id !== playerId
        );

        if (activeCandidates.length > 0) {
          session.isSpectator = true;
          const randomTarget = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
          session.spectateTargetId = randomTarget.id;

          this.sendToWs(ws, {
            type: 'gymkhana_spectate',
            isSpectator: true,
            targetId: randomTarget.id,
            targetNickname: randomTarget.nickname,
            roundTimeRemaining: Math.max(1, Math.round(this.roundTimer)),
          });
          console.log(`[GameRoom:${this.id}] Late joiner ${nickname} (${playerId}) spectating ${randomTarget.nickname} (${randomTarget.id}). ${Math.round(this.roundTimer)}s remaining.`);
        }
      } else if (this.roundPhase === 'intermission') {
        // Intermission is in progress: player waits for the new round to begin
        session.isSpectator = true;
        const leaderboard = Array.from(this.players.values())
          .filter((p) => p.id !== playerId)
          .map((p) => ({
            id: p.id,
            nickname: p.nickname,
            vehicleId: p.vehicleId,
            score: p.score,
          }))
          .sort((a, b) => b.score - a.score);

        this.sendToWs(ws, {
          type: 'gymkhana_round_ended',
          intermissionRemaining: Math.max(1, Math.round(this.roundTimer)),
          leaderboard,
        });
      }
    }

    // 4. Rally Tag Matchmaking & Spectator Logic
    if (this.gameMode === 'tag') {
      if (this.tagPhase === 'waiting') {
        if (this.players.size >= 2) {
          this.tagPhase = 'countdown';
          this.tagCountdownTimer = 15.0;
          this.broadcastTagCountdown(15);
        } else {
          this.sendToWs(ws, {
            type: 'tag_match_countdown',
            countdown: 0,
            assignedSpawnIndex: tagSlotIndex,
          });
        }
      } else if (this.tagPhase === 'countdown') {
        this.sendToWs(ws, {
          type: 'tag_match_countdown',
          countdown: Math.max(1, Math.round(this.tagCountdownTimer)),
          assignedSpawnIndex: tagSlotIndex,
        });
      } else if (this.tagPhase === 'active') {
        const activeCandidates = Array.from(this.players.values()).filter(
          (p) => !p.isSpectator && p.id !== playerId
        );
        if (activeCandidates.length > 0) {
          session.isSpectator = true;
          const randomTarget = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
          session.spectateTargetId = randomTarget.id;
          this.sendToWs(ws, {
            type: 'tag_spectate',
            isSpectator: true,
            targetId: randomTarget.id,
            targetNickname: randomTarget.nickname,
            roundTimeRemaining: Math.max(1, Math.round(this.tagRoundTimer)),
          });
          console.log(`[GameRoom:${this.id}] Tag late joiner ${nickname} (${playerId}) spectating ${randomTarget.nickname}.`);
        }
      } else if (this.tagPhase === 'intermission') {
        session.isSpectator = true;
        const leaderboard = this.getTagLeaderboard();
        this.sendToWs(ws, {
          type: 'tag_match_ended',
          intermissionRemaining: Math.max(1, Math.round(this.tagIntermissionTimer)),
          leaderboard,
        });
      }
    }

    // Broadcast player_joined to existing drivers
    const newPlayerSummary: RemotePlayerSummary = {
      id: playerId,
      nickname,
      vehicleId,
      slotIndex,
      ping: 0,
    };

    this.broadcast(
      {
        type: 'player_joined',
        player: newPlayerSummary,
      },
      playerId
    );

    console.log(`[GameRoom:${this.id}] Driver ${nickname} (${playerId}) joined slot ${slotIndex}. Total: ${this.players.size}`);
    return session;
  }

  /**
   * Handles incoming vehicle telemetry from a player session.
   */
  public handleTelemetry(playerId: string, payload: VehicleTelemetryPayload): void {
    const session = this.players.get(playerId);
    if (!session) return;

    session.lastSeen = Date.now();
    if (typeof payload.score === 'number' && !session.isSpectator) {
      session.score = payload.score;
    }

    session.latestSnapshot = {
      time: payload.time,
      pos: payload.pos,
      rot: payload.rot,
      linVel: payload.linVel,
      angVel: payload.angVel,
      steer: payload.steer,
      wheelRots: payload.wheelRots,
      rpm: payload.rpm,
      gear: payload.gear,
      isDrifting: payload.isDrifting,
      surface: payload.surface,
      score: payload.score,
    };
  }

  /**
   * Responds to heartbeat ping from a player.
   */
  public handlePing(playerId: string, clientTime: number): void {
    const session = this.players.get(playerId);
    if (!session) return;

    session.lastSeen = Date.now();
    this.sendToWs(session.ws, {
      type: 'pong',
      clientTime,
      serverTime: Date.now(),
    });
  }

  /**
   * Removes a player from the room and frees their spawn slot.
   */
  public leave(playerId: string, reason: string = 'client_left'): void {
    const session = this.players.get(playerId);
    if (!session) return;

    const isHost = this.isHost(playerId);
    this.usedSlots.delete(session.slotIndex);
    this.usedTagSpawnSlots.delete(session.assignedTagSpawnIndex);
    this.players.delete(playerId);

    // Reassign any spectators watching this leaving driver to another active player
    if (this.gameMode === 'gymkhana_blitz' && this.roundPhase === 'active') {
      const activeCandidates = Array.from(this.players.values()).filter(
        (p) => !p.isSpectator && p.id !== playerId
      );

      for (const p of this.players.values()) {
        if (p.isSpectator && p.spectateTargetId === playerId) {
          if (activeCandidates.length > 0) {
            const nextTarget = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
            p.spectateTargetId = nextTarget.id;
            this.sendToWs(p.ws, {
              type: 'gymkhana_spectate',
              isSpectator: true,
              targetId: nextTarget.id,
              targetNickname: nextTarget.nickname,
              roundTimeRemaining: Math.max(1, Math.round(this.roundTimer)),
            });
          } else {
            p.spectateTargetId = null;
          }
        }
      }
    }

    // Rally Tag mode player departure handling
    if (this.gameMode === 'tag') {
      if (this.tagPhase === 'countdown') {
        if (this.players.size < 2) {
          this.tagPhase = 'waiting';
          this.tagCountdownTimer = 15.0;
          this.broadcastTagCountdown(0);
        }
      } else if (this.tagPhase === 'active') {
        const remainingActive = Array.from(this.players.values()).filter((p) => !p.isSpectator && p.id !== playerId);
        if (remainingActive.length < 2) {
          this.tagPhase = 'waiting';
          this.tagRoundTimer = 180.0;
          this.taggerId = null;
          this.broadcastTagCountdown(0);
        } else if (this.taggerId === playerId) {
          const nextTagger = remainingActive[Math.floor(Math.random() * remainingActive.length)];
          this.passTag(playerId, nextTagger.id, 0);
        }

        for (const p of this.players.values()) {
          if (p.isSpectator && p.spectateTargetId === playerId) {
            if (remainingActive.length > 0) {
              const nextTarget = remainingActive[Math.floor(Math.random() * remainingActive.length)];
              p.spectateTargetId = nextTarget.id;
              this.sendToWs(p.ws, {
                type: 'tag_spectate',
                isSpectator: true,
                targetId: nextTarget.id,
                targetNickname: nextTarget.nickname,
                roundTimeRemaining: Math.max(1, Math.round(this.tagRoundTimer)),
              });
            } else {
              p.spectateTargetId = null;
            }
          }
        }
      }
    }

    this.broadcast({
      type: 'player_left',
      playerId,
      reason,
    });

    console.log(`[GameRoom:${this.id}] Driver ${session.nickname} (${playerId}) left (${reason}). Total: ${this.players.size}`);

    if (this.onPlayerLeftCallback) {
      this.onPlayerLeftCallback(this.id, playerId, isHost);
    }
  }

  /**
   * Cleans up room resources, intervals, and notifies remaining players.
   */
  public destroy(reason: string = 'room_closed'): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.matchLoopInterval) {
      clearInterval(this.matchLoopInterval);
      this.matchLoopInterval = null;
    }
    if (this.tagProximityInterval) {
      clearInterval(this.tagProximityInterval);
      this.tagProximityInterval = null;
    }

    // Broadcast room_deleted to all currently connected players
    const deleteMsg: ServerMessage = {
      type: 'room_deleted',
      roomId: this.id,
      reason,
    };
    this.broadcast(deleteMsg);

    this.players.clear();
    this.usedSlots.clear();
    this.usedTagSpawnSlots.clear();
    this.onPlayerLeftCallback = null;
  }

  private startGymkhanaMatchLoop(): void {
    if (this.gameMode !== 'gymkhana_blitz') return;

    this.roundPhase = 'active';
    this.roundTimer = 60.0;

    this.matchLoopInterval = setInterval(() => {
      // If room is empty, keep timer primed at 60s
      if (this.players.size === 0) {
        this.roundPhase = 'active';
        this.roundTimer = 60.0;
        return;
      }

      this.roundTimer -= 1.0;

      if (this.roundPhase === 'active') {
        if (this.roundTimer <= 0) {
          // 60-second round finished! Transition to 20-second intermission
          this.roundPhase = 'intermission';
          this.roundTimer = 20.0;

          const leaderboard = Array.from(this.players.values())
            .filter((p) => !p.isSpectator)
            .map((p) => ({
              id: p.id,
              nickname: p.nickname,
              vehicleId: p.vehicleId,
              score: p.score,
            }))
            .sort((a, b) => b.score - a.score);

          this.broadcast({
            type: 'gymkhana_round_ended',
            intermissionRemaining: 20,
            leaderboard,
          });

          console.log(
            `[GameRoom:${this.id}] Gymkhana Blitz round finished. Intermission started (20s). Leaderboard: ${leaderboard.length} drivers.`
          );
        }
      } else if (this.roundPhase === 'intermission') {
        if (this.roundTimer <= 0) {
          // 20-second intermission finished! Reset and start new Gymkhana Blitz round
          this.roundPhase = 'active';
          this.roundTimer = 60.0;

          for (const session of this.players.values()) {
            session.score = 0;
            session.isSpectator = false;
            session.spectateTargetId = null;
          }

          this.broadcast({
            type: 'gymkhana_round_start',
            duration: 60,
            countdown: 3,
          });

          console.log(
            `[GameRoom:${this.id}] Gymkhana Blitz new round started for ${this.players.size} drivers.`
          );
        }
      }
    }, 1000);
  }

  public handleClientReady(playerId: string): void {
    const session = this.players.get(playerId);
    if (!session) return;
    session.isReady = true;
  }

  public handleTagTouch(taggerCandidateId: string, targetPlayerId: string): void {
    if (this.gameMode !== 'tag' || this.tagPhase !== 'active') return;
    if (this.taggerId !== taggerCandidateId) return;
    if (Date.now() < this.tagTaggerFrozenUntil) return;

    const tagger = this.players.get(taggerCandidateId);
    const target = this.players.get(targetPlayerId);
    if (!tagger || !target || target.isSpectator) return;
    if (Date.now() < target.tagGraceUntil) return;

    // Validate distance using latest telemetry if available
    if (tagger.latestSnapshot && target.latestSnapshot) {
      const dx = tagger.latestSnapshot.pos[0] - target.latestSnapshot.pos[0];
      const dz = tagger.latestSnapshot.pos[2] - target.latestSnapshot.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 4.2) return; // Discard invalid client touch reports beyond threshold
    }

    this.passTag(taggerCandidateId, targetPlayerId, 2500);
  }

  public passTag(oldTaggerId: string, newTaggerId: string, freezeDurationMs: number = 2500): void {
    const oldSession = this.players.get(oldTaggerId);
    const newSession = this.players.get(newTaggerId);
    if (!newSession) return;

    const now = Date.now();
    if (oldSession) {
      oldSession.tagGraceUntil = now + 3000; // 3.0s anti-tag-back grace period
      oldSession.tagsMade += 1;
    }

    this.taggerId = newTaggerId;
    this.tagTaggerFrozenUntil = now + freezeDurationMs;

    this.broadcast({
      type: 'tag_passed',
      oldTaggerId,
      newTaggerId,
      freezeDurationMs,
    });

    console.log(
      `[GameRoom:${this.id}] Tag passed from ${oldSession?.nickname ?? oldTaggerId} to ${newSession.nickname} (${newTaggerId}). Freeze: ${freezeDurationMs}ms.`
    );
  }

  public getTagLeaderboard(): TagLeaderboardEntry[] {
    return Array.from(this.players.values())
      .filter((p) => !p.isSpectator)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        vehicleId: p.vehicleId,
        timeClean: p.timeClean,
        tagsMade: p.tagsMade,
      }))
      .sort((a, b) => b.timeClean - a.timeClean);
  }

  private broadcastTagCountdown(countdown: number): void {
    for (const p of this.players.values()) {
      this.sendToWs(p.ws, {
        type: 'tag_match_countdown',
        countdown,
        assignedSpawnIndex: p.assignedTagSpawnIndex,
      });
    }
  }

  private startTagMatchLoop(): void {
    if (this.gameMode !== 'tag') return;

    this.tagPhase = 'waiting';
    this.tagCountdownTimer = 15.0;
    this.tagRoundTimer = 180.0;
    this.tagIntermissionTimer = 20.0;
    this.taggerId = null;

    // 1. One-second match lifecycle loop
    this.matchLoopInterval = setInterval(() => {
      // Free roam waiting state: room has < 2 drivers
      if (this.tagPhase === 'waiting') {
        if (this.players.size >= 2) {
          this.tagPhase = 'countdown';
          this.tagCountdownTimer = 15.0;
          this.broadcastTagCountdown(15);
          console.log(`[GameRoom:${this.id}] Rally Tag: 2+ drivers joined. Starting 15s countdown.`);
        }
        return;
      }

      // Countdown phase (15s)
      if (this.tagPhase === 'countdown') {
        if (this.players.size < 2) {
          this.tagPhase = 'waiting';
          this.tagCountdownTimer = 15.0;
          this.broadcastTagCountdown(0);
          return;
        }

        this.tagCountdownTimer -= 1.0;
        this.broadcastTagCountdown(Math.max(0, Math.round(this.tagCountdownTimer)));

        if (this.tagCountdownTimer <= 0) {
          // Launch 3-minute round
          this.tagPhase = 'active';
          this.tagRoundTimer = 180.0;

          // Re-shuffle distinct spawn slots among all active players
          const activeSessions = Array.from(this.players.values());
          this.usedTagSpawnSlots.clear();
          for (let i = 0; i < activeSessions.length; i++) {
            const s = activeSessions[i];
            s.assignedTagSpawnIndex = i % 12;
            this.usedTagSpawnSlots.add(s.assignedTagSpawnIndex);
            s.isSpectator = false;
            s.spectateTargetId = null;
            s.timeClean = 0;
            s.tagsMade = 0;
            s.tagGraceUntil = 0;
          }

          // Pick random initial tagger
          const randomIndex = Math.floor(Math.random() * activeSessions.length);
          const initialTagger = activeSessions[randomIndex];
          this.taggerId = initialTagger.id;
          this.tagTaggerFrozenUntil = 0; // Initial tagger starts unfrozen

          for (const s of activeSessions) {
            this.sendToWs(s.ws, {
              type: 'tag_match_start',
              roundDuration: 180,
              taggerId: this.taggerId,
              assignedSpawnIndex: s.assignedTagSpawnIndex,
            });
          }

          console.log(
            `[GameRoom:${this.id}] Rally Tag 180s match launched with ${activeSessions.length} drivers. Initial Tagger: ${initialTagger.nickname} (${initialTagger.id}).`
          );
        }
        return;
      }

      // Active round phase (180s)
      if (this.tagPhase === 'active') {
        const activeCount = Array.from(this.players.values()).filter((p) => !p.isSpectator).length;
        if (activeCount < 2) {
          this.tagPhase = 'waiting';
          this.tagRoundTimer = 180.0;
          this.taggerId = null;
          this.broadcastTagCountdown(0);
          return;
        }

        this.tagRoundTimer -= 1.0;

        // Accumulate timeClean for every player who was NOT the tagger during this second
        for (const session of this.players.values()) {
          if (!session.isSpectator && session.id !== this.taggerId) {
            session.timeClean += 1;
          }
        }

        if (this.tagRoundTimer <= 0) {
          // 3-minute round finished! Transition to 20s intermission
          this.tagPhase = 'intermission';
          this.tagIntermissionTimer = 20.0;

          const leaderboard = this.getTagLeaderboard();
          this.broadcast({
            type: 'tag_match_ended',
            intermissionRemaining: 20,
            leaderboard,
          });

          console.log(
            `[GameRoom:${this.id}] Rally Tag round finished! Winner: ${leaderboard[0]?.nickname ?? 'None'} (${leaderboard[0]?.timeClean ?? 0}s clean).`
          );
        }
        return;
      }

      // Intermission phase (20s)
      if (this.tagPhase === 'intermission') {
        this.tagIntermissionTimer -= 1.0;
        if (this.tagIntermissionTimer <= 0) {
          if (this.players.size >= 2) {
            this.tagPhase = 'countdown';
            this.tagCountdownTimer = 15.0;
            this.broadcastTagCountdown(15);
          } else {
            this.tagPhase = 'waiting';
            this.broadcastTagCountdown(0);
          }
        }
      }
    }, 1000);

    // 2. High-frequency (20Hz / 50ms) server-authoritative proximity hit detection
    this.tagProximityInterval = setInterval(() => {
      if (this.tagPhase !== 'active' || !this.taggerId) return;
      if (Date.now() < this.tagTaggerFrozenUntil) return;

      const tagger = this.players.get(this.taggerId);
      if (!tagger || tagger.isSpectator || !tagger.latestSnapshot) return;

      const now = Date.now();
      const taggerPos = tagger.latestSnapshot.pos;

      for (const target of this.players.values()) {
        if (target.id === this.taggerId || target.isSpectator || !target.latestSnapshot) continue;
        if (now < target.tagGraceUntil) continue;

        const targetPos = target.latestSnapshot.pos;
        const dx = taggerPos[0] - targetPos[0];
        const dz = taggerPos[2] - targetPos[2];
        const dist = Math.hypot(dx, dz);

        // 3.2m vehicle collision radius threshold
        if (dist <= 3.2) {
          this.passTag(this.taggerId, target.id, 2500);
          break;
        }
      }
    }, 50);
  }

  private startBroadcastLoop(): void {
    this.broadcastInterval = setInterval(() => {
      if (this.players.size === 0) return;

      const entities: Record<string, EntitySnapshot> = {};
      for (const [id, session] of this.players.entries()) {
        if (session.latestSnapshot && !session.isSpectator) {
          entities[id] = session.latestSnapshot;
        }
      }

      if (Object.keys(entities).length === 0) return;

      const snapshotMsg: ServerMessage = {
        type: 'world_snapshot',
        serverTime: Date.now(),
        entities,
      };

      const serialized = JSON.stringify(snapshotMsg);
      for (const session of this.players.values()) {
        if (session.ws.readyState === 1 /* OPEN */) {
          session.ws.send(serialized);
        }
      }
    }, BROADCAST_INTERVAL_MS);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadPlayers: string[] = [];

      for (const [id, session] of this.players.entries()) {
        if (now - session.lastSeen > HEARTBEAT_TIMEOUT_MS) {
          deadPlayers.push(id);
        }
      }

      for (const id of deadPlayers) {
        this.leave(id, 'timeout');
      }
    }, 2000);
  }

  public broadcast(msg: ServerMessage, exceptPlayerId?: string): void {
    const serialized = JSON.stringify(msg);
    for (const [id, session] of this.players.entries()) {
      if (id === exceptPlayerId) continue;
      if (session.ws.readyState === 1 /* OPEN */) {
        session.ws.send(serialized);
      }
    }
  }

  public sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }
}
