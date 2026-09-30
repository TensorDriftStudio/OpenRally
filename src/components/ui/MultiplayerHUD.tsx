import { useState, useEffect, useCallback } from 'react';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isTextEditingActive } from '@/utils/input/textInput';
import { getLevelPreset } from '@/config/levelRegistry';
import { getGameModeDefinition } from '@/config/gameModeRegistry';
import { returnToMainMenu } from '@/utils/navigation';
import { isMobileOrAndroid } from '@/utils/device';
import { isTouchDevice, getLastInputType } from '@/utils/input/touch';

/**
 * Checks whether the current runtime environment is a mobile phone, tablet, or touch-first viewport.
 */
export function checkIsMobileEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  // 1. Mobile OS / Capacitor native runtime
  if (isMobileOrAndroid()) return true;
  // 2. Hardware touch input support
  if (isTouchDevice()) return true;
  // 3. Coarse pointer media query (mobile touchscreens)
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    return true;
  }
  // 4. Typical smartphone viewport bounds (landscape: height <= 540px, portrait: width <= 768px)
  if (window.innerWidth <= 960 && window.innerHeight <= 540) return true;
  if (window.innerWidth <= 768) return true;
  return false;
}

/**
 * Hook detecting mobile/touch context with real-time responsive and modality adaptability.
 */
export function useIsMobile(): boolean {
  const storeMode = useSettingsStore((s) => s.touchControlMode);
  const touchControlMode = useSettingsStore.getState().touchControlMode ?? storeMode;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (touchControlMode === 'always') return true;
    return checkIsMobileEnvironment();
  });

  const update = useCallback(() => {
    if (useSettingsStore.getState().touchControlMode === 'always') {
      setIsMobile(true);
      return;
    }
    setIsMobile(checkIsMobileEnvironment() || getLastInputType() === 'touch');
  }, []);

  useEffect(() => {
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    window.addEventListener('openrally-input-switch', update as EventListener);
    window.addEventListener('touchstart', update, { passive: true, once: true });

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('openrally-input-switch', update as EventListener);
      window.removeEventListener('touchstart', update);
    };
  }, [update, touchControlMode]);

  return isMobile;
}

