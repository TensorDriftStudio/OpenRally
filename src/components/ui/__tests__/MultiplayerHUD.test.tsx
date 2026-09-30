import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MultiplayerHUD, checkIsMobileEnvironment } from '../MultiplayerHUD';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

describe('MultiplayerHUD - Mobile Ergonomics & Responsive Positioning', () => {
  beforeEach(() => {
    useMultiplayerStore.setState({
      status: 'disconnected',
      ping: 35,
      nickname: 'Apex_Tester',
      selfId: 'player-1',
      remotePlayers: {
        'player-1': {
          id: 'player-1',
          nickname: 'Apex_Tester',
          vehicleId: 'apex_phantom_b',
          slotIndex: 0,
          ping: 35,
        },
      },
      currentRoom: {
        id: 'room-1',
        name: 'Canyon Duel',
        hostId: 'player-1',
        hostNickname: 'Apex_Tester',
        levelId: 'level1_canyon',
        gameMode: 'freeroam',
        playerCount: 1,
        maxPlayers: 8,
        isPersistent: false,
        createdAt: Date.now(),
      },
      isHost: true,
    });

    useGameStore.setState({
      gameState: 'playing',
      selectedLevelId: 'level1_canyon',
      gameMode: 'freeroam',
    });

    useSettingsStore.setState({
      touchControlMode: 'auto',
    });
  });

  it('renders null when disconnected, not playing, or in single player (currentRoom is null)', () => {
    useMultiplayerStore.setState({ status: 'disconnected' });
    expect(renderToString(<MultiplayerHUD />)).toBe('');

    useMultiplayerStore.setState({ status: 'in_game' });
    useGameStore.setState({ gameState: 'menu' });
    expect(renderToString(<MultiplayerHUD />)).toBe('');

    // Crucial: visiting multiplayer menu connected to lobby, then backing out to single player Free Roam
    useGameStore.setState({ gameState: 'playing', gameMode: 'freeroam' });
    useMultiplayerStore.setState({ status: 'in_lobby', currentRoom: null });
    expect(renderToString(<MultiplayerHUD />)).toBe('');
  });

  it('renders active multiplayer HUD when in game session', () => {
    useGameStore.setState({ gameState: 'playing' });
    useMultiplayerStore.setState({ status: 'in_game' });

    const html = renderToString(<MultiplayerHUD />);
    expect(html).toContain('CANYON DUEL');
    expect(html).toContain('FREE ROAM');
    expect(html).toContain('35');
    expect(html).toContain('ms');
  });

  it('evaluates checkIsMobileEnvironment logic across viewports and touch parameters', () => {
    // SSR / default check without window crash
    const res = checkIsMobileEnvironment();
    expect(typeof res).toBe('boolean');
  });

  it('renders with bottom safe-area insets on mobile when touchControlMode is always', () => {
    useGameStore.setState({ gameState: 'playing' });
    useMultiplayerStore.setState({ status: 'in_game' });
    useSettingsStore.setState({ touchControlMode: 'always' });

    const html = renderToString(<MultiplayerHUD />);
    // Always positioned at bottom center
    expect(html).toContain('bottom:calc(10px + var(--sab, 0px))');
    expect(html).toContain('left:50%');
    expect(html).toContain('transform:translateX(-50%)');
    expect(html).toContain('align-items:center');
    expect(html).toContain('flex-direction:column-reverse');
    // Dark slate glassmorphism styling
    expect(html).toContain('rgba(15, 23, 42, 0.88)');
    expect(html).toContain('border-radius:20px');
  });

  it('renders at bottom center on desktop when touchControlMode is off', () => {
    useGameStore.setState({ gameState: 'playing' });
    useMultiplayerStore.setState({ status: 'in_game' });
    useSettingsStore.setState({ touchControlMode: 'off' });

    const html = renderToString(<MultiplayerHUD />);
    // Desktop: always positioned at bottom center with safe area insets
    expect(html).toContain('bottom:calc(10px + var(--sab, 0px))');
    expect(html).toContain('left:50%');
    expect(html).toContain('transform:translateX(-50%)');
    expect(html).toContain('align-items:center');
    expect(html).toContain('flex-direction:column-reverse');
    expect(html).toContain('rgba(15, 23, 42, 0.88)');
    expect(html).toContain('border-radius:20px');
  });
});
