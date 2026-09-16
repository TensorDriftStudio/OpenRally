import { Quaternion, Euler } from 'three';
import type { VehicleConfig } from '@/types/vehicle';
import type { HeightmapData } from '@/types/terrain';
import type { LevelData } from '@/types/level';
import { getInterpolatedHeight } from '@/utils/terrainCompiler';

/**
 * Result of deterministic ground settlement calculation.
 */
export interface GroundedVehicleTransform {
  /** World position [x, y, z] for the vehicle rigid body */
  position: [number, number, number];
  /** World rotation quaternion [x, y, z, w] for the vehicle rigid body */
  rotation: [number, number, number, number];
  /** World Euler rotation [pitch, yaw, roll] in radians */
  euler: [number, number, number];
  /** Per-wheel resting suspension length in meters */
  suspensionLengths: number[];
}

// Reusable scratch objects to guarantee zero GC allocation in hot paths
const _quat = new Quaternion();
const _euler = new Euler();

/**
 * Calculates the exact resting position and orientation of a vehicle on terrain
 * so that all 4 tires touch the ground surface with natural static suspension compression.
 *
 * Accommodates all vehicle geometries (wheel radii, suspension rest lengths, axle heights, track width)
 * and conforms to local terrain pitch and roll gradients.
 *
 * @param spawnPos - Target ground center [x, y, z]
 * @param spawnRotY - Yaw rotation heading in radians
 * @param config - Vehicle configuration specs
 * @param heightmapData - Compiled level heightmap data
 * @param levelData - Level definition containing terrain dimensions
 * @returns Grounded transform with exact position, orientation, and wheel suspension lengths
 */
export function calculateGroundedVehicleTransform(
  spawnPos: [number, number, number],
  spawnRotY: number,
  config: VehicleConfig,
  heightmapData: HeightmapData,
  levelData: LevelData,
): GroundedVehicleTransform {
  const { wheels } = config;
  const numWheels = wheels.length;

  if (!heightmapData?.heights) {
    _euler.set(0, spawnRotY, 0, 'YXZ');
    _quat.setFromEuler(_euler);
    return {
      position: [spawnPos[0], spawnPos[1], spawnPos[2]],
      rotation: [_quat.x, _quat.y, _quat.z, _quat.w],
      euler: [0, spawnRotY, 0],
      suspensionLengths: [0.25, 0.25, 0.25, 0.25],
    };
  }

  const mapWidth = levelData.terrainBase.width;
  const mapDepth = levelData.terrainBase.depth;
  const { heights, rows, cols } = heightmapData;

  const cosY = Math.cos(spawnRotY);
  const sinY = Math.sin(spawnRotY);

  const suspensionLengths: number[] = new Array(numWheels);
  let totalChassisY = 0;

  // Front vs rear and left vs right accumulators for pitch and roll calculation
  let frontGroundYSum = 0;
  let frontCount = 0;
  let frontZSum = 0;

  let rearGroundYSum = 0;
  let rearCount = 0;
  let rearZSum = 0;

  let leftGroundYSum = 0;
  let leftCount = 0;
  let leftXSum = 0;

  let rightGroundYSum = 0;
  let rightCount = 0;
  let rightXSum = 0;

  for (let i = 0; i < numWheels; i++) {
    const wheel = wheels[i];
    const localX = wheel.position[0];
    const localY = wheel.position[1];
    const localZ = wheel.position[2];

    // Transform local wheel coordinate to world (X, Z)
    const worldX = spawnPos[0] + cosY * localX + sinY * localZ;
    const worldZ = spawnPos[2] - sinY * localX + cosY * localZ;

    // Sample terrain ground height beneath wheel contact patch
    const groundY = getInterpolatedHeight(worldX, worldZ, heights, rows, cols, mapWidth, mapDepth);

    // Natural static equilibrium suspension compression: ~72% of full rest length
    // under static vehicle curb weight
    const restLength = typeof wheel.suspensionRestLength === 'number' && wheel.suspensionRestLength > 0
      ? wheel.suspensionRestLength
      : 0.30;
    const restingSuspension = restLength * 0.72;
    suspensionLengths[i] = restingSuspension;

    const radius = typeof wheel.radius === 'number' && wheel.radius > 0 ? wheel.radius : 0.32;

    // Distance from vehicle origin (chassis center) down to tire contact point:
    // contactLocalY = localY - restingSuspension - radius;
    // chassisY - contactLocalY = groundY  =>  chassisY = groundY - contactLocalY
    const groundContactOffset = -(localY - restingSuspension - radius);
    const targetChassisY = groundY + groundContactOffset;
    totalChassisY += targetChassisY;

    // Classify wheels for pitch (front: z > 0, rear: z <= 0) and roll (left: x < 0, right: x > 0)
    if (localZ > 0) {
      frontGroundYSum += groundY;
      frontZSum += localZ;
      frontCount++;
    } else {
      rearGroundYSum += groundY;
      rearZSum += localZ;
      rearCount++;
    }

    if (localX < 0) {
      leftGroundYSum += groundY;
      leftXSum += localX;
      leftCount++;
    } else {
      rightGroundYSum += groundY;
      rightXSum += localX;
      rightCount++;
    }
  }

  const averageChassisY = totalChassisY / numWheels;

  // Calculate terrain pitch and roll angles so vehicle conforms to slope
  let pitch = 0;
  if (frontCount > 0 && rearCount > 0) {
    const avgFrontY = frontGroundYSum / frontCount;
    const avgRearY = rearGroundYSum / rearCount;
    const avgFrontZ = frontZSum / frontCount;
    const avgRearZ = rearZSum / rearCount;
    const wheelbase = Math.max(0.5, avgFrontZ - avgRearZ);
    // In Three.js: positive pitch tilts nose DOWN (+Z into ground), negative tilts nose UP
    pitch = -Math.atan2(avgFrontY - avgRearY, wheelbase);
  }

  let roll = 0;
  if (leftCount > 0 && rightCount > 0) {
    const avgLeftY = leftGroundYSum / leftCount;
    const avgRightY = rightGroundYSum / rightCount;
    const avgLeftX = leftXSum / leftCount;
    const avgRightX = rightXSum / rightCount;
    const trackWidth = Math.max(0.5, avgRightX - avgLeftX);
    // Positive roll tilts car RIGHT (+X down), negative tilts car LEFT
    roll = Math.atan2(avgLeftY - avgRightY, trackWidth);
  }

  // Construct orientation quaternion combining pitch, yaw heading, and roll
  _euler.set(pitch, spawnRotY, roll, 'YXZ');
  _quat.setFromEuler(_euler);

  return {
    position: [spawnPos[0], averageChassisY, spawnPos[2]],
    rotation: [_quat.x, _quat.y, _quat.z, _quat.w],
    euler: [pitch, spawnRotY, roll],
    suspensionLengths,
  };
}
