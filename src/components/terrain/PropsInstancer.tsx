import { useMemo } from 'react';
import {
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { useTexture } from '@react-three/drei';
import { useTerrainData } from '@/components/terrain/TerrainContext';
import { useSettingsStore } from '@/store/settingsStore';
import { isMobileDevice, getClampedAnisotropy } from '@/utils/device';
import {
  usePropsData,
  ProximityColliders,
  VegetationInstancer,
  RocksInstancer,
  ArchitectureInstancer,
  TracksidePropsInstancer,
  GymkhanaPropsInstancer,
} from './props';

// Re-export all procedural geometry builders for 100% test suite and project-wide compatibility
export {
  createTrunkGeometry,
  createPineFoliageGeometry,
  createBirchTrunkGeometry,
  createBirchFoliageGeometry,
  createDesertTrunkGeometry,
  createDesertFoliageGeometry,
  createRealisticRockGeometry,
  createSandstoneRockGeometry,
  createCabinStoneGeometry,
  createCabinWallGeometry,
  createCabinDoorGeometry,
  createCabinWindowGeometry,
  createCabinRoofGeometry,
  createFenceGeometry,
  createCastleTowerGeometry,
  createCastleWallGeometry,
  createCastleGateGeometry,
  createCastleKeepGeometry,
  createCastleArchGeometry,
  createStoneWallGeometry,
  createStandingStoneGeometry,
  createHighlandCottageWallGeometry,
  createHighlandCottageRoofGeometry,
  createStoneCairnGeometry,
  createHayBaleGeometry,
  createRallySignGeometry,
  createStoneBridgeGeometry,
  createShippingContainerGeometry,
  createDriftPylonGeometry,
} from './props/geometries';

/**
 * Evaluates whether terrain prop instanced meshes should cast and receive shadows.
 *
 * Performance Rationale (Mobile GPU optimization):
 * The terrain features up to 27 distinct instanced meshes across 4 categories (vegetation,
 * rocks, architecture, and trackside props). Casting shadows from all props requires an additional
 * shadow map pass, causing severe fill-rate and draw call overhead on mobile GPUs.
 *
 * - On mobile (`isMobile === true`): Prop shadows are strictly disabled across all quality
 *   levels (including Balanced 'medium', 'high', and 'very_high').
 * - On desktop (`isMobile === false`): Prop shadows are enabled for all modes except 'low'.
 *
 * @param isMobile Whether the current runtime environment is a mobile/touch device.
 * @param graphicsQuality The current graphics quality setting ('low' | 'medium' | 'high' | 'very_high').
 * @returns boolean True if prop meshes should cast and receive shadows; false otherwise.
 */
export function canPropsCastShadow(isMobile: boolean, graphicsQuality: string): boolean {
  return !isMobile && graphicsQuality !== 'low';
}

export { computeInstanceBoundingSphere } from './props/types';

/**
 * Clean orchestrator component for all GPU-instanced terrain props,
 * proximity Rapier physics colliders, and environmental dressing.
 */
export function PropsInstancer() {
  const { levelData } = useTerrainData();
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);

  const levelId = levelData.id.toLowerCase();
  const isDesert = levelId.includes('desert');
  const isSnow = levelId.includes('sweden') || levelId.includes('snow') || levelId.includes('winter');
  const isBritain = levelId.includes('britain') || levelId.includes('highland');
  const isGymkhana = levelId.includes('gymkhana');
  const isIsland = levelId.includes('island') && !isGymkhana;

  // Dynamically inspect level props so any level containing specific prop types gets the right textures
  const propsList = levelData.props ?? [];
  const hasProp = (type: string) => propsList.some((p) => p.type === type);
  const hasPrefix = (prefix: string) => propsList.some((p) => p.type.startsWith(prefix));

  const hasHayBale = hasProp('hay_bale');
  const hasFence = hasProp('fence');
  const hasRallySign = hasProp('rally_sign');
  const hasJumpRamp = hasProp('jump_ramp');
  const hasCastle = hasPrefix('castle_') || hasProp('stone_bridge');
  const hasStoneWall = hasProp('stone_wall');
  const hasStandingStone = hasProp('standing_stone');
  const hasHighlandCottage = hasProp('highland_cottage');
  const hasCabin = hasProp('cabin');
  const hasShippingContainer = hasProp('shipping_container');
  const hasBirch = hasProp('tree_birch') || isBritain || isIsland;
  const hasDesertTree = hasProp('tree_desert') || isDesert;
  const hasPine = hasProp('tree_pine') || hasProp('tree') || (!isDesert && !hasDesertTree);

  // Lightweight 1x1 neutral white fallback texture to substitute unneeded prop textures per biome,
  // saving over 90MB VRAM and eliminating texture thrashing on TBDR mobile GPUs without pitch-black darkening.
  const BLANK =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

  const pineBarkPath = (hasPine || !isDesert) ? '/textures/foliage/tree_bark.jpg' : BLANK;
  const pineBranchPath = (!isDesert && !isSnow) ? '/textures/foliage/pine_branch.jpg' : BLANK;
  const pineBranchSnowPath = isSnow ? '/textures/foliage/pine_branch_snow.jpg' : BLANK;
  const birchBarkPath = hasBirch ? '/textures/foliage/birch_bark.jpg' : BLANK;
  const leafyBranchPath = (hasBirch && !isSnow) ? '/textures/foliage/leafy_branch.jpg' : BLANK;
  const desertBarkPath = hasDesertTree ? '/textures/foliage/desert_bark.jpg' : BLANK;
  const desertAcaciaBranchPath = hasDesertTree ? '/textures/foliage/desert_acacia_branch.jpg' : BLANK;

  const rockPath = !isDesert ? '/textures/terrain/rock_cliff.jpg' : BLANK;
  const sandPath = (isDesert || isIsland) ? '/textures/terrain/desert_sand.jpg' : BLANK;

  const cabinTimberWallPath = (hasCabin || isSnow || isIsland) ? '/textures/props/cabin_timber_wall.jpg' : BLANK;
  const cabinRedWallPath = (hasRallySign || hasCabin || isSnow || isIsland || isBritain || isGymkhana) ? '/textures/props/cabin_red_wall.jpg' : BLANK;
  const cabinDoorPath = (hasCabin || isSnow || isIsland) ? '/textures/props/cabin_door.jpg' : BLANK;
  const cabinWindowPath = (hasCabin || isSnow || isIsland) ? '/textures/props/cabin_window.jpg' : BLANK;
  const cabinRoofPath = (hasCabin || isIsland) ? '/textures/props/cabin_roof.jpg' : BLANK;
  const cabinRoofSnowPath = (hasCabin && isSnow) || isSnow ? '/textures/props/cabin_roof_snow.jpg' : BLANK;
  const fencePath = (hasFence || isSnow || isIsland || isBritain || isGymkhana) ? '/textures/props/rustic_fence.jpg' : BLANK;

  const castleStonePath = (hasCastle || isBritain) ? '/textures/props/castle_stone_wall.jpg' : BLANK;
  const castleCobblestonePath = (hasCastle || isBritain) ? '/textures/props/castle_cobblestone.jpg' : BLANK;
  const britishDrystonePath = (hasStoneWall || isBritain) ? '/textures/props/british_drystone_wall.jpg' : BLANK;
  const celticStandingStonePath = (hasStandingStone || isBritain) ? '/textures/props/celtic_standing_stone.jpg' : BLANK;
  const highlandCottageWallPath = (hasHighlandCottage || isBritain) ? '/textures/props/highland_cottage_wall.jpg' : BLANK;
  const highlandCottageThatchPath = (hasHayBale || hasHighlandCottage || isBritain || isGymkhana) ? '/textures/props/highland_cottage_thatch.jpg' : BLANK;
  const jumpRampPath = (hasJumpRamp || isGymkhana) ? '/textures/props/jump_ramp_diffuse.png' : BLANK;
  const containerBluePath = (hasShippingContainer || isGymkhana) ? '/textures/props/shipping_container_blue.jpg' : BLANK;
  const containerOrangePath = (hasShippingContainer || isGymkhana) ? '/textures/props/shipping_container_orange.jpg' : BLANK;
  const containerRedPath = (hasShippingContainer || isGymkhana) ? '/textures/props/shipping_container_red.jpg' : BLANK;

  // Load shared props textures (biome-tailored to reduce VRAM by up to 120MB)
  const [
    pineBarkTexture,
    pineBranchTexture,
    pineBranchSnowTexture,
    birchBarkTexture,
    leafyBranchTexture,
    desertBarkTexture,
    desertAcaciaBranchTexture,
    rockTexture,
    sandTexture,
    cabinTimberWallTexture,
    cabinRedWallTexture,
    cabinDoorTexture,
    cabinWindowTexture,
    cabinRoofTexture,
    cabinRoofSnowTexture,
    fenceTexture,
    castleStoneTexture,
    _castleCobblestoneTexture,
    britishDrystoneTexture,
    celticStandingStoneTexture,
    _highlandCottageWallTexture,
    highlandCottageThatchTexture,
    jumpRampTexture,
    containerBlueTexture,
    containerOrangeTexture,
    containerRedTexture,
  ] = useTexture([
    pineBarkPath,
    pineBranchPath,
    pineBranchSnowPath,
    birchBarkPath,
    leafyBranchPath,
    desertBarkPath,
    desertAcaciaBranchPath,
    rockPath,
    sandPath,
    cabinTimberWallPath,
    cabinRedWallPath,
    cabinDoorPath,
    cabinWindowPath,
    cabinRoofPath,
    cabinRoofSnowPath,
    fencePath,
    castleStonePath,
    castleCobblestonePath,
    britishDrystonePath,
    celticStandingStonePath,
    highlandCottageWallPath,
    highlandCottageThatchPath,
    jumpRampPath,
    containerBluePath,
    containerOrangePath,
    containerRedPath,
  ]);

  useMemo(() => {
    const isMobile = isMobileDevice();
    const anisotropy = getClampedAnisotropy(4, isMobile);
    [
      pineBarkTexture,
      pineBranchTexture,
      pineBranchSnowTexture,
      birchBarkTexture,
      leafyBranchTexture,
      desertBarkTexture,
      desertAcaciaBranchTexture,
      rockTexture,
      sandTexture,
      cabinTimberWallTexture,
      cabinRedWallTexture,
      cabinDoorTexture,
      cabinWindowTexture,
      cabinRoofTexture,
      cabinRoofSnowTexture,
      fenceTexture,
      castleStoneTexture,
      _castleCobblestoneTexture,
      britishDrystoneTexture,
      celticStandingStoneTexture,
      _highlandCottageWallTexture,
      highlandCottageThatchTexture,
      jumpRampTexture,
      containerBlueTexture,
      containerOrangeTexture,
      containerRedTexture,
    ].forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.needsUpdate = true;
    });
  }, [
    pineBarkTexture,
    pineBranchTexture,
    pineBranchSnowTexture,
    birchBarkTexture,
    leafyBranchTexture,
    desertBarkTexture,
    desertAcaciaBranchTexture,
    rockTexture,
    sandTexture,
    cabinTimberWallTexture,
    cabinRedWallTexture,
    cabinDoorTexture,
    cabinWindowTexture,
    cabinRoofTexture,
    cabinRoofSnowTexture,
    fenceTexture,
    castleStoneTexture,
    _castleCobblestoneTexture,
    britishDrystoneTexture,
    celticStandingStoneTexture,
    _highlandCottageWallTexture,
    highlandCottageThatchTexture,
    jumpRampTexture,
    containerBlueTexture,
    containerOrangeTexture,
    containerRedTexture,
  ]);

  const isMobile = isMobileDevice();
  const canShadow = canPropsCastShadow(isMobile, graphicsQuality);

  // Compute terrain ground-snapped matrices and categorized collections
  const categorized = usePropsData();

  return (
    <>
      {/* Isolated Dynamic Proximity Physics Colliders */}
      <ProximityColliders
        spatialGrid={categorized.spatialGrid}
        initialTrees={[...categorized.pineTrees, ...categorized.birchTrees, ...categorized.desertTrees].slice(0, 120)}
        initialRocks={[...categorized.rocks, ...categorized.sandstoneRocks].slice(0, 40)}
        initialCabins={categorized.cabins.slice(0, 10)}
        initialFences={categorized.fences.slice(0, 40)}
        initialCastleTowers={categorized.castleTowers.slice(0, 16)}
        initialCastleWalls={categorized.castleWalls.slice(0, 30)}
        initialCastleGates={categorized.castleGates.slice(0, 8)}
        initialCastleKeeps={categorized.castleKeeps.slice(0, 4)}
        initialCastleArches={categorized.castleArches.slice(0, 12)}
        initialStoneWalls={categorized.stoneWalls.slice(0, 50)}
        initialStandingStones={categorized.standingStones.slice(0, 30)}
        initialHighlandCottages={categorized.highlandCottages.slice(0, 12)}
        initialStoneCairns={categorized.stoneCairns.slice(0, 12)}
        initialHayBales={categorized.hayBales.slice(0, 20)}
        initialRallySigns={categorized.rallySigns.slice(0, 20)}
        initialStoneBridges={categorized.stoneBridges.slice(0, 4)}
        initialShippingContainers={categorized.shippingContainers.slice(0, 30)}
        initialDriftPylons={categorized.driftPylons.slice(0, 30)}
        initialJumpRamps={categorized.jumpRamps.slice(0, 10)}
      />

      {/* 1. GPU-Instanced Vegetation (Pines, Birch, Acacia + Wind Displacement) */}
      <VegetationInstancer
        pineTrees={categorized.pineTrees}
        birchTrees={categorized.birchTrees}
        desertTrees={categorized.desertTrees}
        canShadow={canShadow}
        isSnow={isSnow}
        isDesert={isDesert}
        pineBarkTexture={pineBarkTexture}
        pineBranchTexture={pineBranchTexture}
        pineBranchSnowTexture={pineBranchSnowTexture}
        birchBarkTexture={birchBarkTexture}
        leafyBranchTexture={leafyBranchTexture}
        desertBarkTexture={desertBarkTexture}
        desertAcaciaBranchTexture={desertAcaciaBranchTexture}
      />

      {/* 2. GPU-Instanced Rocks & Megaliths (Granite, Sandstone, Standing Stones, Cairns) */}
      <RocksInstancer
        rocks={categorized.rocks}
        sandstoneRocks={categorized.sandstoneRocks}
        standingStones={categorized.standingStones}
        stoneCairns={categorized.stoneCairns}
        canShadow={canShadow}
        isSnow={isSnow}
        rockTexture={rockTexture}
        sandTexture={sandTexture}
        celticStandingStoneTexture={celticStandingStoneTexture}
      />

      {/* 3. GPU-Instanced Architecture (Cabins, Cottages, Fortress, Bridges) */}
      <ArchitectureInstancer
        cabins={categorized.cabins}
        highlandCottages={categorized.highlandCottages}
        castleTowers={categorized.castleTowers}
        castleWalls={categorized.castleWalls}
        castleGates={categorized.castleGates}
        castleKeeps={categorized.castleKeeps}
        castleArches={categorized.castleArches}
        stoneBridges={categorized.stoneBridges}
        canShadow={canShadow}
        isSnow={isSnow}
        rockTexture={rockTexture}
        cabinTimberWallTexture={cabinTimberWallTexture}
        cabinRedWallTexture={cabinRedWallTexture}
        cabinDoorTexture={cabinDoorTexture}
        cabinWindowTexture={cabinWindowTexture}
        cabinRoofTexture={cabinRoofTexture}
        cabinRoofSnowTexture={cabinRoofSnowTexture}
        castleStoneTexture={castleStoneTexture}
        britishDrystoneTexture={britishDrystoneTexture}
        highlandCottageThatchTexture={highlandCottageThatchTexture}
      />

      {/* 4. GPU-Instanced Trackside Props (Fences, Dyke Walls, Hay Bales, Rally Signs) */}
      <TracksidePropsInstancer
        fences={categorized.fences}
        stoneWalls={categorized.stoneWalls}
        hayBales={categorized.hayBales}
        rallySigns={categorized.rallySigns}
        canShadow={canShadow}
        isSnow={isSnow}
        fenceTexture={fenceTexture}
        britishDrystoneTexture={britishDrystoneTexture}
        highlandCottageThatchTexture={highlandCottageThatchTexture}
        cabinRedWallTexture={cabinRedWallTexture}
      />

      {/* 5. GPU-Instanced Gymkhana Arena Props (Freight Containers, High-Vis Drift Pylons, Jump Ramps) */}
      <GymkhanaPropsInstancer
        shippingContainers={categorized.shippingContainers}
        driftPylons={categorized.driftPylons}
        jumpRamps={categorized.jumpRamps}
        jumpRampTexture={jumpRampTexture}
        containerBlueTexture={containerBlueTexture}
        containerOrangeTexture={containerOrangeTexture}
        containerRedTexture={containerRedTexture}
        canShadow={canShadow}
      />
    </>
  );
}
