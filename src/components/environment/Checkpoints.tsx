import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useGameStore } from '@/store/gameStore';
import { useRacingStore } from '@/store/racingStore';
import type { CheckpointData } from '@/types/racing';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';
import { onGameEvent } from '@/utils/events';
import { isMobileOrAndroid } from '@/utils/device';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { StartFinishGantry } from './StartFinishGantry';
import { CheckpointGate } from './CheckpointGate';

const _carPos = new Vector3();
const _gatePos = new Vector3();

/**
 * Checkpoints manager component.
 * Samples track spline tangents for coherent gate orientations aligned with the driving line,
 * renders the realistic Start/Finish gantry for Sector 0, manages countdown, and handles
 * centralized distance-based culling for all checkpoint gates to eliminate per-gate useFrame overhead.
 */
export function Checkpoints() {
  const gameState = useGameStore((s) => s.gameState);
  const gameMode = useGameStore((s) => s.gameMode);
  const isSceneReady = useGameStore((s) => s.isSceneReady);
  const { heightmapData, levelData } = useTerrainData();
  const currentCheckpoint = useRacingStore((s) => s.currentCheckpoint);
  const passCheckpoint = useRacingStore((s) => s.passCheckpoint);
  const updateTimer = useRacingStore((s) => s.updateTimer);

  const gateGroupRefs = useRef<(Group | null)[]>([]);
  const cullingFrameRef = useRef(0);

  const { checkpoints } = useMemo(() => {
    const { heights, cols, rows } = heightmapData;
    const mapWidth = levelData.terrainBase.width;
    const mapDepth = levelData.terrainBase.depth;
    const points = levelData.track.points;

    const cps: CheckpointData[] = [];
    const count = points.length;

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const prevP = points[(i - 1 + count) % count];
      const nextP = points[(i + 1) % count];

      // Exact tangent direction between neighbor track waypoints
      const tangentX = nextP.x - prevP.x;
      const tangentZ = nextP.z - prevP.z;
      const rotY = Math.atan2(tangentX, tangentZ);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const gateWidth = Math.max(9.5, levelData.track.width + 4.5);
      const halfWidth = gateWidth / 2;
      const roadHalfWidth = levelData.track.width / 2;

      // Sample terrain heights at exact world positions of left pillar, right pillar and road edges
      // (matching the group's rotationY transform: local -X -> (-halfWidth*cosY, +halfWidth*sinY))
      const centerGroundY = getInterpolatedHeight(p.x, p.z, heights, rows, cols, mapWidth, mapDepth);

      const leftX = p.x - halfWidth * cosY;
      const leftZ = p.z + halfWidth * sinY;
      const leftGroundY = getInterpolatedHeight(leftX, leftZ, heights, rows, cols, mapWidth, mapDepth);

      const rightX = p.x + halfWidth * cosY;
      const rightZ = p.z - halfWidth * sinY;
      const rightGroundY = getInterpolatedHeight(rightX, rightZ, heights, rows, cols, mapWidth, mapDepth);

      // Drivable road edge heights
      const roadLeftY = getInterpolatedHeight(p.x - roadHalfWidth * cosY, p.z + roadHalfWidth * sinY, heights, rows, cols, mapWidth, mapDepth);
      const roadRightY = getInterpolatedHeight(p.x + roadHalfWidth * cosY, p.z - roadHalfWidth * sinY, heights, rows, cols, mapWidth, mapDepth);

      // Gantry origin Y is aligned with the highest drivable road point to ensure clearance everywhere
      const maxRoadY = Math.max(centerGroundY, roadLeftY, roadRightY);

      // Relative ground offsets under the left and right pillars
      const leftGroundOffset = leftGroundY - maxRoadY;
      const rightGroundOffset = rightGroundY - maxRoadY;

      cps.push({
        id: i,
        position: [p.x, maxRoadY, p.z],
        rotationY: rotY,
        width: gateWidth,
        isStart: i === 0,
        isFinish: i === 0,
        leftGroundOffset,
        rightGroundOffset,
      });
    }

    return { checkpoints: cps };
  }, [heightmapData, levelData]);

  // Sync total checkpoints count with racingStore in Time Attack mode
  useEffect(() => {
    if (gameMode === 'timeattack') {
      useRacingStore.setState({ totalCheckpoints: checkpoints.length });
    }
  }, [checkpoints.length, gameMode]);

  // Start 3-2-1-START countdown once scene is ready and loaded in Time Attack mode
  useEffect(() => {
    if (gameMode === 'timeattack' && isSceneReady && gameState === 'playing') {
      const status = useRacingStore.getState().raceStatus;
      if (status === 'idle') {
        useRacingStore.getState().startCountdown();
      }
    }
  }, [gameMode, isSceneReady, gameState, levelData.id]);

  // Restart countdown upon vehicle reset
  useEffect(() => {
    const unsub = onGameEvent('vehicle_reset', (e) => {
      const isMultiplayer = Boolean(useMultiplayerStore.getState().currentRoom);

      // In multiplayer or when performing in-place/track recovery, never restart the race countdown!
      if (isMultiplayer || e.reason === 'recovery' || e.reason === 'track_recovery') {
        return;
      }

      if (useGameStore.getState().gameMode === 'timeattack' && useGameStore.getState().gameState === 'playing') {
        useRacingStore.getState().startCountdown();
      }
    });
    return unsub;
  }, []);

  // Frame loop for race countdown, timer, proximity trigger, and centralized gate culling
  useFrame(({ camera }, delta) => {
    if (useGameStore.getState().gameState !== 'playing') return;
    if (gameMode !== 'timeattack') return;

    // Centralized gate distance culling (runs once per 6 frames for all gates)
    cullingFrameRef.current++;
    if (cullingFrameRef.current % 6 === 0) {
      const isMobile = isMobileOrAndroid();
      const maxDistSq = isMobile ? 240 * 240 : 380 * 380;
      const camX = camera.position.x;
      const camY = camera.position.y;
      const camZ = camera.position.z;

      for (let i = 0; i < checkpoints.length; i++) {
        const group = gateGroupRefs.current[i];
        if (!group) continue;
        if (i === currentCheckpoint || checkpoints[i].isStart) {
          if (!group.visible) group.visible = true;
          continue;
        }
        const pos = checkpoints[i].position;
        const dx = camX - pos[0];
        const dy = camY - pos[1];
        const dz = camZ - pos[2];
        const shouldBeVisible = dx * dx + dy * dy + dz * dz <= maxDistSq;
        if (group.visible !== shouldBeVisible) {
          group.visible = shouldBeVisible;
        }
      }
    }

    const { raceStatus, countdown } = useRacingStore.getState();

    // Keep ticking countdown until it finishes and fades out
    if (countdown !== null) {
      useRacingStore.getState().tickCountdown(delta);
    }

    if (raceStatus === 'racing') {
      updateTimer(delta);

      const pos = useGameStore.getState().position;
      _carPos.set(pos[0], pos[1], pos[2]);

      const targetCp = checkpoints[currentCheckpoint];
      if (!targetCp) return;

      _gatePos.set(targetCp.position[0], targetCp.position[1], targetCp.position[2]);
      const dist = _carPos.distanceTo(_gatePos);

      // Gate capture radius (generous to account for track width & high speed)
      const triggerRadius = targetCp.width * 0.85;
      if (dist < triggerRadius) {
        passCheckpoint(currentCheckpoint);
      }
    }
  });

  // Checkpoints, gates, and gantries are only rendered in Time Attack mode
  if (gameMode !== 'timeattack') {
    return null;
  }

  return (
    <group>
      {checkpoints.map((cp) => {
        const isTarget = cp.id === currentCheckpoint;
        const isPassed = currentCheckpoint > cp.id;

        if (cp.isStart) {
          return (
            <StartFinishGantry
              key={cp.id}
              data={cp}
              isTarget={isTarget}
            />
          );
        }

        return (
          <group
            key={cp.id}
            ref={(el) => {
              gateGroupRefs.current[cp.id] = el;
            }}
          >
            <CheckpointGate
              data={cp}
              isTarget={isTarget}
              isPassed={isPassed}
            />
          </group>
        );
      })}
    </group>
  );
}
