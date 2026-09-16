import { useTagLogic } from '@/hooks/useTagLogic';

/**
 * Controller component for Rally Tag (Pursuit) match mechanics.
 * Ticks match round duration, clean time, freeze, and immunity counters
 * inside the R3F Canvas render loop.
 */
export function TagController(): null {
  useTagLogic();
  return null;
}
