# 3D Car Simulator — Internal Documentation for AI

## Project Status
- **Stage**: 3/3 (Expansion) — physics engine, terrain, multi-vehicle registry, multi-track registry, dynamic surface registry, runtime validators, and effects are active.
- **Done**: Foundations, vehicle physics (Rapier), cameras, tire tracks, dust particles, engine sound, configurations (`src/config`), Vehicle & Level & Surface Registries, TypeScript strict typing (zero `any`), automated unit tests (Vitest), architecture documentation (`/docs/`).
- **Environment**: The project is run in WSL (Linux) using Google Antigravity. Use only standard Linux commands (e.g., `npm install`, `npm run dev`, `npx`). Do not use Windows workarounds anymore (such as `cmd.exe /c`), because the terminal operates in a Linux environment.
  - **Game Testing**: The development server (`npm run dev`) runs in WSL, and the browser displays the game on Windows. The port is automatically mapped to `http://localhost:5173/`.

---

## Architecture & Guides Reference (Read First!)
Detailed developer guides for AI agents are available in the `/docs/` folder:
- **[Architecture & Data Flow](docs/ARCHITECTURE.md)**: Coordinates (+Y Up, +Z Forward, +X Right), execution loops, registry pattern, and subsystem overview.
- **[Driving Model & Physics Guide](docs/DRIVING_MODEL_GUIDE.md)**: Complete AI reference manual for handling balance, pipeline execution, parameter tables, and troubleshooting matrix.
- **[Extension Guides (Cookbook)](docs/EXTENSION_GUIDES.md)**: Step-by-step instructions for adding new vehicles (GLB), maps/tracks, surfaces, and UI telemetry.
- **[Debugging & Testing Guide](docs/DEBUGGING_AND_TESTING.md)**: Verification workflow, physics wireframe debugging, and common pitfalls.

---

## Game Vision
3D browser game:
- Driving a car over **uneven, open terrain** (hills, valleys, elevations)
- **Arcade-sim** physics (low entry barrier, but drifting and suspension work provide satisfaction)
- Multi-year project, developed **exclusively by AI**

---

## Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode, zero `any`) |
| Bundler | Vite |
| UI Framework | React 18+ |
| 3D Graphics | React Three Fiber (R3F) + @react-three/drei |
| Physics | @react-three/rapier (Rapier3D, WASM) |
| Game State | Zustand |
| Post-processing | @react-three/postprocessing |
| Testing | Vitest |
| Model Format | GLB/GLTF |
| Linting | Oxlint (NOT ESLint!) + optional Prettier |

---

## Mandatory Verification Command

Before completing any task, **always run the complete automated check**:
```bash
npm run check
```
This runs:
1. `tsc --noEmit` (Strict TypeScript compiler check)
2. `oxlint` (Linter with 0 errors and 0 warnings)
3. `vitest run` (Automated unit tests for math, physics, terrain, registries, and stores)

---

## Directory Structure

```
src/
├── components/
│   ├── canvas/          # 3D Scene (Canvas, lights, post-processing)
│   ├── vehicle/         # Car: visual model, effects (dust, tracks)
│   ├── terrain/         # Terrain generator, heightmap, textures, grass
│   ├── environment/     # Ocean, sky, checkpoints
│   └── ui/              # HUD, menu, garage, track selector (React overlay)
├── hooks/
│   ├── useVehiclePhysics.ts   # Vehicle physics logic (raycast vehicle)
│   ├── useInput.ts            # Keyboard / gamepad handling
│   ├── useChaseCamera.ts      # Chase camera
│   ├── useBumperCamera.ts     # Bumper camera
│   └── useEngineSound.ts      # Engine sound handling
├── store/
│   ├── gameStore.ts           # Game state (speed, selected vehicle/level, telemetry)
│   ├── settingsStore.ts       # Settings (graphics quality, controls, volume)
│   └── racingStore.ts         # Checkpoints, lap times, records
├── config/                    # Global registries, vehicle presets, levels, balances
│   ├── vehicleRegistry.ts     # Vehicle presets & specs registry
│   ├── levelRegistry.ts       # Level presets, spawns, environments
│   ├── surfaceRegistry.ts     # Friction curves, dust particles, audio configs
│   └── levels/                # Level dataset files (Desert Canyon, Island, etc.)
├── utils/
│   ├── builders/              # AI builders & archetypes (vehicles, levels, surfaces)
│   ├── diagnostics/           # Project-wide integrity diagnostics & assertions
│   ├── events/                # Strongly-typed game event bus & React hooks
│   ├── trackGenerator.ts      # Procedural spline & racetrack generator
│   ├── terrainCompiler.ts     # Procedural terrain compiler & track spline
│   ├── math.ts                # Helper functions (lerp, clamp, smoothDamp)
│   ├── physics/               # Powertrain, drivetrain, tires, assists, suspension
│   └── validation/            # Runtime validators for configs, levels, and surfaces
├── types/                     # TypeScript interfaces (zero any)
├── App.tsx
└── main.tsx
public/
└── models/
    ├── vehicles/              # Car GLB models (from AI)
    └── props/                 # Trees, rocks, buildings (from AI)
docs/
├── ARCHITECTURE.md            # System architecture, registries, coordinates
├── EXTENSION_GUIDES.md        # Recipes for adding cars, maps, and features
└── DEBUGGING_AND_TESTING.md   # Testing commands and troubleshooting
```

