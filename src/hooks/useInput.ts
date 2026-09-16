import { useEffect, useRef, useCallback } from 'react';
import type { InputState } from '@/types/game';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRacingStore } from '@/store/racingStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { lerp } from '@/utils/math';
import {
  STEER_SPEED,
  STEER_DEADZONE,
  GAMEPAD_STEER_SPEED,
} from '@/config/input';
import { sampleGamepad, resetGamepadEdgeState, detectGamepadType } from '@/utils/input/gamepad';
import { isTextEditingActive } from '@/utils/input/textInput';
import {
  getTouchInputState,
  setTouchInput,
  setLastInputType,
  type TouchInputState,
} from '@/utils/input/touch';

export const activeKeys = new Set<string>();

/** Global flag indicating if look-back camera is currently requested (keyboard B or gamepad B/RS) */
let _lookBackRequested = false;

/** Global free-look orbit camera offset from Right Analog Stick [-1.0 to 1.0] */
let _cameraLookX = 0;
let _cameraLookY = 0;

/**
 * Returns true if look-back is active on either keyboard or gamepad.
 */
export function isLookBackActive(): boolean {
  return activeKeys.has('KeyB') || _lookBackRequested;
}

const _cameraLookResult = { x: 0, y: 0 };

/**
 * Returns the current orbit camera look offset vector from the Right Analog Stick.
 * x: Horizontal pan [-1.0 (Left) to +1.0 (Right)]
 * y: Vertical tilt [-1.0 (Up) to +1.0 (Down)]
 */
export function getCameraLook(): { x: number; y: number } {
  _cameraLookResult.x = _cameraLookX;
  _cameraLookResult.y = _cameraLookY;
  return _cameraLookResult;
}

export interface BlendInputsOptions {
  dt: number;
  prevSteering: number;
  keys?: Set<string>;
  gp?: {
    steering?: number;
    throttle?: number;
    brake?: number;
    handbrake?: boolean;
    gearUp?: boolean;
    gearDown?: boolean;
    resetHeld?: boolean;
    resetToggle?: boolean;
    cameraToggle?: boolean;
    pauseToggle?: boolean;
  };
  touch?: Partial<TouchInputState>;
  kbGearUp?: boolean;
  kbGearDown?: boolean;
  sensitivity?: number;
}

export interface MergedInputResult {
  state: InputState;
  targetSteering: number;
  steerSpeed: number;
}

/**
 * Pure blending function combining Keyboard, Gamepad, and Touch input sources.
 * Steering: Left is +1.0, Right is -1.0 (OpenRally standard). Clamped to [-1.0, 1.0].
 * Throttle & Brake: Maximum of keyboard digital values, gamepad analog triggers, and touch.
 * Handbrake & Reset: Logical OR across all active input modalities.
 * Gears: Edge-triggered shift up and down pulses.
 */
