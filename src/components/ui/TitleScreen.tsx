import { useEffect, useState, useCallback, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getActiveGamepad, sampleGamepad } from '@/utils/input/gamepad';

import { unlockSharedAudioContext, getSharedAudioContext } from '@/utils/audio/audioContext';

let _unlockAudioCtx: AudioContext | null = null;

/**
 * Minimalist Title Screen ("Press Any Key To Start").
 * Unlocks the WebAudio context silently on user gesture and transitions into the Main Menu.
 */
export function TitleScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const setGameState = useGameStore((s) => s.setGameState);

  const [isFadingOut, setIsFadingOut] = useState(false);
  const startedRef = useRef(false);

  // Silently resume shared audio context to satisfy browser autoplay policy without allocating orphaned contexts
  const unlockAudioContext = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!_unlockAudioCtx) {
        _unlockAudioCtx = getSharedAudioContext();
        if (!_unlockAudioCtx) {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            _unlockAudioCtx = new AudioCtx();
          }
        }
      }
      if (_unlockAudioCtx && _unlockAudioCtx.state === 'suspended') {
        _unlockAudioCtx.resume().catch(() => {});
      }
      unlockSharedAudioContext().catch(() => {});
    } catch {
      // Ignored
    }
  }, []);

  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setIsFadingOut(true);
    unlockAudioContext();

    setTimeout(() => {
      useGameStore.setState({ loadingTarget: 'menu', isSceneReady: false });
      setGameState('loading');
    }, 240);
  }, [unlockAudioContext, setGameState]);

  // Keyboard & mouse listener
  useEffect(() => {
    if (gameState !== 'title') return;

    const onKeyDown = () => handleStart();
    const onPointerDown = () => handleStart();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [gameState, handleStart]);

  // Gamepad listener
  useEffect(() => {
    if (gameState !== 'title') return;

    let animFrameId: number;

    const checkGamepad = () => {
      const gp = getActiveGamepad();
      if (gp) {
        const state = sampleGamepad(1.0, gp);
        if (
          state.menuConfirm ||
          state.menuBack ||
          state.pauseToggle ||
          state.cameraToggle ||
          state.resetToggle ||
          state.menuUp ||
          state.menuDown ||
          state.menuLeft ||
          state.menuRight ||
          state.handbrake ||
          state.throttle > 0.3 ||
          state.brake > 0.3
        ) {
          handleStart();
          return;
        }
      }
      animFrameId = requestAnimationFrame(checkGamepad);
    };

    animFrameId = requestAnimationFrame(checkGamepad);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [gameState, handleStart]);

  if (gameState !== 'title') {
    return null;
  }

  return (
    <div
      id="title-screen"
      style={{
        ...styles.overlay,
        opacity: isFadingOut ? 0 : 1,
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
      onClick={handleStart}
    >
      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoWrapper}>
          <img
            src="/openrally_logo_dark.png"
            alt="OpenRally"
            style={styles.logoImage}
          />
        </div>

        {/* Clean, minimalist call to action */}
        <div style={styles.prompt}>
          <span style={styles.promptText}>PRESS ANY BUTTON TO START</span>
          <span style={styles.promptSub}>KEYBOARD / CONTROLLER</span>
        </div>

        {/* Game Author Credit */}
        <div style={styles.authorBadge}>
          <span style={styles.authorLabel}>CREATED BY</span>
          <span style={styles.authorName}>TensorDriftStudio (Dawid Warzocha)</span>
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
    zIndex: 90,
    backgroundImage: `
      linear-gradient(180deg, rgba(6, 9, 16, 0.78) 0%, rgba(9, 13, 24, 0.90) 100%),
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
    userSelect: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.3s ease-out',
    padding: 'calc(20px + var(--sat)) calc(20px + var(--sar)) calc(20px + var(--sab)) calc(20px + var(--sal))',
    boxSizing: 'border-box',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '36px',
    maxWidth: '560px',
    padding: '24px',
  },
  logoWrapper: {
    maxWidth: '500px',
    width: '90vw',
  },
  logoImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    filter: 'drop-shadow(0 12px 32px rgba(227, 24, 55, 0.35)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8))',
  },
  prompt: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  promptText: {
    color: '#FFFFFF',
    fontSize: '18px',
    fontWeight: 800,
    letterSpacing: '4px',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.3)',
  },
  promptSub: {
    color: '#94A3B8',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },
  authorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(8px)',
  },
  authorLabel: {
    color: 'rgba(243, 244, 246, 0.5)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  authorName: {
    color: '#F3F4F6',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  versionTag: {
    color: '#E31837',
    fontSize: '11px',
    fontWeight: 800,
  },
};
