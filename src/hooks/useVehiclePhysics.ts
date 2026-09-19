import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion, Euler, Object3D } from 'three';
import type { VehicleConfig, SurfaceType } from '@/types/vehicle';
import type { GameState, InputState } from '@/types/game';
import { useInputUpdater } from '@/hooks/useInput';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useTagStore } from '@/store/tagStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { DEFAULT_VEHICLE_CONFIG, MS_TO_KMH, MAX_DELTA } from '@/config/vehicle';
import { resolveVehicleBalance, type DrivingModelBalance } from '@/config/physicsBalance';
import {
  calculateGroundContact,
  updateRolloverDetection,
  calculateRollingResistanceImpulse,
} from '@/utils/physics/vehiclePipeline';
import { updateGearbox, handleManualGearShift, calculateRPM } from '@/utils/physics/powertrain';
import { applyDrivetrain, applyAwdDriftPropulsion } from '@/utils/physics/drivetrain';
import { applyTireFrictionAndBrakes } from '@/utils/physics/tires';
import { applyAerodynamics } from '@/utils/physics/aerodynamics';
import { applyAssists } from '@/utils/physics/assists';
import { syncWheelVisuals } from '@/utils/physics/visuals';
import {
  applyAntiRollBars,
  applyProgressiveSuspensionDynamics,
  resetSuspensionBumpStops,
} from '@/utils/physics/suspension';
import { applyCollisionAngularGovernor } from '@/utils/physics/collisionGovernor';
import {
  createChassisDynamicsState,
  updateChassisDynamics,
  resetChassisDynamics,
  type ChassisDynamicsState,
} from '@/utils/physics/chassisDynamics';
import { calculateGroundedVehicleTransform } from '@/utils/physics/groundSettler';
import { emitGameEvent } from '@/utils/events';
import { getSurfaceDefinition } from '@/config/surfaceRegistry';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { rumbleImpact, rumbleSlip, rumbleSurface } from '@/utils/input/gamepadHaptics';

// ─── Reusable Three.js objects (avoids per-frame GC pressure) ────────
const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _velocity = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const _spawnQuat = new Quaternion();
const _spawnEuler = new Euler();
const _posTuple: [number, number, number] = [0, 0, 0];
const _settledPos = { x: 0, y: 0, z: 0 };
const _settledRot = { x: 0, y: 0, z: 0, w: 1 };
const _settledSuspensions: number[] = [0, 0, 0, 0];
const _zeroVel = { x: 0, y: 0, z: 0 };
const _frozenInput: InputState = {
  steering: 0,
  throttle: 0,
  brake: 1,
  handbrake: true,
  cameraToggle: false,
  reset: false,
};
const _telemetryState = {
  speed: 0,
  lateralSpeed: 0,
  slipAngle: 0,
  rpm: 0,
  gear: 1,
  heading: 0,
  position: _posTuple,
  tireGrips: [1, 1, 1, 1] as number[],
  surface: 'tarmac' as SurfaceType,
  isAirborne: false,
};

/**
 * Vehicle physics hook using Rapier's DynamicRayCastVehicleController.
 * Handles engine force, steering, braking, and handbrake.
 *
 * @param chassisRef - Ref to the chassis RigidBody
 * @param wheelRefs - Array of refs to visual wheel Object3Ds
 * @param config - Vehicle configuration (defaults to DEFAULT_VEHICLE_CONFIG)
 * @param visualRef - Optional ref to the visual chassis Object3D for sprung mass dynamics (body roll, pitch, heave)
 */
