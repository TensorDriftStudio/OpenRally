import {
  GAMEPAD_STICK_DEADZONE,
  GAMEPAD_TRIGGER_DEADZONE,
  GAMEPAD_STEER_EXPONENT,
} from '@/config/input';
import type { GamepadType } from '@/types/game';

/**
 * Standard Xbox / XInput Gamepad button indices (W3C standard mapping).
 */
export const XBOX_BUTTONS = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LSB: 10,
  RSB: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  XBOX_GUIDE: 16,
} as const;

/**
 * Standard PlayStation / DualSense (PS5) Gamepad button indices (W3C standard mapping).
 */
export const DUALSENSE_BUTTONS = {
  CROSS: 0, // ✕
  CIRCLE: 1, // ◯
  SQUARE: 2, // ▢
  TRIANGLE: 3, // △
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  CREATE: 8, // Share
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  PS_BUTTON: 16,
  TOUCHPAD: 17,
} as const;

/**
 * Standard Gamepad axis indices.
 */
export const XBOX_AXES = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3,
} as const;

/**
 * Detects the controller hardware family from its Gamepad ID string.
 */
export function detectGamepadType(id = ''): GamepadType {
  const lower = id.toLowerCase();
  if (
    lower.includes('dualsense') ||
    lower.includes('ps5') ||
    lower.includes('playstation') ||
    lower.includes('dualshock') ||
    lower.includes('054c') ||
    (lower.includes('wireless controller') && !lower.includes('xbox'))
  ) {
    return 'dualsense';
  }
  if (
    lower.includes('xbox') ||
    lower.includes('xinput') ||
    lower.includes('045e')
  ) {
    return 'xbox';
  }
  return 'generic';
}

/**
 * Raw or normalized gamepad sample output.
 */
export interface GamepadSample {
  /** Whether a valid gamepad was detected and polled */
  connected: boolean;
  /** Name / identifier of the active gamepad */
  name: string;
  /** Detected hardware family */
  type: GamepadType;
  /** Analog steering value [-1.0 = Right, +1.0 = Left] */
  steering: number;
  /** Analog throttle value [0.0 to 1.0] */
  throttle: number;
  /** Analog brake value [0.0 to 1.0] */
  brake: number;
  /** Whether the handbrake (Square / X / RB / R1) is held */
  handbrake: boolean;
  /** Edge-triggered: Shift gear up (PS5 Cross / Xbox A) */
  gearUp: boolean;
  /** Edge-triggered: Shift gear down (PS5 Circle / Xbox B) */
  gearDown: boolean;
  /** Edge-triggered: Camera toggle (LB / L1) pressed this frame */
  cameraToggle: boolean;
  /** Edge-triggered: Reset car (Y / Triangle / View / Create) pressed this frame */
  resetToggle: boolean;
  /** Whether reset button (Y / Triangle / View / Create) is currently held */
  resetHeld: boolean;
  /** Edge-triggered: Pause / Menu / Options button pressed this frame */
  pauseToggle: boolean;
  /** Edge-triggered: Telemetry toggle (View / Create / LSB / L3) pressed this frame */
  telemetryToggle: boolean;
  /** Whether look back (B / Circle / RSB / R3) is currently held */
  lookBack: boolean;
  /** Right Stick X axis for Free-look Orbit Camera [-1.0 (Left) to +1.0 (Right)] */
  cameraLookX: number;
  /** Right Stick Y axis for Free-look Orbit Camera [-1.0 (Up) to +1.0 (Down)] */
  cameraLookY: number;
  /** Discrete D-Pad directional button states */
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  /** UI Navigation edge-triggered signals */
  menuUp: boolean;
  menuDown: boolean;
  menuLeft: boolean;
  menuRight: boolean;
  /** UI Confirm (A / Cross button) */
  menuConfirm: boolean;
  /** UI Back (B / Circle button) */
  menuBack: boolean;
  /** UI Tab Navigation edge-triggered signals (LB / L1 for Left, RB / R1 for Right) */
  menuTabLeft: boolean;
  menuTabRight: boolean;
  /** UI Special Action X (Square / X button, e.g. Delete Room) */
  menuSpecialX: boolean;
  /** UI Special Action Y (Triangle / Y button, e.g. Refresh Rooms) */
  menuSpecialY: boolean;
}


