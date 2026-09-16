import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/store/gameStore';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { onGameEvent } from '@/utils/events';

/**
 * Hook that executes the high-frequency physics tick for Gymkhana Blitz.
 * Calculates drift scoring, ticks the 60-second countdown, handles direction
 * transitions, and banks/fails points on vehicle collision or spinout.
 */
export function useGymkhanaLogic(): void {
  const gameState = useGameStore((s) => s.gameState);
  const gameMode = useGameStore((s) => s.gameMode);
  const isSceneReady = useGameStore((s) => s.isSceneReady);

  // Synchronize initial countdown when scene becomes ready in gymkhana mode
  useEffect(() => {
    if (gameState === 'playing' && gameMode === 'gymkhana_blitz' && isSceneReady) {
      const status = useGymkhanaStore.getState().status;
      if (status === 'idle') {
        useGymkhanaStore.getState().startCountdown();
      }
    }
  }, [gameState, gameMode, isSceneReady]);

  // Fail drift on heavy collision with walls / obstacles
  useEffect(() => {
    const unsub = onGameEvent('collision', (payload) => {
      if (useGameStore.getState().gameMode === 'gymkhana_blitz') {
        if (payload.intensity > 15) {
          useGymkhanaStore.getState().failDrift();
        }
      }
    });
    return unsub;
  }, []);

  // Reset blitz and restart countdown upon vehicle reset
  useEffect(() => {
    const unsub = onGameEvent('vehicle_reset', () => {
      if (useGameStore.getState().gameMode === 'gymkhana_blitz' && useGameStore.getState().gameState === 'playing') {
        useGymkhanaStore.getState().resetBlitz();
        useGymkhanaStore.getState().startCountdown();
      }
    });
    return unsub;
  }, []);

  // Frame tick loop
  useFrame((_, delta) => {
    if (useGameStore.getState().gameState !== 'playing') return;
    if (useGameStore.getState().gameMode !== 'gymkhana_blitz') return;

    const gymkhana = useGymkhanaStore.getState();

    // 1. Countdown ticking
    if (gymkhana.countdown !== null) {
      gymkhana.tickCountdown(delta);
    }

    // 2. Active blitz ticking
    if (gymkhana.status === 'active') {
      const { speed, slipAngle, isAirborne } = useGameStore.getState();
      gymkhana.tickBlitz(delta, speed, slipAngle, !isAirborne, isAirborne);
    }
  });
}
