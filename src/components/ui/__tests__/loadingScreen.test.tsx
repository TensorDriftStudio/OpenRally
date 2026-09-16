import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LoadingScreen } from '../LoadingScreen';
import { useGameStore } from '@/store/gameStore';

describe('LoadingScreen - Menu Transition & Gameplay Loading', () => {
  beforeEach(() => {
    useGameStore.setState({
      gameState: 'loading',
      loadingTarget: 'menu',
      selectedLevelId: 'level1_island',
      selectedVehicleId: 'kodiak_raid',
      isSceneReady: false,
    });
  });

  it('renders loading overlay with INITIALIZING OPENRALLY when loadingTarget is menu and not ready', () => {
    const html = renderToString(<LoadingScreen />);

    expect(html).toContain('id="loading-screen"');
    expect(html).toContain('INITIALIZING OPENRALLY');
    expect(html).toContain('/openrally_logo_dark.png');
  });

  it('renders RETURNING TO MAIN MENU when scene is ready and transitioning to menu', () => {
    useGameStore.setState({
      isSceneReady: true,
    });
    const html = renderToString(<LoadingScreen />);

    expect(html).toContain('RETURNING TO MAIN MENU');
  });

  it('omits stage pill when transitioning to menu', () => {
    const html = renderToString(<LoadingScreen />);

    expect(html).not.toContain('MACHINE:');
  });

  it('renders stage pill and simulation initialization text when entering gameplay', () => {
    useGameStore.setState({
      gameState: 'loading',
      loadingTarget: 'gameplay',
    });

    const html = renderToString(<LoadingScreen />);

    expect(html).toContain('MACHINE:');
    expect(html).toContain('STAGE:');
    expect(html).toContain('INITIALIZING SIMULATION');
  });

  it('renders nothing when not in loading state and not visible', () => {
    useGameStore.setState({
      gameState: 'menu',
      loadingTarget: 'menu',
    });

    const html = renderToString(<LoadingScreen />);
    expect(html).toBe('');
  });
});
