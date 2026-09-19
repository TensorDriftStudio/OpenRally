import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, BufferGeometry, BufferAttribute } from 'three';
import { TireRibbonBuffer } from '@/utils/physics/tireRibbon';
import { useGameStore } from '@/store/gameStore';
import { emitGameEvent, onGameEvent, clearAllGameEventListeners } from '@/utils/events';

describe('Tire Tracks Reset and Route Restart Safety', () => {
  let ribbonBuffers: TireRibbonBuffer[];
  let geometries: BufferGeometry[];

  const clearTracks = (bufs: TireRibbonBuffer[], geos: BufferGeometry[]) => {
    for (let i = 0; i < 4; i++) {
      bufs[i].reset();
      const geo = geos[i];
      if (geo) {
        geo.setDrawRange(0, 0);
        const alphaAttr = geo.attributes.ribbonAlpha;
        if (alphaAttr) {
          alphaAttr.needsUpdate = true;
        }
      }
    }
  };

  beforeEach(() => {
    clearAllGameEventListeners();
    useGameStore.setState({
      gameState: 'playing',
      pendingReset: false,
      selectedLevelId: 'level_canyon',
      speed: 80,
    });

    ribbonBuffers = Array.from({ length: 4 }, () => new TireRibbonBuffer({ maxSegments: 20, minDistance: 0.1 }));
    geometries = Array.from({ length: 4 }, () => {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(120), 3));
      geo.setAttribute('ribbonAlpha', new BufferAttribute(new Float32Array(40), 1));
      geo.setIndex(new BufferAttribute(new Uint32Array(114), 1));
      geo.setDrawRange(0, 0);
      return geo;
    });

    // Populate buffers with active tire tracks
    const normal = new Vector3(0, 1, 0);
    for (let i = 0; i < 4; i++) {
      ribbonBuffers[i].addContactPoint(new Vector3(i, 0, 0), normal, 'tarmac', 15, 0.8, true, 1.0);
      ribbonBuffers[i].addContactPoint(new Vector3(i, 0, 1), normal, 'tarmac', 15, 0.8, true, 1.1);
      ribbonBuffers[i].addContactPoint(new Vector3(i, 0, 2), normal, 'tarmac', 15, 0.8, true, 1.2);
      ribbonBuffers[i].updateLifetime(1.2);
      geometries[i].setDrawRange(0, ribbonBuffers[i].getActiveIndicesCount());
    }
  });

  it('populates segments and non-zero draw range during normal driving', () => {
    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBeGreaterThan(0);
      expect(ribbonBuffers[i].getActiveIndicesCount()).toBeGreaterThan(0);
      expect(geometries[i].drawRange.count).toBeGreaterThan(0);
    }
  });

  it('immediately resets segments and sets drawRange to 0 on clearTracks', () => {
    clearTracks(ribbonBuffers, geometries);

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBe(0);
      expect(ribbonBuffers[i].getActiveIndicesCount()).toBe(0);
      expect(ribbonBuffers[i].topologyDirty).toBe(true);
      expect(geometries[i].drawRange.count).toBe(0);
    }
  });

  it('clears tire tracks when vehicle_reset event occurs with reason manual or out_of_bounds', () => {
    const unsub = onGameEvent('vehicle_reset', (e) => {
      if (e.reason !== 'recovery') {
        clearTracks(ribbonBuffers, geometries);
      }
    });

    emitGameEvent('vehicle_reset', { reason: 'manual' });

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBe(0);
      expect(geometries[i].drawRange.count).toBe(0);
    }

    unsub();
  });

  it('preserves tire tracks when vehicle_reset event is an in-place recovery', () => {
    const unsub = onGameEvent('vehicle_reset', (e) => {
      if (e.reason !== 'recovery') {
        clearTracks(ribbonBuffers, geometries);
      }
    });

    emitGameEvent('vehicle_reset', { reason: 'recovery' });

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBeGreaterThan(0);
      expect(geometries[i].drawRange.count).toBeGreaterThan(0);
    }

    unsub();
  });

  it('clears tire tracks when pendingReset is triggered in gameStore', () => {
    const unsub = useGameStore.subscribe((state, prevState) => {
      if (state.pendingReset && !prevState.pendingReset) {
        clearTracks(ribbonBuffers, geometries);
      }
    });

    useGameStore.getState().triggerReset(true);

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBe(0);
      expect(geometries[i].drawRange.count).toBe(0);
    }

    unsub();
  });

  it('clears tire tracks when returning to main menu or loading screen', () => {
    const unsub = useGameStore.subscribe((state, prevState) => {
      if (
        state.gameState !== prevState.gameState &&
        (state.gameState === 'menu' || state.gameState === 'loading')
      ) {
        clearTracks(ribbonBuffers, geometries);
      }
    });

    useGameStore.setState({ gameState: 'loading' });

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBe(0);
      expect(geometries[i].drawRange.count).toBe(0);
    }

    unsub();
  });

  it('clears tire tracks when selected track/level changes', () => {
    const unsub = useGameStore.subscribe((state, prevState) => {
      if (state.selectedLevelId !== prevState.selectedLevelId) {
        clearTracks(ribbonBuffers, geometries);
      }
    });

    useGameStore.setState({ selectedLevelId: 'level_island' });

    for (let i = 0; i < 4; i++) {
      expect(ribbonBuffers[i].getSegmentCount()).toBe(0);
      expect(geometries[i].drawRange.count).toBe(0);
    }

    unsub();
  });
});
