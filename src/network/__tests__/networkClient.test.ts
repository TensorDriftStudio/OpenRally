import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkClient, getWebSocketEndpoint } from '../networkClient';
import { useMultiplayerStore } from '@/store/multiplayerStore';

describe('NetworkClient', () => {
  beforeEach(() => {
    useMultiplayerStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves default ws endpoint as remote server URL by default', () => {
    const endpoint = getWebSocketEndpoint();
    expect(endpoint).toBe('wss://openrally.tensordrift.eu/ws');
  });

  function mockLocation(loc: Partial<Location>): () => void {
    const original = globalThis.window;
    globalThis.window = { location: loc as Location } as Window & typeof globalThis;
    return () => {
      globalThis.window = original;
    };
  }

  it('respects ?ws=local query parameter override', () => {
    const restore = mockLocation({
      search: '?ws=local',
      hostname: 'localhost',
      host: 'localhost:5173',
      protocol: 'http:',
    });
    expect(getWebSocketEndpoint()).toBe('ws://localhost:3001');
    restore();
  });

  it('respects ?ws=remote query parameter override', () => {
    const restore = mockLocation({
      search: '?ws=remote',
      hostname: 'localhost',
      host: 'localhost:5173',
      protocol: 'http:',
    });
    expect(getWebSocketEndpoint()).toBe('wss://openrally.tensordrift.eu/ws');
    restore();
  });

  it('respects custom ?ws=... query parameter override', () => {
    const restore = mockLocation({
      search: '?ws=wss://custom-server.com/ws',
      hostname: 'localhost',
      host: 'localhost:5173',
      protocol: 'http:',
    });
    expect(getWebSocketEndpoint()).toBe('wss://custom-server.com/ws');
    restore();
  });

  it('routes to wss://${host}/ws when deployed behind HTTPS on a remote domain', () => {
    const restore = mockLocation({
      search: '',
      hostname: 'play.openrally.com',
      host: 'play.openrally.com',
      protocol: 'https:',
    });
    expect(getWebSocketEndpoint()).toBe('wss://play.openrally.com/ws');
    restore();
  });

  it('connects to remote server when on Android Capacitor (localhost HTTPS)', () => {
    const restore = mockLocation({
      search: '',
      hostname: 'localhost',
      host: 'localhost',
      protocol: 'https:',
    });
    expect(getWebSocketEndpoint()).toBe('wss://openrally.tensordrift.eu/ws');
    restore();
  });

  it('initializes and manages entity buffers', () => {
    const client = new NetworkClient();
    const buf1 = client.getEntityBuffer('peer1');
    const buf2 = client.getEntityBuffer('peer2');
    const buf1Again = client.getEntityBuffer('peer1');

    expect(buf1).toBe(buf1Again);
    expect(buf1).not.toBe(buf2);
    expect(client.entityBuffers.size).toBe(2);

    client.disconnect();
    expect(client.entityBuffers.size).toBe(0);
  });

  it('supports room management message payloads without throwing', () => {
    const client = new NetworkClient();
    const sendSpy = vi.fn();
    (client as unknown as { ws: { readyState: number; send: typeof sendSpy } }).ws = {
      readyState: 1, // OPEN
      send: sendSpy,
    };

    client.requestRooms();
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"request_rooms"'));

    client.createRoom('Apex Track', 'Racer1', 'vortex_b', 'level2_desert', 'timeattack');
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"create_room"'));
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"name":"Apex Track"'));
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"levelId":"level2_desert"'));
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"gameMode":"timeattack"'));

    client.joinRoom('room_123', 'Racer1', 'vortex_b');
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"join_room"'));
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"roomId":"room_123"'));

    client.deleteRoom('room_123');
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"delete_room"'));

    client.leaveRoom('room_123');
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"leave_room"'));
  });
});

