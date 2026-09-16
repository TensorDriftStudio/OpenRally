import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/store/gameStore';
import { useTagStore } from '@/store/tagStore';

/**
 * Hook that executes the frame tick loop for Rally Tag mode.
 * Ticks match roundRemaining, cleanTime, freeze, and immunity counters
 * at the render frame rate regardless of driving or spectating status.
 */
export function useTagLogic(): void {
  useFrame((_, delta) => {
    const gameState = useGameStore.getState().gameState;
    const gameMode = useGameStore.getState().gameMode;

    if (gameState !== 'playing' || gameMode !== 'tag') return;

    const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 1 / 60;
    useTagStore.getState().tickDelta(safeDelta);
  });
}
