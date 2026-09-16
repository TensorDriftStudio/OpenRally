import type {
  ClientMessage,
  ServerMessage,
  VehicleTelemetryPayload,
} from '@/types/network';
import type { GameMode } from '@/types/game';
import { parseServerMessage } from './packetValidator';
import { SnapshotRingBuffer } from './snapshotRingBuffer';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { useGameStore } from '@/store/gameStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useTagStore } from '@/store/tagStore';

export const TELEMETRY_SEND_INTERVAL_MS = 33; // ~30Hz
const PING_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

export const DEFAULT_REMOTE_WS_URL = 'wss://openrally.tensordrift.eu/ws';

/**
 * Resolves the WebSocket URL depending on deployment environment, mobile platform, and query parameters.
 * Connects directly to the dedicated remote server for Android builds and local web environments by default,
 * while respecting explicit overrides (?ws=local, ?ws=remote, ?ws=url) and VITE_WS_URL env variables.
 */
export function getWebSocketEndpoint(): string {
  // 1. Environment variable override if provided at build or runtime
  const envWs = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WS_URL;
  if (envWs) {
    return envWs;
  }

  if (typeof window === 'undefined') {
    return DEFAULT_REMOTE_WS_URL;
  }

  // 2. Explicit override via query param ?ws=...
  const urlParams = new URLSearchParams(window.location.search);
  const explicitWs = urlParams.get('ws');
  if (explicitWs) {
    if (explicitWs === 'local') {
      return `ws://${window.location.hostname || '127.0.0.1'}:3001`;
    }
    if (explicitWs === 'remote') {
      return DEFAULT_REMOTE_WS_URL;
    }
    return explicitWs;
  }

  // 3. If running on a remote web domain behind HTTPS reverse proxy (excluding localhost in Capacitor / local dev)
  const isLocalHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1';

  if (window.location.protocol === 'https:' && !isLocalHost) {
    return `wss://${window.location.host}/ws`;
  }

  // 4. Default for Android (Capacitor localhost) and local dev: connect directly to dedicated remote server
  return DEFAULT_REMOTE_WS_URL;
}

/**
 * Enterprise-grade WebSocket Network Client managing session lifecycle,
 * heartbeat telemetry, exponential backoff reconnection, and entity ring buffers.
 */
export class NetworkClient {
  private ws: WebSocket | null = null;
  private endpoint: string = '';
  private reconnectAttempts: number = 0;
  private reconnectTimeoutId: number | null = null;
  private pingIntervalId: number | null = null;
  private lastTelemetrySendTime: number = 0;
  private sequence: number = 0;
  private intentionalDisconnect: boolean = false;

  /**
   * Dedicated zero-GC ring buffer per remote peer ID.
   */
  public readonly entityBuffers: Map<string, SnapshotRingBuffer> = new Map();

  /**
   * Retrieves or initializes the SnapshotRingBuffer for a given remote entity.
   */
  public getEntityBuffer(playerId: string): SnapshotRingBuffer {
    let buf = this.entityBuffers.get(playerId);
    if (!buf) {
      buf = new SnapshotRingBuffer();
      this.entityBuffers.set(playerId, buf);
    }
    return buf;
  }