---

## 🏛️ Enterprise-Grade Engineering Standards (Mandatory)

OpenRally strictly requires **Enterprise-Grade / Production-Ready software engineering**. Temporary hacks, quick-and-dirty patches, monolithic god-components/hooks, unverified shortcuts, and placeholder solutions are **strictly prohibited**. Every implementation must follow industry gold standards:

### 1. Architectural Rigor & Clean Modular Design
- **Separation of Concerns (SoC)**: Isolate physics simulation (`src/utils/physics`, `src/hooks`), rendering (`src/components`), state management (`src/store`), configuration (`src/config`), and event orchestration (`src/utils/events`).
- **Enterprise Design Patterns**: Use Registries for entity management, Factories & Builders for procedural generation, Strategy/Polymorphism for variant behaviors, and typed Event Buses for cross-system reactivity.
- **High Cohesion & Low Coupling**: Every component, hook, and utility must have a single, well-defined responsibility. Subsystems must never directly mutate or reach into foreign internal states.

### 2. Strict Type Safety & Domain Modeling
- **Zero `any` & Zero Unsafe Casts**: Absolutely zero `any`, zero `as unknown as T`, and no untyped dictionary bags.
- **Discriminated Unions & Exhaustiveness**: Model game states, vehicle archetypes, and physics events as discriminated unions with exhaustive switch-case validation (`assertNever`).
- **Runtime Assertion & Fail-Fast Validation**: All user/AI configurations, level presets, surface definitions, and vehicle specs must pass runtime validation schemas (`src/utils/validation/`) before entering the simulation.

### 3. Zero-GC Memory Management & High-Performance Execution
- **Zero Allocation in Hot Loops**: In `useFrame`, physics simulation steps, raycast calculations, and audio tick loops, **never instantiate objects, arrays, closures, or vectors**.
- **Scratch Instance Re-Use**: Pre-allocate mutable Three.js primitives (`THREE.Vector3`, `THREE.Quaternion`, `THREE.Matrix4`, `THREE.Euler`) and scratch buffers at module scope or instance level.
- **Deterministic Lifecycle Management**: Always dispose of WebGL geometries, textures, materials, render targets, WebAudio nodes, and event listeners on component unmount or state transitions. Zero memory/GPU leaks.
- **Complexity Guardrails**: Hot algorithms must have known, optimal time and space complexity (prefer O(1) hash maps, spatial indexing, clamped delta times).

### 4. Defensive Programming & Numerical Resilience
- **Numerical Stability**: Guard all physics calculations against `NaN`, `Infinity`, division-by-zero, and extreme deltas. Always sanitize inputs and clamp delta times (`MAX_DELTA`).
- **Graceful Degradation & Error Boundaries**: WebGL context loss, WebAudio auto-play policy blocks, and missing asset textures must degrade gracefully without crashing the game loop.
- **Diagnostic Self-Checks**: Register all new subsystems with `src/utils/diagnostics/` to continuously verify game integrity during automated checks.

