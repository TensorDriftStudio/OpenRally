import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TagCompleteModal } from '../TagCompleteModal';
import { useTagStore } from '@/store/tagStore';
import { useGameStore } from '@/store/gameStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import type { RoomSummary } from '@/types/network';

const mockRoom: RoomSummary = {
  id: 'room_123',
  name: 'Alpine Rally Room',
  hostId: 'p1',
  hostNickname: 'Phantom_Falcon_4',
  levelId: 'desert_canyon',
  gameMode: 'tag',
  playerCount: 2,
  maxPlayers: 8,
  createdAt: Date.now(),
};

describe('TagCompleteModal - Clean Countdown & Classification Integrity', () => {
  beforeEach(() => {
    useTagStore.setState({
      phase: 'intermission',
      showResultsModal: true,
      intermissionRemaining: 20,
      leaderboard: [
        {
          id: 'p1',
          nickname: 'Phantom_Falcon_4',
          vehicleId: 'vortex_rally_b',
          timeClean: 104.28,
          tagsMade: 1,
        },
        {
          id: 'p2',
          nickname: 'Blaze_Hawk_29',
          vehicleId: 'vortex_rally_b',
          timeClean: 76.12,
          tagsMade: 1,
        },
      ],
    });

    useGameStore.setState({
      gameState: 'playing',
      gameMode: 'tag',
      gamepadConnected: true,
      gamepadType: 'xbox',
    });

    useMultiplayerStore.setState({
      selfId: 'p1',
      currentRoom: mockRoom,
    });
  });

  it('renders nothing when showResultsModal is false', () => {
    useTagStore.setState({ showResultsModal: false });
    const html = renderToString(<TagCompleteModal />);
    expect(html).toBe('');
  });

  it('renders nothing when gameMode is not tag', () => {
    useGameStore.setState({ gameMode: 'freeroam' });
    const html = renderToString(<TagCompleteModal />);
    expect(html).toBe('');
  });

  it('renders nothing when currentRoom is missing', () => {
    useMultiplayerStore.setState({ currentRoom: null });
    const html = renderToString(<TagCompleteModal />);
    expect(html).toBe('');
  });

  it('displays NEXT ROUND countdown strictly in whole integer seconds without fractional decimals', () => {
    // Exact floating-point value reported in bug report
    useTagStore.setState({ intermissionRemaining: 17.270400000333854 });

    const html = renderToString(<TagCompleteModal />);

    // Must show 18s (Math.ceil of 17.27...), NEVER 17.270400000333854s
    expect(html).toContain('NEXT ROUND');
    expect(html).toContain('18s');
    expect(html).not.toContain('17.270400000333854');
  });

  it('updates countdown in whole seconds when ticked with safe deltas', () => {
    useTagStore.setState({ intermissionRemaining: 10.0 });
    let html = renderToString(<TagCompleteModal />);
    expect(html).toContain('10s');

    // Simulate frame ticks
    useTagStore.getState().tickDelta(0.4); // 9.6s remaining -> Math.ceil = 10s
    html = renderToString(<TagCompleteModal />);
    expect(html).toContain('10s');

    useTagStore.getState().tickDelta(0.7); // 8.9s remaining -> Math.ceil = 9s
    html = renderToString(<TagCompleteModal />);
    expect(html).toContain('9s');
    expect(html).not.toMatch(/NEXT ROUND<\/div><div[^>]*>\d+\.\d+s<\/div>/);
  });

  it('safeguards non-positive and zero intermission timers to 0s', () => {
    useTagStore.setState({ intermissionRemaining: 0 });
    const html = renderToString(<TagCompleteModal />);
    expect(html).toContain('0s');
  });

  it('renders stage winner banner, leaderboard rows, and clean time rounded to whole seconds', () => {
    const html = renderToString(<TagCompleteModal />);

    expect(html).toContain('RALLY TAG — ROUND FINISHED');
    expect(html).toContain('STAGE WINNER');
    expect(html).toContain('Phantom_Falcon_4');
    expect(html).toContain('104s'); // Rounded from 104.28
    expect(html).toContain('Blaze_Hawk_29');
    expect(html).toContain('76s'); // Rounded from 76.12
    expect(html).toContain('(YOU)');
    expect(html).toContain('CONTINUE (A)');
    expect(html).toContain('LEAVE ROOM');
  });
});
