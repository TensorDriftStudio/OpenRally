import { useState, useEffect } from 'react';
import { menuStyles, getFocusStyle } from './menuStyles';
import type { ControlsTab, MenuView } from './types';

interface ControlsViewProps {
  gamepadConnected: boolean;
  gamepadName: string;
  gamepadType: 'xbox' | 'dualsense' | 'generic' | null;
  controlsTab: ControlsTab;
  focusedIndex: number;
  textColor: string;
  hideTitleAndBack?: boolean;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSetControlsTab: (tab: ControlsTab) => void;
  onSelectView: (view: MenuView) => void;
}

export function ControlsView({
  gamepadConnected,
  gamepadName,
  gamepadType,
  controlsTab,
  focusedIndex,
  textColor,
  hideTitleAndBack = false,
  onPointerMoveItem,
  onSetControlsTab,
  onSelectView,
}: ControlsViewProps) {
  const [selectedTab, setSelectedTab] = useState<ControlsTab | 'touch'>(controlsTab);

  useEffect(() => {
    setSelectedTab(controlsTab);
  }, [controlsTab]);

  return (
    <div
      className="controls-subview menu-scalable-container"
      style={hideTitleAndBack ? { color: textColor, width: '100%' } : { ...menuStyles.subView, color: textColor, width: '100%', minWidth: '540px', maxWidth: '880px' }}
    >
      {!hideTitleAndBack && <h2 style={menuStyles.subViewTitle}>Controls</h2>}

      {/* Gamepad Status Banner */}
      <div style={{
        ...menuStyles.gamepadStatusBanner,
        background: gamepadConnected 
          ? (gamepadType === 'dualsense' ? 'rgba(0, 112, 209, 0.15)' : 'rgba(16, 185, 129, 0.15)')
          : 'rgba(255, 255, 255, 0.05)',
        border: gamepadConnected 
          ? (gamepadType === 'dualsense' ? '1px solid rgba(0, 112, 209, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)')
          : '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: gamepadConnected 
            ? (gamepadType === 'dualsense' ? '#0070d1' : '#10b981')
            : '#888888',
          boxShadow: gamepadConnected 
            ? (gamepadType === 'dualsense' ? '0 0 8px #0070d1' : '0 0 8px #10b981')
            : 'none',
        }} />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>
          {gamepadConnected
            ? (gamepadType === 'dualsense'
                ? `DualSense (PS5) Connected: ${gamepadName || 'Sony DualSense'}`
                : `Xbox Controller Connected: ${gamepadName || 'XInput Controller'}`)
            : 'No Active Controller — Press any button on your gamepad to connect'}
        </span>
      </div>

      {/* Tab Switcher (min 44px Touch Targets) */}
      <div style={{ display: 'flex', gap: '6px', width: '100%', marginBottom: '8px' }}>
        <button
          style={{
            ...menuStyles.tabButton,
            flex: 1,
            minHeight: '44px',
            padding: '10px 8px',
            fontSize: '12px',
            fontWeight: 700,
            ...(selectedTab === 'dualsense' ? menuStyles.activeTabButton : {}),
          }}
          onClick={() => {
            onSetControlsTab('dualsense');
            setSelectedTab('dualsense');
          }}
        >
          DualSense (PS5)
        </button>
        <button
          style={{
            ...menuStyles.tabButton,
            flex: 1,
            minHeight: '44px',
            padding: '10px 8px',
            fontSize: '12px',
            fontWeight: 700,
            ...(selectedTab === 'xbox' ? menuStyles.activeTabButton : {}),
          }}
          onClick={() => {
            onSetControlsTab('xbox');
            setSelectedTab('xbox');
          }}
        >
          Xbox Controller
        </button>
        <button
          style={{
            ...menuStyles.tabButton,
            flex: 1,
            minHeight: '44px',
            padding: '10px 8px',
            fontSize: '12px',
            fontWeight: 700,
            ...(selectedTab === 'keyboard' ? menuStyles.activeTabButton : {}),
          }}
          onClick={() => {
            onSetControlsTab('keyboard');
            setSelectedTab('keyboard');
          }}
        >
          Keyboard
        </button>
        <button
          data-testid="controls-tab-touch"
          style={{
            ...menuStyles.tabButton,
            flex: 1,
            minHeight: '44px',
            padding: '10px 8px',
            fontSize: '12px',
            fontWeight: 700,
            ...(selectedTab === 'touch' ? menuStyles.activeTabButton : {}),
          }}
          onClick={() => setSelectedTab('touch')}
        >
          Touch Screen
        </button>
      </div>

      {selectedTab === 'touch' ? (
        <div
          className="controls-help-grid"
          style={{
            ...menuStyles.controlsHelp,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            color: '#CBD5E1',
          }}
        >
          {/* Header Description */}
          <div
            style={{
              padding: '8px 4px 12px 4px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              Ergonomic on-screen two-thumb driving layout for Android and mobile touch devices.
              Supports multi-touch, floating analog joystick, and haptic feedback.
            </span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadge}>JOYSTICK</span> Steering (Default)
            </strong>
            <span style={{ color: '#94A3B8' }}>Touch & Drag anywhere in Left Zone</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadge}>◄ / ►</span> Steering (Buttons)
            </strong>
            <span style={{ color: '#94A3B8' }}>Discrete Left & Right touch pads</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeGas}>▲ GAS</span> Throttle
            </strong>
            <span style={{ color: '#67E8F9' }}>Right Outer Pedal (Hold for full gas)</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeBrake}>▼ BRAKE</span> Brake / Reverse
            </strong>
            <span style={{ color: '#FCA5A5' }}>Right Inner Pedal (Reverses when stopped)</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeDrift}>DRIFT</span> Handbrake
            </strong>
            <span style={{ color: '#FDE68A' }}>Thumb roll above throttle for hairpins</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeUtil}>❚❚ PAUSE</span> Pause Menu
            </strong>
            <span style={{ color: '#94A3B8' }}>Top-Left on-screen button</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeUtil}>↺ RESET</span> Recover Vehicle
            </strong>
            <span style={{ color: '#94A3B8' }}>Instant respawn on track</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadgeUtil}>📷 CAMERA</span> Cycle View
            </strong>
            <span style={{ color: '#94A3B8' }}>Chase / Close / Bumper / Orbit</span>
          </div>

          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.touchBadge}>VIBRATE</span> Haptic Feedback
            </strong>
            <span style={{ color: '#94A3B8' }}>Pedal touch & drift vibration</span>
          </div>
        </div>
      ) : selectedTab === 'dualsense' ? (
        <div
          className="controls-help-grid"
          style={{
            ...menuStyles.controlsHelp,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            color: '#CBD5E1',
          }}
        >
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>L-STICK</span> Steering (Analog)
            </strong>
            <span style={{ color: '#94A3B8' }}>Left / Right</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>R-STICK</span> Free Look Orbit
            </strong>
            <span style={{ color: '#94A3B8' }}>360° Camera</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badgeTrigger}>R2</span> Throttle / Gas
            </strong>
            <span style={{ color: '#94A3B8' }}>Progressive Analog</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badgeTrigger}>L2</span> Brake / Reverse
            </strong>
            <span style={{ color: '#94A3B8' }}>Progressive Analog</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.psCross}>✕</span> Cross
            </strong>
            <span style={{ color: '#38BDF8', fontWeight: 600 }}>Gear Up (Shift UP)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.psCircle}>●</span> Circle
            </strong>
            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Gear Down (Shift DOWN)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.psSquare}>■</span> Square / R1
            </strong>
            <span style={{ color: '#EF4444', fontWeight: 600 }}>Handbrake</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.psTriangle}>▲</span> Triangle
            </strong>
            <span style={{ color: '#94A3B8' }}>Reset Vehicle</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>L1</span> Left Bumper
            </strong>
            <span style={{ color: '#94A3B8' }}>Cycle Camera</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>R3</span> Right Stick Click
            </strong>
            <span style={{ color: '#94A3B8' }}>Look Back (Instant)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>CREATE</span> Share / Create
            </strong>
            <span style={{ color: '#94A3B8' }}>Reset Vehicle</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>OPTIONS</span> Pause
            </strong>
            <span style={{ color: '#94A3B8' }}>Toggle Menu</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>L3</span> Left Stick Click
            </strong>
            <span style={{ color: '#94A3B8' }}>Toggle Telemetry</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>D-PAD</span> Navigation
            </strong>
            <span style={{ color: '#94A3B8' }}>Menu Controls</span>
          </div>
        </div>
      ) : controlsTab === 'xbox' ? (
        <div
          className="controls-help-grid"
          style={{
            ...menuStyles.controlsHelp,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            color: '#CBD5E1',
          }}
        >
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>LS</span> Steering
            </strong>
            <span style={{ color: '#94A3B8' }}>Analog Left / Right</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>RS</span> Free Look Orbit
            </strong>
            <span style={{ color: '#94A3B8' }}>360° Camera</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badgeTrigger}>RT</span> Throttle / Gas
            </strong>
            <span style={{ color: '#94A3B8' }}>Progressive Analog</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badgeTrigger}>LT</span> Brake / Reverse
            </strong>
            <span style={{ color: '#94A3B8' }}>Progressive Analog</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.xboxA}>A</span> Button
            </strong>
            <span style={{ color: '#38BDF8', fontWeight: 600 }}>Gear Up (Shift UP)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.xboxB}>B</span> Button
            </strong>
            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Gear Down (Shift DOWN)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.xboxX}>X</span> / RB
            </strong>
            <span style={{ color: '#EF4444', fontWeight: 600 }}>Handbrake</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.xboxY}>Y</span> Button
            </strong>
            <span style={{ color: '#94A3B8' }}>Reset Vehicle</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>LB</span> Left Bumper
            </strong>
            <span style={{ color: '#94A3B8' }}>Cycle Camera</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>RS Click</span> Right Stick
            </strong>
            <span style={{ color: '#94A3B8' }}>Look Back (Instant)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>VIEW</span> Back / View
            </strong>
            <span style={{ color: '#94A3B8' }}>Reset Vehicle</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>MENU</span> Pause
            </strong>
            <span style={{ color: '#94A3B8' }}>Toggle Menu</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>LS Click</span> Left Stick
            </strong>
            <span style={{ color: '#94A3B8' }}>Toggle Telemetry</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.badge}>D-PAD</span> Navigation
            </strong>
            <span style={{ color: '#94A3B8' }}>Menu Controls</span>
          </div>
        </div>
      ) : (
        <div
          className="controls-help-grid"
          style={{
            ...menuStyles.controlsHelp,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            color: '#CBD5E1',
          }}
        >
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>W</kbd>
              <kbd style={styles.kbd}>A</kbd>
              <kbd style={styles.kbd}>S</kbd>
              <kbd style={styles.kbd}>D</kbd>
              <span style={{ color: '#64748B', margin: '0 4px' }}>or</span>
              <kbd style={styles.kbd}>ARROWS</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Steer, Throttle & Brake</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>E</kbd>
            </strong>
            <span style={{ color: '#38BDF8', fontWeight: 600 }}>Gear Up (Shift UP)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>Q</kbd>
            </strong>
            <span style={{ color: '#F59E0B', fontWeight: 600 }}>Gear Down (Shift DOWN)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>SPACE</kbd>
            </strong>
            <span style={{ color: '#EF4444', fontWeight: 600 }}>Handbrake / Drift</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>C</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Cycle Camera Mode</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>B</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Look Back (Hold)</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>T</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Toggle Telemetry</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>R</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Reset Vehicle Position</span>
          </div>
          <div style={menuStyles.controlRow}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <kbd style={styles.kbd}>ESC</kbd>
            </strong>
            <span style={{ color: '#94A3B8' }}>Pause / Menu</span>
          </div>
        </div>
      )}

      {!hideTitleAndBack && (
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
            ...getFocusStyle(focusedIndex === 0),
          }} 
          onPointerMove={(e) => onPointerMoveItem(0, e)}
          onClick={() => onSelectView('main')}
        >
          Back
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    color: '#E2E8F0',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.5px',
  },
  badgeTrigger: {
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'rgba(227, 24, 55, 0.15)',
    border: '1px solid rgba(227, 24, 55, 0.4)',
    color: '#F87171',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.5px',
  },
  psCross: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#0070D1',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 900,
  },
  psTriangle: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#10B981',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 900,
  },
  psCircle: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#EF4444',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 900,
  },
  psSquare: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#EC4899',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 900,
  },
  xboxA: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#107C10',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 900,
  },
  xboxB: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#D83B01',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 900,
  },
  xboxX: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#0078D7',
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 900,
  },
  xboxY: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#FFB900',
    color: '#000000',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 900,
  },
  kbd: {
    display: 'inline-block',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: 800,
    lineHeight: '1',
    color: '#E2E8F0',
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '4px',
    boxShadow: '0 2px 0 #0F172A',
    fontFamily: 'monospace',
  },
  touchBadge: {
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(0, 212, 255, 0.2)',
    border: '1px solid rgba(0, 212, 255, 0.5)',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 800,
  },
  touchBadgeGas: {
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(0, 212, 255, 0.3)',
    border: '1px solid #00d4ff',
    color: '#67e8f9',
    fontSize: '11px',
    fontWeight: 800,
  },
  touchBadgeBrake: {
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.3)',
    border: '1px solid #ef4444',
    color: '#fca5a5',
    fontSize: '11px',
    fontWeight: 800,
  },
  touchBadgeDrift: {
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(245, 158, 11, 0.3)',
    border: '1px solid #f59e0b',
    color: '#fde68a',
    fontSize: '11px',
    fontWeight: 800,
  },
  touchBadgeUtil: {
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 800,
  },
};
