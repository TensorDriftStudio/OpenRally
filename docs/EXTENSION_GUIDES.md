# OpenRally — Extension Guides (AI Cookbook)

This guide provides step-by-step instructions and code snippets for common expansion tasks in OpenRally.

---

## 1. Adding a New 3D Vehicle Preset (Fast with Builder)

### Step 1: Place the GLB Asset
Place your GLB model files in `/public/models/vehicles/`:
- Chassis model: `/public/models/vehicles/my_car.glb`
- Wheel model (optional): `/public/models/vehicles/my_wheel.glb`

### Step 2: Create with `createVehiclePreset()` in `src/config/vehicleRegistry.ts`
Use the typed builder to create a new car in under 10 lines from any archetype (`rally`, `supercar`, `offroad`, `drift`, `buggy`):
```ts
import { createVehiclePreset } from '@/utils/builders';

export const VEHICLE_MY_CAR = createVehiclePreset({
  id: 'my_supercar',
  name: 'Phantom GT',
  description: 'Ultra-lightweight twin-turbo GT racer with aggressive downforce.',
  archetype: 'supercar',
  modelPath: '/models/vehicles/my_car.glb',
  stats: {
    topSpeed: 9.8,
    acceleration: 9.5,
  },
  // Optional physics overrides (weightDistribution is automatically inherited from archetype):
  config: {
    engine: { maxForce: 560, maxSpeed: 310 },
  },
});

// Add to registry:
export const VEHICLE_REGISTRY: Record<string, VehiclePreset> = {
  // ...
  my_supercar: VEHICLE_MY_CAR,
};
```
*(The vehicle will automatically appear in the Garage UI and be selectable by players!)*

### Step 3: Register in Network Validators (Client & Server)
To allow multiplayer peers to render your vehicle and prevent packet drops:
1. Add `'my_supercar'` to `VALID_VEHICLE_IDS` in `src/network/packetValidator.ts`.
2. Add `'my_supercar'` to `VALID_VEHICLE_IDS` in `server/src/packetValidator.ts`.
*(This invariant is automatically verified by `npm run check` via `networkRegistryIntegrity.test.ts`!)*

---

## 2. Adding a New Level / Track Map (Fast with Generator & Builder)

### Step 1: Generate Track Spline & Preset
Create a new level definition in `src/config/levels/mountainPass.ts` or directly in `src/config/levelRegistry.ts`:
```ts
import { createLevelPreset } from '@/utils/builders';
import { generateProceduralCircuit } from '@/utils/trackGenerator';

export const LEVEL_PRESET_MOUNTAIN = createLevelPreset({
  id: 'level_mountain',
  name: 'Mountain Pass',
  description: 'Elevated alpine track with sharp switchbacks and scenic cliff edges.',
  difficulty: 'hard',
  archetype: 'alpine', // 'island' | 'desert' | 'alpine' | 'tundra' | 'canyon'
  bannerUrl: '/images/stages/mountain_pass.jpg',
  supportedModes: ['freeroam', 'timeattack', 'tag'], // 12 Rally Tag spawns are auto-generated!
  trackPoints: generateProceduralCircuit({
    radius: 220,
    pointsCount: 14,
    irregularity: 0.35,
    seed: 999,
  }),
  trackWidth: 22,
  targetHeight: 5.0,
});
```

### Step 2: Register in `src/config/levelRegistry.ts`
```ts
export const LEVEL_REGISTRY: Record<string, LevelPreset> = {
  level1_island: LEVEL_PRESET_ISLAND,
  level2_desert: LEVEL_PRESET_DESERT,
  level_mountain: LEVEL_PRESET_MOUNTAIN,
};
```

### Step 3: Register in Network Validators (Client & Server)
1. Add `'level_mountain'` to `VALID_LEVEL_IDS` in `src/network/packetValidator.ts`.
2. Add `'level_mountain'` to `VALID_LEVEL_IDS` in `server/src/packetValidator.ts`.
*(Automatically verified by `npm run check`!)*

---

