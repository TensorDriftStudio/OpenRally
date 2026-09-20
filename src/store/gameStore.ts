import { create } from 'zustand';
import type { CameraMode, GameMode, GameState, GamepadType } from '@/types/game';
import type { SurfaceType, TireType } from '@/types/vehicle';
import { DEFAULT_VEHICLE_ID } from '@/config/vehicleRegistry';
import { DEFAULT_LEVEL_ID, getLevelPreset, getRecommendedTireForLevel } from '@/config/levelRegistry';
import { resetGamepadEdgeState } from '@/utils/input/gamepad';

/**
 * Core game state store — vehicle telemetry, game phase, camera mode,
 * selected vehicle and active level.
 */
interface GameStore {
  /** Current game state */
  gameState: GameState;
  /** Active game mode: Free Roam or Time Attack */
  gameMode: GameMode;
  /** Active camera mode */
  cameraMode: CameraMode;
  /** ID of the selected vehicle preset */
  selectedVehicleId: string;
  /** Active tire compound type (asphalt, gravel, or snow) */
  selectedTireType: TireType;
  /** ID of the active level preset */
  selectedLevelId: string;
  /** Vehicle speed in km/h */
  speed: number;
  /** Lateral speed in m/s (used for drifting/sliding detection) */
  lateralSpeed: number;
  /** Slip angle in radians (difference between heading and velocity direction) */
  slipAngle: number;
  /** Engine RPM */
  rpm: number;
  /** Current transmission gear (-1: Reverse, 0: Neutral, 1-5: Forward) */
  gear: number;
  /** Vehicle heading in radians (0 = north / +Z) */
  heading: number;
  /** Vehicle world position [x, y, z] */
  position: [number, number, number];
  /** Flag to request a physics reset from UI */
  pendingReset: boolean;
  /** Whether the telemetry HUD is visible */
  telemetryEnabled: boolean;
  /** Current friction multiplier for each tire [FL, FR, RL, RR] */
  tireGrips: number[];
  /** Current surface under the vehicle */
  surface: SurfaceType;
  /** Whether a gamepad / Xbox / DualSense controller is currently connected */
  gamepadConnected: boolean;
  /** Name / identifier of the connected gamepad */
  gamepadName: string;
  /** Detected gamepad hardware type */
  gamepadType: GamepadType;
  /** Target destination for current loading sequence ('menu' or 'gameplay') */
  loadingTarget: 'menu' | 'gameplay';
  /** Whether 3D assets, physics, shaders, and terrain are fully ready and settled */
  isSceneReady: boolean;
  /** Whether 3D visual vehicle model is currently fully loaded and mounted in the scene */
  isVehicleVisualReady: boolean;
  /** Whether 3D Garage view modal is currently open */
  isGarageOpen: boolean;
  /** Whether the vehicle is airborne (all wheels off ground) */
  isAirborne: boolean;
  /** Whether the vehicle is currently rolled over on its roof/side */
  isRolledOver: boolean;
  /** Whether ABS is actively modulating brake force */
  absActive: boolean;
  /** Whether TCS is actively modulating throttle torque */
  tcsActive: boolean;
  /** Whether ESP is actively damping yaw velocity */
  espActive: boolean;

  // Actions
  setGameState: (state: GameState) => void;
  setLoadingTarget: (target: 'menu' | 'gameplay') => void;
  setGameMode: (mode: GameMode) => void;
  setSelectedVehicleId: (id: string) => void;
  setSelectedTireType: (tireType: TireType) => void;
  setSelectedLevelId: (id: string) => void;
  setSceneReady: (ready: boolean) => void;
  setIsVehicleVisualReady: (ready: boolean) => void;
  setGarageOpen: (open: boolean) => void;
  setIsAirborne: (isAirborne: boolean) => void;
  setIsRolledOver: (isRolledOver: boolean) => void;
  setSpeed: (speed: number) => void;
  setLateralSpeed: (lateralSpeed: number) => void;
  setSlipAngle: (slipAngle: number) => void;
  setRpm: (rpm: number) => void;
  setGear: (gear: number) => void;
  setHeading: (heading: number) => void;
  setPosition: (pos: [number, number, number]) => void;
  cycleCameraMode: () => void;
  togglePause: () => void;
  triggerReset: (val: boolean) => void;
  setTelemetryEnabled: (val: boolean) => void;
  setTireGrips: (val: number[]) => void;
  setSurface: (val: SurfaceType) => void;
  setGamepadConnected: (connected: boolean, name?: string, type?: GamepadType) => void;
  setDrivingAssistsActive: (assists: { abs?: boolean; tcs?: boolean; esp?: boolean }) => void;
}

const CAMERA_MODES: CameraMode[] = ['chase_close', 'chase', 'bumper', 'free'];

