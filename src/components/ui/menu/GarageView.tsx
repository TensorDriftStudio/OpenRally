import { useRef, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { WebGLRenderer, PCFShadowMap } from 'three';
import type { VehiclePreset, GameMode, TireType } from '@/types';
import { getGameModeDefinition } from '@/config/gameModeRegistry';
import { getLevelPreset, getRecommendedTireForLevel } from '@/config/levelRegistry';
import { getTireDefinition, AVAILABLE_TIRE_TYPES } from '@/config/tireRegistry';
import { useSettingsStore, saveSettingsToStorage } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';
import { getActiveGamepad, XBOX_AXES, XBOX_BUTTONS } from '@/utils/input/gamepad';
import { shouldEnableCanvasShadows } from '@/components/canvas/GameCanvas';
import { isMobileOrAndroid } from '@/utils/device';
import { menuStyles, getFocusStyle } from './menuStyles';
import { CarModelDisplay, StatBar } from './CarModelDisplay';
import type { MenuView } from './types';

const TURNTABLE_DEADZONE = 0.12;
const TURNTABLE_ROTATE_SPEED = 2.8;

function applyTurntableDeadzone(v: number): number {
  const abs = Math.abs(v);
  if (abs <= TURNTABLE_DEADZONE) return 0;
  return (Math.sign(v) * (abs - TURNTABLE_DEADZONE)) / (1 - TURNTABLE_DEADZONE);
}

interface GarageGamepadTurntableProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/**
 * 360° Gamepad Turntable Controller for the Garage 3D Canvas.
 * Supports smooth camera orbit exclusively via Right analog stick,
 * analog zoom via LT / RT triggers, and camera reset via RSB / R3 stick click.
 * Zero-allocation in useFrame to satisfy enterprise performance standards.
 */
function GarageGamepadTurntable({ controlsRef }: GarageGamepadTurntableProps) {
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Direct read without modifying global menu button edge states
    const gp = getActiveGamepad();
    if (!gp || !gp.connected) return;

    const axes = gp.axes || [];
    const buttons = gp.buttons || [];
    const dt = Math.min(0.1, Math.max(0.001, delta));

    // Right analog stick ONLY (Dedicated 360 camera orbit)
    const stickX = applyTurntableDeadzone(axes[XBOX_AXES.RIGHT_STICK_X] ?? 0);
    const stickY = applyTurntableDeadzone(axes[XBOX_AXES.RIGHT_STICK_Y] ?? 0);

    if (Math.abs(stickX) > 0) {
      const currentTheta = controls.getAzimuthalAngle();
      controls.setAzimuthalAngle(currentTheta - stickX * TURNTABLE_ROTATE_SPEED * dt);
    }
    if (Math.abs(stickY) > 0) {
      const currentPhi = controls.getPolarAngle();
      controls.setPolarAngle(currentPhi + stickY * TURNTABLE_ROTATE_SPEED * dt);
    }
    if (Math.abs(stickX) > 0 || Math.abs(stickY) > 0) {
      controls.update();
    }

    // Analog Triggers (LT = zoom out, RT = zoom in)
    const ltValue = buttons[XBOX_BUTTONS.LT]?.value ?? (buttons[XBOX_BUTTONS.LT]?.pressed ? 1 : 0);
    const rtValue = buttons[XBOX_BUTTONS.RT]?.value ?? (buttons[XBOX_BUTTONS.RT]?.pressed ? 1 : 0);
    const zoomDelta = rtValue - ltValue;

    if (Math.abs(zoomDelta) > 0.1) {
      const zoomFactor = 1 + Math.abs(zoomDelta) * 1.6 * dt;
      if (zoomDelta > 0) {
        controls.dollyIn(zoomFactor);
      } else {
        controls.dollyOut(zoomFactor);
      }
      controls.update();
    }

    // Reset view: RSB (Right Stick Click / R3) or LSB
    const btnRSB = buttons[XBOX_BUTTONS.RSB]?.pressed;
    const btnLSB = buttons[XBOX_BUTTONS.LSB]?.pressed;
    if (btnRSB || btnLSB) {
      controls.reset();
    }
  });

  return null;
}

interface GarageViewProps {
  availableVehicles: VehiclePreset[];
  previewVehicleId: string;
  selectedVehicleId: string;
  previewPreset: VehiclePreset;
  focusedIndex: number;
  textColor: string;
  subtitleColor: string;
  currentLevelName?: string;
  gameMode?: GameMode;
  selectedTireType?: TireType;
  onSelectTireType?: (tireType: TireType) => void;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSelectPreviewVehicle: (id: string) => void;
  onEquipVehicle: (id: string) => void;
  onStartRace?: (id: string) => void;
  onSelectView: (view: MenuView) => void;
}

