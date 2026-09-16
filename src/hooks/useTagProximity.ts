import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from '@/store/gameStore';
import { useTagStore } from '@/store/tagStore';
import { getAllRemoteVehicleMeshes } from '@/components/vehicle/remoteVehicleRegistry';
import { networkClient } from '@/network/networkClient';

const TAG_PROXIMITY_RADIUS_SQ = 3.2 * 3.2;

/**
 * Dedicated gameplay proximity hook for Rally Tag mode.
 * Evaluates distances from the player vehicle to remote drivers when player is the active tagger.
 * Decouples mini-game rules from the vehicle physics loop.
 */
export function useTagProximity(chassisRef: React.RefObject<RapierRigidBody | null>): void {
  useFrame(() => {
    const gameMode = useGameStore.getState().gameMode;
    if (gameMode !== 'tag') return;

    const tagState = useTagStore.getState();
    if (tagState.phase !== 'active' || !tagState.isTagger || tagState.isFrozen) {
      return;
    }

    const body = chassisRef.current;
    if (!body || (typeof body.isValid === 'function' && !body.isValid())) {
      return;
    }

    const pos = body.translation();
    const remoteMeshes = getAllRemoteVehicleMeshes();

    for (const [remoteId, mesh] of remoteMeshes) {
      const dx = pos.x - mesh.position.x;
      const dy = pos.y - mesh.position.y;
      const dz = pos.z - mesh.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= TAG_PROXIMITY_RADIUS_SQ) {
        networkClient.sendTagTouch(remoteId);
        break;
      }
    }
  });
}
