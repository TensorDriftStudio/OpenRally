import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameRoom } from '../GameRoom.js';
import type { WebSocket } from 'ws';

function createMockWebSocket(): WebSocket {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

function advanceTimeWithHeartbeat(room: GameRoom, ms: number): void {
  const step = 1000;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    for (const session of room.players.values()) {
      session.lastSeen = Date.now();
    }
    vi.advanceTimersByTime(step);
  }
}

describe('GameRoom - Rally Tag Lifecycle, Tagger, Proximity, Freeze & Scoring', () => {
  let room: GameRoom;

  beforeEach(() => {
    vi.useFakeTimers();
    room = new GameRoom({
      id: 'test_tag_room',
      name: 'Rally Tag Arena',
      hostId: 'host_p1',
      hostNickname: 'Hunter',
      levelId: 'level1_island',
      gameMode: 'tag',
    });
  });

  afterEach(() => {
    room.destroy();
    vi.useRealTimers();
  });

  it('initializes in waiting phase (free roam) with no tagger', () => {
    expect(room.gameMode).toBe('tag');
    expect(room.tagPhase).toBe('waiting');
    expect(room.taggerId).toBeNull();
    expect(room.tagCountdownTimer).toBe(15);
    expect(room.tagRoundTimer).toBe(180);
  });

  it('remains in waiting phase when only 1 driver is in the room', () => {
    const ws1 = createMockWebSocket();
    const session1 = room.join(ws1, 'SoloDriver', 'zephyr_wr4');
    expect(session1).not.toBeNull();
    expect(room.tagPhase).toBe('waiting');

    advanceTimeWithHeartbeat(room, 5000);
    expect(room.tagPhase).toBe('waiting');
  });

  it('starts 15s countdown when second driver joins', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    room.join(ws1, 'Driver1', 'zephyr_wr4');
    room.join(ws2, 'Driver2', 'apex_phantom_b');

    expect(room.tagPhase).toBe('countdown');
    expect(room.tagCountdownTimer).toBe(15);

    advanceTimeWithHeartbeat(room, 5000);
    expect(room.tagPhase).toBe('countdown');
    expect(room.tagCountdownTimer).toBe(10);
  });

  it('reverts to waiting phase if a player leaves during countdown and only 1 remains', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    const _s1 = room.join(ws1, 'Driver1', 'zephyr_wr4');
    const s2 = room.join(ws2, 'Driver2', 'apex_phantom_b');

    expect(room.tagPhase).toBe('countdown');
    if (s2) room.leave(s2.id);

    expect(room.tagPhase).toBe('waiting');
    expect(room.tagCountdownTimer).toBe(15);
  });

  it('launches 180s active match after 15s countdown with one tagger and distinct spawn slots', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    const s1 = room.join(ws1, 'Driver1', 'zephyr_wr4');
    const s2 = room.join(ws2, 'Driver2', 'apex_phantom_b');

    advanceTimeWithHeartbeat(room, 15000);

    expect(room.tagPhase).toBe('active');
    expect(room.tagRoundTimer).toBe(180);
    expect(room.taggerId).toBeTruthy();
    expect([s1?.id, s2?.id]).toContain(room.taggerId);
    expect(s1?.assignedTagSpawnIndex).not.toBe(s2?.assignedTagSpawnIndex);
  });

  it('assigns late joiners during active round as spectators', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    room.join(ws1, 'Driver1', 'zephyr_wr4');
    room.join(ws2, 'Driver2', 'apex_phantom_b');

    advanceTimeWithHeartbeat(room, 15000); // match starts

    const ws3 = createMockWebSocket();
    const s3 = room.join(ws3, 'LateDriver', 'vortex_b');
    expect(s3?.isSpectator).toBe(true);
    expect(s3?.spectateTargetId).toBeTruthy();
  });

  it('transfers tag upon collision, freezes new tagger and gives old tagger immunity', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    const s1 = room.join(ws1, 'Driver1', 'zephyr_wr4')!;
    const s2 = room.join(ws2, 'Driver2', 'apex_phantom_b')!;

    advanceTimeWithHeartbeat(room, 15000);

    const initialTaggerId = room.taggerId!;
    const runner = initialTaggerId === s1.id ? s2 : s1;
    const tagger = initialTaggerId === s1.id ? s1 : s2;

    // Simulate proximity collision via telemetry positions
    tagger.latestSnapshot = {
      time: Date.now(),
      pos: [10, 0, 10],
      rot: [0, 0, 0, 1],
      linVel: [10, 0, 0],
      angVel: [0, 0, 0],
      steer: 0,
      wheelRots: [0, 0, 0, 0],
      rpm: 3000,
      gear: 2,
      isDrifting: false,
      surface: 'tarmac',
    };

    runner.latestSnapshot = {
      time: Date.now(),
      pos: [11.5, 0, 10], // within 1.5m
      rot: [0, 0, 0, 1],
      linVel: [5, 0, 0],
      angVel: [0, 0, 0],
      steer: 0,
      wheelRots: [0, 0, 0, 0],
      rpm: 2500,
      gear: 2,
      isDrifting: false,
      surface: 'tarmac',
    };

    // Advance 60ms to trigger proximity interval
    vi.advanceTimersByTime(60);

    // Tag should have passed to the runner!
    expect(room.taggerId).toBe(runner.id);
    expect(tagger.tagGraceUntil).toBeGreaterThan(Date.now()); // old tagger has immunity
    expect(room.tagTaggerFrozenUntil).toBeGreaterThan(Date.now()); // new tagger is frozen
    expect(tagger.tagsMade).toBe(1);
  });

  it('accumulates clean time for non-taggers and ends with sorted leaderboard', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    const s1 = room.join(ws1, 'Driver1', 'zephyr_wr4')!;
    const s2 = room.join(ws2, 'Driver2', 'apex_phantom_b')!;

    advanceTimeWithHeartbeat(room, 15000);

    // Designate s1 as tagger for 10 seconds
    room.taggerId = s1.id;
    advanceTimeWithHeartbeat(room, 10000);

    expect(s2.timeClean).toBe(10);
    expect(s1.timeClean).toBe(0);

    // Pass tag to s2 for 5 seconds
    room.passTag(s1.id, s2.id, 0);
    advanceTimeWithHeartbeat(room, 5000);

    expect(s2.timeClean).toBe(10);
    expect(s1.timeClean).toBe(5);

    // Advance remaining round time (165s) to trigger round end
    advanceTimeWithHeartbeat(room, 166000);

    expect(room.tagPhase).toBe('intermission');
    const leaderboard = room.getTagLeaderboard();
    expect(leaderboard[0].id).toBe(s1.id); // Winner had more clean time (170s vs 10s)
    expect(leaderboard[1].id).toBe(s2.id);
  });
});
