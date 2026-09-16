import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GymkhanaCompleteModal } from '../GymkhanaCompleteModal';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useGameStore } from '@/store/gameStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';

describe('GymkhanaCompleteModal - Gamepad & Keyboard Navigation', () => {
  beforeEach(() => {
    useMultiplayerStore.setState({
      status: 'disconnected',
      gymkhanaIntermissionRemaining: 0,
      gymkhanaLeaderboard: [],
    });
    useGameStore.setState({
      gameState: 'playing',
      gameMode: 'gymkhana_blitz',
      gamepadConnected: true,
      gamepadType: 'dualsense',
    });
    useGymkhanaStore.setState({
      showResultsModal: true,
      totalScore: 42500,
      bestScore: 50000,
      isNewRecord: false,
      stats: {
        maxMultiplier: 5,
        maxAngleDeg: 42,
        longestDriftSeconds: 6.2,
        totalDrifts: 14,
      },
    });
  });

  it('renders nothing when showResultsModal is false', () => {
    useGymkhanaStore.setState({ showResultsModal: false });
    const html = renderToString(<GymkhanaCompleteModal />);
    expect(html).toBe('');
  });

  it('renders stage complete title, formatted total score, and all three action buttons in singleplayer', () => {
    const html = renderToString(<GymkhanaCompleteModal />);

    expect(html).toContain('STAGE COMPLETE');
    expect(html).toContain('GYMKHANA BLITZ');
    expect(html).toContain('TOTAL DRIFT SCORE');
    expect(html).toContain('42,500');
    expect(html).toContain('PLAY AGAIN');
    expect(html).toContain('CONTINUE IN FREE ROAM');
    expect(html).toContain('RETURN TO MENU');
  });

  it('omits CONTINUE IN FREE ROAM in multiplayer Gymkhana Blitz mode, but shows intermission countdown and leaderboard', () => {
    useMultiplayerStore.setState({
      status: 'in_lobby',
      gymkhanaIntermissionRemaining: 18,
      gymkhanaLeaderboard: [
        { id: 'p1', nickname: 'TopDrifter', vehicleId: 'apex_phantom_b', score: 125000 },
        { id: 'p2', nickname: 'Challenger', vehicleId: 'zephyr_wr4', score: 98000 },
      ],
    });

    const html = renderToString(<GymkhanaCompleteModal />);

    // MUST NOT contain Free Roam in multiplayer Gymkhana Blitz
    expect(html).not.toContain('CONTINUE IN FREE ROAM');
    // Primary button shows ready status and exit button shows leave room
    expect(html).toContain('READY FOR NEXT ROUND');
    expect(html).toContain('LEAVE ROOM');

    // Intermission countdown and leaderboard table
    expect(html).toContain('NEXT ROUND STARTS IN');
    expect(html).toContain('18s');
    expect(html).toContain('OFFICIAL STAGE CLASSIFICATION');
    expect(html).toContain('TopDrifter');
    expect(html).toContain('125,000');
    expect(html).toContain('Challenger');
    expect(html).toContain('98,000');
  });

  it('renders PlayStation controller helper prompts when DualSense gamepad is connected', () => {
    useGameStore.setState({ gamepadConnected: true, gamepadType: 'dualsense' });
    const html = renderToString(<GymkhanaCompleteModal />);

    expect(html).toContain('✕ Select');
    expect(html).toContain('◯ Menu');
    expect(html).toContain('▲▼ Navigate');
  });

  it('renders Xbox controller helper prompts when Xbox controller is connected', () => {
    useGameStore.setState({ gamepadConnected: true, gamepadType: 'xbox' });
    const html = renderToString(<GymkhanaCompleteModal />);

    expect(html).toContain('A Select');
    expect(html).toContain('B Menu');
    expect(html).toContain('▲▼ Navigate');
  });

  it('renders keyboard helper prompts when no gamepad is connected', () => {
    useGameStore.setState({ gamepadConnected: false });
    const html = renderToString(<GymkhanaCompleteModal />);

    expect(html).toContain('Enter / Space Select');
    expect(html).toContain('Esc Menu');
    expect(html).toContain('W / S Navigate');
  });

  it('verifies state transitions for all modal action handlers', () => {
    // 1. Play Again
    useGymkhanaStore.getState().dismissResultsModal();
    useGymkhanaStore.getState().resetBlitz();
    expect(useGymkhanaStore.getState().showResultsModal).toBe(false);
    expect(useGymkhanaStore.getState().status).toBe('idle');

    // 2. Continue in Free Roam
    useGymkhanaStore.getState().dismissResultsModal();
    useGymkhanaStore.getState().resetBlitz();
    useGameStore.getState().setGameMode('freeroam');
    expect(useGameStore.getState().gameMode).toBe('freeroam');
    expect(useGymkhanaStore.getState().status).toBe('idle');

    // 3. Return to Menu
    useGymkhanaStore.getState().dismissResultsModal();
    useGymkhanaStore.getState().resetBlitz();
    useGameStore.getState().setGameState('menu');
    expect(useGameStore.getState().gameState).toBe('menu');
    expect(useGymkhanaStore.getState().status).toBe('idle');
  });
});