## 3. Adding a New Surface Type (e.g. Ice / Snow)

### Step 1: Add the Surface Identifier
In `src/types/vehicle.ts`:
```ts
export type SurfaceType = 'tarmac' | 'mud' | 'grass' | 'sand' | 'snow' | 'gravel' | 'ice';
```

### Step 2: Register in `src/config/surfaceRegistry.ts` using `createSurfaceDefinition()`
```ts
import { createSurfaceDefinition } from '@/utils/builders';

export const SURFACE_REGISTRY: Record<SurfaceType, SurfaceDefinition> = {
  // ...
  ice: createSurfaceDefinition({
    id: 'ice',
    name: 'Glacial Ice',
    frontGrip: { baseGrip: 0.8, slideGrip: 0.5 },
    rearGrip: { baseGrip: 0.8, slideGrip: 0.5 },
    particles: { color: '#ffffff', scale: 0.9 },
    audio: { soundType: 'gravel', basePitch: 1.3 },
    skidMarkOpacity: 0.2,
  }),
};
```

### Step 3: Register in `src/network/packetValidator.ts`
Add `'ice'` to `VALID_SURFACES`.

---

## 4. Adding a New Game Mode in 4 Steps

OpenRally uses `GameModeRegistry` as the single source of truth for all game modes:

### Step 1: Add Literal to `GameMode` Type
In `src/types/game.ts`:
```ts
export type GameMode = 'freeroam' | 'timeattack' | 'gymkhana_blitz' | 'tag' | 'hillclimb';
```

### Step 2: Register in `src/config/gameModeRegistry.ts`
```ts
export const GAME_MODE_REGISTRY: Record<GameMode, GameModeDefinition> = {
  // ...
  hillclimb: {
    id: 'hillclimb',
    name: 'Hillclimb Run',
    badgeLabel: 'HILLCLIMB',
    badgeColor: '#EC4899',
    badgeBg: 'rgba(236, 72, 153, 0.15)',
    badgeBorder: 'rgba(236, 72, 153, 0.35)',
    description: 'Steep single-run ascent against the clock with zero run-off margin.',
    isMultiplayerSupported: false,
    requiresTrackSpline: true,
  },
};
```
*(All UI menus and badges automatically pick up the new mode and style without hardcoded ternaries!)*

### Step 3: Register in Network Validators
Add `'hillclimb'` to `VALID_GAME_MODES` in `src/network/packetValidator.ts` and `server/src/packetValidator.ts`.

### Step 4: Hook into the Decoupled Game Event Bus
Gameplay logic runs in dedicated hooks without touching `useVehiclePhysics.ts`:
```ts
import { onGameEvent } from '@/utils/events';

// In your mode controller (e.g. useHillclimbLogic.ts):
useEffect(() => {
  const unsub = onGameEvent('vehicle_reset', () => {
    if (useGameStore.getState().gameMode === 'hillclimb') {
      // Reset timer and return to bottom staging gate
    }
  });
  return unsub;
}, []);
```

---

## 5. Listening to Gameplay Events (Event Bus)

To build new features (e.g., sound effects, camera shakes, ghost replay, achievements):
```ts
import { onGameEvent, useGameEventListener } from '@/utils/events';

// In React components:
useGameEventListener('lap_completed', ({ lap, lapTime, isBest }) => {
  console.log(`Finished lap ${lap} in ${lapTime}s! Best: ${isBest}`);
});

// Or pure TS / external modules:
const unsub = onGameEvent('gear_shifted', ({ fromGear, toGear }) => {
  // Play gear shift audio or trigger gauge needle twitch
});
```

---

## 6. Working with Gamepad & Controller Haptics

