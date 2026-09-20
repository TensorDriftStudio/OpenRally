import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import {
  setTouchInput,
  resetTouchInputState,
  getLastInputType,
  isTouchDevice,
  triggerHapticFeedback,
  calculateJoystickSteering,
  calculateDigitalSteering,
  JOYSTICK_BASE_RADIUS,
  JOYSTICK_DEADZONE_RATIO,
  type InputType,
} from '@/utils/input/touch';
import {
  startTiltSensorListener,
  calibrateTiltCenter,
  isIosMotionPermissionRequired,
  getTiltPermissionState,
  requestTiltPermission,
  setTiltTouchOverride,
} from '@/utils/input/tilt';

import type {
  TouchControlMode,
  TouchSteeringScheme,
  TouchButtonSize,
} from '@/types';

export interface TouchControlsOverlayProps {
  /** Optional override to force visibility regardless of input mode (useful for testing/previews) */
  forceVisible?: boolean;
  touchControlMode?: TouchControlMode;
  touchSteeringScheme?: TouchSteeringScheme;
  touchOpacity?: number;
  touchButtonSize?: TouchButtonSize;
  touchHaptics?: boolean;
}

interface JoystickCoords {
  x: number;
  y: number;
}

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = memo(function TouchControlsOverlay({
  forceVisible,
  touchControlMode: propMode,
  touchSteeringScheme: propScheme,
  touchOpacity: propOpacity,
  touchButtonSize: propSize,
  touchHaptics: propHaptics,
}) {
  const storeMode = useSettingsStore((s) => s.touchControlMode);
  const storeScheme = useSettingsStore((s) => s.touchSteeringScheme);
  const storeOpacity = useSettingsStore((s) => s.touchOpacity);
  const storeSize = useSettingsStore((s) => s.touchButtonSize);
  const storeHaptics = useSettingsStore((s) => s.touchHaptics);
  const transmissionMode = useSettingsStore((s) => s.transmissionMode);

  const effectiveMode = useSettingsStore.getState().touchControlMode ?? storeMode;
  const effectiveScheme = useSettingsStore.getState().touchSteeringScheme ?? storeScheme;
  const effectiveOpacity = useSettingsStore.getState().touchOpacity ?? storeOpacity;
  const effectiveSize = useSettingsStore.getState().touchButtonSize ?? storeSize;
  const effectiveHaptics = useSettingsStore.getState().touchHaptics ?? storeHaptics;

  const touchControlMode = propMode ?? effectiveMode;
  const touchSteeringScheme = propScheme ?? effectiveScheme;
  const touchOpacity = propOpacity ?? effectiveOpacity;
  const touchButtonSize = propSize ?? effectiveSize;
  const touchHaptics = propHaptics ?? effectiveHaptics;

  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const setGameState = useGameStore((s) => s.setGameState);

  const [activeInputType, setActiveInputType] = useState<InputType>(() => getLastInputType());

  // Joystick state
  const [joystickOrigin, setJoystickOrigin] = useState<JoystickCoords | null>(null);
  const [joystickKnob, setJoystickKnob] = useState<JoystickCoords | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);

  // Digital button state (for buttons scheme)
  const [leftSteerPressed, setLeftSteerPressed] = useState(false);
  const [rightSteerPressed, setRightSteerPressed] = useState(false);
  const leftSteerRef = useRef(false);
  const rightSteerRef = useRef(false);

  // Pedal state
  const [throttlePressed, setThrottlePressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);
  const [handbrakePressed, setHandbrakePressed] = useState(false);

  // Tilt state
  const [calibratedToast, setCalibratedToast] = useState(false);

  // Start tilt listener when tilt steering is selected and auto-request iOS permission on first gesture
  useEffect(() => {
    if (touchSteeringScheme !== 'tilt') return;

    const cleanup = startTiltSensorListener();

    // On iOS 13+, motion sensor permission must be requested via user gesture.
    // If not yet granted, request it automatically on the first user interaction.
    let cleanupPointer: (() => void) | undefined;
    if (isIosMotionPermissionRequired() && getTiltPermissionState() !== 'granted') {
      const handleFirstInteraction = async () => {
        const res = await requestTiltPermission();
        if (res === 'granted' && touchHaptics) {
          triggerHapticFeedback(20);
        }
      };
      window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
      cleanupPointer = () => {
        window.removeEventListener('pointerdown', handleFirstInteraction);
      };
    }

    return () => {
      cleanup();
      cleanupPointer?.();
      setTiltTouchOverride(false);
    };
  }, [touchSteeringScheme, touchHaptics]);

  const handleCalibrateCenter = useCallback(() => {
    calibrateTiltCenter();
    if (touchHaptics) triggerHapticFeedback(15);
    setCalibratedToast(true);
    setTimeout(() => setCalibratedToast(false), 1200);
  }, [touchHaptics]);

  // Listen to input type switches across window
  useEffect(() => {
    const handleInputSwitch = (e?: Event) => {
      if (e && 'detail' in e && typeof (e as CustomEvent).detail?.modality === 'string') {
        setActiveInputType((e as CustomEvent).detail.modality);
      } else {
        setActiveInputType(getLastInputType());
      }
    };

    window.addEventListener('pointerdown', handleInputSwitch, { passive: true });
    window.addEventListener('touchstart', handleInputSwitch, { passive: true });
    window.addEventListener('keydown', handleInputSwitch, { passive: true });
    window.addEventListener('openrally-input-switch', handleInputSwitch as EventListener);

    return () => {
      window.removeEventListener('pointerdown', handleInputSwitch);
      window.removeEventListener('touchstart', handleInputSwitch);
      window.removeEventListener('keydown', handleInputSwitch);
      window.removeEventListener('openrally-input-switch', handleInputSwitch as EventListener);
    };
  }, []);

  // Cleanup inputs on unmount
  useEffect(() => {
    return () => {
      resetTouchInputState();
    };
  }, []);

  // Determine visibility
  const effectiveInputType = getLastInputType() || activeInputType;
  const isVisible =
    forceVisible ??
    (touchControlMode === 'always' ||
      (touchControlMode === 'auto' &&
        (effectiveInputType === 'touch' || isTouchDevice()) &&
        effectiveInputType !== 'keyboard' &&
        effectiveInputType !== 'gamepad'));

  // Calculate size multiplier
  const sizeMultiplier =
    touchButtonSize === 'small' ? 0.85 : touchButtonSize === 'large' ? 1.15 : 1.0;

  // --------------------------------------------------------------------------
  // Floating Joystick Handlers
  // --------------------------------------------------------------------------
  const handleJoystickPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== null) return;
      joystickPointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture not supported or rejected
      }

      const origin = { x: e.clientX, y: e.clientY };
      setJoystickOrigin(origin);
      setJoystickKnob(origin);

      const result = calculateJoystickSteering(
        origin.x,
        e.clientX,
        JOYSTICK_BASE_RADIUS,
        JOYSTICK_DEADZONE_RATIO
      );
      setTouchInput({ steering: result.steering });
      if (touchHaptics) triggerHapticFeedback(10);
    },
    [touchHaptics]
  );

  const handleJoystickPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== e.pointerId || !joystickOrigin) return;

      const deltaX = e.clientX - joystickOrigin.x;
      const deltaY = e.clientY - joystickOrigin.y;
      const dist = Math.hypot(deltaX, deltaY);

      let knobOffsetX = deltaX;
      let knobOffsetY = deltaY;
      if (dist > JOYSTICK_BASE_RADIUS) {
        knobOffsetX = (deltaX / dist) * JOYSTICK_BASE_RADIUS;
        knobOffsetY = (deltaY / dist) * JOYSTICK_BASE_RADIUS;
      }

      // Direct DOM mutation on the knob avoids re-rendering the entire 724-line overlay at 120-240Hz
      if (joystickKnobRef.current) {
        joystickKnobRef.current.style.transform = `translate3d(${knobOffsetX}px, ${knobOffsetY}px, 0)`;
      }

      const result = calculateJoystickSteering(
        joystickOrigin.x,
        e.clientX,
        JOYSTICK_BASE_RADIUS,
        JOYSTICK_DEADZONE_RATIO
      );
      setTouchInput({ steering: result.steering });
    },
    [joystickOrigin]
  );

  const handleJoystickPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== e.pointerId) return;
      joystickPointerIdRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      setJoystickOrigin(null);
      setJoystickKnob(null);
      setTouchInput({ steering: 0 });
    },
    []
  );

  // --------------------------------------------------------------------------
  // Digital Buttons Handlers (Scheme: buttons)
  // --------------------------------------------------------------------------
  const handleLeftSteerDown = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      leftSteerRef.current = true;
      setLeftSteerPressed(true);
      if (touchHaptics) triggerHapticFeedback(10);
      setTouchInput({
        steering: calculateDigitalSteering(true, rightSteerRef.current),
      });
    },
    [touchHaptics]
  );

  const handleLeftSteerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      leftSteerRef.current = false;
      setLeftSteerPressed(false);
      setTouchInput({
        steering: calculateDigitalSteering(false, rightSteerRef.current),
      });
    },
    []
  );

  const handleRightSteerDown = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      rightSteerRef.current = true;
      setRightSteerPressed(true);
      if (touchHaptics) triggerHapticFeedback(10);
      setTouchInput({
        steering: calculateDigitalSteering(leftSteerRef.current, true),
      });
    },
    [touchHaptics]
  );

  const handleRightSteerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      rightSteerRef.current = false;
      setRightSteerPressed(false);
      setTouchInput({
        steering: calculateDigitalSteering(leftSteerRef.current, false),
      });
    },
    []
  );

  // --------------------------------------------------------------------------
  // Pedal Handlers (Throttle, Brake, Handbrake)
  // --------------------------------------------------------------------------
  const handleThrottleDown = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setThrottlePressed(true);
      if (touchHaptics) triggerHapticFeedback(15);
      setTouchInput({ throttle: 1.0 });
    },
    [touchHaptics]
  );

  const handleThrottleUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setThrottlePressed(false);
      setTouchInput({ throttle: 0.0 });
    },
    []
  );

  const handleBrakeDown = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setBrakePressed(true);
      if (touchHaptics) triggerHapticFeedback(15);
      setTouchInput({ brake: 1.0 });
    },
    [touchHaptics]
  );

  const handleBrakeUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setBrakePressed(false);
      setTouchInput({ brake: 0.0 });
    },
    []
  );

  const handleHandbrakeDown = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      e.stopPropagation();
      setHandbrakePressed(true);
      if (touchHaptics) triggerHapticFeedback(25);
      setTouchInput({ handbrake: true });
    },
    [touchHaptics]
  );

  const handleHandbrakeUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      e.stopPropagation();
      setHandbrakePressed(false);
      setTouchInput({ handbrake: false });
    },
    []
  );

  // --------------------------------------------------------------------------
  // Top Utility Handlers (Pause, Reset, Camera)
  // --------------------------------------------------------------------------
  const handlePause = useCallback(() => {
    if (touchHaptics) triggerHapticFeedback(15);
    setTouchInput({ pause: true });
    setGameState('paused');
  }, [touchHaptics, setGameState]);

  const handleResetCar = useCallback(() => {
    if (touchHaptics) triggerHapticFeedback(20);
    setTouchInput({ reset: true });
  }, [touchHaptics]);

  const handleCameraCycle = useCallback(() => {
    if (touchHaptics) triggerHapticFeedback(10);
    setTouchInput({ cameraToggle: true });
    cycleCameraMode();
  }, [touchHaptics, cycleCameraMode]);

  const handleShiftUp = useCallback(() => {
    if (touchHaptics) triggerHapticFeedback(15);
    setTouchInput({ gearUp: true });
  }, [touchHaptics]);

  const handleShiftDown = useCallback(() => {
    if (touchHaptics) triggerHapticFeedback(15);
    setTouchInput({ gearDown: true });
  }, [touchHaptics]);

  if (!isVisible) {
    return null;
  }

  const baseOpacity = Math.max(0.2, Math.min(1.0, touchOpacity));

  return (
    <div
      data-testid="touch-controls-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        opacity: baseOpacity,
      }}
    >
      {/* -------------------------------------------------------------------- */}
      {/* Top Utility Buttons Bar */}
      {/* -------------------------------------------------------------------- */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + var(--sat, 0px))',
          left: 'calc(16px + var(--sal, 0px))',
          display: 'flex',
          gap: '10px',
          pointerEvents: 'auto',
        }}
      >
        {/* Pause Button */}
        <button
          type="button"
          data-testid="touch-btn-pause"
          aria-label="Pause Game"
          onClick={handlePause}
          style={{
            ...utilityBtnStyle,
            width: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
            height: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
          }}
        >
          <span style={{ fontSize: '15px', letterSpacing: '1px' }}>❚❚</span>
        </button>

        {/* Reset Car Button */}
        <button
          type="button"
          data-testid="touch-btn-reset"
          aria-label="Reset Vehicle"
          onClick={handleResetCar}
          style={{
            ...utilityBtnStyle,
            width: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
            height: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
          }}
        >
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>↺</span>
        </button>

        {/* Camera Toggle Button */}
        <button
          type="button"
          data-testid="touch-btn-camera"
          aria-label="Cycle Camera View"
          onClick={handleCameraCycle}
          style={{
            ...utilityBtnStyle,
            width: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
            height: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
          }}
        >
          <span style={{ fontSize: '16px' }}>📷</span>
        </button>

        {/* Calibrate Neutral Tilt Button */}
        {touchSteeringScheme === 'tilt' && (
          <button
            type="button"
            data-testid="touch-btn-tilt-calibrate"
            aria-label="Calibrate Neutral Tilt"
            onClick={handleCalibrateCenter}
            style={{
              ...utilityBtnStyle,
              width: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
              height: `${Math.max(44, Math.round(44 * sizeMultiplier))}px`,
              background: calibratedToast ? 'rgba(16, 185, 129, 0.65)' : 'rgba(15, 23, 42, 0.75)',
              borderColor: calibratedToast ? '#10b981' : 'rgba(0, 212, 255, 0.5)',
              color: calibratedToast ? '#ffffff' : '#67e8f9',
            }}
            title="Calibrate Neutral Steering"
          >
            <span style={{ fontSize: '15px' }}>⌖</span>
          </button>
        )}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Left Thumb: Steering Area (Joystick or Digital Buttons) */}
      {/* -------------------------------------------------------------------- */}
      {touchSteeringScheme === 'joystick' ? (
        <div
          data-testid="touch-joystick-zone"
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '45vw',
            height: '60vh',
            pointerEvents: 'auto',
            touchAction: 'none',
          }}
        >
          {/* Subtle resting guide when not touched */}
          {!joystickOrigin && (
            <div
              style={{
                position: 'absolute',
                left: 'calc(40px + var(--sal, 0px))',
                bottom: 'calc(40px + var(--sab, 0px))',
                width: `${JOYSTICK_BASE_RADIUS * 2}px`,
                height: `${JOYSTICK_BASE_RADIUS * 2}px`,
                borderRadius: '50%',
                border: '2px dashed rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                STEER
              </span>
            </div>
          )}

          {/* Active Floating Joystick */}
          {joystickOrigin && joystickKnob && (
            <div
              data-testid="touch-joystick-base"
              style={{
                position: 'fixed',
                left: `${joystickOrigin.x - JOYSTICK_BASE_RADIUS}px`,
                top: `${joystickOrigin.y - JOYSTICK_BASE_RADIUS}px`,
                width: `${JOYSTICK_BASE_RADIUS * 2}px`,
                height: `${JOYSTICK_BASE_RADIUS * 2}px`,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0,212,255,0.15) 0%, rgba(15,23,42,0.65) 100%)',
                border: '2px solid rgba(0, 212, 255, 0.6)',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                pointerEvents: 'none',
              }}
            >
              {/* Central Thumb Knob */}
              <div
                ref={joystickKnobRef}
                data-testid="touch-joystick-knob"
                style={{
                  position: 'fixed',
                  left: `${joystickKnob.x - 22}px`,
                  top: `${joystickKnob.y - 22}px`,
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #00d4ff 0%, #0070d1 100%)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 212, 255, 0.8)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          )}
        </div>
      ) : touchSteeringScheme === 'buttons' ? (
        /* Digital Left / Right Steering Buttons */
        <div
          style={{
            position: 'absolute',
            left: 'calc(24px + var(--sal, 0px))',
            bottom: 'calc(24px + var(--sab, 0px))',
            display: 'flex',
            gap: '12px',
            pointerEvents: 'auto',
          }}
        >
          {/* Steer Left */}
          <button
            type="button"
            data-testid="touch-btn-steer-left"
            aria-label="Steer Left"
            onPointerDown={handleLeftSteerDown}
            onPointerUp={handleLeftSteerUp}
            onPointerCancel={handleLeftSteerUp}
            onPointerLeave={handleLeftSteerUp}
            style={{
              ...steerBtnStyle,
              width: `${Math.round(80 * sizeMultiplier)}px`,
              height: `${Math.round(76 * sizeMultiplier)}px`,
              background: leftSteerPressed
                ? 'rgba(0, 212, 255, 0.45)'
                : 'rgba(15, 23, 42, 0.75)',
              borderColor: leftSteerPressed ? '#00d4ff' : 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <span style={{ fontSize: '24px' }}>◄</span>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>LEFT</span>
          </button>

          {/* Steer Right */}
          <button
            type="button"
            data-testid="touch-btn-steer-right"
            aria-label="Steer Right"
            onPointerDown={handleRightSteerDown}
            onPointerUp={handleRightSteerUp}
            onPointerCancel={handleRightSteerUp}
            onPointerLeave={handleRightSteerUp}
            style={{
              ...steerBtnStyle,
              width: `${Math.round(80 * sizeMultiplier)}px`,
              height: `${Math.round(76 * sizeMultiplier)}px`,
              background: rightSteerPressed
                ? 'rgba(0, 212, 255, 0.45)'
                : 'rgba(15, 23, 42, 0.75)',
              borderColor: rightSteerPressed ? '#00d4ff' : 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <span style={{ fontSize: '24px' }}>►</span>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>RIGHT</span>
          </button>
        </div>
      ) : (
        /* Motion Sensor (Tilt) Mode - Left Thumb Placement for Handbrake Drift */
        <div
          style={{
            position: 'absolute',
            left: 'calc(24px + var(--sal, 0px))',
            bottom: 'calc(24px + var(--sab, 0px))',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            data-testid="touch-btn-handbrake"
            aria-label="Handbrake Drift"
            onPointerDown={handleHandbrakeDown}
            onPointerUp={handleHandbrakeUp}
            onPointerCancel={handleHandbrakeUp}
            onPointerLeave={handleHandbrakeUp}
            style={{
              ...pedalBaseStyle,
              width: `${Math.round(92 * sizeMultiplier)}px`,
              height: `${Math.round(76 * sizeMultiplier)}px`,
              borderRadius: '20px',
              background: handbrakePressed
                ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.6) 0%, rgba(217, 119, 6, 0.8) 100%)'
                : 'linear-gradient(180deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
              borderColor: handbrakePressed ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)',
              boxShadow: handbrakePressed ? '0 0 14px rgba(245, 158, 11, 0.5)' : 'none',
            }}
          >
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fde68a', letterSpacing: '0.5px' }}>
              DRIFT
            </span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>HANDBRAKE</span>
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Right Thumb: Pedals & Handbrake Cluster */}
      {/* -------------------------------------------------------------------- */}
      <div
        style={{
          position: 'absolute',
          right: 'calc(24px + var(--sar, 0px))',
          bottom: 'calc(24px + var(--sab, 0px))',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '14px',
          pointerEvents: 'auto',
        }}
      >
        {/* Brake / Reverse Pedal */}
        <button
          type="button"
          data-testid="touch-pedal-brake"
          aria-label="Brake or Reverse"
          onPointerDown={handleBrakeDown}
          onPointerUp={handleBrakeUp}
          onPointerCancel={handleBrakeUp}
          onPointerLeave={handleBrakeUp}
          style={{
            ...pedalBaseStyle,
            width: `${Math.round(76 * sizeMultiplier)}px`,
            height: `${Math.round(92 * sizeMultiplier)}px`,
            background: brakePressed
              ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.6) 0%, rgba(185, 28, 28, 0.8) 100%)'
              : 'linear-gradient(180deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
            borderColor: brakePressed ? '#ef4444' : 'rgba(239, 68, 68, 0.4)',
            boxShadow: brakePressed ? '0 0 16px rgba(239, 68, 68, 0.5)' : 'none',
          }}
        >
          <span style={{ fontSize: '20px' }}>▼</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5' }}>BRAKE</span>
          <span style={{ fontSize: '9px', opacity: 0.7 }}>REV</span>
        </button>

        {/* Throttle Pedal (Gas) */}
        <button
          type="button"
          data-testid="touch-pedal-throttle"
          aria-label="Accelerate"
          onPointerDown={handleThrottleDown}
          onPointerUp={handleThrottleUp}
          onPointerCancel={handleThrottleUp}
          onPointerLeave={handleThrottleUp}
          style={{
            ...pedalBaseStyle,
            width: `${Math.round(76 * sizeMultiplier)}px`,
            height: `${Math.round(112 * sizeMultiplier)}px`,
            background: throttlePressed
              ? 'linear-gradient(180deg, rgba(0, 212, 255, 0.6) 0%, rgba(0, 112, 209, 0.8) 100%)'
              : 'linear-gradient(180deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
            borderColor: throttlePressed ? '#00d4ff' : 'rgba(0, 212, 255, 0.4)',
            boxShadow: throttlePressed ? '0 0 16px rgba(0, 212, 255, 0.5)' : 'none',
          }}
        >
          <span style={{ fontSize: '24px' }}>▲</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#67e8f9' }}>GAS</span>
          <span style={{ fontSize: '9px', opacity: 0.7 }}>THROTTLE</span>
        </button>
      </div>

      {/* Handbrake Button (Drift) - Right Thumb Placement (when not in tilt mode) */}
      {touchSteeringScheme !== 'tilt' && (
        <div
          style={{
            position: 'absolute',
            right: 'calc(24px + var(--sar, 0px))',
            bottom: `calc(${Math.round(150 * sizeMultiplier)}px + var(--sab, 0px))`,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            data-testid="touch-btn-handbrake"
            aria-label="Handbrake Drift"
            onPointerDown={handleHandbrakeDown}
            onPointerUp={handleHandbrakeUp}
            onPointerCancel={handleHandbrakeUp}
            onPointerLeave={handleHandbrakeUp}
            style={{
              ...pedalBaseStyle,
              width: `${Math.round(84 * sizeMultiplier)}px`,
              height: `${Math.max(44, Math.round(48 * sizeMultiplier))}px`,
              borderRadius: '24px',
              background: handbrakePressed
                ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.6) 0%, rgba(217, 119, 6, 0.8) 100%)'
                : 'linear-gradient(180deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
              borderColor: handbrakePressed ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)',
              boxShadow: handbrakePressed ? '0 0 14px rgba(245, 158, 11, 0.5)' : 'none',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fde68a', letterSpacing: '0.5px' }}>
              DRIFT
            </span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>HANDBRAKE</span>
          </button>
        </div>
      )}

      {/* Manual Transmission Shift Buttons (Shift UP / DOWN) */}
      {transmissionMode === 'manual' && (
        <div
          data-testid="touch-manual-shifter"
          style={{
            position: 'absolute',
            right:
              touchSteeringScheme === 'tilt'
                ? 'calc(24px + var(--sar, 0px))'
                : `calc(${Math.round(120 * sizeMultiplier)}px + var(--sar, 0px))`,
            bottom: `calc(${Math.round(150 * sizeMultiplier)}px + var(--sab, 0px))`,
            display: 'flex',
            gap: '8px',
            pointerEvents: 'auto',
          }}
        >
          {/* Shift Down */}
          <button
            type="button"
            data-testid="touch-btn-shift-down"
            aria-label="Shift Down"
            onPointerDown={handleShiftDown}
            style={{
              ...utilityBtnStyle,
              width: `${Math.max(44, Math.round(48 * sizeMultiplier))}px`,
              height: `${Math.max(44, Math.round(48 * sizeMultiplier))}px`,
              background: 'rgba(245, 158, 11, 0.35)',
              borderColor: '#f59e0b',
              color: '#fde68a',
              fontWeight: 900,
              fontSize: '18px',
            }}
          >
            -
          </button>

          {/* Shift Up */}
          <button
            type="button"
            data-testid="touch-btn-shift-up"
            aria-label="Shift Up"
            onPointerDown={handleShiftUp}
            style={{
              ...utilityBtnStyle,
              width: `${Math.max(44, Math.round(48 * sizeMultiplier))}px`,
              height: `${Math.max(44, Math.round(48 * sizeMultiplier))}px`,
              background: 'rgba(56, 189, 248, 0.35)',
              borderColor: '#38bdf8',
              color: '#bae6fd',
              fontWeight: 900,
              fontSize: '18px',
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
});

// --------------------------------------------------------------------------
// Shared Style Objects
// --------------------------------------------------------------------------
const utilityBtnStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.75)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '12px',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  touchAction: 'none',
  padding: 0,
};

const steerBtnStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  touchAction: 'none',
  padding: 0,
};

const pedalBaseStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  touchAction: 'none',
  padding: 0,
};