export function MultiplayerHUD() {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const storeStatus = useMultiplayerStore((s) => s.status);
  const storeGameState = useGameStore((s) => s.gameState);
  const status = useMultiplayerStore.getState().status ?? storeStatus;
  const gameState = useGameStore.getState().gameState ?? storeGameState;

  const storePing = useMultiplayerStore((s) => s.ping);
  const storeRemotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const storeNickname = useMultiplayerStore((s) => s.nickname);
  const storeSelfId = useMultiplayerStore((s) => s.selfId);
  const storeCurrentRoom = useMultiplayerStore((s) => s.currentRoom);
  const storeIsHost = useMultiplayerStore((s) => s.isHost);

  const ping = useMultiplayerStore.getState().ping ?? storePing;
  const remotePlayers = useMultiplayerStore.getState().remotePlayers ?? storeRemotePlayers;
  const nickname = useMultiplayerStore.getState().nickname ?? storeNickname;
  const selfId = useMultiplayerStore.getState().selfId ?? storeSelfId;
  const currentRoom = useMultiplayerStore.getState().currentRoom ?? storeCurrentRoom;
  const isHost = useMultiplayerStore.getState().isHost ?? storeIsHost;

  // Toggle expanded roster with Tab key on desktop, close with Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingActive(e)) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        setExpanded((prev) => !prev);
      } else if (e.code === 'Escape' && expanded) {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  if (status === 'disconnected' || gameState !== 'playing' || !currentRoom) {
    return null;
  }

  const allPlayers = Object.values(remotePlayers);
  const totalCount = allPlayers.length;

  const getPingColor = (p: number) => {
    if (p < 60) return '#34D399';
    if (p < 120) return '#FBBF24';
    return '#F87171';
  };

  const handleLeaveSession = () => {
    returnToMainMenu();
  };

  const handleDeleteSession = () => {
    returnToMainMenu({ deleteRoomId: currentRoom?.id });
  };

  const roomDisplayName = currentRoom ? currentRoom.name.toUpperCase() : 'ARENA';
  const levelPreset = getLevelPreset(currentRoom?.levelId ?? useGameStore.getState().selectedLevelId);
  const currentGameMode = currentRoom?.gameMode ?? useGameStore.getState().gameMode;
  const modeDef = getGameModeDefinition(currentGameMode);
  const modeBadgeText = modeDef.badgeLabel;
  const modeBadgeColor = modeDef.badgeColor;

  // Always positioned at the bottom horizontal center across all viewports and modalities
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 'calc(10px + var(--sab, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    alignItems: 'center',
    flexDirection: 'column-reverse',
    zIndex: 90,
    display: 'flex',
    gap: '6px',
    fontFamily: 'Inter, system-ui, sans-serif',
    userSelect: 'none',
    pointerEvents: 'auto',
  };

  // High-performance, crisp glassmorphism status pill anchored at the bottom
  const barStyle: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.88)',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    borderRadius: '20px',
    padding: isMobile ? '3px 10px' : '4px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '6px' : '8px',
    color: '#F8FAFC',
    fontSize: isMobile ? '10px' : '11px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.45)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    pointerEvents: 'auto',
    maxWidth: '92vw',
    transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div style={containerStyle}>
      {/* Discreet Multiplayer Status Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={barStyle}
        title={isMobile ? 'Tap for player roster and room options' : 'Click or press TAB to toggle driver roster'}
      >
        {/* Connection status indicator dot */}
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: status === 'in_game' || status === 'in_lobby' ? '#34D399' : '#F59E0B',
            boxShadow: `0 0 6px ${status === 'in_game' || status === 'in_lobby' ? '#34D399' : '#F59E0B'}`,
            flexShrink: 0,
          }}
        />

        {/* Room / Mode Identifier */}
        <span
          style={{
            maxWidth: isMobile ? '110px' : '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 800,
            color: '#F8FAFC',
            letterSpacing: '0.3px',
          }}
        >
          {roomDisplayName}
        </span>

        {/* Track / Level Preset Badge */}
        <span
          style={{
            padding: '1px 5px',
            borderRadius: '3px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#CBD5E1',
            fontSize: isMobile ? '8.5px' : '9.5px',
            fontWeight: 800,
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          {levelPreset.name.toUpperCase()}
        </span>

        {/* Game Mode Badge */}
        <span
          style={{
            padding: '1px 5px',
            borderRadius: '3px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: `1px solid ${modeBadgeColor}`,
            color: modeBadgeColor,
            fontSize: isMobile ? '8.5px' : '9.5px',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            letterSpacing: '0.3px',
          }}
        >
          {modeBadgeText}
        </span>

        {/* Host Tag */}
        {isHost && (
          <span
            style={{
              padding: '1px 4px',
              borderRadius: '3px',
              background: '#F59E0B',
              color: '#000',
              fontSize: isMobile ? '8px' : '8.5px',
              fontWeight: 900,
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
            }}
          >
            HOST
          </span>
        )}

        {/* Connected Drivers Count */}
        <span
          style={{
            color: '#94A3B8',
            fontSize: isMobile ? '9px' : '10px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          👥 {totalCount} {totalCount === 1 ? 'driver' : 'drivers'}
        </span>

        {/* Ping Latency */}
        <span
          style={{
            fontSize: isMobile ? '9px' : '10px',
            fontWeight: 700,
            color: getPingColor(ping),
            padding: '1px 5px',
            borderRadius: '3px',
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            minWidth: '38px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {ping}ms
        </span>

        {/* Expand / Collapse Indicator */}
        <span
          style={{
            fontSize: isMobile ? '8px' : '9px',
            color: '#64748B',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            marginLeft: '1px',
          }}
        >
          {isMobile ? (expanded ? '▼' : '▲') : (expanded ? '▼' : '▲ (TAB)')}
        </span>
      </div>

      {/* Expanded Driver Roster & Host Actions */}
      {expanded && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: isMobile ? '8px' : '10px',
            minWidth: isMobile ? '220px' : '240px',
            maxWidth: isMobile ? '280px' : '320px',
            maxHeight: isMobile ? '45vh' : 'none',
            overflowY: isMobile ? 'auto' : 'visible',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? '6px' : '8px',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              fontSize: isMobile ? '9px' : '10px',
              fontWeight: 800,
              color: '#94A3B8',
              letterSpacing: '1px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{levelPreset.name.toUpperCase()} • {modeBadgeText}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{totalCount}/12</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '0 2px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Close roster"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Self */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: 600,
              color: '#38BDF8',
              padding: '3px 6px',
              borderRadius: '4px',
              background: 'rgba(56, 189, 248, 0.1)',
            }}
          >
            <span>{nickname} (You)</span>
            <span style={{ fontSize: '9px', color: isHost ? '#F59E0B' : '#64748B', fontWeight: 700 }}>
              {isHost ? '★ Host' : 'Driver'}
            </span>
          </div>

          {/* Peers */}
          {allPlayers
            .filter((p) => p.id !== selfId)
            .map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: isMobile ? '11px' : '12px',
                  color: '#E2E8F0',
                  padding: '3px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <span>{p.nickname}</span>
                <span style={{ fontSize: '9px', color: '#94A3B8' }}>{p.vehicleId}</span>
              </div>
            ))}

          {/* Room Controls */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '4px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              onClick={handleLeaveSession}
              style={{
                flex: 1,
                padding: isMobile ? '5px 8px' : '6px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#CBD5E1',
                fontSize: isMobile ? '10px' : '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Leave Room
            </button>
            {isHost && !currentRoom?.isPersistent && (
              <button
                type="button"
                onClick={handleDeleteSession}
                style={{
                  padding: isMobile ? '5px 8px' : '6px 8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#F87171',
                  fontSize: isMobile ? '10px' : '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Delete Room
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
