import { describe, it, expect, beforeEach } from 'vitest';
import { blendInputs } from '../useInput';
import {
  setTouchInput,
  getTouchInputState,
  resetTouchInputState,
  getLastInputType,
  setLastInputType,
} from '@/utils/input/touch';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import { STEER_SPEED, GAMEPAD_STEER_SPEED, STEER_DEADZONE } from '@/config/input';

describe('useInput Touch Integration & Multi-Source Blending', () => {
  beforeEach(() => {
    resetTouchInputState();
    setLastInputType('touch');
    useGameStore.setState({
      gameState: 'playing',
      gameMode: 'freeroam',
      cameraMode: 'chase_close',
      telemetryEnabled: false,
    });
    useRacingStore.setState({
      raceStatus: 'idle',
    });
  });

  // --------------------------------------------------------------------------
  // 1. Pure Touch Driving (Single Input Source)
  // --------------------------------------------------------------------------
  describe('Pure Touch Driving', () => {
    it('samples touch throttle cleanly when keyboard and gamepad are idle', () => {
      const touch = { throttle: 0.75, brake: 0, steering: 0 };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.state.throttle).toBe(0.75);
      expect(res.state.brake).toBe(0);
      expect(res.state.steering).toBe(0);
      expect(res.state.handbrake).toBe(false);
    });

    it('samples touch brake cleanly when keyboard and gamepad are idle', () => {
      const touch = { throttle: 0, brake: 0.85, steering: 0 };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.state.throttle).toBe(0);
      expect(res.state.brake).toBe(0.85);
    });

    it('samples simultaneous touch throttle and brake (burnout / launch control)', () => {
      const touch = { throttle: 1.0, brake: 1.0, steering: 0 };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.state.throttle).toBe(1.0);
      expect(res.state.brake).toBe(1.0);
    });

    it('steers Left (+1.0 Left) with high-rate gamepad/touch interpolation speed', () => {
      const touch = { steering: 0.8, throttle: 1.0 };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.targetSteering).toBe(0.8);
      expect(res.steerSpeed).toBe(GAMEPAD_STEER_SPEED);
      expect(res.state.steering).toBeGreaterThan(0);
    });

    it('steers Right (-1.0 Right) with high-rate gamepad/touch interpolation speed', () => {
      const touch = { steering: -0.8, throttle: 1.0 };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.targetSteering).toBe(-0.8);
      expect(res.steerSpeed).toBe(GAMEPAD_STEER_SPEED);
      expect(res.state.steering).toBeLessThan(0);
    });

    it('activates handbrake from touch input', () => {
      const touch = { handbrake: true };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.state.handbrake).toBe(true);
    });

    it('activates reset and cameraToggle from touch input', () => {
      const touch = { reset: true, cameraToggle: true };
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch,
      });

      expect(res.state.reset).toBe(true);
      expect(res.state.cameraToggle).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Keyboard + Touch Blending (Cross-Platform Integrity)
  // --------------------------------------------------------------------------
  describe('Keyboard + Touch Blending', () => {
    it('takes the maximum throttle between keyboard and touch', () => {
      const keysWithW = new Set(['KeyW']);
      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysWithW,
        gp: {},
        touch: { throttle: 0.4 },
      });
      expect(res1.state.throttle).toBe(1.0); // Keyboard (1.0) overrides touch (0.4)

      const keysWithoutW = new Set<string>();
      const res2 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysWithoutW,
        gp: {},
        touch: { throttle: 0.65 },
      });
      expect(res2.state.throttle).toBe(0.65); // Touch (0.65) active when keyboard released
    });

    it('takes the maximum brake between keyboard and touch', () => {
      const keysWithS = new Set(['KeyS']);
      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysWithS,
        gp: {},
        touch: { brake: 0.3 },
      });
      expect(res1.state.brake).toBe(1.0);

      const keysWithoutS = new Set<string>();
      const res2 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysWithoutS,
        gp: {},
        touch: { brake: 0.7 },
      });
      expect(res2.state.brake).toBe(0.7);
    });

    it('combines keyboard and touch steering smoothly and clamps to [-1.0, 1.0]', () => {
      // Both steer Left (+1.0 + +0.5 = 1.5 -> clamped to 1.0)
      const keysA = new Set(['KeyA']);
      const resCoop = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysA,
        gp: {},
        touch: { steering: 0.5 },
      });
      expect(resCoop.targetSteering).toBe(1.0);

      // Opposing: Keyboard Left (+1.0) vs Touch Right (-0.4) -> +0.6
      const resOppose = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysA,
        gp: {},
        touch: { steering: -0.4 },
      });
      expect(resOppose.targetSteering).toBeCloseTo(0.6);

      // Opposing: Keyboard Right (-1.0) vs Touch Left (+0.3) -> -0.7
      const keysD = new Set(['KeyD']);
      const resOpposeRight = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keysD,
        gp: {},
        touch: { steering: 0.3 },
      });
      expect(resOpposeRight.targetSteering).toBeCloseTo(-0.7);
    });

    it('combines handbrake from keyboard (Space) and touch via logical OR', () => {
      const spaceKey = new Set(['Space']);
      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: spaceKey,
        gp: {},
        touch: { handbrake: false },
      });
      expect(res1.state.handbrake).toBe(true);

      const emptyKeys = new Set<string>();
      const res2 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: emptyKeys,
        gp: {},
        touch: { handbrake: true },
      });
      expect(res2.state.handbrake).toBe(true);
    });

    it('combines reset trigger from keyboard (KeyR) and touch via logical OR', () => {
      const keyR = new Set(['KeyR']);
      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: keyR,
        gp: {},
        touch: { reset: false },
      });
      expect(res1.state.reset).toBe(true);

      const emptyKeys = new Set<string>();
      const res2 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: emptyKeys,
        gp: {},
        touch: { reset: true },
      });
      expect(res2.state.reset).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Gamepad + Touch Blending (Cross-Platform Integrity)
  // --------------------------------------------------------------------------
  describe('Gamepad + Touch Blending', () => {
    it('takes the maximum throttle between gamepad analog trigger and touch', () => {
      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { throttle: 0.9 },
        touch: { throttle: 0.4 },
      });
      expect(res1.state.throttle).toBe(0.9);

      const res2 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { throttle: 0.3 },
        touch: { throttle: 0.8 },
      });
      expect(res2.state.throttle).toBe(0.8);
    });

    it('takes the maximum brake between gamepad analog trigger and touch', () => {
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { brake: 0.6 },
        touch: { brake: 0.85 },
      });
      expect(res.state.brake).toBe(0.85);
    });

    it('combines gamepad stick and touch joystick steering smoothly', () => {
      // Both steer Right (-0.3 + -0.4 = -0.7)
      const resRight = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { steering: -0.3 },
        touch: { steering: -0.4 },
      });
      expect(resRight.targetSteering).toBeCloseTo(-0.7);

      // Both steer Left beyond limit (+0.7 + +0.8 = +1.5 -> clamped to 1.0)
      const resLeftClamped = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { steering: 0.7 },
        touch: { steering: 0.8 },
      });
      expect(resLeftClamped.targetSteering).toBe(1.0);
    });

    it('combines handbrake, reset, and cameraToggle across gamepad and touch', () => {
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { handbrake: true, resetToggle: false, cameraToggle: false },
        touch: { handbrake: false, reset: true, cameraToggle: true },
      });

      expect(res.state.handbrake).toBe(true);
      expect(res.state.reset).toBe(true);
      expect(res.state.cameraToggle).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Tri-Modal Blending (Keyboard + Gamepad + Touch)
  // --------------------------------------------------------------------------
  describe('Tri-Modal Blending (Keyboard + Gamepad + Touch)', () => {
    it('seamlessly arbitrates maximum throttle across all three input sources', () => {
      // Gamepad is largest
      const resGp = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { throttle: 0.88 },
        touch: { throttle: 0.5 },
      });
      expect(resGp.state.throttle).toBe(0.88);

      // Keyboard is largest
      const resKb = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set(['ArrowUp']),
        gp: { throttle: 0.5 },
        touch: { throttle: 0.7 },
      });
      expect(resKb.state.throttle).toBe(1.0);

      // Touch is largest
      const resTouch = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { throttle: 0.2 },
        touch: { throttle: 0.95 },
      });
      expect(resTouch.state.throttle).toBe(0.95);
    });

    it('combines steering across all three sources and respects clamp boundaries', () => {
      // Keyboard Left (+1.0) + Gamepad Right (-0.5) + Touch Left (+0.3) = +0.8
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set(['KeyA']),
        gp: { steering: -0.5 },
        touch: { steering: 0.3 },
      });
      expect(res.targetSteering).toBeCloseTo(0.8);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Steering Dynamics & Deadzone
  // --------------------------------------------------------------------------
  describe('Steering Dynamics & Deadzone Handling', () => {
    it('uses STEER_SPEED (5) when pure keyboard is active', () => {
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set(['KeyA']),
        gp: { steering: 0 },
        touch: { steering: 0 },
      });
      expect(res.steerSpeed).toBe(STEER_SPEED);
    });

    it('uses GAMEPAD_STEER_SPEED (18) when touch steering is active', () => {
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: { steering: 0 },
        touch: { steering: 0.5 },
      });
      expect(res.steerSpeed).toBe(GAMEPAD_STEER_SPEED);
    });

    it('snaps steering to zero when below STEER_DEADZONE', () => {
      // If interpolated value is below 0.001
      const res = blendInputs({
        dt: 1 / 60,
        prevSteering: 0.0005,
        keys: new Set<string>(),
        gp: {},
        touch: { steering: 0 },
      });
      expect(Math.abs(res.state.steering)).toBeLessThan(STEER_DEADZONE);
      expect(res.state.steering).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Subsystem State & Input Mode Switching
  // --------------------------------------------------------------------------
  describe('Input Modality Transitions during Driving', () => {
    it('updates lastInputType to touch when touch driving commands are set', () => {
      setLastInputType('keyboard');
      expect(getLastInputType()).toBe('keyboard');

      setTouchInput({ throttle: 1.0 });
      expect(getLastInputType()).toBe('touch');
    });

    it('preserves touch input state across consecutive blend calls', () => {
      setTouchInput({ throttle: 0.8, steering: -0.5 });
      const snap1 = getTouchInputState();

      const res1 = blendInputs({
        dt: 1 / 60,
        prevSteering: 0,
        keys: new Set<string>(),
        gp: {},
        touch: snap1,
      });
      expect(res1.state.throttle).toBe(0.8);

      const snap2 = getTouchInputState();
      expect(snap2.throttle).toBe(0.8);
      expect(snap2.steering).toBe(-0.5);
    });

    it('scales digital keyboard steering turn rate with user sensitivity setting', () => {
      const keys = new Set(['KeyA']);
      const dt = 1 / 60;

      // Default sensitivity (1.0)
      const resDefault = blendInputs({
        dt,
        prevSteering: 0,
        keys,
        sensitivity: 1.0,
      });

      // Low sensitivity (0.2)
      const resLow = blendInputs({
        dt,
        prevSteering: 0,
        keys,
        sensitivity: 0.2,
      });

      // Steering builds up much more gradually at low sensitivity
      expect(resLow.state.steering).toBeLessThan(resDefault.state.steering);
      expect(resLow.state.steering).toBeGreaterThan(0);
      expect(resLow.steerSpeed).toBeLessThan(resDefault.steerSpeed);
    });
  });
});
