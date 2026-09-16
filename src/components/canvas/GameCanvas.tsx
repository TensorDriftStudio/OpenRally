import { Suspense, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ACESFilmicToneMapping, HalfFloatType, PCFShadowMap } from 'three';
import { Terrain } from '@/components/terrain/Terrain';
import { GrassField } from '@/components/terrain/GrassField';
import { PropsInstancer } from '@/components/terrain/PropsInstancer';

import { TerrainProvider } from '@/components/terrain/TerrainContext';
import { Ocean } from '@/components/environment/Ocean';
import { Checkpoints } from '@/components/environment/Checkpoints';
import { GymkhanaController } from '@/components/environment/GymkhanaController';
import { Vehicle } from '@/components/vehicle/Vehicle';
import { RemoteVehicleManager } from '@/components/vehicle/RemoteVehicleManager';
import { Lights } from '@/components/canvas/Lights';
import { ShaderWarmUp } from '@/components/canvas/ShaderWarmUp';
import { PostProcessingErrorBoundary } from '@/components/canvas/PostProcessingErrorBoundary';
import { Environment, Sky, AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import { useSettingsStore, saveSettingsToStorage } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { getLevelPreset } from '@/config/levelRegistry';
import { SKY_CONFIG, FOG_CONFIG, POSTPROCESSING_CONFIG } from '@/config/environment';
import { calculateDprConfig, isMobileDevice, isMobileOrAndroid } from '@/utils/device';
import { suspendSharedAudioContext } from '@/utils/audio/audioContext';
import type { DrawDistance } from '@/types';

export interface MobileFramePacerProps {
  targetFps?: number;
  enabled?: boolean;
}

export interface FramePacerOptions {
  advance: (timestamp: number) => void;
  clock?: { elapsedTime: number; oldTime?: number };
  targetFps?: number;
  enabled?: boolean;
}

/**
 * Calculates whether a frame should advance based on target FPS and jitter tolerance.
 */
export function shouldAdvanceFrame(
  now: number,
  lastFrameTime: number,
  targetFps: number = 60,
  jitterBufferMs: number = 1.5
): boolean {
  const interval = 1000 / targetFps;
  return now - lastFrameTime >= interval - jitterBufferMs;
}

/**
 * Initiates the 60 FPS mobile frame-pacing loop.
 * Caps presentation frequency on 120Hz LTPO screens (e.g. Pixel 10 Pro),
 * aligning visual frames with Rapier's 60Hz physics timestep and halving GPU draw calls.
 */
export function startFramePacingLoop({
  advance,
  clock,
  targetFps = 60,
  enabled = true,
}: FramePacerOptions): () => void {
  if (!enabled) return () => {};

  let animId: number;
  const interval = 1000 / targetFps;
  const jitterBufferMs = 1.5; // ~1.5ms jitter buffer for 120Hz vsync cadence
  let lastTime = performance.now();
  let lastRafTime = lastTime;
  let accumulator = 0;

  // Initial frame advance
  try {
    advance(lastTime / 1000);
  } catch (err) {
    console.warn('[GameCanvas] Suppressed initial advance error:', err);
  }

  const tick = (now: number) => {
    animId = requestAnimationFrame(tick);
    const elapsed = now - lastTime;
    const rafInterval = now - lastRafTime;
    lastRafTime = now;

    // Detect native 60Hz vsync cadence: if incoming rAF ticks arrive at ~16.6ms intervals (>13.0ms)
    // and target is 60 FPS, allow native vsync frames through without artificial frame-skipping judder
    const isNative60HzCadence = targetFps === 60 && rafInterval > 13.0 && elapsed > 12.0;

    // Detect 90Hz vsync cadence: incoming rAF ticks arrive at ~11.1ms intervals (9.5ms - 12.8ms)
    const is90HzCadence = targetFps === 60 && rafInterval >= 9.5 && rafInterval <= 12.8;

    let shouldAdvance = false;
    if (isNative60HzCadence) {
      shouldAdvance = true;
      accumulator = 0;
    } else if (is90HzCadence) {
      // Accumulate 90Hz tick time to render 2 out of every 3 frames (smooth 60 FPS instead of 45 FPS judder)
      accumulator += rafInterval;
      if (accumulator >= interval - jitterBufferMs) {
        shouldAdvance = true;
        accumulator = Math.max(0, accumulator - interval);
      }
    } else if (shouldAdvanceFrame(now, lastTime, targetFps, jitterBufferMs)) {
      shouldAdvance = true;
      accumulator = 0;
    }

    if (shouldAdvance) {
      // Prevent large delta spike if resuming from tab backgrounding / app pause
      if (elapsed > 200 && clock) {
        clock.elapsedTime = (now - interval) / 1000;
        if ('oldTime' in clock) {
          (clock as { oldTime: number }).oldTime = now - interval;
        }
        accumulator = 0;
      }
      lastTime = now;
      try {
        advance(now / 1000);
      } catch (renderErr) {
        console.warn('[GameCanvas] Suppressed render error in frame pacing loop:', renderErr);
      }
    }
  };

  animId = requestAnimationFrame(tick);

  return () => {
    if (animId) {
      cancelAnimationFrame(animId);
    }
  };
}

/**
 * Paces R3F scene rendering to target FPS (default 60 FPS) on mobile displays
 * (especially 120Hz LTPO screens like Google Pixel 10 Pro) to avoid thermal throttling,
 * battery drain, and redundant GPU passes while matching Rapier's 60Hz physics timestep.
 */
export function MobileFramePacer({ targetFps = 60, enabled = true }: MobileFramePacerProps) {
  const advance = useThree((state) => state.advance);
  const clock = useThree((state) => state.clock);

  useEffect(() => {
    return startFramePacingLoop({ advance, clock, targetFps, enabled });
  }, [advance, clock, enabled, targetFps]);

  return null;
}

/**
 * Paces 3D scene rendering during Menu and Title screens when frameloop is suspended.
 * Advances the cinematic showcase camera and vehicle turntable smoothly.
 */
export function MenuCinematicPacer({ enabled = true, targetFps = 60 }: { enabled?: boolean; targetFps?: number }) {
  const advance = useThree((state) => state.advance);
  const clock = useThree((state) => state.clock);

  useEffect(() => {
    return startFramePacingLoop({ advance, clock, targetFps, enabled });
  }, [advance, clock, enabled, targetFps]);

  return null;
}

/**
 * Reactively synchronizes the Three.js PerspectiveCamera far clipping plane
 * and updates its projection matrix whenever draw distance settings change.
 * Necessary because R3F's <Canvas camera={{ far }}> is only read at mount time.
 */
export function CameraFarController({ far }: { far: number }) {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (camera.far !== far && Number.isFinite(far) && far > 0) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, [camera, far]);

  return null;
}

