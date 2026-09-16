import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData, LevelPreset } from '@/types/level';
import { compileTerrain } from '@/utils/terrainCompiler';
import { LEVEL_PRESET_ISLAND } from '@/config/levelRegistry';

/**
 * Shared terrain data — compiled once from LevelPreset/LevelData and consumed by
 * the visual Terrain mesh, PropsInstancer, physics, and checkpoints.
 */
interface TerrainContextValue {
  /** The compiled heightmap data */
  heightmapData: HeightmapData;
  /** The explicit level data defining the map */
  levelData: LevelData;
  /** Active level preset metadata (spawns, resets, environment) */
  levelPreset: LevelPreset;
}

const TerrainCtx = createContext<TerrainContextValue | null>(null);

interface TerrainProviderProps {
  levelPreset?: LevelPreset;
  children: ReactNode;
}

/**
 * TerrainProvider compiles the map data once and provides it to all
 * child components via React Context.
 */
export function TerrainProvider({
  levelPreset = LEVEL_PRESET_ISLAND,
  children,
}: TerrainProviderProps) {
  const value = useMemo<TerrainContextValue>(() => {
    const levelData = levelPreset.data;
    const heightmapData = compileTerrain(levelData);
    return { heightmapData, levelData, levelPreset };
  }, [levelPreset]);

  return <TerrainCtx.Provider value={value}>{children}</TerrainCtx.Provider>;
}

/**
 * Hook to consume the shared heightmap data and active level metadata from TerrainProvider.
 * Must be used within a <TerrainProvider>.
 */
export function useTerrainData(): TerrainContextValue {
  const ctx = useContext(TerrainCtx);
  if (!ctx) {
    throw new Error('useTerrainData must be used within a <TerrainProvider>');
  }
  return ctx;
}

/**
 * Optional hook to consume terrain data if rendered inside a <TerrainProvider>,
 * returning null otherwise without throwing an exception.
 */
export function useOptionalTerrainData(): TerrainContextValue | null {
  return useContext(TerrainCtx);
}
