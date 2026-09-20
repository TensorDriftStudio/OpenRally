import { useState, useEffect, useRef, useCallback } from 'react';
import { useTagStore } from '@/store/tagStore';
import { useGameStore } from '@/store/gameStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { sampleGamepad, resetGamepadEdgeState } from '@/utils/input/gamepad';
import { isTextEditingActive } from '@/utils/input/textInput';
import { getVehiclePreset } from '@/config/vehicleRegistry';
import { returnToMainMenu } from '@/utils/navigation';
import { useIsMobile } from './MultiplayerHUD';

/**
 * Rally Tag (Pursuit) Stage Complete modal.
 * Displays match winner, full driver classification ranked by Clean Time,
 * 20-second intermission countdown, and universal gamepad & keyboard navigation.
 */
export function TagCompleteModal() {
  const isMobile = useIsMobile();
  const storeShowResultsModal = useTagStore((s) => s.showResultsModal);
  const showResultsModal = useTagStore.getState().showResultsModal ?? storeShowResultsModal;

  const storeGameMode = useGameStore((s) => s.gameMode);
  const gameMode = useGameStore.getState().gameMode ?? storeGameMode;

  const storeLeaderboard = useTagStore((s) => s.leaderboard);
  const leaderboard = useTagStore.getState().leaderboard ?? storeLeaderboard;

  const storeIntermissionRemaining = useTagStore((s) => s.intermissionRemaining);
  const intermissionRemaining = useTagStore.getState().intermissionRemaining ?? storeIntermissionRemaining;

  const storeCurrentRoom = useMultiplayerStore((s) => s.currentRoom);
  const currentRoom = useMultiplayerStore.getState().currentRoom ?? storeCurrentRoom;

  const storeSelfId = useMultiplayerStore((s) => s.selfId);
  const selfId = useMultiplayerStore.getState().selfId ?? storeSelfId;

  const dismissResultsModal = useTagStore((s) => s.dismissResultsModal);

  const intermissionSeconds =
    Number.isFinite(intermissionRemaining) && intermissionRemaining > 0
      ? Math.max(0, Math.ceil(intermissionRemaining))
      : 0;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(0);
  focusedIndexRef.current = focusedIndex;

  const handleContinue = useCallback(() => {
    resetGamepadEdgeState();
    dismissResultsModal();
  }, [dismissResultsModal]);

  const handleLeave = useCallback(() => {
    resetGamepadEdgeState();
    returnToMainMenu();
  }, []);

  const continueRef = useRef(handleContinue);
  continueRef.current = handleContinue;
  const leaveRef = useRef(handleLeave);
  leaveRef.current = handleLeave;

  // Clear gamepad edges on mount
  useEffect(() => {
    if (showResultsModal) {
      resetGamepadEdgeState();
    }
  }, [showResultsModal]);

  // Keyboard navigation
  useEffect(() => {
    if (!showResultsModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingActive(e)) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + 2) % 2);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % 2);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (focusedIndexRef.current === 0) continueRef.current();
        else leaveRef.current();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        leaveRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResultsModal]);

  // Gamepad navigation loop
  useEffect(() => {
    if (!showResultsModal) return;

    let animId: number;
    const pollGamepad = () => {
      const gp = sampleGamepad();
      if (gp.connected) {
        if (gp.menuUp) {
          setFocusedIndex((prev) => (prev - 1 + 2) % 2);
        } else if (gp.menuDown) {
          setFocusedIndex((prev) => (prev + 1) % 2);
        }

        if (gp.menuConfirm) {
          if (focusedIndexRef.current === 0) continueRef.current();
          else leaveRef.current();
        } else if (gp.menuBack) {
          leaveRef.current();
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [showResultsModal]);

  if (!showResultsModal || gameMode !== 'tag' || !currentRoom) {
    return null;
  }

  const winner = leaderboard[0];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '8px' : '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isMobile ? '440px' : '560px',
          background: 'linear-gradient(180deg, #111827 0%, #0B0F19 100%)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 0 32px rgba(244, 63, 94, 0.25), 0 20px 40px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '10px 14px' : '14px 20px',
            background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.2) 0%, rgba(15, 23, 42, 0.8) 100%)',
            borderBottom: '1px solid rgba(244, 63, 94, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: isMobile ? '13px' : '16px', fontWeight: 900, color: '#F43F5E', letterSpacing: '1px' }}>
              🎯 RALLY TAG — ROUND FINISHED
            </div>
            <div style={{ fontSize: isMobile ? '10px' : '11px', color: '#94A3B8' }}>
              Round duration: 3 minutes • Winner: Most time clean
            </div>
          </div>
          <div
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '4px 10px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700 }}>NEXT ROUND</div>
            <div style={{ fontSize: '14px', fontWeight: 900, color: '#FBBF24', fontFamily: 'monospace' }}>
              {`${intermissionSeconds}s`}
            </div>
          </div>
        </div>

        {/* Winner Spotlight Banner */}
        {winner && (
          <div
            style={{
              padding: isMobile ? '10px 14px' : '12px 20px',
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(244, 63, 94, 0.1) 100%)',
              borderBottom: '1px solid rgba(234, 179, 8, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: isMobile ? '20px' : '26px' }}>🏆</div>
              <div>
                <div style={{ fontSize: '10px', color: '#FDE047', fontWeight: 700 }}>STAGE WINNER</div>
                <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 900, color: '#FFFFFF' }}>
                  {winner.nickname}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>CLEAN TIME</div>
              <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 900, color: '#34D399', fontFamily: 'monospace' }}>
                {`${Math.round(winner.timeClean)}s`}
              </div>
            </div>
          </div>
        )}

        {/* Classification Table */}
        <div
          style={{
            padding: isMobile ? '8px 12px' : '12px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 90px 60px',
              padding: '4px 8px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748B',
              letterSpacing: '0.5px',
            }}
          >
            <span>POS</span>
            <span>DRIVER</span>
            <span style={{ textAlign: 'right' }}>CLEAN TIME</span>
            <span style={{ textAlign: 'right' }}>TAGS</span>
          </div>

          {leaderboard.map((entry, idx) => {
            const isSelf = entry.id === selfId;
            const preset = getVehiclePreset(entry.vehicleId);
            const posBadgeColor = idx === 0 ? '#EAB308' : idx === 1 ? '#94A3B8' : idx === 2 ? '#B45309' : '#64748B';

            return (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 90px 60px',
                  alignItems: 'center',
                  padding: isMobile ? '6px 8px' : '8px 10px',
                  background: isSelf ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSelf ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                }}
              >
                <span style={{ fontWeight: 900, color: posBadgeColor, fontSize: isMobile ? '11px' : '13px' }}>
                  #{idx + 1}
                </span>
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: isSelf ? '#38BDF8' : '#F8FAFC',
                      fontSize: isMobile ? '12px' : '13px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.nickname} {isSelf && <span style={{ fontSize: '9px', color: '#38BDF8' }}>(YOU)</span>}
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {preset.name}
                  </div>
                </div>
                <span
                  style={{
                    textAlign: 'right',
                    fontWeight: 900,
                    color: '#34D399',
                    fontFamily: 'monospace',
                    fontSize: isMobile ? '12px' : '14px',
                  }}
                >
                  {`${Math.round(entry.timeClean)}s`}
                </span>
                <span
                  style={{
                    textAlign: 'right',
                    fontWeight: 800,
                    color: '#F43F5E',
                    fontSize: isMobile ? '12px' : '13px',
                  }}
                >
                  {entry.tagsMade}
                </span>
              </div>
            );
          })}
        </div>

        {/* Modal Buttons */}
        <div
          style={{
            padding: isMobile ? '10px 14px' : '14px 20px',
            background: 'rgba(10, 15, 26, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={handleContinue}
            onPointerMove={() => setFocusedIndex(0)}
            style={{
              flex: 1,
              padding: isMobile ? '10px' : '12px',
              borderRadius: '8px',
              background: focusedIndex === 0 ? '#F43F5E' : 'rgba(244, 63, 94, 0.2)',
              border: '1px solid #F43F5E',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: isMobile ? '12px' : '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: focusedIndex === 0 ? '2px solid #FFFFFF' : 'none',
              outlineOffset: '2px',
              textAlign: 'center',
            }}
          >
            {focusedIndex === 0 ? '▶ CONTINUE (A)' : 'CONTINUE'}
          </button>

          <button
            type="button"
            onClick={handleLeave}
            onPointerMove={() => setFocusedIndex(1)}
            style={{
              flex: 1,
              padding: isMobile ? '10px' : '12px',
              borderRadius: '8px',
              background: focusedIndex === 1 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255, 255, 255, 0.06)',
              border: focusedIndex === 1 ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.12)',
              color: focusedIndex === 1 ? '#FFFFFF' : '#94A3B8',
              fontWeight: 800,
              fontSize: isMobile ? '12px' : '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: focusedIndex === 1 ? '2px solid #FFFFFF' : 'none',
              outlineOffset: '2px',
              textAlign: 'center',
            }}
          >
            {focusedIndex === 1 ? '✕ LEAVE ROOM (B)' : 'LEAVE ROOM'}
          </button>
        </div>
      </div>
    </div>
  );
}