/**
 * Monitors instantaneous frame duration and signals <AdaptiveDpr /> to temporarily
 * step down resolution when frame time exceeds 20ms (< 50 FPS).
 */
function AdaptivePerformanceTrigger() {
  const regress = useThree((s) => s.performance.regress);
  useFrame((_, delta) => {
    if (delta > 0.02) {
      regress();
    }
  });
  return null;
}

/**
 * Evaluates whether 3D shadow map rendering should be enabled on the Canvas.
 * Shadow passes are suppressed whenever shadows are toggled off in settings
 * or when graphics quality is 'low' to eliminate mobile GPU fill-rate and draw call overhead.
 */
export function shouldEnableCanvasShadows(
  shadowsEnabled: boolean,
  graphicsQuality: string,
): boolean {
  return shadowsEnabled && graphicsQuality !== 'low';
}

/**
 * Returns the shadow configuration for the Canvas:
 * - false on mobile devices to strictly eliminate mobile GPU crashes and white screens (contact shadows used instead)
 * - false on desktop if shadows are disabled or graphics quality is 'low'
 * - 'percentage' on desktop for hardware-accelerated PCF shadows
 */
export function getCanvasShadowsType(
  shadowsEnabled: boolean,
  graphicsQuality: string,
  isMobile: boolean = isMobileOrAndroid(),
): false | 'percentage' {
  if (isMobile || !shouldEnableCanvasShadows(shadowsEnabled, graphicsQuality)) {
    return false;
  }
  return 'percentage';
}

/**
 * Evaluates whether post-processing effects (Bloom, Vignette, ToneMapping) should be rendered.
 * On desktop: active when postProcessingEnabled is true and graphics quality is not 'low'.
 * On mobile TBDR GPUs: bypassed on 'low' and 'medium' (Balanced profile) to preserve 60 FPS and battery,
 * but enabled on 'high' and 'very_high' when postProcessingEnabled is true for high-end mobile devices.
 */
export function shouldRenderPostProcessing(
  postProcessingEnabled: boolean,
  isMobile: boolean,
  graphicsQuality: string,
): boolean {
  return (
    postProcessingEnabled &&
    (isMobile ? graphicsQuality === 'very_high' || graphicsQuality === 'high' : graphicsQuality !== 'low')
  );
}

/**
 * Main game canvas — wraps the R3F Canvas with Physics, scene objects,
 * dynamic level environments, and post-processing effects.
 */
