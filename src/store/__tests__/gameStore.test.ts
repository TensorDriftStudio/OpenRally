import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useGameStore.setState({
      gameState: 'menu',
      cameraMode: 'chase_close',
      speed: 0,
      lateralSpeed: 0,
      slipAngle: 0,
      rpm: 1000,
      gear: 1,
      heading: 0,
      position: [0, 0.5, 0],
      pendingReset: false,
      telemetryEnabled: false,
      tireGrips: [0, 0, 0, 0],
      surface: 'mud',
    });
  });

  it('cycles camera modes in order', () => {
    expect(useGameStore.getState().cameraMode).toBe('chase_close');

    useGameStore.getState().cycleCameraMode();
    expect(useGameStore.getState().cameraMode).toBe('chase');

    useGameStore.getState().cycleCameraMode();
    expect(useGameStore.getState().cameraMode).toBe('bumper');

    useGameStore.getState().cycleCameraMode();
    expect(useGameStore.getState().cameraMode).toBe('free');

    useGameStore.getState().cycleCameraMode();
    expect(useGameStore.getState().cameraMode).toBe('chase_close');
  });

  it('supports title gameState and transitions', () => {
    useGameStore.getState().setGameState('title');
    expect(useGameStore.getState().gameState).toBe('title');

    useGameStore.getState().setGameState('menu');
    expect(useGameStore.getState().gameState).toBe('menu');
  });

  it('toggles pause state when playing or paused', () => {
    useGameStore.getState().setGameState('playing');
    expect(useGameStore.getState().gameState).toBe('playing');

    useGameStore.getState().togglePause();
    expect(useGameStore.getState().gameState).toBe('paused');

    useGameStore.getState().togglePause();
    expect(useGameStore.getState().gameState).toBe('playing');
  });

  it('updates telemetry properties correctly', () => {
    const { setSpeed, setRpm, setGear, setPosition, setSurface, setTireGrips } = useGameStore.getState();

    setSpeed(120);
    setRpm(5500);
    setGear(3);
    setPosition([10, 5, 20]);
    setSurface('tarmac');
    setTireGrips([3.2, 3.2, 3.6, 3.6]);

    const state = useGameStore.getState();
    expect(state.speed).toBe(120);
    expect(state.rpm).toBe(5500);
    expect(state.gear).toBe(3);
    expect(state.position).toEqual([10, 5, 20]);
    expect(state.surface).toBe('tarmac');
    expect(state.tireGrips).toEqual([3.2, 3.2, 3.6, 3.6]);
  });

  it('switches game modes correctly between freeroam and timeattack', () => {
    expect(useGameStore.getState().gameMode).toBe('timeattack');

    useGameStore.getState().setGameMode('freeroam');
    expect(useGameStore.getState().gameMode).toBe('freeroam');

    useGameStore.getState().setGameMode('timeattack');
    expect(useGameStore.getState().gameMode).toBe('timeattack');
  });

  it('updates gamepad connection state, name, and type', () => {
    expect(useGameStore.getState().gamepadConnected).toBe(false);
    expect(useGameStore.getState().gamepadName).toBe('');
    expect(useGameStore.getState().gamepadType).toBeNull();

    useGameStore.getState().setGamepadConnected(true, 'DualSense Wireless Controller', 'dualsense');
    expect(useGameStore.getState().gamepadConnected).toBe(true);
    expect(useGameStore.getState().gamepadName).toBe('DualSense Wireless Controller');
    expect(useGameStore.getState().gamepadType).toBe('dualsense');

    useGameStore.getState().setGamepadConnected(true, 'Xbox Wireless Controller', 'xbox');
    expect(useGameStore.getState().gamepadType).toBe('xbox');

    useGameStore.getState().setGamepadConnected(false);
    expect(useGameStore.getState().gamepadConnected).toBe(false);
    expect(useGameStore.getState().gamepadType).toBeNull();
  });

  it('supports loadingTarget state and transitions between menu and gameplay targets', () => {
    expect(useGameStore.getState().loadingTarget).toBe('menu');

    useGameStore.getState().setLoadingTarget('gameplay');
    expect(useGameStore.getState().loadingTarget).toBe('gameplay');

    useGameStore.getState().setLoadingTarget('menu');
    expect(useGameStore.getState().loadingTarget).toBe('menu');
  });

  it('resets telemetry, updates spawn position/heading and triggers pendingReset when setSelectedLevelId is called', () => {
    // Set dirty telemetry
    useGameStore.setState({
      speed: 140,
      lateralSpeed: 12,
      slipAngle: 0.35,
      rpm: 6500,
      gear: 4,
      pendingReset: false,
    });

    useGameStore.getState().setSelectedLevelId('level2_desert');
    const state = useGameStore.getState();

    expect(state.selectedLevelId).toBe('level2_desert');
    expect(state.selectedTireType).toBe('gravel');
    expect(state.isSceneReady).toBe(false);
    expect(state.speed).toBe(0);
    expect(state.lateralSpeed).toBe(0);
    expect(state.slipAngle).toBe(0);
    expect(state.rpm).toBe(1000);
    expect(state.gear).toBe(1);
    expect(state.pendingReset).toBe(true);
    expect(state.position).toEqual([-3.5, 9.8, -1.5]);
  });

  it('automatically preselects appropriate tire compound when switching levels and allows manual override', () => {
    // 1. Sweden Snow Rally must default to snow tires
    useGameStore.getState().setSelectedLevelId('level3_sweden');
    expect(useGameStore.getState().selectedLevelId).toBe('level3_sweden');
    expect(useGameStore.getState().selectedTireType).toBe('snow');

    // 2. Apex Gymkhana Arena must default to asphalt tires
    useGameStore.getState().setSelectedLevelId('level5_gymkhana');
    expect(useGameStore.getState().selectedLevelId).toBe('level5_gymkhana');
    expect(useGameStore.getState().selectedTireType).toBe('asphalt');

    // 3. Desert Canyon must default to gravel tires
    useGameStore.getState().setSelectedLevelId('level2_desert');
    expect(useGameStore.getState().selectedLevelId).toBe('level2_desert');
    expect(useGameStore.getState().selectedTireType).toBe('gravel');

    // 4. User can still freely override tire choice for the stage
    useGameStore.getState().setSelectedTireType('asphalt');
    expect(useGameStore.getState().selectedTireType).toBe('asphalt');
    expect(useGameStore.getState().selectedLevelId).toBe('level2_desert');
  });
});



