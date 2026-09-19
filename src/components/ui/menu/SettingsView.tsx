import { useState } from 'react';
import type {
  GraphicsQuality,
  TargetFps,
  DrawDistance,
  AntiAliasingMode,
  TouchControlMode,
  TouchSteeringScheme,
  TouchButtonSize,
  TransmissionMode,
} from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { isMobileOrAndroid } from '@/utils/device';
import { menuStyles, getFocusStyle } from './menuStyles';
import { MIN_STEERING_SENSITIVITY, MAX_STEERING_SENSITIVITY, STEERING_SENSITIVITY_STEP } from '@/config/input';
import type { ControlsTab, MenuView, ResetConfirmState, SettingsCategory } from './types';
import { ControlsView } from './ControlsView';

export type { SettingsCategory };

interface SettingsViewProps {
  graphicsQuality: GraphicsQuality;
  targetFps: TargetFps;
  drawDistance: DrawDistance;
  antiAliasing: AntiAliasingMode;
  resolutionScale: number;
  dynamicResolution: boolean;
  shadowsEnabled: boolean;
  postProcessingEnabled: boolean;
  sensitivity: number;
  vibrationEnabled: boolean;
  vibrationIntensity: number;
  menuMusicVolume: number;
  gameMusicVolume: number;
  sfxVolume: number;
  resetConfirmState: ResetConfirmState;
  focusedIndex: number;
  textColor: string;
  activeCategory?: SettingsCategory;
  onSetActiveCategory?: (cat: SettingsCategory) => void;
  gamepadConnected?: boolean;
  gamepadName?: string;
  gamepadType?: 'xbox' | 'dualsense' | 'generic' | null;
  controlsTab?: ControlsTab;
  onSetControlsTab?: (tab: ControlsTab) => void;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSetGraphicsQuality: (quality: GraphicsQuality) => void;
  onSetTargetFps: (fps: TargetFps) => void;
  onSetDrawDistance: (distance: DrawDistance) => void;
  onSetAntiAliasing: (mode: AntiAliasingMode) => void;
  onSetResolutionScale: (scale: number) => void;
  onToggleDynamicResolution: () => void;
  onToggleShadows: () => void;
  onTogglePostProcessing: () => void;
  onSetSensitivity: (val: number) => void;
  onToggleVibration: () => void;
  onSetVibrationIntensity: (val: number) => void;
  onSetMenuMusicVolume: (val: number) => void;
  onSetGameMusicVolume: (val: number) => void;
  onSetSfxVolume: (val: number) => void;
  onResetRecords: () => void;
  onSelectView: (view: MenuView) => void;
}

const tabBumperBadgeStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: 800,
  color: '#94A3B8',
  letterSpacing: '0.5px',
  userSelect: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

