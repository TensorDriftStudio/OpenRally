import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VEHICLE_REGISTRY } from '@/config/vehicleRegistry';
import { LEVEL_REGISTRY } from '@/config/levelRegistry';
import { SURFACE_REGISTRY } from '@/config/surfaceRegistry';
import { GAME_MODE_REGISTRY } from '@/config/gameModeRegistry';
import type { GameMode } from '@/types/game';
import type { SurfaceType } from '@/types/vehicle';
import {
  VALID_LEVEL_IDS,
  VALID_GAME_MODES,
  VALID_SURFACES,
  isValidVehicleId,
} from '@/network/packetValidator';

describe('Network Registry & Cross-Subsystem Integrity', () => {
  it('ensures every vehicle in VEHICLE_REGISTRY passes client network packet validation', () => {
    const missing: string[] = [];
    for (const vehicleId of Object.keys(VEHICLE_REGISTRY)) {
      if (!isValidVehicleId(vehicleId)) {
        missing.push(vehicleId);
      }
    }
    expect(
      missing,
      `The following vehicles exist in VEHICLE_REGISTRY but are rejected by network packet validator: ${missing.join(', ')}. Please add them to VALID_VEHICLE_IDS in src/network/packetValidator.ts and server/src/packetValidator.ts.`,
    ).toEqual([]);
  });

  it('ensures every surface in SURFACE_REGISTRY is supported by network VALID_SURFACES', () => {
    const missing: string[] = [];
    for (const surface of Object.keys(SURFACE_REGISTRY) as SurfaceType[]) {
      if (!VALID_SURFACES.has(surface)) {
        missing.push(surface);
      }
    }
    expect(
      missing,
      `The following surfaces exist in SURFACE_REGISTRY but are missing from VALID_SURFACES in network validator: ${missing.join(', ')}.`,
    ).toEqual([]);
  });

  it('ensures every level in LEVEL_REGISTRY is included in network VALID_LEVEL_IDS', () => {
    const missing: string[] = [];
    for (const levelId of Object.keys(LEVEL_REGISTRY)) {
      if (!VALID_LEVEL_IDS.has(levelId)) {
        missing.push(levelId);
      }
    }
    expect(
      missing,
      `The following levels exist in LEVEL_REGISTRY but are missing from VALID_LEVEL_IDS: ${missing.join(', ')}. Please add them to VALID_LEVEL_IDS in src/network/packetValidator.ts and server/src/packetValidator.ts.`,
    ).toEqual([]);
  });

  it('ensures every game mode in GAME_MODE_REGISTRY is recognized by network VALID_GAME_MODES', () => {
    const missing: string[] = [];
    for (const mode of Object.keys(GAME_MODE_REGISTRY) as GameMode[]) {
      if (!VALID_GAME_MODES.has(mode)) {
        missing.push(mode);
      }
    }
    expect(
      missing,
      `The following game modes exist in GAME_MODE_REGISTRY but are missing from VALID_GAME_MODES: ${missing.join(', ')}.`,
    ).toEqual([]);
  });

  it('ensures all registered levels have valid bannerUrl and supportedModes', () => {
    for (const [id, level] of Object.entries(LEVEL_REGISTRY)) {
      expect(level.bannerUrl, `Level "${id}" must define a valid bannerUrl for UI display.`).toBeDefined();
      expect(level.bannerUrl?.length).toBeGreaterThan(0);

      if (level.supportedModes) {
        level.supportedModes.forEach((mode) => {
          expect(
            GAME_MODE_REGISTRY[mode],
            `Level "${id}" specifies unknown supportedMode "${mode}". Must exist in GAME_MODE_REGISTRY.`,
          ).toBeDefined();
        });
      }
    }
  });

  it('verifies server packetValidator.ts stays in sync with all registered vehicles and levels', () => {
    const serverValidatorPath = path.resolve(__dirname, '../../../../../server/src/packetValidator.ts');
    if (!fs.existsSync(serverValidatorPath)) {
      return; // Skip if server directory is not present in build environment
    }

    const content = fs.readFileSync(serverValidatorPath, 'utf-8');

    for (const vehicleId of Object.keys(VEHICLE_REGISTRY)) {
      expect(
        content.includes(`'${vehicleId}'`),
        `Server packetValidator.ts is missing vehicle ID "${vehicleId}". Add it to VALID_VEHICLE_IDS in server/src/packetValidator.ts!`,
      ).toBe(true);
    }

    for (const levelId of Object.keys(LEVEL_REGISTRY)) {
      expect(
        content.includes(`'${levelId}'`),
        `Server packetValidator.ts is missing level ID "${levelId}". Add it to VALID_LEVEL_IDS in server/src/packetValidator.ts!`,
      ).toBe(true);
    }
  });
});