/**
 * Applies a scaled radial deadzone to an analog axis.
 * Prevents drift while ensuring smooth non-jumping transition past threshold.
 *
 * @param value - Raw axis value between -1.0 and 1.0
 * @param deadzone - Deadzone threshold (e.g. 0.08)
 * @returns Filtered and remapped value in [-1.0, 1.0]
 */
export function applyScaledDeadzone(value: number, deadzone = GAMEPAD_STICK_DEADZONE): number {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / (1 - deadzone);
  return Math.sign(value) * Math.min(Math.max(scaled, 0), 1);
}

/**
 * Applies non-linear response curve for enhanced precision around center stick.
 *
 * @param value - Normalized value in [-1.0, 1.0]
 * @param exponent - Non-linearity exponent (> 1 gives finer micro-corrections)
 */
export function applySteeringCurve(value: number, exponent = GAMEPAD_STEER_EXPONENT): number {
  if (value === 0) return 0;
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

/**
 * Reads trigger value safely with deadzone filtering.
 *
 * @param button - GamepadButton object or undefined
 * @param deadzone - Trigger deadzone threshold
 */
export function readTrigger(
  button: GamepadButton | undefined,
  deadzone = GAMEPAD_TRIGGER_DEADZONE,
): number {
  if (!button) return 0;
  const val = typeof button.value === 'number' ? button.value : button.pressed ? 1 : 0;
  if (val <= deadzone) return 0;
  return (val - deadzone) / (1 - deadzone);
}

/**
 * Reads button press state safely.
 */
export function isButtonPressed(button: GamepadButton | undefined): boolean {
  if (!button) return false;
  return button.pressed || button.value > 0.5;
}

// Previous frame button states for rising-edge detection
export const prevButtonStates: Record<string, boolean> = {
  camera: false,
  pause: false,
  telemetry: false,
  reset: false,
  gearUp: false,
  gearDown: false,
  menuUp: false,
  menuDown: false,
  menuLeft: false,
  menuRight: false,
  menuConfirm: false,
  menuBack: false,
  menuTabLeft: false,
  menuTabRight: false,
  menuSpecialX: false,
  menuSpecialY: false,
};

// Delayed Auto Shift (DAS) repeat timings for menu directional navigation
export const UI_DAS_INITIAL_DELAY_MS = 320;
export const UI_DAS_REPEAT_INTERVAL_MS = 120;

const menuNavHoldStart: Record<'up' | 'down' | 'left' | 'right', number> = {
  up: 0,
  down: 0,
  left: 0,
  right: 0,
};

const menuNavLastRepeat: Record<'up' | 'down' | 'left' | 'right', number> = {
  up: 0,
  down: 0,
  left: 0,
  right: 0,
};

/**
 * Resets edge trigger trackers and snapshots currently held buttons
 * to prevent accidental double-clicks upon switching views or game states.
 *
 * @param customGamepad - Optional gamepad instance to snapshot (for testing/mocking)
 */
export function resetGamepadEdgeState(customGamepad?: Gamepad | null): void {
  menuNavHoldStart.up = 0;
  menuNavHoldStart.down = 0;
  menuNavHoldStart.left = 0;
  menuNavHoldStart.right = 0;
  menuNavLastRepeat.up = 0;
  menuNavLastRepeat.down = 0;
  menuNavLastRepeat.left = 0;
  menuNavLastRepeat.right = 0;

  const gp = customGamepad !== undefined ? customGamepad : getActiveGamepad();
  if (gp && gp.buttons) {
    const buttons = gp.buttons;
    const axes = gp.axes || [];
    const btnA = isButtonPressed(buttons[0]);
    const btnB = isButtonPressed(buttons[1]);
    const btnSquare = isButtonPressed(buttons[2]);
    const btnY = isButtonPressed(buttons[3]);
    const btnLB = isButtonPressed(buttons[4]);
    const btnRB = isButtonPressed(buttons[5]);
    const btnView = isButtonPressed(buttons[8]);
    const btnMenu = isButtonPressed(buttons[9]);
    const dpadUp = isButtonPressed(buttons[12]);
    const dpadDown = isButtonPressed(buttons[13]);
    const dpadLeft = isButtonPressed(buttons[14]);
    const dpadRight = isButtonPressed(buttons[15]);
    const rawStickX = axes[0] ?? 0;
    const rawStickY = axes[1] ?? 0;
    const stickMag = Math.hypot(rawStickX, rawStickY);

    let stickUp = false;
    let stickDown = false;
    let stickLeft = false;
    let stickRight = false;

    if (stickMag >= 0.35) {
      const absX = Math.abs(rawStickX);
      const absY = Math.abs(rawStickY);
      if (absY >= absX * 0.5) {
        if (rawStickY < -0.35) stickUp = true;
        if (rawStickY > 0.35) stickDown = true;
      }
      if (absX >= absY * 0.5) {
        if (rawStickX < -0.35) stickLeft = true;
        if (rawStickX > 0.35) stickRight = true;
      }
    }

    prevButtonStates.gearUp = btnA;
    prevButtonStates.gearDown = btnB;
    prevButtonStates.menuConfirm = btnA;
    prevButtonStates.menuBack = btnB;
    prevButtonStates.menuTabLeft = btnLB;
    prevButtonStates.menuTabRight = btnRB;
    prevButtonStates.menuSpecialX = btnSquare;
    prevButtonStates.menuSpecialY = btnY;
    prevButtonStates.pause = btnMenu;
    prevButtonStates.camera = btnLB;
    prevButtonStates.reset = btnY || btnView;
    prevButtonStates.menuUp = dpadUp || stickUp;
    prevButtonStates.menuDown = dpadDown || stickDown;
    prevButtonStates.menuLeft = dpadLeft || stickLeft;
    prevButtonStates.menuRight = dpadRight || stickRight;
  } else {
    for (const key of Object.keys(prevButtonStates)) {
      prevButtonStates[key] = false;
    }
  }
}

/**
 * Returns the first active connected gamepad from the Gamepad API.
 */
export function getActiveGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined') return null;
  const getGamepads =
    navigator.getGamepads ??
    (navigator as unknown as { webkitGetGamepads?: () => Gamepad[] }).webkitGetGamepads;
  if (typeof getGamepads !== 'function') return null;

  try {
    const gamepads = getGamepads.call(navigator);
    if (!gamepads) return null;

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && (gp.connected || (gp.buttons && gp.buttons.length > 0))) {
        return gp;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Polls the current state of the connected Xbox, DualSense, or standard gamepad.
 *
 * @param sensitivity - Steering sensitivity multiplier (default 1.0)
 * @param customGamepad - Optional gamepad instance to sample (for testing/mocking)
 */
export function sampleGamepad(sensitivity = 1.0, customGamepad?: Gamepad | null): GamepadSample {
  const gp = customGamepad !== undefined ? customGamepad : getActiveGamepad();
  const isConnected = !!gp && (gp.connected || (gp.buttons && gp.buttons.length > 0));

  if (!gp || !isConnected) {
    // Reset edges if disconnected
    resetGamepadEdgeState();
    return {
      connected: false,
      name: '',
      type: null,
      steering: 0,
      throttle: 0,
      brake: 0,
      handbrake: false,
      gearUp: false,
      gearDown: false,
      cameraToggle: false,
      resetToggle: false,
      resetHeld: false,
      pauseToggle: false,
      telemetryToggle: false,
      lookBack: false,
      cameraLookX: 0,
      cameraLookY: 0,
      dpadUp: false,
      dpadDown: false,
      dpadLeft: false,
      dpadRight: false,
      menuUp: false,
      menuDown: false,
      menuLeft: false,
      menuRight: false,
      menuConfirm: false,
      menuBack: false,
      menuTabLeft: false,
      menuTabRight: false,
      menuSpecialX: false,
      menuSpecialY: false,
    };
  }

  const buttons = gp.buttons || [];
  const axes = gp.axes || [];

  // 1. Steering
  // In W3C standard: Left stick X < 0 is Left, > 0 is Right.
  // In OpenRally coordinate system: +1.0 is Left, -1.0 is Right.
  // Therefore, steerTarget is -leftStickX.
  const rawStickX = axes[XBOX_AXES.LEFT_STICK_X] ?? 0;
  const filteredStickX = applyScaledDeadzone(rawStickX);
  let steerVal = -applySteeringCurve(filteredStickX);

  // Support D-Pad Left/Right as alternative digital steering
  const dpadLeft = isButtonPressed(buttons[XBOX_BUTTONS.DPAD_LEFT]);
  const dpadRight = isButtonPressed(buttons[XBOX_BUTTONS.DPAD_RIGHT]);
  const isDpadSteering = (dpadLeft && !dpadRight) || (dpadRight && !dpadLeft);
  if (dpadLeft && !dpadRight) steerVal = 1;
  else if (dpadRight && !dpadLeft) steerVal = -1;

  // Apply user sensitivity setting (clamped to [-1, 1]):
  // For digital D-Pad steering, scales target angle within [0.1, 1.0].
  // For analog stick steering:
  // - When sensitivity <= 1.0: Progressive curve (s * x + (1 - s) * x^3) scales down micro-corrections
  //   at center (slope = sensitivity) while smoothly preserving full steering lock at full stick deflection.
  // - When sensitivity > 1.0: Exponent curve (x^(1/s)) ramps up faster to full lock for ultra-responsive control.
  let finalSteering: number;
  if (isDpadSteering) {
    finalSteering = steerVal * Math.min(1.0, Math.max(0.1, sensitivity));
  } else {
    const absSteer = Math.abs(steerVal);
    const signSteer = Math.sign(steerVal);
    if (absSteer === 0) {
      finalSteering = 0;
    } else if (sensitivity <= 1.0) {
      const progressive = sensitivity * absSteer + (1 - sensitivity) * Math.pow(absSteer, 3);
      finalSteering = signSteer * Math.min(1.0, Math.max(0, progressive));
    } else {
      finalSteering = signSteer * Math.min(1.0, Math.pow(absSteer, 1 / Math.max(0.1, sensitivity)));
    }
  }

  // 2. Throttle
  // Right Trigger (RT) is the primary analog throttle
  const rtValue = readTrigger(buttons[XBOX_BUTTONS.RT]);
  const dpadUp = isButtonPressed(buttons[XBOX_BUTTONS.DPAD_UP]);
  const throttle = Math.max(rtValue, dpadUp ? 1 : 0);

  // 3. Brake
  // Left Trigger (LT) is the primary analog brake
  const ltValue = readTrigger(buttons[XBOX_BUTTONS.LT]);
  const dpadDown = isButtonPressed(buttons[XBOX_BUTTONS.DPAD_DOWN]);
  const brake = Math.max(ltValue, dpadDown ? 1 : 0);

  // 4. Manual Gear Shifting (X on PS5 / A on Xbox: UP; Circle on PS5 / B on Xbox: DOWN)
  const btnA = isButtonPressed(buttons[XBOX_BUTTONS.A]);
  const btnB = isButtonPressed(buttons[XBOX_BUTTONS.B]);
  const gearUp = btnA && !prevButtonStates.gearUp;
  const gearDown = btnB && !prevButtonStates.gearDown;
  prevButtonStates.gearUp = btnA;
  prevButtonStates.gearDown = btnB;

  // 5. Handbrake (Square on PS5 / X on Xbox or Right Bumper RB / R1)
  const btnSquare = isButtonPressed(buttons[XBOX_BUTTONS.X]);
  const btnRB = isButtonPressed(buttons[XBOX_BUTTONS.RB]);
  const handbrake = btnSquare || btnRB;

  // 6. Look Back (Right Stick Click RSB / R3)
  const btnRSB = isButtonPressed(buttons[XBOX_BUTTONS.RSB]);
  const lookBack = btnRSB;

  // 7. Free Look Orbit Camera (Right Analog Stick — Forza Horizon style)
  const rawRightStickX = axes[XBOX_AXES.RIGHT_STICK_X] ?? 0;
  const rawRightStickY = axes[XBOX_AXES.RIGHT_STICK_Y] ?? 0;
  const cameraLookX = applyScaledDeadzone(rawRightStickX, 0.08);
  const cameraLookY = applyScaledDeadzone(rawRightStickY, 0.08);

  // 8. Camera Toggle (Left Bumper LB / L1) — Rising edge detection
  const btnLB = isButtonPressed(buttons[XBOX_BUTTONS.LB]);
  const camPressedNow = btnLB;
  const cameraToggle = camPressedNow && !prevButtonStates.camera;
  prevButtonStates.camera = camPressedNow;

  // 9. Reset Car (Triangle on PS5 / Y on Xbox, or View / Create button) — Rising edge + held detection
  const btnY = isButtonPressed(buttons[XBOX_BUTTONS.Y]);
  const btnView = isButtonPressed(buttons[XBOX_BUTTONS.VIEW]);
  const resetPressedNow = btnY || btnView;
  const resetToggle = resetPressedNow && !prevButtonStates.reset;
  prevButtonStates.reset = resetPressedNow;

  // 9. Pause Toggle (Menu / Start button)
  const btnMenu = isButtonPressed(buttons[XBOX_BUTTONS.MENU]);
  const pauseToggle = btnMenu && !prevButtonStates.pause;
  prevButtonStates.pause = btnMenu;

  // 10. Telemetry Toggle (Left Stick Click LSB or View button if not reset)
  const btnLSB = isButtonPressed(buttons[XBOX_BUTTONS.LSB]);
  const telemetryPressedNow = btnLSB;
  const telemetryToggle = telemetryPressedNow && !prevButtonStates.telemetry;
  prevButtonStates.telemetry = telemetryPressedNow;

  // 11. UI Navigation Signals (for Menu overlay) with Delayed Auto Shift (DAS)
  const rawStickY = axes[XBOX_AXES.LEFT_STICK_Y] ?? 0;
  const stickMag = Math.hypot(rawStickX, rawStickY);

  let stickUp = false;
  let stickDown = false;
  let stickLeft = false;
  let stickRight = false;

  if (stickMag >= 0.35) {
    const absX = Math.abs(rawStickX);
    const absY = Math.abs(rawStickY);
    if (absY >= absX * 0.5) {
      if (rawStickY < -0.35) stickUp = true;
      if (rawStickY > 0.35) stickDown = true;
    }
    if (absX >= absY * 0.5) {
      if (rawStickX < -0.35) stickLeft = true;
      if (rawStickX > 0.35) stickRight = true;
    }
  }

  const upPressed = dpadUp || stickUp;
  const downPressed = dpadDown || stickDown;
  const leftPressed = dpadLeft || stickLeft;
  const rightPressed = dpadRight || stickRight;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const processMenuDir = (
    dir: 'up' | 'down' | 'left' | 'right',
    isPressed: boolean,
    prevPressed: boolean,
  ): boolean => {
    if (!isPressed) {
      menuNavHoldStart[dir] = 0;
      menuNavLastRepeat[dir] = 0;
      return false;
    }
    if (!prevPressed) {
      // First edge press
      menuNavHoldStart[dir] = now;
      menuNavLastRepeat[dir] = now;
      return true;
    }
    // Held down: check DAS timings
    const holdDuration = now - menuNavHoldStart[dir];
    if (holdDuration >= UI_DAS_INITIAL_DELAY_MS) {
      if (now - menuNavLastRepeat[dir] >= UI_DAS_REPEAT_INTERVAL_MS) {
        menuNavLastRepeat[dir] = now;
        return true;
      }
    }
    return false;
  };

  const menuUp = processMenuDir('up', upPressed, prevButtonStates.menuUp);
  const menuDown = processMenuDir('down', downPressed, prevButtonStates.menuDown);
  const menuLeft = processMenuDir('left', leftPressed, prevButtonStates.menuLeft);
  const menuRight = processMenuDir('right', rightPressed, prevButtonStates.menuRight);

  const menuConfirm = btnA && !prevButtonStates.menuConfirm;
  const menuBack = btnB && !prevButtonStates.menuBack;
  const menuTabLeft = btnLB && !prevButtonStates.menuTabLeft;
  const menuTabRight = btnRB && !prevButtonStates.menuTabRight;
  const menuSpecialX = btnSquare && !prevButtonStates.menuSpecialX;
  const menuSpecialY = btnY && !prevButtonStates.menuSpecialY;

  prevButtonStates.menuUp = upPressed;
  prevButtonStates.menuDown = downPressed;
  prevButtonStates.menuLeft = leftPressed;
  prevButtonStates.menuRight = rightPressed;
  prevButtonStates.menuConfirm = btnA;
  prevButtonStates.menuBack = btnB;
  prevButtonStates.menuTabLeft = btnLB;
  prevButtonStates.menuTabRight = btnRB;
  prevButtonStates.menuSpecialX = btnSquare;
  prevButtonStates.menuSpecialY = btnY;

  const gamepadType = detectGamepadType(gp.id);

  return {
    connected: true,
    name: gp.id || (gamepadType === 'dualsense' ? 'DualSense Controller' : 'Xbox Controller'),
    type: gamepadType,
    steering: finalSteering,
    throttle,
    brake,
    handbrake,
    gearUp,
    gearDown,
    cameraToggle,
    resetToggle,
    resetHeld: resetPressedNow,
    pauseToggle,
    telemetryToggle,
    lookBack,
    cameraLookX,
    cameraLookY,
    dpadUp,
    dpadDown,
    dpadLeft,
    dpadRight,
    menuUp,
    menuDown,
    menuLeft,
    menuRight,
    menuConfirm,
    menuBack,
    menuTabLeft,
    menuTabRight,
    menuSpecialX,
    menuSpecialY,
  };
}
