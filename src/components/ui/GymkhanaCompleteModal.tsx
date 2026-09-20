import { useState, useEffect, useRef, useCallback } from 'react';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { useGameStore } from '@/store/gameStore';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { sampleGamepad, resetGamepadEdgeState } from '@/utils/input/gamepad';
import { isTextEditingActive } from '@/utils/input/textInput';
import { getVehiclePreset } from '@/config/vehicleRegistry';
import { returnToMainMenu } from '@/utils/navigation';

function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/**
 * Stage Complete modal displayed when the 60-second Gymkhana Blitz timer expires.
 * Displays total drift score, personal best, new record badges, performance breakdown,
 * official multiplayer room classification, 20s intermission countdown,
 * and full controller / gamepad (DualSense, Xbox) and keyboard navigation support.
 */
function GymkhanaCompleteModalContent() {
  const storeTotalScore = useGymkhanaStore((s) => s.totalScore);
  const storeBestScore = useGymkhanaStore((s) => s.bestScore);
  const storeIsNewRecord = useGymkhanaStore((s) => s.isNewRecord);
  const storeStats = useGymkhanaStore((s) => s.stats);
  const storeGamepadConnected = useGameStore((s) => s.gamepadConnected);
  const storeGamepadType = useGameStore((s) => s.gamepadType);

  const storeStatus = useMultiplayerStore((s) => s.status);
  const storeGameMode = useGameStore((s) => s.gameMode);
  const status = useMultiplayerStore.getState().status ?? storeStatus;
  const gameMode = useGameStore.getState().gameMode ?? storeGameMode;
  const isMultiplayer = status !== 'disconnected';
  const isMultiplayerGymkhana = isMultiplayer && gameMode === 'gymkhana_blitz';
  const storeLeaderboard = useMultiplayerStore((s) => s.gymkhanaLeaderboard);
  const leaderboard = useMultiplayerStore.getState().gymkhanaLeaderboard ?? storeLeaderboard;
  const storeIntermissionRemaining = useMultiplayerStore((s) => s.gymkhanaIntermissionRemaining);
  const intermissionRemaining = useMultiplayerStore.getState().gymkhanaIntermissionRemaining ?? storeIntermissionRemaining;
  const currentRoom = useMultiplayerStore((s) => s.currentRoom);
  const selfId = useMultiplayerStore((s) => s.selfId);

  const [intermissionTimer, setIntermissionTimer] = useState(() => Math.max(0, Math.ceil(intermissionRemaining ?? 20)));

  useEffect(() => {
    if (!isMultiplayerGymkhana) return;
    setIntermissionTimer(Math.max(0, Math.ceil(intermissionRemaining ?? 20)));
    const interval = setInterval(() => {
      setIntermissionTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isMultiplayerGymkhana, intermissionRemaining]);

  const totalScore = useGymkhanaStore.getState().totalScore ?? storeTotalScore;
  const bestScore = useGymkhanaStore.getState().bestScore ?? storeBestScore;
  const isNewRecord = useGymkhanaStore.getState().isNewRecord ?? storeIsNewRecord;
  const stats = useGymkhanaStore.getState().stats ?? storeStats;
  const gamepadConnected = useGameStore.getState().gamepadConnected ?? storeGamepadConnected;
  const gamepadType = useGameStore.getState().gamepadType ?? storeGamepadType;

  const dismissResultsModal = useGymkhanaStore((s) => s.dismissResultsModal);
  const startCountdown = useGymkhanaStore((s) => s.startCountdown);

  const setGameMode = useGameStore((s) => s.setGameMode);
  const triggerReset = useGameStore((s) => s.triggerReset);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(0);
  focusedIndexRef.current = focusedIndex;

  const handlePlayAgain = useCallback(() => {
    resetGamepadEdgeState();
    if (!isMultiplayerGymkhana) {
      dismissResultsModal();
      useGymkhanaStore.getState().resetBlitz();
      triggerReset(true);
      startCountdown();
    }
  }, [dismissResultsModal, startCountdown, triggerReset, isMultiplayerGymkhana]);

  const handleSwitchToFreeRoam = useCallback(() => {
    if (isMultiplayerGymkhana) return; // Strict block in multiplayer Gymkhana Blitz
    resetGamepadEdgeState();
    dismissResultsModal();
    useGymkhanaStore.getState().resetBlitz();
    setGameMode('freeroam');
  }, [dismissResultsModal, setGameMode, isMultiplayerGymkhana]);

  const handleReturnToMenu = useCallback(() => {
    returnToMainMenu();
  }, []);

  const playAgainRef = useRef(handlePlayAgain);
  playAgainRef.current = handlePlayAgain;
  const freeRoamRef = useRef(handleSwitchToFreeRoam);
  freeRoamRef.current = handleSwitchToFreeRoam;
  const returnMenuRef = useRef(handleReturnToMenu);
  returnMenuRef.current = handleReturnToMenu;

  const maxButtons = isMultiplayerGymkhana ? 2 : 3;

  // Clear edges on open
  useEffect(() => {
    resetGamepadEdgeState();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingActive(e)) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + maxButtons) % maxButtons);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % maxButtons);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        const cur = focusedIndexRef.current;
        if (isMultiplayerGymkhana) {
          if (cur === 0) playAgainRef.current();
          else if (cur === 1) returnMenuRef.current();
        } else {
          if (cur === 0) playAgainRef.current();
          else if (cur === 1) freeRoamRef.current();
          else if (cur === 2) returnMenuRef.current();
        }
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        returnMenuRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maxButtons, isMultiplayerGymkhana]);

  // Gamepad loop
  useEffect(() => {
    let animId: number;
    const pollGamepad = () => {
      const gp = sampleGamepad();
      if (gp.connected) {
        if (gp.menuUp) {
          setFocusedIndex((prev) => (prev - 1 + maxButtons) % maxButtons);
        } else if (gp.menuDown) {
          setFocusedIndex((prev) => (prev + 1) % maxButtons);
        }

        if (gp.menuConfirm) {
          const cur = focusedIndexRef.current;
          if (isMultiplayerGymkhana) {
            if (cur === 0) playAgainRef.current();
            else if (cur === 1) returnMenuRef.current();
          } else {
            if (cur === 0) playAgainRef.current();
            else if (cur === 1) freeRoamRef.current();
            else if (cur === 2) returnMenuRef.current();
          }
        } else if (gp.menuBack) {
          returnMenuRef.current();
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [maxButtons, isMultiplayerGymkhana]);

  return (
    <div style={styles.backdrop}>
      <div style={styles.modalCard}>
        {/* Top Rally Hazard Chevron Strip */}
        <div style={styles.hazardStripTop} />

        {/* Rally Championship Stage Finish Badge & Header */}
        <div style={styles.headerSection}>
          <div style={styles.badgeWrapperLogo}>
            <img
              src="/images/ui/rally_finish_badge.jpg"
              alt="Rally Stage Finish Badge"
              style={styles.badgeImage}
            />
          </div>

          <span style={styles.championshipTag}>OPEN RALLY CHAMPIONSHIP</span>
          <span style={styles.finishControlTag}>STOP CONTROL • OFFICIAL CLASSIFICATION</span>
        </div>

        {/* Header Badges */}
        <div style={styles.badgeWrapper}>
          <span style={styles.categoryBadge}>STAGE COMPLETE</span>
          {isNewRecord && <span style={styles.newRecordBadge}>★ NEW RECORD! ★</span>}
        </div>

        <h1 style={styles.title}>GYMKHANA BLITZ</h1>

        {/* Final Drift Score with carbon fiber backing & digital rally display */}
        <div style={styles.scoreContainer}>
          <div style={styles.scoreHeaderRow}>
            <span style={styles.scoreLabel}>TOTAL DRIFT SCORE</span>
            <span style={styles.liveTimingBadge}>OFFICIAL STAGE TIMING</span>
          </div>
          <div style={styles.scoreNumber}>{formatScore(totalScore)}</div>
          <div style={styles.scoreUnit}>POINTS</div>
        </div>

        {/* Personal Best Pill */}
        <div style={styles.bestPill}>
          <span style={styles.trophyIcon}>🏆</span>
          <span>STAGE RECORD:</span>
          <strong style={{ color: '#38BDF8', letterSpacing: '0.8px' }}>
            {bestScore !== null ? `${formatScore(bestScore)} PTS` : `${formatScore(totalScore)} PTS`}
          </strong>
        </div>

        {/* Performance Stats Breakdown Grid with Rally Telemetry Icons */}
        <div style={styles.statsGrid}>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>⚡</span>
            <span style={styles.statLabel}>MAX MULTIPLIER</span>
            <span style={styles.statValue}>x{stats.maxMultiplier}</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>📐</span>
            <span style={styles.statLabel}>PEAK SLIP ANGLE</span>
            <span style={styles.statValue}>{stats.maxAngleDeg}°</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>⏱️</span>
            <span style={styles.statLabel}>LONGEST DRIFT</span>
            <span style={styles.statValue}>{stats.longestDriftSeconds.toFixed(1)}s</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>⛓️</span>
            <span style={styles.statLabel}>DRIFT CHAINS</span>
            <span style={styles.statValue}>{stats.totalDrifts}</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>🚀</span>
            <span style={styles.statLabel}>LONGEST JUMP</span>
            <span style={styles.statValue}>{(stats.longestJumpSeconds ?? 0).toFixed(1)}s</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statIcon}>🪂</span>
            <span style={styles.statLabel}>TOTAL AIR TIME</span>
            <span style={styles.statValue}>{(stats.totalAirTime ?? 0).toFixed(1)}s</span>
          </div>
        </div>

        {/* Multiplayer 20-Second Intermission & Leaderboard */}
        {isMultiplayerGymkhana && (
          <>
            <div style={styles.intermissionBanner}>
              <span style={styles.intermissionPulseDot} />
              <span style={styles.intermissionLabel}>NEXT ROUND STARTS IN:</span>
              <strong style={styles.intermissionTimerText}>{Math.max(0, Math.ceil(intermissionTimer))}s</strong>
            </div>

            {leaderboard.length > 0 && (
              <div style={styles.leaderboardContainer}>
                <div style={styles.leaderboardHeaderRow}>
                  <span style={styles.leaderboardTitle}>OFFICIAL STAGE CLASSIFICATION</span>
                  <span style={styles.leaderboardRoomTag}>{currentRoom?.name ?? 'MULTIPLAYER'}</span>
                </div>
                <div style={styles.leaderboardList}>
                  {leaderboard.map((driver, index) => {
                    const isSelf = driver.id === selfId;
                    const preset = getVehiclePreset(driver.vehicleId);
                    return (
                      <div
                        key={driver.id}
                        style={{
                          ...styles.leaderboardRow,
                          ...(isSelf ? styles.leaderboardRowSelf : {}),
                        }}
                      >
                        <span style={styles.rankBadge}>
                          {index === 0 ? '🥇 #1' : index === 1 ? '🥈 #2' : index === 2 ? '🥉 #3' : `#${index + 1}`}
                        </span>
                        <div style={styles.driverInfoCol}>
                          <span style={styles.driverNick}>
                            {driver.nickname} {isSelf && <span style={styles.youBadge}>(YOU)</span>}
                          </span>
                          <span style={styles.driverCar}>{preset.name}</span>
                        </div>
                        <span style={styles.driverScore}>{formatScore(driver.score)} PTS</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Action Buttons with Dynamic Gamepad / Keyboard Focus Styles */}
        <div style={styles.buttonGroup}>
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              ...(focusedIndex === 0 ? styles.focusedPrimaryButton : {}),
            }}
            onPointerMove={() => setFocusedIndex(0)}
            onClick={handlePlayAgain}
          >
            <span>{isMultiplayerGymkhana ? `READY FOR NEXT ROUND (${Math.max(0, Math.ceil(intermissionTimer))}s)` : 'PLAY AGAIN'}</span>
            <span style={styles.buttonArrow}>➜</span>
          </button>

          {!isMultiplayerGymkhana && (
            <button
              type="button"
              style={{
                ...styles.secondaryButton,
                ...(focusedIndex === 1 ? styles.focusedSecondaryButton : {}),
              }}
              onPointerMove={() => setFocusedIndex(1)}
              onClick={handleSwitchToFreeRoam}
            >
              CONTINUE IN FREE ROAM
            </button>
          )}

          <button
            type="button"
            style={{
              ...styles.tertiaryButton,
              ...((isMultiplayerGymkhana ? focusedIndex === 1 : focusedIndex === 2)
                ? styles.focusedTertiaryButton
                : {}),
            }}
            onPointerMove={() => setFocusedIndex(isMultiplayerGymkhana ? 1 : 2)}
            onClick={handleReturnToMenu}
          >
            {isMultiplayer ? 'LEAVE ROOM & EXIT' : 'RETURN TO MENU'}
          </button>
        </div>

        {/* Gamepad / Controller / Keyboard Navigation Helper Badge */}
        <div style={styles.controllerHelperRow}>
          {gamepadConnected ? (
            <>
              <span style={styles.helperBadge}>
                {gamepadType === 'dualsense' ? '✕ Select' : 'A Select'}
              </span>
              <span style={styles.helperBadge}>
                {gamepadType === 'dualsense' ? '◯ Menu' : 'B Menu'}
              </span>
              <span style={styles.helperBadge}>▲▼ Navigate</span>
            </>
          ) : (
            <>
              <span style={styles.helperBadge}>Enter / Space Select</span>
              <span style={styles.helperBadge}>Esc Menu</span>
              <span style={styles.helperBadge}>W / S Navigate</span>
            </>
          )}
        </div>

        {/* Bottom Rally Hazard Chevron Strip */}
        <div style={styles.hazardStripBottom} />
      </div>
    </div>
  );
}

export function GymkhanaCompleteModal() {
  const storeShow = useGymkhanaStore((s) => s.showResultsModal);
  const showResultsModal = useGymkhanaStore.getState().showResultsModal ?? storeShow;
  if (!showResultsModal) return null;
  return <GymkhanaCompleteModalContent />;
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(5, 8, 16, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'auto',
    animation: 'fadeIn 0.25s ease-out',
    padding: '16px',
    boxSizing: 'border-box',
  },
  modalCard: {
    position: 'relative',
    backgroundImage: 'linear-gradient(180deg, rgba(15, 23, 42, 0.93) 0%, rgba(8, 12, 22, 0.97) 100%), url(/images/ui/rally_stage_card_bg.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: '2px solid rgba(245, 158, 11, 0.45)',
    borderRadius: '24px',
    padding: '24px 32px',
    maxWidth: '500px',
    width: '92%',
    maxHeight: '92vh',
    overflowY: 'auto',
    textAlign: 'center',
    boxShadow: '0 32px 80px rgba(0, 0, 0, 0.85), 0 0 50px rgba(245, 158, 11, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
    boxSizing: 'border-box',
  },
  hazardStripTop: {
    height: '6px',
    width: '100%',
    borderRadius: '4px 4px 0 0',
    background: 'repeating-linear-gradient(45deg, #F59E0B, #F59E0B 12px, #0F172A 12px, #0F172A 24px)',
    marginBottom: '12px',
  },
  hazardStripBottom: {
    height: '6px',
    width: '100%',
    borderRadius: '0 0 4px 4px',
    background: 'repeating-linear-gradient(45deg, #F59E0B, #F59E0B 12px, #0F172A 12px, #0F172A 24px)',
    marginTop: '16px',
  },
  headerSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '8px',
  },
  badgeWrapperLogo: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    padding: '3px',
    background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #F59E0B 100%)',
    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.45), inset 0 0 10px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '6px',
  },
  badgeImage: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  championshipTag: {
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '2.5px',
    color: '#FACC15',
    textTransform: 'uppercase',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.9)',
  },
  finishControlTag: {
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '1.2px',
    color: '#94A3B8',
    marginBottom: '6px',
    textTransform: 'uppercase',
  },
  badgeWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  categoryBadge: {
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '1.8px',
    padding: '4px 14px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#CBD5E1',
    textTransform: 'uppercase',
  },
  newRecordBadge: {
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '1px',
    padding: '4px 14px',
    borderRadius: '12px',
    background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
    color: '#FFFFFF',
    boxShadow: '0 2px 14px rgba(239, 68, 68, 0.5)',
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: '26px',
    fontWeight: 900,
    fontStyle: 'italic',
    letterSpacing: '2.5px',
    color: '#F8FAFC',
    textTransform: 'uppercase',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.9), 0 0 25px rgba(245, 158, 11, 0.3)',
  },
  scoreContainer: {
    background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)',
    border: '1.5px solid rgba(245, 158, 11, 0.5)',
    borderRadius: '16px',
    padding: '12px 20px',
    marginBottom: '10px',
    boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.7), 0 4px 20px rgba(0, 0, 0, 0.4)',
  },
  scoreHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  scoreLabel: {
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '1.8px',
    color: '#F59E0B',
  },
  liveTimingBadge: {
    fontSize: '8px',
    fontWeight: 800,
    letterSpacing: '1px',
    color: '#CBD5E1',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  scoreNumber: {
    fontFamily: "'SF Mono', 'Consolas', 'Courier New', monospace",
    fontSize: '44px',
    fontWeight: 900,
    color: '#FACC15',
    textShadow: '0 0 25px rgba(250, 204, 21, 0.5), 0 2px 4px rgba(0, 0, 0, 0.9)',
    lineHeight: 1.1,
    letterSpacing: '1.5px',
  },
  scoreUnit: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '2px',
    color: '#94A3B8',
    marginTop: '2px',
  },
  bestPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 16px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '12px',
    fontWeight: 700,
    color: '#94A3B8',
    marginBottom: '14px',
  },
  trophyIcon: {
    fontSize: '13px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '18px',
  },
  statBox: {
    background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.3)',
  },
  statIcon: {
    fontSize: '14px',
    marginBottom: '2px',
  },
  statLabel: {
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.8px',
    color: '#94A3B8',
    marginBottom: '2px',
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: "'SF Mono', Consolas, monospace",
    fontSize: '17px',
    fontWeight: 900,
    color: '#F8FAFC',
    textShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  primaryButton: {
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '12px',
    background: 'linear-gradient(90deg, #B91C1C 0%, #E11D48 50%, #EA580C 100%)',
    padding: '13px 20px',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 900,
    letterSpacing: '1.2px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 18px rgba(225, 29, 72, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    textTransform: 'uppercase',
  },
  focusedPrimaryButton: {
    outline: '3px solid #FACC15',
    outlineOffset: '2px',
    boxShadow: '0 0 26px rgba(250, 204, 21, 0.6), 0 6px 20px rgba(225, 29, 72, 0.5)',
    transform: 'scale(1.03)',
  },
  secondaryButton: {
    border: '1.5px solid rgba(16, 185, 129, 0.45)',
    borderRadius: '12px',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '11px 20px',
    color: '#34D399',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textTransform: 'uppercase',
  },
  focusedSecondaryButton: {
    borderColor: '#34D399',
    background: 'rgba(16, 185, 129, 0.28)',
    boxShadow: '0 0 22px rgba(16, 185, 129, 0.55), 0 0 0 2px #FFFFFF',
    transform: 'scale(1.03)',
    color: '#FFFFFF',
  },
  tertiaryButton: {
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.04)',
    padding: '9px 16px',
    color: '#94A3B8',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textTransform: 'uppercase',
  },
  focusedTertiaryButton: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
    background: 'rgba(255, 255, 255, 0.12)',
    boxShadow: '0 0 16px rgba(148, 163, 184, 0.4), 0 0 0 1px #FFFFFF',
    transform: 'scale(1.02)',
    color: '#FFFFFF',
  },
  buttonArrow: {
    fontSize: '16px',
    fontWeight: 900,
  },
  controllerHelperRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  helperBadge: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#CBD5E1',
    letterSpacing: '0.5px',
  },
  intermissionBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'rgba(245, 158, 11, 0.14)',
    border: '1px solid rgba(245, 158, 11, 0.5)',
    borderRadius: '12px',
    padding: '8px 16px',
    marginBottom: '14px',
  },
  intermissionPulseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#F59E0B',
    boxShadow: '0 0 10px #F59E0B',
  },
  intermissionLabel: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '1.2px',
    color: '#FACC15',
    textTransform: 'uppercase',
  },
  intermissionTimerText: {
    fontFamily: "'SF Mono', Consolas, monospace",
    fontSize: '16px',
    fontWeight: 900,
    color: '#FFFFFF',
  },
  leaderboardContainer: {
    background: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '14px',
    padding: '10px 14px',
    marginBottom: '16px',
    maxHeight: '180px',
    overflowY: 'auto',
  },
  leaderboardHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    paddingBottom: '4px',
  },
  leaderboardTitle: {
    fontSize: '10px',
    fontWeight: 900,
    letterSpacing: '1.5px',
    color: '#F59E0B',
    textTransform: 'uppercase',
  },
  leaderboardRoomTag: {
    fontSize: '9px',
    fontWeight: 800,
    color: '#94A3B8',
  },
  leaderboardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  leaderboardRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
  },
  leaderboardRowSelf: {
    background: 'rgba(56, 189, 248, 0.15)',
    border: '1px solid rgba(56, 189, 248, 0.4)',
  },
  rankBadge: {
    fontSize: '11px',
    fontWeight: 900,
    width: '40px',
    textAlign: 'left',
    color: '#FACC15',
  },
  driverInfoCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    flex: 1,
    marginLeft: '6px',
  },
  driverNick: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#F8FAFC',
  },
  youBadge: {
    fontSize: '9px',
    color: '#38BDF8',
    marginLeft: '4px',
  },
  driverCar: {
    fontSize: '9px',
    color: '#94A3B8',
  },
  driverScore: {
    fontFamily: "'SF Mono', Consolas, monospace",
    fontSize: '13px',
    fontWeight: 900,
    color: '#FACC15',
  },
};