### 5. Comprehensive Testability & Continuous Verification
- **High-Coverage Unit Testing**: Every mathematical subroutine, physics helper, state reducer, procedural generator, builder, and registry must have thorough Vitest unit tests in `__tests__/`.
- **Deterministic Pure Functions**: Core business logic, physics calculations, and procedural algorithms must be written as deterministic pure functions wherever feasible.
- **Mandatory Quality Gate**: No change is complete without passing `npm run check` (`tsc --noEmit` + `oxlint` + `vitest run`).

### 6. AAA-Grade Visual Effects & Environmental Systems (VFX, Water, Smoke, Terrain & Props)
When building or extending any visual or environmental game element (e.g., tire smoke, dust plumes, water/ocean simulation, splash effects, vegetation/grass, weather, sky, lighting, or 3D props):
- **Commercial Game-Grade Visual Fidelity**: Never create simplistic placeholder geometry (e.g. flat blue planes for water, simple spinning billboards for smoke). Use production-ready GLSL vertex/fragment shaders (e.g., Gerstner wave displacement, Fresnel reflectance, soft alpha blending, normal maps, dynamic depth awareness).
- **Physical Plausibility & Environmental Interactivity**: VFX must dynamically respond to simulation telemetry (wheel slip speed, car velocity, surface material friction, handbrake drifts, contact normals). Water and terrain must feature convincing physical feedback (dynamic splashes, surface spray, drag/buoyancy effects).
- **GPU Instancing & Draw-Call Optimization**: All repeating environment elements (trees, rocks, barriers, grass blades, foliage) must use `InstancedMesh` with spatial culling and LODs. Never instantiate hundreds of individual Three.js Mesh components.
- **Zero-GC Particle Systems**: Particle effects (smoke, sparks, water spray, dust) must use fixed-size typed array ring buffers (`Float32Array`) and GPU instancing or points. Never mount/unmount per-particle React components or allocate objects per frame.
- **Adaptive Graphics Scalability**: Automatically hook into `settingsStore.graphicsQuality` (`'low' | 'medium' | 'high'`) to dynamically scale particle budgets, shader passes, shadow maps, and draw distances without dropping frames on low-end devices.

---

## Coding Conventions

1. **One hook = one file** in `src/hooks/`
2. **One component = one file** in the appropriate subfolder of `src/components/`
3. **Configurations** separated into files in `src/config/` (registries, presets, physics balance)
4. **Global types** in `src/types/` (e.g., `vehicle.ts`, `level.ts`, `surface.ts`, `game.ts`)
5. **Zustand stores** in `src/store/` — each store in a separate file
6. **Use Builders & Generators for new content**: Use `createVehiclePreset()`, `createLevelPreset()`, and `generateProceduralCircuit()` instead of assembling raw config objects.
7. **Use Event Bus for cross-system reactions**: Use `onGameEvent()` / `useGameEventListener()` to avoid tightly coupling subsystems.
8. **Naming**: PascalCase for components, camelCase for hooks and utils
9. **JSDoc comments** for every exported function/type
10. **No `any`** — always type explicitly (use `IRapierVehicleController`, `SurfaceType`, `VehiclePreset`, `LevelPreset`, etc.)
11. **Write unit tests** in `__tests__/` alongside modified math, physics, terrain, registries, builders, or store files.

---

## Roadmap

### Stage 1 — Foundation (COMPLETED)
Terrain, physics, camera, controls, HUD, lighting

### Stage 2 — Polishing (COMPLETED)
Particle effects, sound, different surfaces, objects on the map, post-processing, automated unit tests, strict typing

### Stage 3 — Expansion ⬅️ NOW (Main focus)
AI models (GLB), replacing blocky models with real 3D vehicle and environment models, multi-vehicle registry, multi-map tracks

### Stage 4+ — Future
Multiplayer, map editor, weather, asset generation automation

