import { createServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from './rooms/RoomManager.js';
import { parseClientMessage } from './packetValidator.js';
import { SERVER_VERSION, PROTOCOL_VERSION } from './version.js';
import type { ClientMessage } from './types.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const roomManager = new RoomManager();

// Minimal HTTP server for health checks & WebSocket upgrade
const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/api/health') {
    const rooms = roomManager.getRoomsList();
    const totalPlayers = rooms.reduce((acc, r) => acc + r.playerCount, 0);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        version: SERVER_VERSION,
        protocol: PROTOCOL_VERSION,
        uptime: process.uptime(),
        roomsCount: rooms.length,
        players: totalPlayers,
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`OpenRally Multiplayer Dedicated Game Server v${SERVER_VERSION}\n`);
});

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit to prevent JSON-parse / event-loop DoS
const MAX_SOCKETS_PER_IP = 10;
const MAX_HANDSHAKES_PER_MINUTE_PER_IP = 30;

const ipConnectionCount = new Map<string, number>();
const ipHandshakeHistory = new Map<string, number[]>();

function resolveClientIp(req: import('http').IncomingMessage): string {
  const remoteAddr = req.socket.remoteAddress || '127.0.0.1';
  const isLocalProxy =
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === '::ffff:127.0.0.1';

  if (isLocalProxy) {
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim().length > 0) {
      return xRealIp.trim();
    }
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim().length > 0) {
      return cfConnectingIp.trim();
    }
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0].trim();
    }
  }

  return remoteAddr;
}

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const history = ipHandshakeHistory.get(ip) || [];
  const recent = history.filter((t) => now - t < 60000);
  if (recent.length >= MAX_HANDSHAKES_PER_MINUTE_PER_IP) {
    ipHandshakeHistory.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipHandshakeHistory.set(ip, recent);
  return true;
}

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD_BYTES,
});

wss.on('connection', (ws: WebSocket, req) => {
  const ip = resolveClientIp(req);
  const currentSockets = ipConnectionCount.get(ip) || 0;

  if (currentSockets >= MAX_SOCKETS_PER_IP || !checkIpRateLimit(ip)) {
    console.warn(
      `[Server] Rejected connection from ${ip}: rate limit or socket ceiling exceeded (active sockets: ${currentSockets})`
    );
    ws.close(1008, 'RATE_LIMIT_EXCEEDED');
    return;
  }

  ipConnectionCount.set(ip, currentSockets + 1);

  let isClosed = false;
  const releaseSocket = () => {
    if (isClosed) return;
    isClosed = true;
    const count = ipConnectionCount.get(ip) || 1;
    if (count <= 1) {
      ipConnectionCount.delete(ip);
    } else {
      ipConnectionCount.set(ip, count - 1);
    }
  };

  const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const clientVersion = reqUrl.searchParams.get('v');

  console.log(`[Server] New WebSocket connection from ${ip} (clientVersion: ${clientVersion || 'none'})`);

  if (!clientVersion || clientVersion !== SERVER_VERSION) {
    console.warn(
      `[Server] Rejected connection from ${ip}: version mismatch (server: ${SERVER_VERSION}, client: ${clientVersion || 'none'})`
    );
    const mismatchMsg = JSON.stringify({
      type: 'version_mismatch',
      serverVersion: SERVER_VERSION,
      clientVersion: clientVersion || 'unknown',
      message: `Client version (${clientVersion || 'legacy'}) is incompatible with server version (${SERVER_VERSION}). Please update your game.`,
    });
    try {
      ws.send(mismatchMsg);
    } catch {
      // Suppress send error on early socket closure
    }
    releaseSocket();
    ws.close(4003, 'VERSION_MISMATCH');
    return;
  }

  // Automatically subscribe newly connected clients to lobby updates
  roomManager.subscribeLobby(ws);

  ws.on('message', (data: Buffer | string) => {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf-8');
      const raw = JSON.parse(text);
      const msg: ClientMessage | null = parseClientMessage(raw);
      if (!msg) return;

      switch (msg.type) {
        case 'request_rooms': {
          roomManager.subscribeLobby(ws);
          break;
        }

        case 'create_room': {
          roomManager.createRoom(ws, msg.name, msg.nickname, msg.vehicleId, msg.levelId, msg.gameMode);
          break;
        }

        case 'join_room': {
          roomManager.joinRoom(ws, msg.roomId, msg.nickname, msg.vehicleId);
          break;
        }

        case 'delete_room': {
          const playerId = roomManager.getPlayerId(ws);
          if (playerId) {
            roomManager.deleteRoom(msg.roomId, playerId);
          }
          break;
        }

        case 'leave_room': {
          const playerId = roomManager.getPlayerId(ws);
          if (playerId) {
            roomManager.leavePlayer(playerId, 'user_left_room');
          }
          break;
        }

        case 'join_lobby': {
          // Backward compatibility for legacy join_lobby
          roomManager.joinRoom(ws, 'gymkhana_freeroam', msg.nickname, msg.vehicleId);
          break;
        }

        case 'leave_lobby': {
          const playerId = roomManager.getPlayerId(ws);
          if (playerId) {
            roomManager.leavePlayer(playerId, 'user_left_lobby');
          }
          break;
        }

        case 'telemetry': {
          roomManager.handleTelemetry(ws, msg.payload);
          break;
        }

        case 'ping': {
          roomManager.handlePing(ws, msg.clientTime);
          break;
        }

        case 'client_ready': {
          roomManager.handleClientReady(ws);
          break;
        }

        case 'tag_touch': {
          roomManager.handleTagTouch(ws, msg.targetPlayerId);
          break;
        }
      }
    } catch (err) {
      console.warn('[Server] Error handling packet:', err);
    }
  });

  ws.on('close', (code) => {
    releaseSocket();
    roomManager.handleDisconnect(ws, `code_${code}`);
  });

  ws.on('error', (err) => {
    releaseSocket();
    console.warn(`[Server] Client error from ${ip}:`, err);
    roomManager.handleDisconnect(ws, 'error');
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[OpenRally] Multiplayer Relay Server running on http://${HOST}:${PORT}`);
  console.log(`[OpenRally] WebSocket endpoint active at ws://${HOST}:${PORT}/ws`);
});

function handleShutdown(): void {
  console.log('[OpenRally] Shutting down server gracefully...');
  roomManager.destroy();

  // Notify all connected clients of server restart with standard code 1001
  for (const client of wss.clients) {
    try {
      client.close(1001, 'SERVER_RESTART');
    } catch {
      // Suppress
    }
  }

  wss.close();
  httpServer.close(() => {
    console.log('[OpenRally] Server closed gracefully.');
    process.exit(0);
  });

  // Force exit after 1.0s if keep-alive sockets linger
  setTimeout(() => {
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        // Suppress
      }
    }
    process.exit(0);
  }, 1000).unref();
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