  /**
   * Connects to the multiplayer relay server.
   */
  public connect(endpoint?: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalDisconnect = false;
    this.endpoint = endpoint || getWebSocketEndpoint();

    const store = useMultiplayerStore.getState();
    store.setStatus('connecting');
    store.setError(null);

    try {
      this.ws = new WebSocket(this.endpoint);
      this.ws.onopen = this.handleOpen;
      this.ws.onmessage = this.handleMessage;
      this.ws.onerror = this.handleError;
      this.ws.onclose = this.handleClose;
    } catch (err) {
      console.warn('[NetworkClient] Connection creation error:', err);
      store.setStatus('error');
      store.setError('Failed to establish connection');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnects cleanly and clears intervals and buffers.
   */
  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          const leaveMsg: ClientMessage = { type: 'leave_lobby' };
          this.ws.send(JSON.stringify(leaveMsg));
          this.ws.close(1000, 'User left');
        } else {
          this.ws.close();
        }
      } catch {
        // Suppress
      }
      this.ws = null;
    }

    this.entityBuffers.clear();
    useMultiplayerStore.getState().reset();
  }

  /**
   * Requests latest rooms directory from server.
   */
  public requestRooms(): void {
    const msg: ClientMessage = {
      type: 'request_rooms',
    };
    this.send(msg);
  }

  /**
   * Creates a new multiplayer room and joins as host.
   */
  public createRoom(
    name: string,
    nickname: string,
    vehicleId: string,
    levelId: string = 'level1_island',
    gameMode: GameMode = 'freeroam'
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }
    const msg: ClientMessage = {
      type: 'create_room',
      name,
      nickname,
      vehicleId,
      levelId,
      gameMode,
    };
    this.send(msg);
  }

  /**
   * Joins an existing room by its unique ID.
   */
  public joinRoom(roomId: string, nickname: string, vehicleId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }
    const msg: ClientMessage = {
      type: 'join_room',
      roomId,
      nickname,
      vehicleId,
    };
    this.send(msg);
  }

  /**
   * Deletes a room (host only).
   */
  public deleteRoom(roomId: string): void {
    const msg: ClientMessage = {
      type: 'delete_room',
      roomId,
    };
    this.send(msg);
  }

  /**
   * Leaves the current room and returns to lobby.
   */
  public leaveRoom(roomId: string): void {
    const msg: ClientMessage = {
      type: 'leave_room',
      roomId,
    };
    this.send(msg);
    useMultiplayerStore.getState().setCurrentRoom(null);
    useMultiplayerStore.getState().setPlayers([]);
    this.entityBuffers.clear();
    this.requestRooms();
  }

  /**
   * Sends join_lobby request once socket is open (legacy wrapper).
   */
  public joinLobby(nickname: string, vehicleId: string, _levelId: string = 'level5_gymkhana'): void {
    this.joinRoom('gymkhana_freeroam', nickname, vehicleId);
  }

  /**
   * Checks whether the network client is connected and ready to transmit a new telemetry frame.
   */
  public canSendTelemetry(now: number = performance.now()): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && (now - this.lastTelemetrySendTime >= TELEMETRY_SEND_INTERVAL_MS);
  }

  /**
   * Throttled telemetry transmission called from useVehiclePhysics / useFrame (~30Hz).
   */
  public sendTelemetry(payload: Omit<VehicleTelemetryPayload, 'seq' | 'time'>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    if (now - this.lastTelemetrySendTime < TELEMETRY_SEND_INTERVAL_MS) {
      return;
    }
    this.lastTelemetrySendTime = now;

    const fullPayload: VehicleTelemetryPayload = {
      ...payload,
      seq: ++this.sequence,
      time: Date.now(),
    };

    const msg: ClientMessage = {
      type: 'telemetry',
      payload: fullPayload,
    };
    this.send(msg);
  }

  public sendClientReady(): void {
    this.send({ type: 'client_ready' });
  }

  public sendTagTouch(targetPlayerId: string): void {
    this.send({ type: 'tag_touch', targetPlayerId });
  }

  private sendQueue: ClientMessage[] = [];

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.warn('[NetworkClient] Send failed:', err);
      }
    } else {
      this.sendQueue.push(msg);
    }
  }

  private handleOpen = (): void => {
    this.reconnectAttempts = 0;

    // Flush any queued client messages upon connection
    while (this.sendQueue.length > 0) {
      const queuedMsg = this.sendQueue.shift();
      if (queuedMsg && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(queuedMsg));
        } catch {
          // Ignore
        }
      }
    }

    // Immediately fetch active rooms list
    this.requestRooms();

    // Start heartbeat ping
    this.startPingHeartbeat();
  };

  public handleMessage = (event: MessageEvent): void => {
    try {
      const raw = JSON.parse(event.data);
      const msg: ServerMessage | null = parseServerMessage(raw);
      if (!msg) return;

      const store = useMultiplayerStore.getState();

      switch (msg.type) {
        case 'rooms_list': {
          store.setRooms(msg.rooms);
          break;
        }

        case 'room_created': {
          store.setCurrentRoom(msg.room);
          if (msg.room.levelId) {
            useGameStore.getState().setSelectedLevelId(msg.room.levelId);
          }
          if (msg.room.gameMode) {
            useGameStore.getState().setGameMode(msg.room.gameMode);
          }
          break;
        }

        case 'room_joined': {
          store.setSelfId(msg.selfId, msg.room.name, 0, msg.room);
          store.setPlayers(msg.players);
          if (msg.room.levelId) {
            useGameStore.getState().setSelectedLevelId(msg.room.levelId);
          }
          if (msg.room.gameMode) {
            useGameStore.getState().setGameMode(msg.room.gameMode);
          }
          break;
        }

        case 'room_deleted': {
          store.setCurrentRoom(null);
          store.setError(`Room closed: ${msg.reason}`);
          store.setPlayers([]);
          this.entityBuffers.clear();
          this.requestRooms();
          break;
        }

        case 'lobby_joined': {
          store.setSelfId(msg.selfId, msg.room);
          store.setPlayers(msg.players);
          break;
        }

        case 'player_joined': {
          store.addPlayer(msg.player);
          break;
        }

        case 'player_left': {
          store.removePlayer(msg.playerId);
          this.entityBuffers.delete(msg.playerId);
          break;
        }

        case 'world_snapshot': {
          const entities = msg.entities;
          const receiveTime = Date.now();
          for (const entityId in entities) {
            if (entityId === store.selfId) continue;
            const snap = entities[entityId];
            // Normalize snapshot time to local arrival timeline to prevent client clock skew
            snap.time = receiveTime;
            const buffer = this.getEntityBuffer(entityId);
            buffer.push(snap);
          }
          break;
        }

        case 'pong': {
          const rtt = performance.now() - msg.clientTime;
          store.updatePing(Math.max(1, Math.round(rtt)));
          break;
        }

        case 'gymkhana_spectate': {
          store.setSpectating(
            msg.isSpectator,
            msg.targetId,
            msg.targetNickname,
            msg.roundTimeRemaining
          );
          break;
        }

        case 'gymkhana_round_ended': {
          store.setGymkhanaRoundEnded(msg.intermissionRemaining, msg.leaderboard);
          useGymkhanaStore.setState({
            showResultsModal: true,
            status: 'completed',
          });
          break;
        }

        case 'gymkhana_round_start': {
          store.setGymkhanaRoundStart();
          useGymkhanaStore.getState().dismissResultsModal();
          useGymkhanaStore.getState().resetBlitz();
          useGymkhanaStore.getState().startCountdown();
          useGameStore.getState().triggerReset(true);
          break;
        }

        case 'tag_match_countdown': {
          useTagStore.getState().setCountdown(msg.countdown, msg.assignedSpawnIndex);
          break;
        }

        case 'tag_match_start': {
          useTagStore.getState().startMatch(msg.roundDuration, msg.taggerId, msg.assignedSpawnIndex);
          useGameStore.getState().triggerReset(true);
          break;
        }

        case 'tag_passed': {
          useTagStore.getState().setTagPassed(msg.oldTaggerId, msg.newTaggerId, msg.freezeDurationMs);
          break;
        }

        case 'tag_match_ended': {
          useTagStore.getState().endMatch(msg.intermissionRemaining, msg.leaderboard);
          break;
        }

        case 'tag_spectate': {
          store.setSpectating(
            msg.isSpectator,
            msg.targetId,
            msg.targetNickname,
            msg.roundTimeRemaining
          );
          break;
        }

        case 'error': {
          store.setError(`${msg.code}: ${msg.message}`);
          break;
        }
      }
    } catch (err) {
      console.warn('[NetworkClient] Message decode error:', err);
    }
  };

  private handleError = (event: Event): void => {
    console.warn('[NetworkClient] WebSocket error event:', event);
  };

  private handleClose = (event: CloseEvent): void => {
    console.log('[NetworkClient] WebSocket closed:', event.code, event.reason);
    this.clearTimers();
    this.ws = null;

    if (this.intentionalDisconnect) {
      return;
    }

    const store = useMultiplayerStore.getState();
    store.setStatus('reconnecting');
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      const store = useMultiplayerStore.getState();
      store.setStatus('disconnected');
      store.setError('Connection lost. Please rejoin lobby.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(10000, 1000 * Math.pow(2, this.reconnectAttempts - 1));

    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
    }

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect(this.endpoint);
    }, delay);
  }

  private startPingHeartbeat(): void {
    if (this.pingIntervalId !== null) {
      window.clearInterval(this.pingIntervalId);
    }

    this.pingIntervalId = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMsg: ClientMessage = {
          type: 'ping',
          clientTime: performance.now(),
        };
        this.send(pingMsg);
      }
    }, PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.pingIntervalId !== null) {
      window.clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
}

/**
 * Global singleton network client instance.
 */
export const networkClient = new NetworkClient();
