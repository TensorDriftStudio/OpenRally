import { memo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useTagStore } from '@/store/tagStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { useIsMobile } from '../MultiplayerHUD';

function formatRoundTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const remSecs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
}

/**
 * Rally Tag (Pursuit) HUD Board.
 * Displays real-time match state, round timer, role indicator (Tagger vs Runner),
 * countdown notifications, and freeze / immunity status banners.
 */
export const TagBoard = memo(function TagBoard() {
  const isMobile = useIsMobile();
  const gameMode = useGameStore((s) => s.gameMode);
  const gameState = useGameStore((s) => s.gameState);

  const phase = useTagStore((s) => s.phase);
  const countdownRemaining = useTagStore((s) => s.countdownRemaining);
  const roundRemaining = useTagStore((s) => s.roundRemaining);
  const isTagger = useTagStore((s) => s.isTagger);
  const taggerNickname = useTagStore((s) => s.taggerNickname);
  const isFrozen = useTagStore((s) => s.isFrozen);
  const freezeRemaining = useTagStore((s) => s.freezeRemaining);
  const immunityRemaining = useTagStore((s) => s.immunityRemaining);
  const timeClean = useTagStore((s) => s.timeClean);
  const tagsMade = useTagStore((s) => s.tagsMade);

  const isSpectating = useMultiplayerStore((s) => s.isSpectating);
  const spectateTargetNickname = useMultiplayerStore((s) => s.spectateTargetNickname);

  const currentRoom = useMultiplayerStore((s) => s.currentRoom);

  if (gameMode !== 'tag' || gameState !== 'playing' || !currentRoom) {
    return null;
  }

  return (
    <div style={styles.container}>
      {/* 1. Waiting Phase Banner */}
      {phase === 'waiting' && (
        <div
          style={{
            ...styles.centerBanner,
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            top: isMobile ? '8px' : '24px',
          }}
        >
          <div style={{ fontSize: isMobile ? '11px' : '13px', fontWeight: 800, color: '#38BDF8', letterSpacing: '1px' }}>
            🌴 FREE ROAM ACTIVE
          </div>
          <div style={{ fontSize: isMobile ? '9px' : '11px', color: '#94A3B8', marginTop: '2px' }}>
            Waiting for 2nd driver to join room to begin Rally Tag match (15s countdown).
          </div>
        </div>
      )}

      {/* 2. Match Countdown Overlay */}
      {phase === 'countdown' && (
        <div
          style={{
            ...styles.centerBanner,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '2px solid #F59E0B',
            boxShadow: '0 0 24px rgba(245, 158, 11, 0.5), 0 8px 24px rgba(0,0,0,0.6)',
            top: isMobile ? '12px' : '36px',
            padding: isMobile ? '8px 16px' : '12px 24px',
          }}
        >
          <div style={{ fontSize: isMobile ? '10px' : '12px', fontWeight: 700, color: '#FCD34D', letterSpacing: '1.5px' }}>
            GET READY TO TAG OR EVADE
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1, marginTop: '2px' }}>
            MATCH STARTS IN {countdownRemaining}s
          </div>
          <div style={{ fontSize: isMobile ? '9px' : '11px', color: '#CBD5E1', marginTop: '4px' }}>
            Spawning at unique coordinates. Tagger receives +50% engine power!
          </div>
        </div>
      )}

      {/* 3. Active Match Top HUD */}
      {phase === 'active' && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? '6px' : '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {/* Round Timer & Clean Time Stats Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '10px' : '16px',
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: isMobile ? '4px 12px' : '6px 18px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: isMobile ? '11px' : '13px', color: '#94A3B8', fontWeight: 700 }}>
                TIME
              </span>
              <span
                style={{
                  fontSize: isMobile ? '14px' : '18px',
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  color: roundRemaining <= 30 ? '#F87171' : '#F8FAFC',
                }}
              >
                {formatRoundTime(roundRemaining)}
              </span>
            </div>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: isMobile ? '10px' : '12px', color: '#94A3B8', fontWeight: 700 }}>
                CLEAN TIME
              </span>
              <span style={{ fontSize: isMobile ? '13px' : '16px', fontWeight: 900, color: '#34D399' }}>
                {Math.floor(timeClean)}s
              </span>
            </div>

            {tagsMade > 0 && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: isMobile ? '10px' : '12px', color: '#94A3B8', fontWeight: 700 }}>
                    TAGS
                  </span>
                  <span style={{ fontSize: isMobile ? '13px' : '16px', fontWeight: 900, color: '#F43F5E' }}>
                    {tagsMade}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Role Status Card */}
          {isSpectating ? (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid #38BDF8',
                borderRadius: '6px',
                padding: '4px 14px',
                color: '#BAE6FD',
                fontSize: isMobile ? '10px' : '12px',
                fontWeight: 800,
                letterSpacing: '0.5px',
              }}
            >
              👁️ SPECTATING {spectateTargetNickname ?? 'DRIVER'} — JOINING NEXT ROUND
            </div>
          ) : isTagger ? (
            <div
              style={{
                background: isFrozen
                  ? 'rgba(30, 58, 138, 0.92)'
                  : 'linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(153, 27, 27, 0.95))',
                border: isFrozen ? '2px solid #60A5FA' : '2px solid #EF4444',
                borderRadius: '8px',
                padding: isMobile ? '4px 12px' : '6px 18px',
                boxShadow: isFrozen
                  ? '0 0 16px rgba(96, 165, 250, 0.7)'
                  : '0 0 20px rgba(239, 68, 68, 0.8), 0 4px 12px rgba(0,0,0,0.5)',
                color: '#FFFFFF',
                textAlign: 'center',
                animation: isFrozen ? undefined : 'pulse 1.2s infinite ease-in-out',
              }}
            >
              {isFrozen ? (
                <div style={{ fontSize: isMobile ? '11px' : '13px', fontWeight: 900 }}>
                  ❄️ YOU WERE TAGGED! IMMOBILIZED: {freezeRemaining.toFixed(1)}s
                </div>
              ) : (
                <>
                  <div style={{ fontSize: isMobile ? '11px' : '14px', fontWeight: 900, letterSpacing: '0.8px' }}>
                    🔥 YOU ARE THE TAGGER! (+50% ENGINE POWER)
                  </div>
                  <div style={{ fontSize: isMobile ? '9px' : '10px', color: '#FCA5A5', marginTop: '1px', fontWeight: 600 }}>
                    Chase other drivers and touch their car to pass the tag!
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                border: immunityRemaining > 0 ? '2px solid #34D399' : '1px solid rgba(244, 63, 94, 0.5)',
                borderRadius: '8px',
                padding: isMobile ? '4px 12px' : '6px 16px',
                boxShadow: immunityRemaining > 0 ? '0 0 16px rgba(52, 211, 153, 0.6)' : '0 4px 12px rgba(0,0,0,0.4)',
                color: '#F8FAFC',
                textAlign: 'center',
              }}
            >
              {immunityRemaining > 0 ? (
                <div style={{ fontSize: isMobile ? '10px' : '12px', fontWeight: 800, color: '#34D399' }}>
                  🛡️ IMMUNITY ACTIVE: {immunityRemaining.toFixed(1)}s
                </div>
              ) : (
                <div style={{ fontSize: isMobile ? '10px' : '12px', fontWeight: 700 }}>
                  ⚠️ EVADE THE TAGGER: <span style={{ color: '#F87171', fontWeight: 900 }}>{taggerNickname || 'Hunter'}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 15,
  },
  centerBanner: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    borderRadius: '10px',
    padding: '10px 20px',
    textAlign: 'center',
    backdropFilter: 'blur(8px)',
  },
};