## ⚠️ Common Mistakes to Avoid (AI Rules)
1. **Error in `tsconfig.app.json`**: NEVER add the `"ignoreDeprecations": "6.0"` option in TypeScript configuration files (e.g., `tsconfig.app.json`). The project defaults to not needing this flag at all. Adding it always breaks the configuration and throws an error due to the specifics of the current compiler version.
2. **No "quick hacks" or "prototypes"**: Always implement enterprise-grade, maintainable, modular, and fully tested solutions.
3. **No toy/placeholder VFX or environment elements**: Always implement effects (water, smoke, dust, vegetation, props) using enterprise/AAA techniques (custom GLSL shaders, GPU instancing, typed particle pools, physical interaction, graphics scalability).
4. **Never commit code breaking `npm run check`**: All tests and linter must be clean before finishing tasks.
5. **Git Branch & Push Policy (Main & Stable Protection)**: All ongoing development, commits, and experiments must remain strictly on the `dev` branch. **NEVER automatically merge or push changes to `main` or `stable` branches.** Syncing, merging, or pushing to `main` and `stable` is ONLY allowed when the user explicitly requests it.
6. **Strict Trademark & Copyright Safety (IP Protection)**: NEVER use real-world automotive manufacturer brands (e.g., *Ford, Toyota, Subaru, Mitsubishi, Audi, Porsche*), real motorsport governing bodies or series trademarks (e.g., *FIA, WRC, WEC, Formula 1, F1, NASCAR*), or real corporate sponsor trademarks (e.g., *Red Bull, Monster Energy, Pirelli, Castrol, Sparco, Michelin*) in vehicle presets, in-game banners, 3D textures, UI text, audio tags, or code comments. Always invent and use completely original, fictional, or generic names and branding (e.g., `Apex Rally AWD`, `Vortex Rally1`, `Open Rally Championship`). Ensure all assets (audio, 3D models, textures) are original or under permissive licenses (MIT/CC0) with zero trademark infringements.
7. **Map Prop Placement & Telemetry Inspector (Instant Debugging)**: When diagnosing map obstacles or placing props, use the **Telemetry & Debug Inspector** (`T` key or Gamepad LSB/View). The overlay displays real-time `Pos: X, Y, Z`, `Stage / Target CP`, and the top 4 **Nearby Objects with their exact IDs and distances** within 45m. All props across all levels must strictly pass `validateLevelPreset()` and `validateLevelTrackClearance()` in `npm run check`.
8. **Cross-Platform Case Sensitivity & Sibling Name Disambiguation**: NEVER name a component/file with the same base name as a sibling subdirectory (e.g., `HUD.tsx` alongside `hud/`). On case-insensitive operating systems (Windows NTFS, macOS APFS), bundlers like Vite resolve relative imports (e.g. `./hud`) to the sibling file instead of the directory index, causing critical runtime `SyntaxError` White-Screens. Always use distinct names (e.g., `gauges/`, `menu/`, `dashboard/`). This invariant is automatically verified by `crossPlatformIntegrity.test.ts` in `npm run check`.
9. **Mandatory Universal Gamepad & Controller Support for All Menus & UI Controls**: NEVER create or extend any menu, subview, modal dialog, HUD control, or interactive UI option that is mouse-only. Every button, toggle, card, track selector, and room option MUST be fully operable using standard gamepads (Xbox, PlayStation DualSense, DirectInput) and keyboard arrows without requiring a mouse. All selectable elements MUST feature high-contrast visual focus indicators (via `getFocusStyle()` or `getGamepadFocusStyle()`). All views in `MenuView` MUST have exhaustive navigation coverage in `useMenuGamepadNavigation.ts` or register a `MenuGamepadDelegate` in `menuGamepadRegistry.ts`. This invariant is strictly enforced by `menuGamepadIntegrity.test.ts` during `npm run check`.
10. **Strict English-Only Language Policy (No Polish Language)**: NEVER use Polish (or any language other than English) in user-facing UI, in-game text, button labels, HUD, menus, option descriptions, vehicle/level specs, code comments, or commit messages. The entire project and game interface must be 100% in English at all times. When the user writes prompts in Polish, always translate internally, implement all UI/game assets in English, and communicate/respond strictly in English.
11. **Mandatory Automated Version Synchronization on Changes & Commits**: Whenever completing changes, feature additions, optimizations, bug fixes, or preparing commits, AI MUST automatically update the project version without requiring the user to prompt or remind it. Use `npm run version:minor` for new features, game modes, physics/telemetry expansions, or multiplayer protocol changes, and `npm run version:patch` for bug fixes, performance optimizations, or maintenance tweaks. Always ensure `npm run check` passes with the updated version.




