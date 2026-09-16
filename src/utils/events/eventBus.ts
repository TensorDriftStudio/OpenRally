import { useEffect, useRef } from 'react';
import type { SurfaceType } from '@/types/vehicle';

/**
 * Strongly typed game event dictionary.
 */
export interface GameEventMap {
  lap_completed: {
    lap: number;
    lapTime: number;
    isBest: boolean;
  };
  checkpoint_passed: {
    checkpointIndex: number;
    totalCheckpoints: number;
  };
  surface_changed: {
    from: SurfaceType;
    to: SurfaceType;
  };
  vehicle_reset: {
    reason: 'manual' | 'out_of_bounds' | 'stability_guard' | 'recovery';
  };
  gear_shifted: {
    fromGear: number;
    toGear: number;
  };
  drift_started: {
    speedKmh: number;
    slipAngle: number;
  };
  drift_ended: {
    duration: number;
    score: number;
  };
  high_speed_achieved: {
    speedKmh: number;
  };
  collision: {
    intensity: number;
    point?: [number, number, number];
  };
  track_records_reset: {
    timestamp: number;
  };
  android_back_pressed: Record<string, never>;
}

export type GameEventName = keyof GameEventMap;
export type GameEventListener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

// Internal listener storage
const listeners = new Map<GameEventName, Set<GameEventListener<never>>>();

/**
 * Subscribes a listener to a specific game event.
 * Returns an unsubscribe callback for easy cleanup.
 */
export function onGameEvent<K extends GameEventName>(
  eventName: K,
  listener: GameEventListener<K>,
): () => void {
  let eventListeners = listeners.get(eventName);
  if (!eventListeners) {
    eventListeners = new Set();
    listeners.set(eventName, eventListeners);
  }

  const genericListener = listener as unknown as GameEventListener<never>;
  eventListeners.add(genericListener);

  return () => {
    eventListeners?.delete(genericListener);
    if (eventListeners?.size === 0) {
      listeners.delete(eventName);
    }
  };
}

/**
 * Emits a strongly typed game event to all registered listeners.
 */
export function emitGameEvent<K extends GameEventName>(
  eventName: K,
  payload: GameEventMap[K],
): void {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners || eventListeners.size === 0) return;

  eventListeners.forEach((listener) => {
    try {
      (listener as unknown as GameEventListener<K>)(payload);
    } catch (err) {
      console.error(`[EventBus] Error in listener for event "${eventName}":`, err);
    }
  });
}

/**
 * Clears all registered event listeners (useful for test isolation).
 */
export function clearAllGameEventListeners(): void {
  listeners.clear();
}

/**
 * React hook to subscribe to a game event with automatic cleanup on unmount.
 */
export function useGameEventListener<K extends GameEventName>(
  eventName: K,
  listener: GameEventListener<K>,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const unsub = onGameEvent(eventName, (payload) => {
      listenerRef.current(payload);
    });
    return unsub;
  }, [eventName]);
}
