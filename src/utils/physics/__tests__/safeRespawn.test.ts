import { describe, it, expect } from 'vitest';
import {
  getPropClearanceRadius,
  isLocationClearOfProps,
  findNearestSafeTrackPoint,
  findSafeBreadcrumb,
  resolveSafeRespawnTransform,
} from '../safeRespawn';
import type { PropData, LevelData, LevelPreset } from '@/types/level';
import type { HeightmapData } from '@/types/terrain';
import { DEFAULT_VEHICLE_CONFIG } from '@/config/vehicle';

describe('Safe Respawn & Obstacle Clearance Solver', () => {
  const mockProps: PropData[] = [
    {
      id: 'tree_1',
      type: 'tree_pine',
      position: [100, 10, 50],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    {
      id: 'rock_1',
      type: 'rock',
      position: [105, 10, 55],
      rotation: [0, 0, 0],
      scale: [2, 2, 2], // Larger rock
    },
    {
      id: 'cabin_1',
      type: 'cabin',
      position: [200, 15, 200],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ];

  const mockTrackPoints = [
    { x: 0, z: 0 },
    { x: 50, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 50 },
    { x: 100, z: 100 },
    { x: 50, z: 100 },
    { x: 0, z: 100 },
    { x: 0, z: 50 },
  ];

  const mockHeightmap: HeightmapData = {
    heights: new Float32Array(33 * 33).fill(5),
    rows: 33,
    cols: 33,
    minHeight: 0,
    maxHeight: 20,
    trackMasks: new Float32Array(33 * 33),
  };

  const mockLevelData: LevelData = {
    id: 'test_circuit',
    name: 'Test Circuit',
    terrainBase: {
      width: 500,
      depth: 500,
      subdivisions: 32,
      amplitude: 20,
      frequency: 0.01,
      octaves: 2,
      lacunarity: 2,
      persistence: 0.5,
      seed: 42,
    },
    track: {
      points: mockTrackPoints,
      width: 8,
      falloff: 4,
      targetHeight: 5,
    },
    heightModifiers: [],
    props: mockProps,
  };

  const mockLevelPreset: LevelPreset = {
    id: 'test_circuit',
    name: 'Test Circuit',
    description: 'Test level preset',
    difficulty: 'easy',
    surfaceDescription: 'Tarmac',
    recommendedTire: 'asphalt',
    bannerUrl: '',
    data: mockLevelData,
    spawnPosition: [0, 5.5, 0],
    spawnRotationY: 0,
    fallResetY: -5,
  };

  describe('getPropClearanceRadius', () => {
    it('provides minimum safe clearance of at least 3.8m for standard trees and rocks', () => {
      const treeClearance = getPropClearanceRadius('tree_pine', [1, 1, 1]);
      const rockClearance = getPropClearanceRadius('rock', [1, 1, 1]);

      expect(treeClearance).toBeGreaterThanOrEqual(3.8);
      expect(rockClearance).toBeGreaterThanOrEqual(4.0);
    });

    it('scales clearance with scaled obstacles such as large rocks or buildings', () => {
      const smallRock = getPropClearanceRadius('rock', [1, 1, 1]);
      const bigRock = getPropClearanceRadius('rock', [3, 3, 3]);
      const cabin = getPropClearanceRadius('cabin', [1, 1, 1]);

      expect(bigRock).toBeGreaterThan(smallRock);
      expect(cabin).toBeGreaterThanOrEqual(7.5);
    });
  });

  describe('isLocationClearOfProps', () => {
    it('returns false when position is within prop collision radius', () => {
      // Tree is at (100, 50), clearance is ~3.9m
      const nearTree = isLocationClearOfProps(101, 50.5, mockProps);
      expect(nearTree).toBe(false);

      // Rock is at (105, 55) with scale 2, clearance is ~5.5m
      const nearRock = isLocationClearOfProps(106, 56, mockProps);
      expect(nearRock).toBe(false);
    });

    it('returns true when position is well clear of all props', () => {
      // Road at (50, 0) is far from all props
      const safePoint = isLocationClearOfProps(50, 0, mockProps);
      expect(safePoint).toBe(true);
    });
  });

  describe('findNearestSafeTrackPoint', () => {
    it('finds closest track point on the spline', () => {
      // Near (50, 5) -> closest track point should be near (50, 0)
      const res = findNearestSafeTrackPoint(50, 5, 'test_circuit', mockTrackPoints, mockProps);
      expect(res).not.toBeNull();
      expect(res!.position[0]).toBeCloseTo(50, 0);
      expect(res!.position[1]).toBeCloseTo(0, 0);
      expect(res!.distance).toBeCloseTo(5, 0);
    });

    it('diverts to clear track segment if an obstacle is placed directly on the closest sample', () => {
      const propsWithObstacleOnRoad: PropData[] = [
        {
          id: 'road_blocker',
          type: 'rock',
          position: [50, 5, 0], // Directly on track at (50, 0)
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ];

      const res = findNearestSafeTrackPoint(50, 0, 'test_circuit_blocked', mockTrackPoints, propsWithObstacleOnRoad);
      expect(res).not.toBeNull();
      // Must not be within the obstacle's clearance zone!
      const isClear = isLocationClearOfProps(res!.position[0], res!.position[1], propsWithObstacleOnRoad);
      expect(isClear).toBe(true);
    });
  });

  describe('findSafeBreadcrumb', () => {
    it('picks a valid breadcrumb that was recorded before the crash and away from crash site', () => {
      const STRIDE = 7;
      const buffer = new Float32Array(8 * STRIDE);

      // Breadcrumb 0: 3.0s ago at (40, 5, 0), safe, heading 0
      buffer[0] = 40;
      buffer[1] = 5;
      buffer[2] = 0;
      buffer[3] = 0;
      buffer[4] = 2000; // t = 2000ms
      buffer[5] = 1; // safe

      // Breadcrumb 1: 0.2s ago at (100, 10, 49) - right next to tree!
      buffer[7] = 100;
      buffer[8] = 10;
      buffer[9] = 49;
      buffer[10] = 0;
      buffer[11] = 4800; // t = 4800ms
      buffer[12] = 0; // unsafe

      const nowTime = 5000;
      const carCrashPos = { x: 100, z: 50 }; // at the tree

      const safeBc = findSafeBreadcrumb(
        carCrashPos.x,
        carCrashPos.z,
        buffer,
        2, // head
        2, // count
        mockProps,
        nowTime,
        800, // minAgeMs
        5.0, // minDist
      );

      expect(safeBc).not.toBeNull();
      expect(safeBc!.position[0]).toBe(40);
      expect(safeBc!.position[2]).toBe(0);
    });
  });

  describe('resolveSafeRespawnTransform', () => {
    it('recovers to safe track when car rolls over near a tree beside the road', () => {
      // Car crashes into tree at (100, 10, 50) and rolls over
      const carPos = { x: 100.5, y: 10, z: 49.8 };

      const result = resolveSafeRespawnTransform({
        currentPos: carPos,
        currentRotY: 1.57,
        levelData: mockLevelData,
        levelPreset: mockLevelPreset,
        heightmapData: mockHeightmap,
        vehicleConfig: DEFAULT_VEHICLE_CONFIG,
        gameMode: 'freeroam',
        isRolledOver: true,
        isMultiplayer: false,
      });

      // The respawn position MUST be clear of all props!
      const isClear = isLocationClearOfProps(result.position[0], result.position[2], mockProps);
      expect(isClear).toBe(true);

      // Distance from the tree must be at least the clearance radius
      const distFromTree = Math.hypot(result.position[0] - 100, result.position[2] - 50);
      const treeClearance = getPropClearanceRadius('tree_pine', [1, 1, 1]);
      expect(distFromTree).toBeGreaterThanOrEqual(treeClearance);

      // Reason should be track_recovery since it was within 40m of track
      expect(result.reason).toBe('track_recovery');
      expect(result.suspensionLengths.length).toBe(4);
      expect(result.position[1]).toBeGreaterThan(0);
    });

    it('recovers to previous checkpoint in Time Attack mode', () => {
      const carPos = { x: 95, y: 10, z: 25 };

      const result = resolveSafeRespawnTransform({
        currentPos: carPos,
        currentRotY: 0,
        levelData: mockLevelData,
        levelPreset: mockLevelPreset,
        heightmapData: mockHeightmap,
        vehicleConfig: DEFAULT_VEHICLE_CONFIG,
        gameMode: 'timeattack',
        isRolledOver: true,
        isMultiplayer: false,
        currentCheckpoint: 2, // Approaching CP 2, last passed was CP 1
      });

      expect(result.reason).toBe('checkpoint');
      const isClear = isLocationClearOfProps(result.position[0], result.position[2], mockProps);
      expect(isClear).toBe(true);
    });

    it('falls back to safe spawn point if somehow an arbitrary target is blocked by props', () => {
      // Scenario where car is at an obstacle and track is removed
      const noTrackLevelData: LevelData = {
        ...mockLevelData,
        track: {
          points: [],
          width: 0,
          falloff: 0,
          targetHeight: 0,
        },
      };

      const result = resolveSafeRespawnTransform({
        currentPos: { x: 100, y: 10, z: 50 }, // directly at tree
        currentRotY: 0,
        levelData: noTrackLevelData,
        levelPreset: mockLevelPreset,
        heightmapData: mockHeightmap,
        vehicleConfig: DEFAULT_VEHICLE_CONFIG,
        gameMode: 'freeroam',
        isRolledOver: true,
        isMultiplayer: false,
      });

      // Must safely fallback to level spawn position which is clear of props
      expect(result.reason).toBe('spawn');
      expect(result.position[0]).toBeCloseTo(mockLevelPreset.spawnPosition[0], 1);
      expect(result.position[2]).toBeCloseTo(mockLevelPreset.spawnPosition[2], 1);
      const isClear = isLocationClearOfProps(result.position[0], result.position[2], mockProps);
      expect(isClear).toBe(true);
    });
  });
});