export function useVehiclePhysics(
  chassisRef: React.RefObject<RapierRigidBody | null>,
  wheelRefs: React.RefObject<(Object3D | null)[]>,
  config: VehicleConfig = DEFAULT_VEHICLE_CONFIG,
  visualRef?: React.RefObject<Object3D | null>,
): void {
  const { world, rapier } = useRapier();
  const { heightmapData, levelData, levelPreset } = useTerrainData();
  const prevGearRef = useRef<number>(1);
  const prevEmittedGearRef = useRef<number>(1);
  const prevSurfaceRef = useRef<SurfaceType>('tarmac');
  const prevSpeedKmhRef = useRef<number>(0);
  const currentRpmRef = useRef<number>(1000);
  const isAirborneRef = useRef<boolean>(false);
  const settleFramesRef = useRef<number>(0);
  const isSettledRef = useRef<boolean>(false);
  const chassisDynamicsStateRef = useRef<ChassisDynamicsState>(createChassisDynamicsState());
  const isRolledOverRef = useRef<boolean>(false);
  const rolloverTimerRef = useRef<number>(0);
  const pausedStateRef = useRef<{
    linvel: { x: number; y: number; z: number };
    angvel: { x: number; y: number; z: number };
    pos: { x: number; y: number; z: number };
    rot: { x: number; y: number; z: number; w: number };
    speed: number;
    rpm: number;
    gear: number;
    isAirborne: boolean;
  } | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const prevGameStateRef = useRef<GameState>(useGameStore.getState().gameState);
  const vehicleControllerRef = useRef<InstanceType<
    typeof rapier.DynamicRayCastVehicleController
  > | null>(null);
  const balanceRef = useRef<DrivingModelBalance>(resolveVehicleBalance(config));
  const getInput = useInputUpdater();

  // Cached physical simulation telemetry updated synchronously inside useBeforePhysicsStep
  const latestForwardSpeedRef = useRef<number>(0);
  const latestLateralSpeedRef = useRef<number>(0);
  const latestSpeedKmhRef = useRef<number>(0);
  const latestSlipAngleRef = useRef<number>(0);
  const latestSteerAngleRef = useRef<number>(0);
  const latestGripsRef = useRef<number[]>([1, 1, 1, 1]);
  const latestSurfaceRef = useRef<SurfaceType>('tarmac');
  const latestAbsActiveRef = useRef<boolean>(false);
  const latestTcsActiveRef = useRef<boolean>(false);
  const latestEspActiveRef = useRef<boolean>(false);
  const latestEffectiveInputRef = useRef<InputState>(_frozenInput);
  const latestInputRef = useRef<InputState>(_frozenInput);
  const prevSteeringInputRef = useRef<number>(0);
  const filteredDriftIntensityRef = useRef<number>(0);

  // Safely dispose the active vehicle controller without throwing WASM errors
  const disposeController = () => {
    if (vehicleControllerRef.current) {
      try {
        world.removeVehicleController(vehicleControllerRef.current);
      } catch (err) {
        console.warn('[useVehiclePhysics] Suppressed removeVehicleController error:', err);
      }
      vehicleControllerRef.current = null;
    }
  };

  // Idempotently configure and attach the vehicle controller to a valid rigid body
  const setupController = (body: RapierRigidBody) => {
    if (typeof body.isValid === 'function' && !body.isValid()) return;
    disposeController();

    try {
      const controller = world.createVehicleController(body);

      // Add wheels
      config.wheels.forEach((wheel) => {
        controller.addWheel(
          // connection point (chassis-local)
          { x: wheel.position[0], y: wheel.position[1], z: wheel.position[2] },
          // suspension direction (downward)
          { x: 0, y: -1, z: 0 },
          // axle direction (lateral)
          { x: -1, y: 0, z: 0 },
          // suspension rest length
          wheel.suspensionRestLength,
          // wheel radius
          wheel.radius,
        );
      });

      // Configure suspension for each wheel
      for (let i = 0; i < config.wheels.length; i++) {
        const wheel = config.wheels[i];
        controller.setWheelSuspensionStiffness(i, wheel.suspensionStiffness);
        if (typeof controller.setWheelMaxSuspensionTravel === 'function') {
          controller.setWheelMaxSuspensionTravel(i, wheel.suspensionTravel);
        }
        // Balanced rally damper characteristics:
        // Well-matched bump compression and rebound relaxation damping:
        // Absorbs bumps and landings smoothly while rapidly settling any bounce.
        const compDamping = wheel.suspensionCompression ?? (wheel.suspensionDamping * 0.75);
        const relaxDamping = wheel.suspensionRelaxation ?? (wheel.suspensionDamping * 1.15);
        controller.setWheelSuspensionCompression(i, compDamping);
        controller.setWheelSuspensionRelaxation(i, relaxDamping);
        // Ensure suspension can support high-G centripetal loads in vertical loops without bottoming out
        controller.setWheelMaxSuspensionForce(i, Math.max(wheel.maxSuspensionForce ?? 15000, 85000));
      }

      vehicleControllerRef.current = controller;
    } catch (err) {
      console.error('[useVehiclePhysics] Error setting up vehicle controller:', err);
    }
  };

  // Initialize and synchronize the vehicle controller when preset or level changes
  useEffect(() => {
    settleFramesRef.current = 0;
    isSettledRef.current = false;
    prevSpeedKmhRef.current = 0;
    prevGearRef.current = 1;
    prevEmittedGearRef.current = 1;
    prevSurfaceRef.current = 'tarmac';
    currentRpmRef.current = 1000;
    isAirborneRef.current = false;
    isRolledOverRef.current = false;
    rolloverTimerRef.current = 0;
    pausedStateRef.current = null;
    isPausedRef.current = false;
    balanceRef.current = resolveVehicleBalance(config);

    latestForwardSpeedRef.current = 0;
    latestLateralSpeedRef.current = 0;
    latestSpeedKmhRef.current = 0;
    latestSlipAngleRef.current = 0;
    latestSteerAngleRef.current = 0;
    latestGripsRef.current = [1, 1, 1, 1];
    latestSurfaceRef.current = 'tarmac';
    latestAbsActiveRef.current = false;
    latestTcsActiveRef.current = false;
    latestEspActiveRef.current = false;
    latestEffectiveInputRef.current = _frozenInput;
    latestInputRef.current = _frozenInput;
    prevSteeringInputRef.current = 0;
    filteredDriftIntensityRef.current = 0;

    useGameStore.setState({
      isRolledOver: false,
      absActive: false,
      tcsActive: false,
      espActive: false,
    });
    resetChassisDynamics(visualRef?.current ?? null, chassisDynamicsStateRef.current);

    const body = chassisRef.current;
    if (body && (typeof body.isValid !== 'function' || body.isValid())) {
      setupController(body);
      if (typeof body.setAngularDamping === 'function') {
        body.setAngularDamping(0.6);
      }
    }

    return () => {
      disposeController();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, levelPreset.id]);

  // Fixed-timestep simulation progression: executes synchronously BEFORE every Rapier world.step()
  // Eliminates substep starvation during frame drops / low framerates and guarantees 100% physically-consistent forces
  useBeforePhysicsStep((world) => {
    const gameState = useGameStore.getState().gameState;
    if (gameState !== 'playing') return;

    const body = chassisRef.current;
    if (!body || (typeof body.isValid === 'function' && !body.isValid())) return;

    if (!vehicleControllerRef.current) {
      setupController(body);
      if (!vehicleControllerRef.current) return;
    }
    const controller = vehicleControllerRef.current;

    const isSpectating = useMultiplayerStore.getState().isSpectating;
    if (isSpectating) {
      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);
      return;
    }

    const currentBodyPos = body.translation();
    const curLinvel = body.linvel();
    const curAngvel = body.angvel();

    // Numerical sanity guard: detect NaN or infinite values produced by extreme collisions or solver instability
    const isCorrupted =
      !Number.isFinite(currentBodyPos.x) ||
      !Number.isFinite(currentBodyPos.y) ||
      !Number.isFinite(currentBodyPos.z) ||
      !Number.isFinite(curLinvel.x) ||
      !Number.isFinite(curLinvel.y) ||
      !Number.isFinite(curLinvel.z) ||
      !Number.isFinite(curAngvel.x) ||
      !Number.isFinite(curAngvel.y) ||
      !Number.isFinite(curAngvel.z);

    if (isCorrupted) return;

    const rawStepDt = world.timestep;
    const dt = Number.isFinite(rawStepDt) && rawStepDt > 0 ? rawStepDt : 1 / 60;
    const input = getInput(dt);
    latestInputRef.current = input;

    // Calculate current speed (m/s → km/h)
    _forward.set(0, 0, 1);
    _right.set(1, 0, 0); // Local right vector (+X is right in Three.js right-handed coordinates)
    const bodyQuat = body.rotation();
    _quat.set(bodyQuat.x, bodyQuat.y, bodyQuat.z, bodyQuat.w);
    _forward.applyQuaternion(_quat);
    _right.applyQuaternion(_quat);

    _velocity.set(curLinvel.x, curLinvel.y, curLinvel.z);
    const forwardSpeed = _velocity.dot(_forward); // m/s along forward axis
    const lateralSpeed = _velocity.dot(_right);   // m/s along lateral axis
    // Use planar ground speed so cornering/drifting does not cause artificial RPM drop or gear downshift
    const groundSpeed = Math.hypot(forwardSpeed, lateralSpeed);
    const speedKmh = groundSpeed * MS_TO_KMH;

    // Slip angle calculation
    // Uses absolute forward speed to prevent 180-degree slip-angle spike when rolling backward down slopes
    let slipAngle = 0;
    const absForwardSpeed = Math.abs(forwardSpeed);
    if (absForwardSpeed > 0.8) {
      slipAngle = Math.atan2(lateralSpeed, absForwardSpeed);
    }

    const state = useGameStore.getState();
    const tagState = useTagStore.getState();

    const isCountingDown = 
      (state.gameMode === 'timeattack' && useRacingStore.getState().raceStatus === 'countdown') ||
      (state.gameMode === 'gymkhana_blitz' && useGymkhanaStore.getState().status === 'countdown') ||
      (state.gameMode === 'tag' && tagState.phase === 'countdown');

    const isTagFrozen = state.gameMode === 'tag' && tagState.isFrozen;

    if (isCountingDown || isTagFrozen) {
      body.setLinvel({ x: 0, y: Math.min(0, curLinvel.y), z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const effectiveInput = (isCountingDown || isTagFrozen) ? _frozenInput : input;
    latestEffectiveInputRef.current = effectiveInput;

    const isGymkhanaFinished =
      useGymkhanaStore.getState().showResultsModal ||
      (state.gameMode === 'gymkhana_blitz' && useGymkhanaStore.getState().status === 'completed');

    if (isGymkhanaFinished) {
      body.setLinvel({ x: curLinvel.x * 0.88, y: Math.min(0, curLinvel.y), z: curLinvel.z * 0.88 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const transmissionMode = useSettingsStore.getState().transmissionMode;
    let currentGear: number;

    if (transmissionMode === 'manual') {
      currentGear = handleManualGearShift(prevGearRef.current, effectiveInput, isAirborneRef.current);
    } else {
      currentGear = updateGearbox(speedKmh, forwardSpeed, effectiveInput, prevGearRef.current, isAirborneRef.current, {
        slipAngle,
        inclineSine: _forward.y,
      });
    }

    const balance = balanceRef.current;
    const { absEnabled, tcsEnabled, espEnabled } = useSettingsStore.getState();

    // --- 1. APPLY TIRE FRICTION & BRAKES ---
    const selectedTireType = useGameStore.getState().selectedTireType;
    const isManual = transmissionMode === 'manual';
    const { grips: tireGrips, surface, steerAngle, absActive } = applyTireFrictionAndBrakes(
      controller,
      config,
      effectiveInput,
      speedKmh,
      forwardSpeed,
      currentBodyPos.x,
      currentBodyPos.y,
      currentBodyPos.z,
      slipAngle,
      heightmapData,
      levelData,
      balance,
      { absEnabled, tcsEnabled, espEnabled },
      selectedTireType,
      { forwardY: _forward.y, currentGear, isManual },
    );

    // --- 2. APPLY DRIVETRAIN (Engine, Reverse, Rev Limiter, Rally TCS, DCCD) ---
    const powerMultiplier = (state.gameMode === 'tag' && tagState.isTagger) ? 1.5 : 1.0;
    const { tcsActive, nextDriftIntensity } = applyDrivetrain(
      controller,
      config,
      effectiveInput,
      forwardSpeed,
      currentGear,
      slipAngle,
      speedKmh,
      powerMultiplier,
      balance.drivetrain,
      { tcsEnabled },
      surface,
      filteredDriftIntensityRef.current,
      dt,
      { isManual },
    );
    filteredDriftIntensityRef.current = nextDriftIntensity;

    // --- 3. APPLY ARCADE ASSISTS ---
    const { espActive } = applyAssists(
      body,
      config,
      effectiveInput,
      forwardSpeed,
      dt,
      balance,
      { espEnabled },
      prevSteeringInputRef.current,
    );
    prevSteeringInputRef.current = effectiveInput.steering;

    // --- 3.5. APPLY SUSPENSION ARB & PITCH STABILIZATION ---
    applyAntiRollBars(body, controller, config, dt, balance.suspension);

    // --- 3.6. DISSIPATE UNNATURAL COLLISION ROTATIONAL SPIKES ---
    applyCollisionAngularGovernor(body, config, dt, {
      isGrounded: !isAirborneRef.current,
      forwardSpeed,
    });

    // --- 3.7. DYNAMIC PROGRESSIVE SUSPENSION DYNAMICS ---
    // Under extreme centripetal compression (vertical loops, high-speed dips),
    // smoothly ramp raycast stiffness and critical damping to maintain clearance.
    // Absorbs jump landing impacts with viscous damping and zero trampoline rebound.
    applyProgressiveSuspensionDynamics(controller, config, {
      dt,
      forwardSpeed,
      isAirborne: isAirborneRef.current,
    });

    // --- 4. UPDATE RAPIER VEHICLE ---
    try {
      controller.updateVehicle(dt);
    } catch (simErr) {
      console.warn('[useVehiclePhysics] Suppressed Rapier vehicle solver exception:', simErr);
      const spawnPos = levelPreset.spawnPosition;
      body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      emitGameEvent('vehicle_reset', { reason: 'stability_guard' });
      return;
    }

    // --- 4.1. GROUND CONTACT & AIRBORNE TELEMETRY ---
    const { groundedRatio, isAirborne } = calculateGroundContact(controller, config.wheels.length);
    isAirborneRef.current = isAirborne;

    // --- 4.2. ROLLOVER DETECTION (CAR INVERTED ON ROOF OR SIDE) ---
    _up.set(0, 1, 0).applyQuaternion(_quat);
    const rollover = updateRolloverDetection(
      _up.y,
      speedKmh,
      rolloverTimerRef.current,
      dt,
      isRolledOverRef.current,
    );
    rolloverTimerRef.current = rollover.newTimer;
    if (rollover.stateChanged) {
      isRolledOverRef.current = rollover.isRolledOver;
    }

    // --- 4.3. DYNAMIC INVERTED DAMPING (PREVENTS WEEBLE-WOBBLE SELF-RIGHTING) ---
    if (_up.y < 0.20 && speedKmh < 24 && isAirborne && groundedRatio === 0) {
      // When car is inverted on its roof or severely tipped on its side at low speed, elevate angular damping
      // to rapidly extinguish tumbling kinetic energy, keeping the vehicle stably inverted instead of bouncing back.
      // Guarded by isAirborne & groundedRatio === 0 so track driving through an inverted loop apex is never frozen.
      if (typeof body.setAngularDamping === 'function') {
        body.setAngularDamping(5.0);
      }
    } else {
      // Restore baseline angular damping once car is righted or driving inverted at speed through a stunt loop
      if (typeof body.angularDamping === 'function' && Math.abs(body.angularDamping() - 0.6) > 0.01) {
        body.setAngularDamping(0.6);
      }
    }

    // --- 5. APPLY AERODYNAMICS & SURFACE ROLLING DRAG ---
    applyAerodynamics(body, config, forwardSpeed, _velocity, currentBodyPos.y, dt, balance.drivetrain.aeroDragScale ?? 1.0);

    const surfaceDef = getSurfaceDefinition(surface);

    // Physical rolling resistance (loose ground deceleration: sand, tall grass, mud)
    const rollDragImpulse = calculateRollingResistanceImpulse(
      surfaceDef,
      typeof body.mass === 'function' ? body.mass() : (config.chassisMass || 150),
      _forward,
      forwardSpeed,
      groundedRatio,
      slipAngle,
      effectiveInput.throttle,
      dt,
    );
    if (rollDragImpulse) {
      body.applyImpulse(rollDragImpulse, true);
    }

    // --- 5.1. APPLY AWD POWER-SLIDE PROPULSION ---
    applyAwdDriftPropulsion(
      body,
      config,
      effectiveInput,
      _forward,
      speedKmh,
      slipAngle,
      groundedRatio,
      dt,
      currentGear,
      _right,
      steerAngle,
      balance,
      { espEnabled },
    );

    // --- 6. UPDATE ENGINE RPM ---
    const targetRpm = calculateRPM(speedKmh, currentGear, input, {
      currentRpm: currentRpmRef.current,
      dt,
      groundedRatio,
      isAirborne,
      slipAngle,
      steering: input.steering,
      looseSurfaceTractionLoss: surfaceDef.looseSurfaceTractionLoss,
    });
    currentRpmRef.current = targetRpm;

    // Cache physical telemetry for useFrame visual sync
    latestForwardSpeedRef.current = forwardSpeed;
    latestLateralSpeedRef.current = lateralSpeed;
    latestSpeedKmhRef.current = speedKmh;
    latestSlipAngleRef.current = slipAngle;
    latestSteerAngleRef.current = steerAngle;
    latestGripsRef.current = tireGrips;
    latestSurfaceRef.current = surface;
    latestAbsActiveRef.current = absActive;
    latestTcsActiveRef.current = tcsActive;
    latestEspActiveRef.current = espActive;
    prevGearRef.current = currentGear;
  });

  // Frame update: apply forces, read state
  useFrame((_, delta) => {
    const gameState = useGameStore.getState().gameState;
    const prevGameState = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    const loadingTarget = useGameStore.getState().loadingTarget;
    const isMenuLoading = gameState === 'loading' && loadingTarget === 'menu';
    const isEnteringMenu =
      ((prevGameState === 'playing' || prevGameState === 'paused') &&
      (gameState === 'menu' || gameState === 'title')) || isMenuLoading;
    const isMenuOrTitle = gameState === 'menu' || gameState === 'title' || isMenuLoading;

    const body = chassisRef.current;
    if (!body || (typeof body.isValid === 'function' && !body.isValid())) return;

    if (!vehicleControllerRef.current) {
      setupController(body);
      if (!vehicleControllerRef.current) return;
    }

    const controller = vehicleControllerRef.current;

    // Settle vehicle physics on ground before dismissing loading screen (only in gameplay)
    if (!useGameStore.getState().isSceneReady && !isMenuOrTitle) {
      settleFramesRef.current += 1;
      if (settleFramesRef.current >= 15) {
        useGameStore.getState().setSceneReady(true);
      }
    }

    // --- CHECK PENDING RESET FOR ALL STATES (PLAYING, LOADING, PAUSED, MENU) ---
    const resetState = useGameStore.getState();
    const tagStoreState = useTagStore.getState();
    let spawnPos = levelPreset.spawnPosition;
    let spawnRotY = levelPreset.spawnRotationY;
    if (resetState.gameMode === 'tag' && levelPreset.tagSpawnPoints && levelPreset.tagSpawnPoints.length > 0) {
      const spIndex = tagStoreState.assignedSpawnIndex % levelPreset.tagSpawnPoints.length;
      const pt = levelPreset.tagSpawnPoints[spIndex];
      spawnPos = pt.position;
      spawnRotY = pt.rotationY;
    }
    const fallResetY = levelPreset.fallResetY;
    const currentBodyPos = body.translation();
    const curLinvel = body.linvel();
    const curAngvel = body.angvel();

    // Menu out-of-bounds guard: vehicle in menu/title must stay strictly near spawn and above water
    const distFromSpawnSq =
      (currentBodyPos.x - spawnPos[0]) ** 2 +
      (currentBodyPos.z - spawnPos[2]) ** 2;
    const isMenuOutOfBounds =
      isMenuOrTitle &&
      (distFromSpawnSq > 100 || currentBodyPos.y < -1.0 || currentBodyPos.y > spawnPos[1] + 10.0);

    // Numerical sanity guard: detect NaN or infinite values produced by extreme collisions or solver instability
    const isCorrupted =
      !Number.isFinite(currentBodyPos.x) ||
      !Number.isFinite(currentBodyPos.y) ||
      !Number.isFinite(currentBodyPos.z) ||
      !Number.isFinite(curLinvel.x) ||
      !Number.isFinite(curLinvel.y) ||
      !Number.isFinite(curLinvel.z) ||
      !Number.isFinite(curAngvel.x) ||
      !Number.isFinite(curAngvel.y) ||
      !Number.isFinite(curAngvel.z);

    if (
      isEnteringMenu ||
      isMenuOutOfBounds ||
      isCorrupted ||
      currentBodyPos.y < fallResetY ||
      resetState.pendingReset
    ) {
      if (isMenuOrTitle || isEnteringMenu) {
        const grounded = calculateGroundedVehicleTransform(
          spawnPos,
          spawnRotY,
          config,
          heightmapData,
          levelData,
        );
        _settledPos.x = grounded.position[0];
        _settledPos.y = grounded.position[1];
        _settledPos.z = grounded.position[2];
        _settledRot.x = grounded.rotation[0];
        _settledRot.y = grounded.rotation[1];
        _settledRot.z = grounded.rotation[2];
        _settledRot.w = grounded.rotation[3];
        for (let i = 0; i < config.wheels.length; i++) {
          _settledSuspensions[i] = grounded.suspensionLengths[i] ?? (config.wheels[i].suspensionRestLength * 0.72);
        }
        body.setTranslation({ x: _settledPos.x, y: _settledPos.y, z: _settledPos.z }, true);
        body.setRotation({ x: _settledRot.x, y: _settledRot.y, z: _settledRot.z, w: _settledRot.w }, true);
        isSettledRef.current = true;
        body.setGravityScale(0, true);
      } else {
        body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);
        _spawnEuler.set(0, spawnRotY, 0);
        _spawnQuat.setFromEuler(_spawnEuler);
        body.setRotation({ x: _spawnQuat.x, y: _spawnQuat.y, z: _spawnQuat.z, w: _spawnQuat.w }, true);
        isSettledRef.current = false;
        body.setGravityScale(1, true);
      }

      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);

      prevSpeedKmhRef.current = 0;
      prevGearRef.current = 1;
      prevEmittedGearRef.current = 1;
      latestForwardSpeedRef.current = 0;
      latestLateralSpeedRef.current = 0;
      latestSpeedKmhRef.current = 0;
      currentRpmRef.current = 1000;
      isAirborneRef.current = false;
      settleFramesRef.current = 0;
      pausedStateRef.current = null;
      isPausedRef.current = false;
      resetChassisDynamics(visualRef?.current ?? null, chassisDynamicsStateRef.current);
      resetSuspensionBumpStops();
      if (typeof body.setAngularDamping === 'function') {
        body.setAngularDamping(0.6);
      }

      emitGameEvent('vehicle_reset', {
        reason: isCorrupted
          ? 'stability_guard'
          : (currentBodyPos.y < fallResetY || isMenuOutOfBounds)
            ? 'out_of_bounds'
            : isEnteringMenu
              ? 'manual'
              : 'manual',
      });

      if (resetState.pendingReset) {
        resetState.triggerReset(false);
      }
      return;
    }

    // ─── 0. PAUSE STATE HANDLING (FREEZE & RESTORE IDENTICAL PRE-PAUSE MOMENTUM) ───
    if (gameState === 'paused') {
      if (!isPausedRef.current) {
        // First frame entering pause: capture the exact simulation state
        const curLinvel = body.linvel();
        const curAngvel = body.angvel();
        const curPos = body.translation();
        const curRot = body.rotation();

        pausedStateRef.current = {
          linvel: { x: curLinvel.x, y: curLinvel.y, z: curLinvel.z },
          angvel: { x: curAngvel.x, y: curAngvel.y, z: curAngvel.z },
          pos: { x: curPos.x, y: curPos.y, z: curPos.z },
          rot: { x: curRot.x, y: curRot.y, z: curRot.z, w: curRot.w },
          speed: prevSpeedKmhRef.current,
          rpm: currentRpmRef.current,
          gear: prevGearRef.current,
          isAirborne: isAirborneRef.current,
        };
        isPausedRef.current = true;
      }

      // While paused: keep the vehicle solidly stationary at paused coordinates
      // Do NOT apply braking forces or step vehicle controller to avoid altering wheel/suspension physics!
      if (pausedStateRef.current) {
        body.setTranslation(pausedStateRef.current.pos, true);
        body.setRotation(pausedStateRef.current.rot, true);
        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);
      }
      return;
    }

    // Resuming from pause back to 'playing':
    if (isPausedRef.current) {
      isPausedRef.current = false;
      if (pausedStateRef.current) {
        const saved = pausedStateRef.current;
        body.setTranslation(saved.pos, true);
        body.setRotation(saved.rot, true);
        body.setLinvel(saved.linvel, true);
        body.setAngvel(saved.angvel, true);
        prevSpeedKmhRef.current = saved.speed;
        currentRpmRef.current = saved.rpm;
        prevGearRef.current = saved.gear;
        prevEmittedGearRef.current = saved.gear;
        isAirborneRef.current = saved.isAirborne;

        useGameStore.setState({
          speed: Math.round(saved.speed),
          rpm: Math.round(saved.rpm),
          gear: saved.gear,
        });

        pausedStateRef.current = null;
      }
    }

    // ─── 0.5. TITLE / MENU / LOADING SPAWN SETTLE ───
    if (gameState === 'title' || gameState === 'menu' || gameState === 'loading') {
      pausedStateRef.current = null;
      isPausedRef.current = false;

      // Deterministically initialize grounded resting pose if not yet settled in menu
      if (!isSettledRef.current) {
        const grounded = calculateGroundedVehicleTransform(
          spawnPos,
          spawnRotY,
          config,
          heightmapData,
          levelData,
        );
        _settledPos.x = grounded.position[0];
        _settledPos.y = grounded.position[1];
        _settledPos.z = grounded.position[2];
        _settledRot.x = grounded.rotation[0];
        _settledRot.y = grounded.rotation[1];
        _settledRot.z = grounded.rotation[2];
        _settledRot.w = grounded.rotation[3];
        for (let i = 0; i < config.wheels.length; i++) {
          _settledSuspensions[i] = grounded.suspensionLengths[i] ?? (config.wheels[i].suspensionRestLength * 0.72);
        }
        isSettledRef.current = true;
        body.setGravityScale(0, true);
        if (!useGameStore.getState().isSceneReady) {
          useGameStore.getState().setSceneReady(true);
        }
      }

      // Keep vehicle 100% frozen, solid, and motionless at grounded position
      body.setTranslation(_settledPos, true);
      body.setRotation(_settledRot, true);
      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);

      // Keep visual wheels completely static at resting suspension length
      const wheels = wheelRefs.current;
      if (wheels) {
        for (let i = 0; i < config.wheels.length; i++) {
          const wheelObj = wheels[i];
          if (!wheelObj) continue;
          const connection = controller.wheelChassisConnectionPointCs(i);
          const suspension = _settledSuspensions[i] ?? (config.wheels[i].suspensionRestLength * 0.72);
          if (connection != null) {
            wheelObj.position.set(connection.x, connection.y - suspension, connection.z);
            wheelObj.rotation.y = 0;
          }
        }
      }
      resetChassisDynamics(visualRef?.current ?? null, chassisDynamicsStateRef.current);
      isRolledOverRef.current = false;
      rolloverTimerRef.current = 0;
      useGameStore.setState({
        isRolledOver: false,
        absActive: false,
        tcsActive: false,
        espActive: false,
      });
      return;
    }

    if (isSettledRef.current) {
      isSettledRef.current = false;
      body.setGravityScale(1, true);
    }

    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 1 / 60;
    const dt = Math.max(0.001, Math.min(safeDelta, MAX_DELTA));

    const isSpectating = useMultiplayerStore.getState().isSpectating;
    if (isSpectating) {
      body.setLinvel(_zeroVel, true);
      body.setAngvel(_zeroVel, true);
      return;
    }

    const forwardSpeed = latestForwardSpeedRef.current;
    const lateralSpeed = latestLateralSpeedRef.current;
    const speedKmh = latestSpeedKmhRef.current;
    const slipAngle = latestSlipAngleRef.current;
    const tireGrips = latestGripsRef.current;
    const surface = latestSurfaceRef.current;
    const absActive = latestAbsActiveRef.current;
    const tcsActive = latestTcsActiveRef.current;
    const espActive = latestEspActiveRef.current;
    const currentGear = prevGearRef.current;
    const effectiveInput = latestEffectiveInputRef.current;
    const input = latestInputRef.current;
    const isAirborne = isAirborneRef.current;
    const targetRpm = currentRpmRef.current;

    const pos = body.translation();
    const bodyQuat = body.rotation();
    _quat.set(bodyQuat.x, bodyQuat.y, bodyQuat.z, bodyQuat.w);

    // Sync gear shift event to event bus
    if (currentGear !== prevEmittedGearRef.current) {
      emitGameEvent('gear_shifted', {
        fromGear: prevEmittedGearRef.current,
        toGear: currentGear,
      });
      prevEmittedGearRef.current = currentGear;
    }

    // Sync surface change event to event bus
    if (surface !== prevSurfaceRef.current) {
      emitGameEvent('surface_changed', {
        from: prevSurfaceRef.current,
        to: surface,
      });
      prevSurfaceRef.current = surface;
    }

    // Sync driving assist active indicators to store when status changes
    const state = useGameStore.getState();
    if (absActive !== state.absActive || tcsActive !== state.tcsActive || espActive !== state.espActive) {
      useGameStore.getState().setDrivingAssistsActive({
        abs: absActive,
        tcs: tcsActive,
        esp: espActive,
      });
    }

    // Sync rollover state
    if (state.isRolledOver !== isRolledOverRef.current) {
      useGameStore.setState({ isRolledOver: isRolledOverRef.current });
    }

    // --- GAMEPAD HAPTIC RUMBLE FEEDBACK ---
    const speedDelta = prevSpeedKmhRef.current - speedKmh;
    if (speedDelta > 25 && prevSpeedKmhRef.current > 30) {
      // Sudden deceleration / heavy collision impact
      rumbleImpact(Math.min(1.0, speedDelta / 60));
    } else if (Math.abs(lateralSpeed) > 2.8 || (input.handbrake && speedKmh > 12)) {
      // Tire slip / drifting vibration
      rumbleSlip(Math.min(1.0, Math.abs(lateralSpeed) / 7));
    } else if (surface !== 'tarmac' && speedKmh > 15) {
      // Off-road surface roughness
      const surfaceIntensity = surface === 'sand' ? 1.3 : surface === 'mud' ? 1.1 : 0.9;
      rumbleSurface(Math.min(1.0, (speedKmh / 80) * surfaceIntensity));
    }
    prevSpeedKmhRef.current = speedKmh;

    // --- SYNC VISUALS (WHEELS & SPRUNG CHASSIS DYNAMICS) ---
    syncWheelVisuals(controller, wheelRefs, config, forwardSpeed, dt, targetRpm, currentGear, effectiveInput);
    if (visualRef?.current) {
      updateChassisDynamics(
        visualRef.current,
        controller,
        body,
        config,
        chassisDynamicsStateRef.current,
        forwardSpeed,
        dt,
      );
    }

    // --- UPDATE TELEMETRY & HUD ---
    _euler.setFromQuaternion(_quat, 'YXZ');

    // Batch all state updates into one call (strictly sanitizing values against NaN)
    _posTuple[0] = Number.isFinite(pos.x) ? pos.x : spawnPos[0];
    _posTuple[1] = Number.isFinite(pos.y) ? pos.y : spawnPos[1];
    _posTuple[2] = Number.isFinite(pos.z) ? pos.z : spawnPos[2];

    // Update pre-allocated telemetry object to eliminate per-frame GC allocations
    _telemetryState.speed = Number.isFinite(speedKmh) ? Math.round(speedKmh) : 0;
    _telemetryState.lateralSpeed = Number.isFinite(lateralSpeed) ? lateralSpeed : 0;
    _telemetryState.slipAngle = Number.isFinite(slipAngle) ? slipAngle : 0;
    _telemetryState.rpm = Number.isFinite(targetRpm) ? Math.round(targetRpm) : 1000;
    _telemetryState.gear = currentGear;
    _telemetryState.heading = Number.isFinite(_euler.y) ? _euler.y : 0;
    _telemetryState.position = _posTuple;
    _telemetryState.tireGrips = tireGrips;
    _telemetryState.surface = surface;
    _telemetryState.isAirborne = isAirborne;

    useGameStore.setState(_telemetryState);

    // --- CHECK MANUAL RESET (KEYBOARD 'R' OR GAMEPAD BUTTON) ---
    if (input.reset) {
      const isRolledOver = isRolledOverRef.current || useGameStore.getState().isRolledOver;

      if (isRolledOver) {
        // In-place recovery: flip upright at current location, elevate above ground, zero velocities
        _euler.setFromQuaternion(_quat, 'YXZ');
        _spawnEuler.set(0, _euler.y, 0);
        _spawnQuat.setFromEuler(_spawnEuler);

        body.setTranslation({ x: pos.x, y: pos.y + 0.85, z: pos.z }, true);
        body.setRotation({ x: _spawnQuat.x, y: _spawnQuat.y, z: _spawnQuat.z, w: _spawnQuat.w }, true);

        body.setLinvel(_zeroVel, true);
        body.setAngvel(_zeroVel, true);

        currentRpmRef.current = 1000;
        isAirborneRef.current = false;
        settleFramesRef.current = 0;
        isRolledOverRef.current = false;
        rolloverTimerRef.current = 0;
        prevEmittedGearRef.current = 1;
        prevGearRef.current = 1;
        latestForwardSpeedRef.current = 0;
        latestLateralSpeedRef.current = 0;
        latestSpeedKmhRef.current = 0;
        useGameStore.setState({ isRolledOver: false });
        resetChassisDynamics(visualRef?.current ?? null, chassisDynamicsStateRef.current);
        resetSuspensionBumpStops(vehicleControllerRef.current, config);
        if (typeof body.setAngularDamping === 'function') {
          body.setAngularDamping(0.6);
        }

        emitGameEvent('vehicle_reset', {
          reason: 'recovery',
        });
      } else {
        body.setTranslation({ x: spawnPos[0], y: spawnPos[1], z: spawnPos[2] }, true);

        _spawnEuler.set(0, spawnRotY, 0);
        _spawnQuat.setFromEuler(_spawnEuler);
        body.setRotation({ x: _spawnQuat.x, y: _spawnQuat.y, z: _spawnQuat.z, w: _spawnQuat.w }, true);

        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);

        currentRpmRef.current = 1000;
        isAirborneRef.current = false;
        settleFramesRef.current = 0;
        pausedStateRef.current = null;
        isPausedRef.current = false;
        isRolledOverRef.current = false;
        rolloverTimerRef.current = 0;
        prevEmittedGearRef.current = 1;
        prevGearRef.current = 1;
        latestForwardSpeedRef.current = 0;
        latestLateralSpeedRef.current = 0;
        latestSpeedKmhRef.current = 0;
        useGameStore.setState({ isRolledOver: false });
        resetChassisDynamics(visualRef?.current ?? null, chassisDynamicsStateRef.current);
        resetSuspensionBumpStops(vehicleControllerRef.current, config);
        if (typeof body.setAngularDamping === 'function') {
          body.setAngularDamping(0.6);
        }

        emitGameEvent('vehicle_reset', {
          reason: 'manual',
        });
      }
    }
  });
}