export const useGameStore = create<GameStore>((set) => ({
  gameState: 'title',
  gameMode: 'timeattack',
  cameraMode: 'chase_close',
  selectedVehicleId: DEFAULT_VEHICLE_ID,
  selectedTireType: getRecommendedTireForLevel(DEFAULT_LEVEL_ID),
  selectedLevelId: DEFAULT_LEVEL_ID,
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
  gamepadConnected: false,
  gamepadName: '',
  gamepadType: null,
  loadingTarget: 'menu',
  isSceneReady: false,
  isVehicleVisualReady: false,
  isGarageOpen: false,
  isAirborne: false,
  isRolledOver: false,
  absActive: false,
  tcsActive: false,
  espActive: false,

  setGameState: (gameState) => {
    resetGamepadEdgeState();
    set((state) => {
      const isEnteringMenu =
        (state.gameState === 'playing' || state.gameState === 'paused') &&
        (gameState === 'menu' || gameState === 'title');

      const levelPreset = isEnteringMenu ? getLevelPreset(state.selectedLevelId) : null;
      const spawnPos = levelPreset?.spawnPosition;

      return {
        gameState,
        isSceneReady:
          gameState === 'title' || gameState === 'menu'
            ? false
            : state.isSceneReady,
        isVehicleVisualReady:
          gameState === 'title'
            ? false
            : state.isVehicleVisualReady,
        loadingTarget:
          gameState === 'menu' || gameState === 'title' ? 'menu' : state.loadingTarget,
        pendingReset: isEnteringMenu ? true : state.pendingReset,
        speed: isEnteringMenu ? 0 : state.speed,
        lateralSpeed: isEnteringMenu ? 0 : state.lateralSpeed,
        slipAngle: isEnteringMenu ? 0 : state.slipAngle,
        rpm: isEnteringMenu ? 1000 : state.rpm,
        gear: isEnteringMenu ? 1 : state.gear,
        heading: isEnteringMenu && levelPreset ? levelPreset.spawnRotationY : state.heading,
        position: isEnteringMenu && spawnPos ? [spawnPos[0], spawnPos[1], spawnPos[2]] : state.position,
        isRolledOver: isEnteringMenu ? false : state.isRolledOver,
      };
    });
  },
  setLoadingTarget: (loadingTarget) => set({ loadingTarget }),
  setGameMode: (gameMode) => set({ gameMode }),
  setSelectedVehicleId: (selectedVehicleId) => set({ selectedVehicleId, isSceneReady: false, isVehicleVisualReady: false }),
  setSelectedTireType: (selectedTireType) => set({ selectedTireType }),
  setSelectedLevelId: (selectedLevelId) => {
    const levelPreset = getLevelPreset(selectedLevelId);
    const spawnPos = levelPreset.spawnPosition;
    set({
      selectedLevelId,
      selectedTireType: getRecommendedTireForLevel(levelPreset),
      isSceneReady: false,
      isVehicleVisualReady: false,
      speed: 0,
      lateralSpeed: 0,
      slipAngle: 0,
      rpm: 1000,
      gear: 1,
      heading: levelPreset.spawnRotationY,
      position: [spawnPos[0], spawnPos[1], spawnPos[2]],
      pendingReset: true,
      isRolledOver: false,
    });
  },
  setSceneReady: (isSceneReady) => set({ isSceneReady }),
  setIsVehicleVisualReady: (isVehicleVisualReady) => set({ isVehicleVisualReady }),
  setGarageOpen: (isGarageOpen) => set({ isGarageOpen }),
  setIsAirborne: (isAirborne) => set({ isAirborne }),
  setIsRolledOver: (isRolledOver) => set({ isRolledOver }),
  setSpeed: (speed) => set({ speed }),
  setLateralSpeed: (lateralSpeed) => set({ lateralSpeed }),
  setSlipAngle: (slipAngle) => set({ slipAngle }),
  setRpm: (rpm) => set({ rpm }),
  setGear: (gear) => set({ gear }),
  setHeading: (heading) => set({ heading }),
  setPosition: (position) => set({ position }),

  cycleCameraMode: () =>
    set((state) => {
      const idx = CAMERA_MODES.indexOf(state.cameraMode);
      const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
      return { cameraMode: next };
    }),

  togglePause: () => {
    resetGamepadEdgeState();
    set((state) => ({
      gameState: state.gameState === 'playing' ? 'paused' : 'playing',
    }));
  },
  triggerReset: (val) => set({ pendingReset: val }),
  setTelemetryEnabled: (val) => set({ telemetryEnabled: val }),
  setTireGrips: (val) => set({ tireGrips: val }),
  setSurface: (val) => set({ surface: val }),
  setGamepadConnected: (connected, name = '', type = null) =>
    set({ gamepadConnected: connected, gamepadName: name, gamepadType: type }),
  setDrivingAssistsActive: (assists) =>
    set((state) => ({
      absActive: assists.abs !== undefined ? assists.abs : state.absActive,
      tcsActive: assists.tcs !== undefined ? assists.tcs : state.tcsActive,
      espActive: assists.esp !== undefined ? assists.esp : state.espActive,
    })),
}));


