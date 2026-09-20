#!/usr/bin/env node

/**
 * OpenRally Automated Version Synchronization Script
 * Synchronizes SemVer version numbers across:
 * - root package.json
 * - server/package.json
 * - src/config/version.ts
 * - server/src/version.ts
 *
 * Usage:
 *   node scripts/bumpVersion.mjs patch       (e.g. 1.0.0 -> 1.0.1)
 *   node scripts/bumpVersion.mjs minor       (e.g. 1.0.0 -> 1.1.0)
 *   node scripts/bumpVersion.mjs major       (e.g. 1.0.0 -> 2.0.0)
 *   node scripts/bumpVersion.mjs 1.1.0       (explicit target version)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ROOT_PKG_PATH = path.join(ROOT_DIR, 'package.json');
const SERVER_PKG_PATH = path.join(ROOT_DIR, 'server/package.json');
const CLIENT_VERSION_FILE = path.join(ROOT_DIR, 'src/config/version.ts');
const SERVER_VERSION_FILE = path.join(ROOT_DIR, 'server/src/version.ts');

function parseSemVer(versionStr) {
  const match = versionStr.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Invalid SemVer string: "${versionStr}". Expected format X.Y.Z or X.Y.Z-prerelease`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function computeTargetVersion(currentVersion, bumpType) {
  const parsed = parseSemVer(currentVersion);

  switch (bumpType.toLowerCase()) {
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'major':
      return `${parsed.major + 1}.0.0`;
    default:
      // Treat as explicit target version string
      parseSemVer(bumpType); // Validate formatting
      return bumpType;
  }
}

function updateJsonFile(filePath, newVersion) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[bumpVersion] Warning: File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);
  const oldVersion = json.version;
  json.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
  console.log(`[bumpVersion] Updated ${path.relative(ROOT_DIR, filePath)}: ${oldVersion} -> ${newVersion}`);
}

function updateTsVersionFile(filePath, constantName, newVersion, protocolVersion) {
  const banner = constantName === 'GAME_VERSION'
    ? `/**
 * OpenRally Game Engine Version
 * Single source of truth for UI badges, telemetry payloads, diagnostics, and multiplayer handshakes.
 *
 * NOTE: Synchronized automatically with package.json and server/src/version.ts via scripts/bumpVersion.mjs.
 */`
    : `/**
 * OpenRally Dedicated Multiplayer Server Version
 * Single source of truth for server build identity and client handshake verification.
 *
 * NOTE: Synchronized automatically with package.json and src/config/version.ts via scripts/bumpVersion.mjs.
 */`;

  const content = `${banner}
export const ${constantName} = '${newVersion}';

/**
 * Protocol version for binary/JSON network packets.
 * Mismatched protocol versions reject client connections with VERSION_MISMATCH.
 */
export const PROTOCOL_VERSION = '${protocolVersion}';
`;

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[bumpVersion] Generated ${path.relative(ROOT_DIR, filePath)} with ${constantName} = '${newVersion}'`);
}

function main() {
  const args = process.argv.slice(2);
  const bumpArg = args[0];

  if (!bumpArg) {
    console.error('Usage: node scripts/bumpVersion.mjs <patch|minor|major|x.y.z>');
    process.exit(1);
  }

  const rootPkg = JSON.parse(fs.readFileSync(ROOT_PKG_PATH, 'utf-8'));
  const currentVersion = rootPkg.version || '1.0.0';

  const newVersion = computeTargetVersion(currentVersion, bumpArg);
  const parsedNew = parseSemVer(newVersion);
  const protocolVersion = `${parsedNew.major}.${parsedNew.minor}`;

  console.log(`\n=== OpenRally Version Synchronization ===`);
  console.log(`Current Version:  ${currentVersion}`);
  console.log(`Target Version:   ${newVersion}`);
  console.log(`Protocol Version: ${protocolVersion}\n`);

  // 1. Root package.json
  updateJsonFile(ROOT_PKG_PATH, newVersion);

  // 2. Server package.json
  updateJsonFile(SERVER_PKG_PATH, newVersion);

  // 3. Client version constant
  updateTsVersionFile(CLIENT_VERSION_FILE, 'GAME_VERSION', newVersion, protocolVersion);

  // 4. Server version constant
  updateTsVersionFile(SERVER_VERSION_FILE, 'SERVER_VERSION', newVersion, protocolVersion);

  console.log(`\n✓ Version ${newVersion} synchronized successfully across all packages and engine modules.\n`);
}

main();
