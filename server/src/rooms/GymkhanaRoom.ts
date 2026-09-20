import type { WebSocket } from 'ws';
import type {
  EntitySnapshot,
  RemotePlayerSummary,
  ServerMessage,
  VehicleTelemetryPayload,
} from '../types.js';

export const MAX_PLAYERS = 12;
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
}

export class GymkhanaRoom {
  public readonly id: string = 'gymkhana_freeroam';
  public readonly players: Map<string, PlayerSession> = new Map();
  private readonly usedSlots: Set<number> = new Set();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startBroadcastLoop();
    this.startHeartbeatMonitor();
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

  /**
   * Registers a new player into the Gymkhana Arena room.
   */
  public join(ws: WebSocket, nickname: string, vehicleId: string): PlayerSession | null {
    if (this.players.size >= MAX_PLAYERS) {
      this.sendToWs(ws, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Gymkhana Arena is currently full (max 12 drivers).',
      });
      return null;
    }

    // Allocate lowest available slot
    let slotIndex = 0;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!this.usedSlots.has(i)) {
        slotIndex = i;
        break;
      }
    }
    this.usedSlots.add(slotIndex);

    const playerId = `p_${Math.random().toString(36).substring(2, 9)}`;
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
    };

    this.players.set(playerId, session);

    // Send lobby_joined state to the newly connected driver
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

    this.sendToWs(ws, {
      type: 'lobby_joined',
      selfId: playerId,
      room: this.id,
      players: playerSummaries,
    });

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

    console.log(`[GymkhanaRoom] Driver ${nickname} (${playerId}) joined slot ${slotIndex}. Total: ${this.players.size}`);
    return session;
  }

  /**
   * Handles incoming vehicle telemetry from a player session.
   */
  public handleTelemetry(playerId: string, payload: VehicleTelemetryPayload): void {
    const session = this.players.get(playerId);
    if (!session) return;

    session.lastSeen = Date.now();
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

    this.usedSlots.delete(session.slotIndex);
    this.players.delete(playerId);

    this.broadcast({
      type: 'player_left',
      playerId,
      reason,
    });

    console.log(`[GymkhanaRoom] Driver ${session.nickname} (${playerId}) left (${reason}). Total: ${this.players.size}`);
  }

  public destroy(): void {
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.players.clear();
    this.usedSlots.clear();
  }

  private startBroadcastLoop(): void {
    this.broadcastInterval = setInterval(() => {
      if (this.players.size === 0) return;

      const entities: Record<string, EntitySnapshot> = {};
      for (const [id, session] of this.players.entries()) {
        if (session.latestSnapshot) {
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

  private broadcast(msg: ServerMessage, exceptPlayerId?: string): void {
    const serialized = JSON.stringify(msg);
    for (const [id, session] of this.players.entries()) {
      if (id === exceptPlayerId) continue;
      if (session.ws.readyState === 1 /* OPEN */) {
        session.ws.send(serialized);
      }
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }
}
