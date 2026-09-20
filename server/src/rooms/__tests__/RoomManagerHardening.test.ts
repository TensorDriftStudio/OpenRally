import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomManager, MAX_CUSTOM_ROOMS } from '../RoomManager.js';
import type { WebSocket } from 'ws';

function createMockWebSocket(): WebSocket {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('RoomManager Hardening & Security Limits', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('rejects rapid consecutive room creations by the same socket (rate limiting)', () => {
    const ws = createMockWebSocket();

    // First creation should succeed
    const room1 = manager.createRoom(ws, 'Room 1', 'Driver1', 'apex_a');
    expect(room1).not.toBeNull();

    // Immediate second creation should be rejected due to rate limiting
    const room2 = manager.createRoom(ws, 'Room 2', 'Driver1', 'apex_a');
    expect(room2).toBeNull();

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"code":"RATE_LIMIT_EXCEEDED"')
    );
  });

  it('allows different sockets to create rooms without interfering with each other rate limits', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    const room1 = manager.createRoom(ws1, 'Room 1', 'Driver1', 'apex_a');
    const room2 = manager.createRoom(ws2, 'Room 2', 'Driver2', 'apex_a');

    expect(room1).not.toBeNull();
    expect(room2).not.toBeNull();
  });

  it('enforces maximum custom room capacity ceiling', () => {
    const sockets: WebSocket[] = [];

    // Fill rooms up to MAX_CUSTOM_ROOMS
    // Note: 1 persistent room already exists at index 0
    const needed = MAX_CUSTOM_ROOMS - 1;
    for (let i = 0; i < needed; i++) {
      const ws = createMockWebSocket();
      sockets.push(ws);
      const room = manager.createRoom(ws, `Room ${i}`, `Driver_${i}`, 'apex_a');
      expect(room).not.toBeNull();
    }

    // Attempting to create one more room beyond capacity must be rejected
    const excessWs = createMockWebSocket();
    const excessRoom = manager.createRoom(excessWs, 'Excess Room', 'GreedyDriver', 'apex_a');
    expect(excessRoom).toBeNull();
    expect(excessWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"code":"ROOM_CAPACITY_REACHED"')
    );
  });

  it('cleans up client rate-limit tracking when client disconnects', () => {
    const ws = createMockWebSocket();
    const room = manager.createRoom(ws, 'Room Disconnect', 'Driver', 'apex_a');
    expect(room).not.toBeNull();

    // Disconnect
    manager.handleDisconnect(ws);

    // If client reconnects on a new socket, they should be able to create a room
    const newWs = createMockWebSocket();
    const newRoom = manager.createRoom(newWs, 'Room Reconnect', 'Driver', 'apex_a');
    expect(newRoom).not.toBeNull();
  });
});