export function SettingsView({
  graphicsQuality,
  targetFps,
  drawDistance,
  antiAliasing,
  resolutionScale,
  dynamicResolution,
  shadowsEnabled,
  postProcessingEnabled,
  sensitivity,
  vibrationEnabled,
  vibrationIntensity,
  menuMusicVolume,
  gameMusicVolume,
  sfxVolume,
  resetConfirmState,
  focusedIndex,
  textColor,
  activeCategory: propActiveCategory,
  onSetActiveCategory,
  gamepadConnected = false,
  gamepadName = '',
  gamepadType = null,
  controlsTab = 'dualsense',
  onSetControlsTab,
  onPointerMoveItem,
  onSetGraphicsQuality,
  onSetTargetFps,
  onSetDrawDistance,
  onSetAntiAliasing,
  onSetResolutionScale,
  onToggleDynamicResolution,
  onToggleShadows,
  onTogglePostProcessing,
  onSetSensitivity,
  onToggleVibration,
  onSetVibrationIntensity,
  onSetMenuMusicVolume,
  onSetGameMusicVolume,
  onSetSfxVolume,
  onResetRecords,
  onSelectView,
}: SettingsViewProps) {
  const {
    touchControlMode,
    setTouchControlMode,
    touchSteeringScheme,
    setTouchSteeringScheme,
    touchOpacity,
    setTouchOpacity,
    touchButtonSize,
    setTouchButtonSize,
    touchHaptics,
    setTouchHaptics,
    transmissionMode,
    setTransmissionMode,
    absEnabled,
    toggleAbs,
    tcsEnabled,
    toggleTcs,
    espEnabled,
    toggleEsp,
  } = useSettingsStore();

  const [internalCategory, setInternalCategory] = useState<SettingsCategory>('graphics');
  const activeCategory = propActiveCategory ?? internalCategory;
  const setActiveCategory = onSetActiveCategory ?? setInternalCategory;

  const backIdx =
    activeCategory === 'graphics'
      ? 9
      : activeCategory === 'audio'
        ? 4
        : activeCategory === 'controls'
          ? 2
          : activeCategory === 'touch'
            ? 6
            : vibrationEnabled
              ? 9
              : 8;

  return (
    <div
      className="settings-subview menu-scalable-container"
      style={{ ...menuStyles.subView, color: textColor, width: '100%', minWidth: '540px', maxWidth: '880px' }}
    >
      <h2 style={menuStyles.subViewTitle}>Options & Settings</h2>

      {/* Row 0: 5 Categorized Horizontal Tabs with Controller Bumper Badges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          width: '100%',
          marginBottom: '10px',
          flexWrap: 'wrap',
          padding: '4px',
          borderRadius: '8px',
          background: focusedIndex === 0 ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
          border: focusedIndex === 0 ? '1px solid #38BDF8' : '1px solid transparent',
          transition: 'all 0.15s ease',
        }}
        onPointerMove={(e) => onPointerMoveItem(0, e)}
      >
        <span style={tabBumperBadgeStyle}>{gamepadConnected ? 'LB / L1' : 'Q'}</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, justifyContent: 'center' }}>
          {(['graphics', 'audio', 'controls', 'touch', 'gameplay'] as const).map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                style={{
                  ...menuStyles.tabButton,
                  minHeight: '44px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  ...(isActive ? menuStyles.activeTabButton : {}),
                  ...(focusedIndex === 0 && isActive ? { boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)' } : {}),
                }}
                onClick={() => setActiveCategory(cat)}
              >
                {cat === 'touch' ? 'Touch Controls' : cat}
              </button>
            );
          })}
        </div>
        <span style={tabBumperBadgeStyle}>{gamepadConnected ? 'RB / R1' : 'E'}</span>
      </div>

      {/* Active Tab Content Container */}
      <div className="settings-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {/* TAB: CONTROLS */}
        {activeCategory === 'controls' && (
          <div
            style={{ width: '100%', ...getFocusStyle(focusedIndex === 1) }}
            onPointerMove={(e) => onPointerMoveItem(1, e)}
          >
            <ControlsView
              hideTitleAndBack={true}
              gamepadConnected={gamepadConnected}
              gamepadName={gamepadName}
              gamepadType={gamepadType}
              controlsTab={controlsTab}
              focusedIndex={0}
              textColor={textColor}
              onPointerMoveItem={() => {}}
              onSetControlsTab={onSetControlsTab ?? (() => {})}
              onSelectView={onSelectView}
            />
          </div>
        )}

        {/* TAB 1: GRAPHICS */}
        {activeCategory === 'graphics' && (
          <>
            {/* Row 1: Graphics Quality */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 1) }}
              onPointerMove={(e) => onPointerMoveItem(1, e)}
            >
              <span>Graphics Quality</span>
              <select
                value={graphicsQuality}
                onChange={(e) => onSetGraphicsQuality(e.target.value as GraphicsQuality)}
                style={menuStyles.select}
              >
                <option value="low">Low (Optimized Mobile)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="high">High (Desktop)</option>
                <option value="very_high">Very High (Ultra)</option>
              </select>
            </div>

            {/* Row 2: Target Frame Rate */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 2) }}
              onPointerMove={(e) => onPointerMoveItem(2, e)}
            >
              <span>Target Frame Rate</span>
              <select
                value={targetFps}
                onChange={(e) => onSetTargetFps(parseInt(e.target.value, 10) as TargetFps)}
                style={menuStyles.select}
              >
                <option value={30}>30 FPS (Battery Saver)</option>
                <option value={60}>60 FPS (Balanced)</option>
                <option value={120}>120 FPS (Ultra Fluid / 120Hz)</option>
              </select>
            </div>

            {/* Row 3: Draw Distance */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 3) }}
              onPointerMove={(e) => onPointerMoveItem(3, e)}
            >
              <span>Draw Distance</span>
              <select
                value={drawDistance}
                onChange={(e) => onSetDrawDistance(e.target.value as DrawDistance)}
                style={menuStyles.select}
              >
                <option value="short">Short (650m - Best FPS)</option>
                <option value="medium">Medium (1200m - Balanced)</option>
                <option value="far">Far (2200m - High Detail)</option>
                <option value="ultra">Ultra (3800m - Maximum)</option>
              </select>
            </div>

            {/* Row 4: Anti-Aliasing */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 4) }}
              onPointerMove={(e) => onPointerMoveItem(4, e)}
            >
              <span>Anti-Aliasing</span>
              <select
                value={antiAliasing}
                onChange={(e) => onSetAntiAliasing(e.target.value as AntiAliasingMode)}
                style={menuStyles.select}
              >
                <option value="smaa">SMAA (Sharp & Fast)</option>
                <option value="msaa">MSAA 4x (Hardware)</option>
                <option value="off">Off (Fastest)</option>
              </select>
            </div>

            {/* Row 5: Render Resolution */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 5) }}
              onPointerMove={(e) => onPointerMoveItem(5, e)}
            >
              <span>Render Resolution</span>
              <select
                value={resolutionScale}
                onChange={(e) => onSetResolutionScale(parseFloat(e.target.value))}
                style={menuStyles.select}
              >
                <option value="0.5">50% (Performance)</option>
                <option value="0.75">75% (Balanced)</option>
                <option value="1">100% (Native)</option>
                <option value="1.25">125% (Ultra Sharp)</option>
                <option value="1.5">150% (Super-Sampling)</option>
              </select>
            </div>

            {/* Row 6: Dynamic Resolution (Adaptive DPR) */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 6) }}
              onPointerMove={(e) => onPointerMoveItem(6, e)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Dynamic Resolution</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                  Adaptive DPR
                </span>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '48px', minHeight: '44px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={dynamicResolution}
                  onChange={onToggleDynamicResolution}
                  style={menuStyles.checkbox}
                />
              </label>
            </div>

            {/* Row 7: Real-time Shadows */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 7) }}
              onPointerMove={(e) => onPointerMoveItem(7, e)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Real-time Shadows</span>
                {isMobileOrAndroid() && (
                  <span style={{ fontSize: '11px', color: '#94A3B8', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                    PC Only (Contact AO Active)
                  </span>
                )}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '48px', minHeight: '44px', cursor: isMobileOrAndroid() ? 'not-allowed' : 'pointer', opacity: isMobileOrAndroid() ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={!isMobileOrAndroid() && shadowsEnabled}
                  disabled={isMobileOrAndroid()}
                  onChange={onToggleShadows}
                  style={menuStyles.checkbox}
                />
              </label>
            </div>

            {/* Row 8: Post Processing */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 8) }}
              onPointerMove={(e) => onPointerMoveItem(8, e)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Post Processing</span>
                {isMobileOrAndroid() && (
                  <span style={{ fontSize: '11px', color: '#94A3B8', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                    PC Only (Performance Guard)
                  </span>
                )}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '48px', minHeight: '44px', cursor: isMobileOrAndroid() ? 'not-allowed' : 'pointer', opacity: isMobileOrAndroid() ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={!isMobileOrAndroid() && postProcessingEnabled}
                  disabled={isMobileOrAndroid()}
                  onChange={onTogglePostProcessing}
                  style={menuStyles.checkbox}
                />
              </label>
            </div>
          </>
        )}

        {/* TAB 2: AUDIO */}
        {activeCategory === 'audio' && (
          <>
            {/* Row 1: Menu Music */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 1) }}
              onPointerMove={(e) => onPointerMoveItem(1, e)}
            >
              <span>Menu Music ({Math.round(menuMusicVolume * 100)}%)</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={menuMusicVolume}
                  onChange={(e) => onSetMenuMusicVolume(parseFloat(e.target.value))}
                  style={{ cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>

            {/* Row 2: Game Music */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 2) }}
              onPointerMove={(e) => onPointerMoveItem(2, e)}
            >
              <span>Game Music ({Math.round(gameMusicVolume * 100)}%)</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={gameMusicVolume}
                  onChange={(e) => onSetGameMusicVolume(parseFloat(e.target.value))}
                  style={{ cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>

            {/* Row 3: SFX Volume */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 3) }}
              onPointerMove={(e) => onPointerMoveItem(3, e)}
            >
              <span>SFX Volume ({Math.round(sfxVolume * 100)}%)</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sfxVolume}
                  onChange={(e) => onSetSfxVolume(parseFloat(e.target.value))}
                  style={{ cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>
          </>
        )}

        {/* TAB 3: TOUCH CONTROLS */}
        {activeCategory === 'touch' && (
          <>
            {/* Row 1: Touch Overlay Mode */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 1) }}
              onPointerMove={(e) => onPointerMoveItem(1, e)}
            >
              <span>Touch Overlay Mode</span>
              <select
                value={touchControlMode}
                onChange={(e) => setTouchControlMode(e.target.value as TouchControlMode)}
                style={menuStyles.select}
              >
                <option value="auto">Auto-Detect (Mobile)</option>
                <option value="always">Always Visible</option>
                <option value="off">Off (Hide Overlay)</option>
              </select>
            </div>

            {/* Row 2: Steering Scheme */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 2) }}
              onPointerMove={(e) => onPointerMoveItem(2, e)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                <span>Steering Scheme</span>
                {touchSteeringScheme === 'tilt' && (
                  <span style={{ fontSize: '11px', color: '#00d4ff', fontWeight: 600 }}>
                    Tilt phone sideways to steer. Calibration &amp; touch override enabled.
                  </span>
                )}
              </div>
              <select
                value={touchSteeringScheme}
                onChange={(e) => setTouchSteeringScheme(e.target.value as TouchSteeringScheme)}
                style={menuStyles.select}
              >
                <option value="joystick">Floating Analog Joystick</option>
                <option value="buttons">Digital Buttons (L / R)</option>
                <option value="tilt">Motion Sensor (Tilt / Gyro)</option>
              </select>
            </div>

            {/* Row 3: Button Size */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 3) }}
              onPointerMove={(e) => onPointerMoveItem(3, e)}
            >
              <span>Button Size</span>
              <select
                value={touchButtonSize}
                onChange={(e) => setTouchButtonSize(e.target.value as TouchButtonSize)}
                style={menuStyles.select}
              >
                <option value="small">Compact (85%)</option>
                <option value="medium">Standard (100%)</option>
                <option value="large">Large (115%)</option>
              </select>
            </div>

            {/* Row 4: Controls Opacity */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 4) }}
              onPointerMove={(e) => onPointerMoveItem(4, e)}
            >
              <span>Controls Opacity ({Math.round(touchOpacity * 100)}%)</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={touchOpacity}
                  onChange={(e) => setTouchOpacity(parseFloat(e.target.value))}
                  style={{ cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>

            {/* Row 5: Haptic Feedback */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 5) }}
              onPointerMove={(e) => onPointerMoveItem(5, e)}
            >
              <span>Haptic Feedback</span>
              <button
                type="button"
                onClick={() => setTouchHaptics(!touchHaptics)}
                style={{
                  background: touchHaptics ? '#10b981' : '#475569',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  minWidth: '56px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {touchHaptics ? 'ON' : 'OFF'}
              </button>
            </div>
          </>
        )}

        {/* TAB 4: GAMEPLAY */}
        {activeCategory === 'gameplay' && (
          <>
            {/* Row 1: Transmission Mode */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 1) }}
              onPointerMove={(e) => onPointerMoveItem(1, e)}
            >
              <span>Transmission</span>
              <select
                value={transmissionMode}
                onChange={(e) => setTransmissionMode(e.target.value as TransmissionMode)}
                style={menuStyles.select}
              >
                <option value="automatic">Automatic</option>
                <option value="manual">Manual Sequential</option>
              </select>
            </div>

            {/* Row 2: Anti-lock Braking System (ABS) */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 2) }}
              onPointerMove={(e) => onPointerMoveItem(2, e)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                <span style={{ fontWeight: 700 }}>Anti-lock Braking System (ABS)</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                  Prevents wheel lockup under heavy braking to maintain steering authority
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAbs}
                style={{
                  background: absEnabled ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  color: absEnabled ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  minWidth: '56px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {absEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Row 3: Traction Control System (TCS) */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 3) }}
              onPointerMove={(e) => onPointerMoveItem(3, e)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                <span style={{ fontWeight: 700 }}>Traction Control System (TCS)</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                  Modulates engine throttle under extreme wheelspin to prevent power oversteer
                </span>
              </div>
              <button
                type="button"
                onClick={toggleTcs}
                style={{
                  background: tcsEnabled ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  color: tcsEnabled ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  minWidth: '56px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {tcsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Row 4: Electronic Stability Program (ESP) */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 4) }}
              onPointerMove={(e) => onPointerMoveItem(4, e)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                <span style={{ fontWeight: 700 }}>Stability Control (ESP)</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                  Applies stabilizing yaw damping moments during slides to prevent spin-outs
                </span>
              </div>
              <button
                type="button"
                onClick={toggleEsp}
                style={{
                  background: espEnabled ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  color: espEnabled ? '#ffffff' : '#94A3B8',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  minWidth: '56px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {espEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Row 5: Steering Sensitivity */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 5) }}
              onPointerMove={(e) => onPointerMoveItem(5, e)}
            >
              <span>Steering Sensitivity ({sensitivity.toFixed(2)}x)</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="range"
                  min={MIN_STEERING_SENSITIVITY}
                  max={MAX_STEERING_SENSITIVITY}
                  step={STEERING_SENSITIVITY_STEP}
                  value={sensitivity}
                  onChange={(e) => onSetSensitivity(parseFloat(e.target.value))}
                  style={{ cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>

            {/* Row 6: Controller Vibration */}
            <div
              style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 6) }}
              onPointerMove={(e) => onPointerMoveItem(6, e)}
            >
              <span>Controller Vibration (Rumble)</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '48px', minHeight: '44px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vibrationEnabled}
                  onChange={onToggleVibration}
                  style={menuStyles.checkbox}
                />
              </label>
            </div>

            {/* Row 7 (if vibration): Vibration Intensity */}
            {vibrationEnabled && (
              <div
                style={{ ...menuStyles.optionRow, minHeight: '44px', ...getFocusStyle(focusedIndex === 7) }}
                onPointerMove={(e) => onPointerMoveItem(7, e)}
              >
                <span>Vibration Intensity ({Math.round(vibrationIntensity * 100)}%)</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={vibrationIntensity}
                    onChange={(e) => onSetVibrationIntensity(parseFloat(e.target.value))}
                    style={{ cursor: 'pointer', minHeight: '32px' }}
                  />
                </div>
              </div>
            )}

            {/* Row 8 (or 7 if !vibration): Clear Records */}
            <div
              className="settings-option-span-2"
              style={{
                ...menuStyles.optionRow,
                minHeight: '44px',
                justifyContent: 'space-between',
                border: resetConfirmState === 'confirming'
                  ? '1px solid #E31837'
                  : resetConfirmState === 'done'
                    ? '1px solid #10b981'
                    : '1px solid transparent',
                background: resetConfirmState === 'confirming'
                  ? 'rgba(227, 24, 55, 0.08)'
                  : resetConfirmState === 'done'
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(0,0,0,0.1)',
                ...getFocusStyle(focusedIndex === (vibrationEnabled ? 8 : 7)),
              }}
              onPointerMove={(e) => onPointerMoveItem(vibrationEnabled ? 8 : 7, e)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                <span style={{ fontWeight: 700, color: '#F1F5F9' }}>Clear Stage Lap Records</span>
                <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>
                  Reset all saved personal best times across circuits
                </span>
              </div>
              <button
                type="button"
                style={{
                  padding: '10px 18px',
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: resetConfirmState === 'confirming' ? '1px solid #E31837' : '1px solid rgba(227, 24, 55, 0.4)',
                  background: resetConfirmState === 'confirming'
                    ? '#E31837'
                    : resetConfirmState === 'done'
                      ? '#10b981'
                      : 'rgba(227, 24, 55, 0.15)',
                  color: resetConfirmState === 'confirming' || resetConfirmState === 'done' ? '#ffffff' : '#F87171',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  touchAction: 'manipulation',
                }}
                onClick={onResetRecords}
              >
                {resetConfirmState === 'confirming' && 'CONFIRM RESET'}
                {resetConfirmState === 'done' && 'CLEARED'}
                {resetConfirmState === 'idle' && 'CLEAR ALL'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Back Button */}
      <button
        style={{
          ...menuStyles.button,
          ...menuStyles.secondaryButton,
          color: textColor,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          marginTop: '12px',
          width: '100%',
          minHeight: '44px',
          justifyContent: 'center',
          ...getFocusStyle(focusedIndex === backIdx),
        }}
        onPointerMove={(e) => onPointerMoveItem(backIdx, e)}
        onClick={() => onSelectView('main')}
      >
        Back
      </button>
    </div>
  );
}