export function blendInputs({
  dt,
  prevSteering,
  keys = activeKeys,
  gp = {},
  touch = getTouchInputState(),
  kbGearUp = false,
  kbGearDown = false,
  sensitivity = 1.0,
}: BlendInputsOptions): MergedInputResult {
  const gpSteering = gp.steering ?? 0;
  const gpThrottle = gp.throttle ?? 0;
  const gpBrake = gp.brake ?? 0;
  const gpHandbrake = Boolean(gp.handbrake);
  const gpReset = Boolean(gp.resetHeld || gp.resetToggle);
  const gpCameraToggle = Boolean(gp.cameraToggle);
  const gpGearUp = Boolean(gp.gearUp);
  const gpGearDown = Boolean(gp.gearDown);

  const touchSteering = touch.steering ?? 0;
  const touchThrottle = touch.throttle ?? 0;
  const touchBrake = touch.brake ?? 0;
  const touchHandbrake = Boolean(touch.handbrake);
  const touchReset = Boolean(touch.reset);
  const touchCameraToggle = Boolean(touch.cameraToggle);
  const touchGearUp = Boolean(touch.gearUp);
  const touchGearDown = Boolean(touch.gearDown);

  const kbThrottle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  const kbBrake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  const kbSteer =
    (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
    (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0);

  const throttle = Math.max(kbThrottle, gpThrottle, touchThrottle);
  const brake = Math.max(kbBrake, gpBrake, touchBrake);
  const handbrake = keys.has('Space') || gpHandbrake || touchHandbrake;
  const reset = keys.has('KeyR') || gpReset || touchReset;
  const cameraToggle = Boolean(gpCameraToggle || touchCameraToggle);
  const gearUp = gpGearUp || touchGearUp || kbGearUp;
  const gearDown = gpGearDown || touchGearDown || kbGearDown;

  // Determine steering speed:
  // Analog inputs (gamepad stick or touch steering) use responsive GAMEPAD_STEER_SPEED scaled by sensitivity.
  // Digital keyboard inputs use STEER_SPEED scaled by user sensitivity, allowing
  // delicate micro-corrections at low sensitivity without jerky snap oversteer.
  let steerSpeed = STEER_SPEED;
  const isAnalogSteering = Math.abs(gpSteering) > 0.001 || Math.abs(touchSteering) > 0.001;

  if (isAnalogSteering) {
    steerSpeed = GAMEPAD_STEER_SPEED * Math.max(0.4, Math.min(1.6, Math.sqrt(sensitivity)));
  } else if (kbSteer !== 0) {
    steerSpeed = STEER_SPEED * Math.max(0.15, Math.min(2.5, sensitivity));
  } else {
    // Re-centering when keyboard keys released: quick and stable
    steerSpeed = Math.max(STEER_SPEED, STEER_SPEED * Math.min(1.5, sensitivity));
  }

  const combinedSteer = kbSteer + gpSteering + touchSteering;
  const targetSteering = Math.max(-1.0, Math.min(1.0, combinedSteer));

  const steerLerp = 1 - Math.exp(-steerSpeed * dt);
  const newSteering = lerp(prevSteering, targetSteering, steerLerp);
  const clampedSteering = Math.abs(newSteering) < STEER_DEADZONE ? 0 : newSteering;

  return {
    state: {
      steering: clampedSteering,
      throttle,
      brake,
      handbrake,
      cameraToggle,
      reset,
      gearUp,
      gearDown,
    },
    targetSteering,
    steerSpeed,
  };
}

/**
 * Returns a function that updates and returns the current InputState.
 * Designed to be called inside useFrame with delta time.
 * Handles Keyboard, Gamepad, and Touch inputs seamlessly.
 */
export function useInputUpdater(): (dt: number) => InputState {
  const stateRef = useRef<InputState>({
    steering: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    cameraToggle: false,
    reset: false,
  });

  const cameraToggledRef = useRef(false);
  const escapeToggledRef = useRef(false);
  const telemetryToggledRef = useRef(false);
  const keyGearUpHeldRef = useRef(false);
  const keyGearDownHeldRef = useRef(false);

  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const setGameState = useGameStore((s) => s.setGameState);
  const setTelemetryEnabled = useGameStore((s) => s.setTelemetryEnabled);
  const setGamepadConnected = useGameStore((s) => s.setGamepadConnected);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTextEditingActive(e)) {
        return;
      }

      setLastInputType('keyboard');
      activeKeys.add(e.code);

      // Camera cycle
      if (e.code === 'KeyC' && !cameraToggledRef.current) {
        cameraToggledRef.current = true;
        cycleCameraMode();
      }

      // Telemetry HUD toggle
      if (e.code === 'KeyT' && !telemetryToggledRef.current) {
        telemetryToggledRef.current = true;
        const current = useGameStore.getState().telemetryEnabled;
        setTelemetryEnabled(!current);
      }

      // Escape for Pause Menu (only enters pause from active gameplay; unpausing is handled exclusively by MenuOverlay)
      if (e.code === 'Escape' && !escapeToggledRef.current) {
        escapeToggledRef.current = true;

        const state = useGameStore.getState();
        if (state.gameState === 'playing') {
          setGameState('paused');
        }
      }

      if (
        [
          'KeyW', 'KeyA', 'KeyS', 'KeyD',
          'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
          'Space',
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    },
    [cycleCameraMode, setGameState, setTelemetryEnabled],
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    activeKeys.delete(e.code);
    if (e.code === 'KeyC') {
      cameraToggledRef.current = false;
    }
    if (e.code === 'KeyT') {
      telemetryToggledRef.current = false;
    }
    if (e.code === 'Escape') {
      escapeToggledRef.current = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const onGamepadConnected = (e: GamepadEvent) => {
      setGamepadConnected(true, e.gamepad.id, detectGamepadType(e.gamepad.id));
    };

    const onGamepadDisconnected = () => {
      setGamepadConnected(false, '', null);
      resetGamepadEdgeState();
    };

    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
    };
  }, [handleKeyDown, handleKeyUp, setGamepadConnected]);

  return useCallback((dt: number): InputState => {
    const gameState = useGameStore.getState().gameState;

    // If not playing (paused or menu), zero out movement inputs and return immediately!
    // Do NOT poll sampleGamepad here so that MenuOverlay has exclusive access to gamepad navigation.
    if (gameState !== 'playing') {
      _cameraLookX = 0;
      _cameraLookY = 0;
      stateRef.current.throttle = 0;
      stateRef.current.brake = 0;
      stateRef.current.steering = 0;
      stateRef.current.handbrake = false;
      stateRef.current.gearUp = false;
      stateRef.current.gearDown = false;
      stateRef.current.reset = false;
      return stateRef.current;
    }

    const gameMode = useGameStore.getState().gameMode;
    const raceStatus = useRacingStore.getState().raceStatus;
    const gymkhanaStatus = useGymkhanaStore.getState().status;
    const isCountingDown = 
      (gameMode === 'timeattack' && raceStatus === 'countdown') ||
      (gameMode === 'gymkhana_blitz' && gymkhanaStatus === 'countdown');

    if (isCountingDown) {
      _cameraLookX = 0;
      _cameraLookY = 0;
      stateRef.current.throttle = 0;
      stateRef.current.brake = 1;
      stateRef.current.steering = 0;
      stateRef.current.handbrake = true;
      stateRef.current.reset = false;
      return stateRef.current;
    }

    // If Gymkhana Blitz has completed or results modal is displayed, halt vehicle and yield
    // exclusive gamepad access to GymkhanaCompleteModal (prevents car motion and button edge stealing)
    const showGymkhanaModal = useGymkhanaStore.getState().showResultsModal;
    const isGymkhanaFinished =
      showGymkhanaModal ||
      (gameMode === 'gymkhana_blitz' && gymkhanaStatus === 'completed');

    if (isGymkhanaFinished) {
      _cameraLookX = 0;
      _cameraLookY = 0;
      stateRef.current.throttle = 0;
      stateRef.current.brake = 1;
      stateRef.current.steering = 0;
      stateRef.current.handbrake = true;
      stateRef.current.gearUp = false;
      stateRef.current.gearDown = false;
      stateRef.current.reset = false;
      return stateRef.current;
    }

    const isSpectating = useMultiplayerStore.getState().isSpectating;
    if (isSpectating) {
      _cameraLookX = 0;
      _cameraLookY = 0;
      stateRef.current.throttle = 0;
      stateRef.current.brake = 1;
      stateRef.current.steering = 0;
      stateRef.current.handbrake = true;
      stateRef.current.gearUp = false;
      stateRef.current.gearDown = false;
      stateRef.current.reset = false;
      return stateRef.current;
    }

    const sensitivity = useSettingsStore.getState().sensitivity;

    // Poll Gamepad for active gameplay
    const gp = sampleGamepad(sensitivity);

    // Sync gamepad connection status if changed
    const currentGpConnected = useGameStore.getState().gamepadConnected;
    const currentGpType = useGameStore.getState().gamepadType;
    if (gp.connected !== currentGpConnected || gp.type !== currentGpType) {
      setGamepadConnected(gp.connected, gp.name, gp.type);
    }

    // Switch input mode to gamepad if gamepad activity is detected
    if (
      gp.throttle > 0.05 ||
      gp.brake > 0.05 ||
      Math.abs(gp.steering) > 0.05 ||
      gp.handbrake ||
      gp.gearUp ||
      gp.gearDown ||
      gp.resetHeld ||
      gp.resetToggle ||
      gp.cameraToggle ||
      gp.pauseToggle
    ) {
      setLastInputType('gamepad');
    }

    // In-game driving hotkeys from Gamepad or Touch (only active when playing)
    const touch = getTouchInputState();

    if (gp.pauseToggle || touch.pause) {
      setGameState('paused');
      if (touch.pause) {
        setTouchInput({ pause: false });
      }
    }

    if (gp.cameraToggle || touch.cameraToggle) {
      cycleCameraMode();
      if (touch.cameraToggle) {
        setTouchInput({ cameraToggle: false });
      }
    }

    if (gp.telemetryToggle) {
      const current = useGameStore.getState().telemetryEnabled;
      setTelemetryEnabled(!current);
    }

    _lookBackRequested = gp.lookBack;
    _cameraLookX = gp.cameraLookX;
    _cameraLookY = gp.cameraLookY;

    const isE = activeKeys.has('KeyE');
    const isQ = activeKeys.has('KeyQ');
    const kbGearUp = isE && !keyGearUpHeldRef.current;
    const kbGearDown = isQ && !keyGearDownHeldRef.current;
    keyGearUpHeldRef.current = isE;
    keyGearDownHeldRef.current = isQ;

    const merged = blendInputs({
      dt,
      prevSteering: stateRef.current.steering,
      keys: activeKeys,
      gp,
      touch,
      kbGearUp,
      kbGearDown,
      sensitivity,
    });

    if (touch.gearUp) {
      setTouchInput({ gearUp: false });
    }
    if (touch.gearDown) {
      setTouchInput({ gearDown: false });
    }
    if (touch.reset) {
      setTouchInput({ reset: false });
    }

    stateRef.current = merged.state;
    return stateRef.current;
  }, [cycleCameraMode, setGameState, setGamepadConnected, setTelemetryEnabled]);
}
