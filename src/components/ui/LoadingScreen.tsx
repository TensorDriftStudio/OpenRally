import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { getLevelPreset } from '@/config/levelRegistry';
import { getVehiclePreset } from '@/config/vehicleRegistry';

/**
 * Loading screen overlay — shown while physics/scene initializes when entering gameplay.
 * Fades out once ready. Styled consistently with the cinematic dark rally atmosphere.
 */
export function LoadingScreen() {
  const { active, progress } = useProgress();
  const storeGameState = useGameStore((s) => s.gameState);
  const storeIsSceneReady = useGameStore((s) => s.isSceneReady);
  const storeLoadingTarget = useGameStore((s) => s.loadingTarget);
  const storeSelectedLevelId = useGameStore((s) => s.selectedLevelId);
  const storeSelectedVehicleId = useGameStore((s) => s.selectedVehicleId);

  const gameState = useGameStore.getState().gameState ?? storeGameState;
  const isSceneReady = useGameStore.getState().isSceneReady ?? storeIsSceneReady;
  const loadingTarget = useGameStore.getState().loadingTarget ?? storeLoadingTarget;
  const selectedLevelId = useGameStore.getState().selectedLevelId ?? storeSelectedLevelId;
  const selectedVehicleId = useGameStore.getState().selectedVehicleId ?? storeSelectedVehicleId;

  const level = getLevelPreset(selectedLevelId);
  const vehicle = getVehiclePreset(selectedVehicleId);

  const isRelevantState = gameState === 'loading' || gameState === 'playing';
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const isMenuLoading = gameState === 'loading' && loadingTarget === 'menu';

  useEffect(() => {
    if (gameState === 'loading') {
      setVisible(true);
      setFadeOut(false);

      const isDone = isSceneReady && (!active || progress >= 100);
      if (isDone) {
        // When transitioning to menu, guarantee a minimum opaque screen hold (500ms)
        // so that scene reset, vehicle grounding, and camera orbit snapping complete completely invisibly
        const holdDelay = isMenuLoading ? 500 : 0;
        let fadeTimer: ReturnType<typeof setTimeout> | null = null;
        const holdTimer = setTimeout(() => {
          setFadeOut(true);
          fadeTimer = setTimeout(() => {
            setVisible(false);
            const target = useGameStore.getState().loadingTarget;
            useGameStore.getState().setGameState(target === 'gameplay' ? 'playing' : 'menu');
            if (target === 'gameplay') {
              if (useGameStore.getState().gameMode === 'timeattack') {
                useRacingStore.getState().startCountdown();
              } else if (useGameStore.getState().gameMode === 'gymkhana_blitz') {
                useGymkhanaStore.getState().startCountdown();
              }
            }
          }, 600);
        }, holdDelay);

        return () => {
          clearTimeout(holdTimer);
          if (fadeTimer) clearTimeout(fadeTimer);
        };
      }

      // Safety timeout guard (max 3s)
      const safetyTimer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          useGameStore.getState().setSceneReady(true);
          const target = useGameStore.getState().loadingTarget;
          useGameStore.getState().setGameState(target === 'gameplay' ? 'playing' : 'menu');
          if (target === 'gameplay') {
            if (useGameStore.getState().gameMode === 'timeattack') {
              useRacingStore.getState().startCountdown();
            } else if (useGameStore.getState().gameMode === 'gymkhana_blitz') {
              useGymkhanaStore.getState().startCountdown();
            }
          }
        }, 500);
      }, 3000);

      return () => clearTimeout(safetyTimer);
    }

    if (gameState === 'playing') {
      if (!isSceneReady || active || progress < 100) {
        setVisible(true);
        setFadeOut(false);

        // Safety timeout guard (max 3s) to prevent hanging on loading screen during gameplay
        const safetyTimer = setTimeout(() => {
          useGameStore.getState().setSceneReady(true);
          setFadeOut(true);
          setTimeout(() => {
            setVisible(false);
          }, 600);
        }, 3000);

        return () => clearTimeout(safetyTimer);
      } else {
        setFadeOut(true);
        const timer = setTimeout(() => {
          setVisible(false);
        }, 600);
        return () => clearTimeout(timer);
      }
    }

    setVisible(false);
    setFadeOut(false);
  }, [gameState, isSceneReady, active, progress]);

  // Never render if not in loading/playing state and not visible
  if (!isRelevantState && !visible) return null;

  // Format progress for display
  const displayProgress = Math.round(progress) || (isSceneReady ? 100 : 0);

  return (
    <div
      id="loading-screen"
      style={{
        ...styles.overlay,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
        pointerEvents: fadeOut ? 'none' : 'all',
      }}
    >
      <div style={styles.content}>
        {/* Game Logo */}
        <div style={styles.logoContainer}>
          <img
            src="/openrally_logo_dark.png"
            alt="OpenRally"
            style={styles.logoImage}
          />
        </div>

        {/* Stage & Machine Preview Pill (Only shown when entering gameplay/stage) */}
        {!isMenuLoading && (
          <div style={styles.stagePill}>
            <span style={styles.stageLabel}>STAGE:</span>
            <span style={styles.stageValue}>{level.name}</span>
            <span style={styles.separator}>•</span>
            <span style={styles.stageLabel}>MACHINE:</span>
            <span style={styles.stageValue}>{vehicle.name}</span>
          </div>
        )}

        {/* Loading bar */}
        <div style={styles.loadingBar}>
          <div
            style={{
              ...styles.loadingFill,
              width: `${Math.max(8, displayProgress)}%`,
            }}
          >
            <div style={styles.loadingGlow} />
          </div>
        </div>

        {/* Status Text */}
        <p style={styles.subtitle}>
          {isMenuLoading
            ? displayProgress < 100
              ? `INITIALIZING OPENRALLY • ${displayProgress}%`
              : 'RETURNING TO MAIN MENU'
            : displayProgress < 100
              ? `INITIALIZING SIMULATION • ${displayProgress}%`
              : 'ENGINE READY • ENTERING STAGE'}
        </p>

        {/* Author Credit Badge */}
        <div style={styles.authorBadge}>
          <span style={styles.authorLabel}>CREATED BY</span>
          <span style={styles.authorName}>TensorDrift Studio</span>
          <span style={styles.versionTag}>• v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    backgroundImage: `
      linear-gradient(180deg, rgba(6, 9, 16, 0.85) 0%, rgba(9, 13, 24, 0.94) 100%),
      radial-gradient(circle at center, rgba(227, 24, 55, 0.15) 0%, transparent 60%),
      url('/images/ui/rally_backdrop.jpg')
    `,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    pointerEvents: 'none',
    padding: 'calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))',
    boxSizing: 'border-box',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '24px',
    maxWidth: '560px',
    padding: '24px',
  },
  logoContainer: {
    maxWidth: '480px',
    width: '85vw',
  },
  logoImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    filter: 'drop-shadow(0 12px 32px rgba(227, 24, 55, 0.35)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8))',
  },
  stagePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(8px)',
    fontSize: '12px',
    letterSpacing: '0.5px',
  },
  stageLabel: {
    color: '#94A3B8',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '1px',
  },
  stageValue: {
    color: '#FFFFFF',
    fontWeight: 800,
  },
  separator: {
    color: '#64748B',
  },
  loadingBar: {
    width: '320px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  loadingFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #991B1B, #E31837, #F87171)',
    backgroundSize: '200% 100%',
    borderRadius: '3px',
    position: 'relative' as const,
    transition: 'width 0.2s ease-out',
  },
  loadingGlow: {
    position: 'absolute' as const,
    inset: '-2px',
    background: 'inherit',
    filter: 'blur(4px)',
    opacity: 0.4,
  },
  subtitle: {
    fontSize: '12px',
    color: '#CBD5E1',
    letterSpacing: '3px',
    margin: 0,
    fontWeight: 800,
    textTransform: 'uppercase',
  },
  authorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 14px',
    borderRadius: '16px',
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    marginTop: '8px',
  },
  authorLabel: {
    color: 'rgba(243, 244, 246, 0.5)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  authorName: {
    color: '#F3F4F6',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  versionTag: {
    color: '#E31837',
    fontSize: '11px',
    fontWeight: 800,
  },
};