function getVehicleCategoryTag(preset: VehiclePreset): string {
  if (preset.id === 'apex_phantom_b' || preset.id === 'rally_cyclone_b') return 'GROUP B PROTOTYPE';
  if (preset.id === 'vortex_b') return 'GROUP B HOMOLOGATION';
  if (preset.id === 'bantam_turbo') return 'MID-ENGINE MAXI';
  if (preset.id === 'vanguard_gt') return 'AERO GT COUPE';

  if (preset.id === 'shadowfire_rs' || preset.id === 'rally_wrc') return 'MODERN RALLY RS';
  if (preset.id === 'zephyr_wr4' || preset.id === 'rally_hatchback') return 'CHAMPIONSHIP AWD';
  if (preset.id === 'kodiak_raid' || preset.id === 'rally_titan_b') return 'CROSS-COUNTRY RAID';
  return preset.category.toUpperCase();
}

interface GarageErrorBoundaryProps {
  children: ReactNode;
}

interface GarageErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class GarageCanvasErrorBoundary extends Component<
  GarageErrorBoundaryProps,
  GarageErrorBoundaryState
> {
  public override state: GarageErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): GarageErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || '3D Preview unavailable on this device',
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn('[GarageCanvasErrorBoundary] Suppressed 3D preview error in Garage:', error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#94a3b8',
            textAlign: 'center',
            padding: '16px',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '24px' }}>🏎️</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f87171' }}>
            3D Preview Unavailable
          </span>
          <span style={{ fontSize: '10px', color: '#64748b', maxWidth: '240px' }}>
            GPU memory limit or context lost. Vehicle can still be equipped and raced.
          </span>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            style={{
              marginTop: '6px',
              padding: '4px 12px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Retry 3D View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GarageView({
  availableVehicles,
  previewVehicleId,
  selectedVehicleId,
  previewPreset,
  focusedIndex,
  textColor,
  subtitleColor,
  currentLevelName,
  gameMode,
  selectedTireType,
  onSelectTireType,
  onPointerMoveItem,
  onSelectPreviewVehicle,
  onEquipVehicle,
  onStartRace,
  onSelectView,
}: GarageViewProps) {
  const isEquipped = selectedVehicleId === previewVehicleId;
  const shadowsEnabled = useSettingsStore((s) => s.shadowsEnabled);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const storeGamepadConnected = useGameStore((s) => s.gamepadConnected);
  const storeGamepadType = useGameStore((s) => s.gamepadType);
  const gamepadConnected = useGameStore.getState().gamepadConnected ?? storeGamepadConnected;
  const gamepadType = useGameStore.getState().gamepadType ?? storeGamepadType;
  const storeTireType = useGameStore((s) => s.selectedTireType);
  const storeSetTireType = useGameStore((s) => s.setSelectedTireType);
  const selectedLevelId = useGameStore((s) => s.selectedLevelId);
  const currentLevelPreset = getLevelPreset(selectedLevelId);
  const recommendedTire = getRecommendedTireForLevel(currentLevelPreset);
  const activeTireType = selectedTireType ?? storeTireType;
  const handleSelectTire = onSelectTireType ?? storeSetTireType;
  const activeTireDef = getTireDefinition(activeTireType);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const glRef = useRef<WebGLRenderer | null>(null);
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  const carouselContainerRef = useRef<HTMLDivElement | null>(null);

  const currentVehicleIndex = Math.max(
    0,
    availableVehicles.findIndex((v) => v.id === previewVehicleId),
  );

  const handlePrevVehicle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const count = availableVehicles.length;
    if (count <= 1) return;
    const prevIdx = (currentVehicleIndex - 1 + count) % count;
    onSelectPreviewVehicle(availableVehicles[prevIdx].id);
  };

  const handleNextVehicle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const count = availableVehicles.length;
    if (count <= 1) return;
    const nextIdx = (currentVehicleIndex + 1) % count;
    onSelectPreviewVehicle(availableVehicles[nextIdx].id);
  };

  useEffect(() => {
    if (activeCardRef.current && carouselContainerRef.current) {
      activeCardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [previewVehicleId]);

  useEffect(() => {
    useGameStore.getState().setGarageOpen(true);
    const controls = controlsRef.current;
    return () => {
      useGameStore.getState().setGarageOpen(false);
      if (controls) {
        controls.dispose();
      }
      if (glRef.current) {
        try {
          glRef.current.getContext().getExtension('WEBGL_lose_context')?.loseContext();
          glRef.current.dispose();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!controlsRef.current) return;
    controlsRef.current.dollyIn(1.25);
    controlsRef.current.update();
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!controlsRef.current) return;
    controlsRef.current.dollyOut(1.25);
    controlsRef.current.update();
  };

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!controlsRef.current) return;
    controlsRef.current.reset();
  };

  return (
    <div
      className="garage-subview menu-scalable-container"
      style={{ ...menuStyles.subView, color: textColor, width: '100%', minWidth: '540px', maxWidth: '880px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <h2 style={{ ...menuStyles.subViewTitle, margin: 0 }}>Vehicle Selection</h2>
        <span
          style={{
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'rgba(227, 24, 55, 0.15)',
            border: '1px solid rgba(227, 24, 55, 0.4)',
            color: '#F87171',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '1px',
          }}
        >
          STEP 3 / 3
        </span>
      </div>

      {/* Race Configuration Summary Pill */}
      {(currentLevelName || gameMode) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '6px 14px',
            borderRadius: '16px',
            marginBottom: '10px',
            fontSize: '12px',
            color: '#CBD5E1',
          }}
        >
          {currentLevelName && (
            <span>STAGE: <strong style={{ color: '#FFFFFF' }}>{currentLevelName}</strong></span>
          )}
          {currentLevelName && gameMode && <span>•</span>}
          {gameMode && (
            <span>MODE: <strong style={{ color: getGameModeDefinition(gameMode).badgeColor }}>{getGameModeDefinition(gameMode).badgeLabel}</strong></span>
          )}
        </div>
      )}

      {/* Side-by-Side Split: Left Turntable, Right Specs & Actions */}
      <div className="garage-split-layout" style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '12px' }}>
        {/* Left: 3D Preview Canvas with 360° Orbit & Zoom */}
        <div
          className="garage-canvas-box"
          style={{
            width: '100%',
            height: '240px',
            position: 'relative',
            background: 'radial-gradient(ellipse at center, #18233C 0%, #0B101D 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            cursor: 'grab',
          }}
        >
          <GarageCanvasErrorBoundary>
          <Canvas
            shadows={!isMobileOrAndroid() && shouldEnableCanvasShadows(shadowsEnabled, graphicsQuality)}
            dpr={[1, isMobileOrAndroid() ? 1.5 : 2]}
            camera={{ position: [3.8, 2.0, -5.4], fov: 42 }}
            onCreated={({ gl }) => {
              glRef.current = gl;
              const isMobile = isMobileOrAndroid();
              if (gl.shadowMap) {
                gl.shadowMap.type = PCFShadowMap;
              }
              const canvas = gl.domElement;
              canvas.addEventListener(
              'webglcontextlost',
              (e) => {
                e.preventDefault();
                console.warn('[GarageView] webglcontextlost handled via preventDefault()');
                try {
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
                console.info('[GarageView] webglcontextrestored: resetting renderer state');
                gl.resetState();
              },
              false,
            );
            }}
          >
            <color attach="background" args={['#0B101D']} />
            <ambientLight intensity={0.9} />
            <directionalLight
              position={[10, 10, 10]}
              intensity={2.2}
              castShadow={!isMobileOrAndroid() && shouldEnableCanvasShadows(shadowsEnabled, graphicsQuality)}
              shadow-bias={-0.0005}
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <directionalLight position={[-8, 6, -8]} intensity={0.7} color="#3B82F6" />
            <group position={[0, 0.15, 0]}>
              <CarModelDisplay preset={previewPreset} />
            </group>
            <OrbitControls
              ref={controlsRef}
              enablePan={false}
              enableZoom={true}
              minDistance={2.4}
              maxDistance={8.5}
              minPolarAngle={Math.PI / 12}
              maxPolarAngle={Math.PI / 2 - 0.05}
              enableDamping={true}
              dampingFactor={0.08}
              target={[0, 0.4, 0]}
            />
            <GarageGamepadTurntable controlsRef={controlsRef} />
            <Environment preset="city" />
          </Canvas>
          </GarageCanvasErrorBoundary>

          {/* Interactive Zoom & Reset Controls (44x44px Touch Targets) */}
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            display: 'flex',
            gap: '8px',
            zIndex: 10,
          }}>
            <button
              type="button"
              title="Zoom In"
              style={styles.zoomButton}
              onClick={handleZoomIn}
            >
              +
            </button>
            <button
              type="button"
              title="Zoom Out"
              style={styles.zoomButton}
              onClick={handleZoomOut}
            >
              −
            </button>
            <button
              type="button"
              title="Reset Camera View"
              style={styles.zoomButton}
              onClick={handleResetCamera}
            >
              ↺
            </button>
          </div>

          {/* Interaction Hint */}
          <span style={{
            position: 'absolute',
            bottom: '8px',
            right: '12px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: 'rgba(255, 255, 255, 0.65)',
            pointerEvents: 'none',
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
          }}>
            {gamepadConnected
              ? (gamepadType === 'dualsense'
                  ? '🎮 RIGHT STICK: ROTATE 360° • L2/R2: ZOOM • R3: RESET'
                  : '🎮 RIGHT STICK: ROTATE 360° • LT/RT: ZOOM • RSB: RESET')
              : 'DRAG TO ROTATE • SCROLL TO ZOOM'}
          </span>
        </div>

        {/* Right: Vehicle Selection Tabs, Specs and Action Buttons */}
        <div className="garage-details-box" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Vehicle Selection Carousel Navigation Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '6px',
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '4px 8px',
            }}
          >
            <button
              type="button"
              title="Previous Vehicle"
              aria-label="Previous Vehicle"
              style={styles.carouselNavButton}
              onClick={handlePrevVehicle}
            >
              ◀
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '1.2px',
                  color: '#CBD5E1',
                  textTransform: 'uppercase',
                }}
              >
                CAR {currentVehicleIndex + 1} OF {availableVehicles.length}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.8px',
                  color: '#F87171',
                  background: 'rgba(227, 24, 55, 0.18)',
                  border: '1px solid rgba(227, 24, 55, 0.35)',
                  padding: '1px 8px',
                  borderRadius: '8px',
                }}
              >
                {getVehicleCategoryTag(previewPreset)}
              </span>
            </div>

            <button
              type="button"
              title="Next Vehicle"
              aria-label="Next Vehicle"
              style={styles.carouselNavButton}
              onClick={handleNextVehicle}
            >
              ▶
            </button>
          </div>

          {/* Horizontal Vehicle Cards Carousel Strip */}
          <div
            ref={carouselContainerRef}
            className="garage-carousel-strip"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingBottom: '4px',
              marginBottom: '6px',
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {availableVehicles.map((veh) => {
              const isSelected = veh.id === previewVehicleId;
              const isCarEquipped = veh.id === selectedVehicleId;
              return (
                <button
                  key={veh.id}
                  ref={isSelected ? activeCardRef : undefined}
                  type="button"
                  style={{
                    flex: '0 0 auto',
                    minWidth: '130px',
                    maxWidth: '160px',
                    minHeight: '48px',
                    scrollSnapAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(227, 24, 55, 0.25) 0%, rgba(27, 54, 93, 0.6) 100%)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected
                      ? '1.5px solid #E31837'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isSelected
                      ? '0 0 12px rgba(227, 24, 55, 0.35), inset 0 0 8px rgba(227, 24, 55, 0.15)'
                      : 'none',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1.0)',
                  }}
                  onClick={() => onSelectPreviewVehicle(veh.id)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isSelected ? '#FFFFFF' : '#E2E8F0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: isCarEquipped ? '80px' : '110px',
                      }}
                    >
                      {veh.name}
                    </span>
                    {isCarEquipped && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '4px',
                          padding: '1px 4px',
                          lineHeight: 1,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      color: isSelected ? '#F87171' : '#94A3B8',
                      fontWeight: 600,
                    }}
                  >
                    <span>{veh.stats.driveType}</span>
                    <span>•</span>
                    <span>{veh.config.engine.maxSpeed} km/h</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Vehicle Header & Drive Badge */}
          <div style={{ ...menuStyles.garageHeader, marginBottom: '4px' }}>
            <span style={menuStyles.garageVehicleName}>{previewPreset.name}</span>
            <span style={menuStyles.driveBadge}>{previewPreset.stats.driveType}</span>
          </div>
          <p className="garage-desc-compact" style={{ ...menuStyles.subtitle, color: subtitleColor, margin: '0 0 8px 0', fontSize: '12px', lineHeight: 1.3 }}>
            {previewPreset.description}
          </p>

          <div style={{ ...menuStyles.statsContainer, gap: '6px' }}>
            <StatBar label="Top Speed" value={previewPreset.stats.topSpeed} />
            <StatBar label="Acceleration" value={previewPreset.stats.acceleration} />
            <StatBar label="Handling" value={previewPreset.stats.handling} />
            <StatBar label="Offroad" value={previewPreset.stats.offroad} />
          </div>

          {/* 3-Way Tire Compound Selection Widget */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '4px',
              marginBottom: '2px',
              background: 'rgba(15, 23, 42, 0.55)',
              border: focusedIndex === 0
                ? '1.5px solid #E31837'
                : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '6px 10px',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              boxShadow: focusedIndex === 0 ? '0 0 12px rgba(227, 24, 55, 0.35)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#CBD5E1', textTransform: 'uppercase' }}>
                  TIRE COMPOUND
                </span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#FFFFFF' }}>
                  • {activeTireDef.label}
                </span>
                {activeTireType === recommendedTire && (
                  <span style={{ fontSize: '9px', fontWeight: 800, color: '#34D399', letterSpacing: '0.5px' }}>
                    (STAGE DEFAULT)
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.8px',
                  color: activeTireDef.color,
                  background: activeTireDef.badgeBg,
                  border: `1px solid ${activeTireDef.badgeBorder}`,
                  padding: '1px 6px',
                  borderRadius: '6px',
                }}
              >
                {activeTireDef.badge}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                width: '100%',
              }}
            >
              {AVAILABLE_TIRE_TYPES.map((tType) => {
                const tireDef = getTireDefinition(tType);
                const isSelected = activeTireType === tType;
                const isRecommended = tType === recommendedTire;

                return (
                  <button
                    key={tType}
                    type="button"
                    style={{
                      minHeight: '44px',
                      minWidth: '44px',
                      padding: '4px 6px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '2px',
                      background: isSelected
                        ? `linear-gradient(135deg, ${tireDef.badgeBg} 0%, rgba(15, 23, 42, 0.9) 100%)`
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected
                        ? `1.5px solid ${tireDef.color}`
                        : isRecommended
                          ? '1px solid rgba(52, 211, 153, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: isSelected
                        ? `0 0 10px ${tireDef.badgeBg}`
                        : 'none',
                      color: isSelected ? '#FFFFFF' : '#94A3B8',
                      fontWeight: 700,
                      fontSize: '11px',
                      transition: 'all 0.15s ease',
                      boxSizing: 'border-box',
                      touchAction: 'manipulation',
                    }}
                    onPointerMove={(e) => onPointerMoveItem(0, e)}
                    onClick={() => handleSelectTire(tType)}
                  >
                    <span style={{ fontSize: '14px' }}>{tireDef.icon}</span>
                    <span style={{ letterSpacing: '0.4px', fontWeight: 800 }}>{tireDef.label}</span>
                    {isRecommended && (
                      <span
                        style={{
                          fontSize: '8px',
                          fontWeight: 800,
                          color: isSelected ? '#A7F3D0' : '#34D399',
                          letterSpacing: '0.5px',
                          lineHeight: 1,
                        }}
                      >
                        RECOMMENDED
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <span style={{ fontSize: '10px', color: '#94A3B8', lineHeight: 1.25 }}>
              {activeTireDef.description}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
            <button
              style={{
                ...menuStyles.button,
                minHeight: '44px',
                flex: 1,
                background: onStartRace ? 'linear-gradient(90deg, #991B1B, #E31837)' : (isEquipped ? 'linear-gradient(90deg, #059669, #10B981)' : 'linear-gradient(90deg, #991B1B, #E31837)'),
                boxShadow: onStartRace ? '0 4px 16px rgba(227, 24, 55, 0.4)' : undefined,
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '15px',
                letterSpacing: '1px',
                color: '#FFFFFF',
                ...getFocusStyle(focusedIndex === 1),
              }}
              onPointerMove={(e) => onPointerMoveItem(1, e)}
              onClick={() => {
                if (onStartRace) {
                  onStartRace(previewVehicleId);
                } else {
                  onEquipVehicle(previewVehicleId);
                }
              }}
            >
              {onStartRace ? 'START RACE ►' : (isEquipped ? '✓ EQUIPPED' : 'EQUIP VEHICLE')}
            </button>
            <button
              style={{ 
                ...menuStyles.button, 
                ...menuStyles.secondaryButton, 
                minHeight: '44px',
                color: textColor, 
                borderColor: 'rgba(255, 255, 255, 0.1)', 
                width: '120px',
                justifyContent: 'center',
                ...getFocusStyle(focusedIndex === 2),
              }} 
              onPointerMove={(e) => onPointerMoveItem(2, e)}
              onClick={() => onSelectView('start_mode')}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  zoomButton: {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    minHeight: '44px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#F1F5F9',
    fontSize: '18px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
    touchAction: 'manipulation',
    boxSizing: 'border-box',
  },
  carouselNavButton: {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    minHeight: '44px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#F1F5F9',
    fontSize: '14px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
    touchAction: 'manipulation',
    boxSizing: 'border-box',
  },
};