export function GameCanvas() {
  const postProcessingEnabled = useSettingsStore(
    (s) => s.postProcessingEnabled,
  );
  const shadowsEnabled = useSettingsStore((s) => s.shadowsEnabled);
  const debugPhysics = useSettingsStore((s) => s.debugPhysics);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const antiAliasing = useSettingsStore((s) => s.antiAliasing);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const dynamicResolution = useSettingsStore((s) => s.dynamicResolution);
  const targetFps = useSettingsStore((s) => s.targetFps ?? 60);
  const drawDistance = useSettingsStore((s) => s.drawDistance ?? (isMobileDevice() ? 'medium' : 'far'));
  const gameState = useGameStore((s) => s.gameState);
  const selectedLevelId = useGameStore((s) => s.selectedLevelId);
  const isGarageOpen = useGameStore((s) => s.isGarageOpen);
  const isSceneReady = useGameStore((s) => s.isSceneReady);

  const isMobile = isMobileOrAndroid();

  const canRenderPostProcessing = shouldRenderPostProcessing(
    postProcessingEnabled,
    isMobile,
    graphicsQuality,
  );

  const envResolution = isMobile ? (graphicsQuality === 'low' ? 64 : 128) : 256;

  const levelPreset = getLevelPreset(selectedLevelId);

  const baseFogColor = levelPreset.environment?.fog?.color ?? FOG_CONFIG.color;
  const baseFogNear = levelPreset.environment?.fog?.near ?? FOG_CONFIG.near;
  const baseFogFar = levelPreset.environment?.fog?.far ?? FOG_CONFIG.far;

  // Dynamic Draw Distance configuration:
  // 'short': ~650m (massive mobile GPU fill/vertex relief, perfect for mobile battery & thermals)
  // 'medium': ~1200m (balanced horizon for mobile and laptops)
  // 'far': ~2200m (crisp high-end desktop view)
  // 'ultra': ~3800m (panoramic mountain vista)
  const drawDistanceMap: Record<DrawDistance, { cameraFar: number; fogNearScale: number; fogFarScale: number }> = {
    short: { cameraFar: 650, fogNearScale: 0.5, fogFarScale: 0.65 },
    medium: { cameraFar: 1200, fogNearScale: 0.8, fogFarScale: 1.0 },
    far: { cameraFar: 2200, fogNearScale: 1.1, fogFarScale: 1.6 },
    ultra: { cameraFar: 3800, fogNearScale: 1.4, fogFarScale: 2.2 },
  };

  const currentDist = drawDistanceMap[drawDistance] ?? drawDistanceMap.medium;
  const fogColor = baseFogColor;
  const fogNear = baseFogNear * currentDist.fogNearScale;
  const fogFar = baseFogFar * currentDist.fogFarScale;
  const cameraFar = currentDist.cameraFar;

  const sunPosition = (levelPreset.environment?.sky?.sunPosition ?? SKY_CONFIG.sunPosition) as [number, number, number];
  const inclination = levelPreset.environment?.sky?.inclination ?? SKY_CONFIG.inclination;
  const azimuth = levelPreset.environment?.sky?.azimuth ?? SKY_CONFIG.azimuth;

  const turbidity = levelPreset.environment?.sky?.turbidity ?? SKY_CONFIG.turbidity;
  const rayleigh = levelPreset.environment?.sky?.rayleigh ?? SKY_CONFIG.rayleigh;
  const mieCoefficient = levelPreset.environment?.sky?.mieCoefficient ?? SKY_CONFIG.mieCoefficient;
  const mieDirectionalG = levelPreset.environment?.sky?.mieDirectionalG ?? SKY_CONFIG.mieDirectionalG;

  const { dprTuple } = calculateDprConfig({
    graphicsQuality,
    resolutionScale,
    dynamicResolution,
  });

  const isGameplay = gameState === 'playing' || gameState === 'paused';
  // Suspend rendering loop completely during menus/title to consume 0% GPU/CPU
  const frameloop = !isGameplay ? 'never' : (isMobile ? 'never' : 'always');

  return (
    <Canvas
      frameloop={frameloop}
      dpr={dprTuple}
      shadows={shouldEnableCanvasShadows(shadowsEnabled, graphicsQuality)}
      camera={{ fov: 60, near: 0.35, far: cameraFar, position: [0, 10, -15] }}
      gl={{
        antialias: antiAliasing !== 'off',
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 0.98,
      }}
      performance={{ min: 0.6 }}
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: isGameplay ? 'auto' : 'none',
      }}
      onCreated={({ gl }) => {
        if (gl.shadowMap) {
          if (isMobile) {
            gl.shadowMap.enabled = false;
          } else {
            gl.shadowMap.type = PCFShadowMap;
          }
        }
        const canvas = gl.domElement;
        canvas.addEventListener(
          'webglcontextlost',
          (event) => {
            event.preventDefault();
            console.warn('[GameCanvas] webglcontextlost handled gracefully via preventDefault()');
            try {
              const { gameState, setGameState } = useGameStore.getState();
              if (gameState === 'playing') {
                setGameState('paused');
              }
              suspendSharedAudioContext().catch(() => {});
              const { shadowsEnabled } = useSettingsStore.getState();
              if (shadowsEnabled && isMobile) {
                useSettingsStore.setState({ shadowsEnabled: false });
                saveSettingsToStorage({ shadowsEnabled: false });
              }
            } catch {
              // Ignore
            }
          },
          false,
        );
        canvas.addEventListener(
          'webglcontextrestored',
          () => {
            console.info('[GameCanvas] webglcontextrestored: resetting renderer state');
            gl.resetState();
          },
          false,
        );
      }}
    >
      <MobileFramePacer targetFps={targetFps} enabled={isMobile && isGameplay} />
      <MenuCinematicPacer enabled={!isGameplay && !isGarageOpen} targetFps={isMobile ? 30 : 60} />
      <Suspense fallback={null}>
        <ShaderWarmUp />
        {dynamicResolution && <AdaptiveDpr />}
        <AdaptiveEvents />
        {dynamicResolution && <AdaptivePerformanceTrigger />}
        {/* Reactive camera far plane synchronization */}
        <CameraFarController far={cameraFar} />

        {/* Fog for atmosphere and distance culling */}
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />

        {/* Lighting */}
        <Lights />

        {/* Procedural Sky visible to player with realistic atmospheric scattering */}
        <Sky 
          distance={SKY_CONFIG.distance} 
          sunPosition={sunPosition}
          inclination={inclination} 
          azimuth={azimuth} 
          turbidity={turbidity}
          rayleigh={rayleigh}
          mieCoefficient={mieCoefficient}
          mieDirectionalG={mieDirectionalG}
        />
        {/* Environment captures the Sky for realistic reflections on water and car */}
        <Environment background={false} resolution={envResolution} frames={1}>
          <Sky 
            distance={SKY_CONFIG.distance} 
            sunPosition={sunPosition} 
            inclination={inclination} 
            azimuth={azimuth} 
            turbidity={turbidity}
            rayleigh={rayleigh}
            mieCoefficient={mieCoefficient}
            mieDirectionalG={mieDirectionalG}
          />
        </Environment>

        {/* Terrain context wraps both physics terrain, visual grass, ocean, props, and checkpoints */}
        <TerrainProvider key={selectedLevelId} levelPreset={levelPreset}>
          {/* Ocean boundary */}
          <Ocean />

          {/* Physics world */}
          <Physics 
            gravity={[0, -9.81, 0]} 
            timeStep={1 / 60} 
            debug={debugPhysics} 
            paused={gameState === 'paused' || (!isGameplay && isSceneReady)}
          >
            <Terrain />
            <PropsInstancer />
            
            {/* Rally Checkpoint Gates with physics colliders */}
            <Checkpoints />

            {/* Gymkhana Blitz physics scoring controller */}
            <GymkhanaController />

            {/* Player vehicle */}
            <Vehicle />

            {/* Remote networked peers */}
            <RemoteVehicleManager />
          </Physics>

          {/* Instanced grass field — outside Physics (no collision needed) */}
          <GrassField />
        </TerrainProvider>

        {/* Post-processing effects */}
        {canRenderPostProcessing && (
          <PostProcessingErrorBoundary>
            <EffectComposer
              multisampling={antiAliasing === 'msaa' && !isMobile ? 4 : 0}
              frameBufferType={isMobile ? undefined : HalfFloatType}
            >
              {antiAliasing === 'smaa' && !isMobile ? <SMAA /> : <></>}
              <Bloom
                luminanceThreshold={POSTPROCESSING_CONFIG.bloom.luminanceThreshold}
                luminanceSmoothing={POSTPROCESSING_CONFIG.bloom.luminanceSmoothing}
                mipmapBlur={!isMobile}
                resolutionScale={isMobile ? 0.5 : 1.0}
                levels={isMobile ? 2 : (graphicsQuality === 'very_high' ? 8 : 5)}
                intensity={isMobile ? 0.25 : POSTPROCESSING_CONFIG.bloom.intensity}
              />
              {/* ToneMapping inside EffectComposer prevents severe HDR clipping blowout */}
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
              <Vignette
                offset={POSTPROCESSING_CONFIG.vignette.offset}
                darkness={POSTPROCESSING_CONFIG.vignette.darkness}
              />
            </EffectComposer>
          </PostProcessingErrorBoundary>
        )}
      </Suspense>
    </Canvas>
  );
}