OpenRally includes standard W3C Gamepad API support tuned specifically for Xbox / XInput controllers:
```ts
import { sampleGamepad } from '@/utils/input/gamepad';
import { playGamepadRumble, rumbleImpact, rumbleSlip, rumbleSurface } from '@/utils/input/gamepadHaptics';

// Reading gamepad input:
const sample = sampleGamepad(sensitivity);
// sample.steering: -1.0 (Right) to +1.0 (Left)
// sample.throttle: 0.0 to 1.0 (RT trigger)
// sample.brake: 0.0 to 1.0 (LT trigger)

// Triggering haptic vibration:
rumbleImpact(0.8); // Sudden collision impact
rumbleSlip(0.5);   // Tire drift / skid vibration
rumbleSurface(0.4); // Rough off-road terrain vibration
```

---

## 7. Validating Changes & Integrity
Before submitting changes, run automated verification:
```bash
npm run check
```
This executes compiler checks, oxlint linter, full-project diagnostics (`diagnostics.test.ts`, `networkRegistryIntegrity.test.ts`), and vitest unit tests across all registries, generators, and physics formulas.

---

## 7. Vehicle Physics Tuning Guide

OpenRally's vehicle physics pipeline consists of 4 interdependent subsystems. Understanding how they interact is essential for balanced handling.

### 7.1 Surface Grip (`src/config/surfaceRegistry.ts`)

Each surface defines **front and rear** tire grip curves independently:
```ts
tireModel: {
  front: { baseGrip: 2.30, peakSlipAngle: Math.PI / 8, slideGrip: 1.65 },
  rear:  { baseGrip: 2.10, peakSlipAngle: Math.PI / 8, slideGrip: 1.50 },
}
```

| Parameter | Effect |
|---|---|
| `baseGrip` | Peak lateral friction. Lower = easier to slide. |
| `peakSlipAngle` | Angle at which grip starts dropping. Tighter = less margin before slide. |
| `slideGrip` | Minimum friction when fully sliding. Lower = faster, more committed drifts. |
| Front > Rear bias | ~10% higher front grip creates natural oversteer tendency (rear breaks loose first). |

### 7.2 Tire Friction Model (`src/utils/physics/tires.ts`)

Key design decisions:
- **Per-wheel local slip angle**: Front steered wheels compute `|slipAngle - steerAngle|` so turning into a slide reduces their perceived slip, maintaining front grip and turn-in authority.
- **Smooth cubic Hermite (smoothstep) drop-off** instead of linear: `overSlip² × (3 - 2 × overSlip)` gives gradual grip loss near the limit and sharp loss at extreme angles.
- **Loose surface traction loss**: Under throttle on dirt/gravel/snow, all powered wheels lose grip synchronously (`looseSurfaceTractionLoss × throttle`, floor at 0.40).

### 7.3 Drivetrain AWD Power (`src/utils/physics/drivetrain.ts`)

Continuous symmetrical AWD with drift power compensation:
```
driftPowerBoost = 1.0 + steerAmount × 0.35 + slipAmount × 0.65
```
- At full lock steering + 45° slip: `1.0 + 0.35 + 0.65 = 2.0×` engine force.
- This overcomes lateral scrub drag so the car **accelerates through drifts** instead of bogging down.
- `frontBias: 0.5` = 50/50 front/rear torque split (true symmetrical AWD).

### 7.4 Assists (`src/utils/physics/assists.ts`)

| Assist | Purpose |
|---|---|
| **Turn-in torque** (`0.52 × mass × speedRamp`) | Direct yaw moment on corner entry, eliminates understeer. Ramps from 0 to full over 8 m/s. |
| **Yaw rate ceiling** (`min(4.5, speed/10 + 2.2)`) | Limits rotation speed to prevent spin-outs. Only kicks in at excess yaw + 0.8 rad/s. |
| **Power slide freedom** | When throttle > 0.15 and yaw < 3.8 rad/s with no steering, yaw damping is suppressed to preserve drift momentum. |
| **Handbrake** | Completely disables yaw damping for free rotation during handbrake turns. |

### 7.5 Rolling Drag & Drift Momentum (`src/hooks/useVehiclePhysics.ts`)

During active throttle drifts (`|slipAngle| > 0.15` and `throttle > 0.1`), rolling resistance is reduced by 65% to prevent artificial speed loss during cornering slides.

