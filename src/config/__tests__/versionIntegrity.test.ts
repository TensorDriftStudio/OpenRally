import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GAME_VERSION, PROTOCOL_VERSION } from '../version';
import { SERVER_VERSION, PROTOCOL_VERSION as SERVER_PROTOCOL } from '../../../server/src/version';

describe('Version Integrity System', () => {
  const rootPkgPath = path.resolve(__dirname, '../../../package.json');
  const serverPkgPath = path.resolve(__dirname, '../../../server/package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf-8'));

  it('verifies GAME_VERSION adheres strictly to Semantic Versioning (SemVer)', () => {
    const semVerRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
    expect(GAME_VERSION).toMatch(semVerRegex);
    expect(SERVER_VERSION).toMatch(semVerRegex);
  });

  it('verifies PROTOCOL_VERSION adheres to major.minor format', () => {
    const protoRegex = /^\d+\.\d+$/;
    expect(PROTOCOL_VERSION).toMatch(protoRegex);
    expect(SERVER_PROTOCOL).toMatch(protoRegex);
  });

  it('guarantees client GAME_VERSION matches root package.json.version', () => {
    expect(GAME_VERSION).toBe(rootPkg.version);
  });

  it('guarantees server SERVER_VERSION matches server/package.json.version', () => {
    expect(SERVER_VERSION).toBe(serverPkg.version);
  });

  it('guarantees strict parity between client GAME_VERSION and server SERVER_VERSION', () => {
    expect(GAME_VERSION).toBe(SERVER_VERSION);
    expect(PROTOCOL_VERSION).toBe(SERVER_PROTOCOL);
  });

  it('ensures bumpVersion.mjs script exists and contains bump commands', () => {
    const bumpScriptPath = path.resolve(__dirname, '../../../scripts/bumpVersion.mjs');
    expect(fs.existsSync(bumpScriptPath)).toBe(true);

    expect(rootPkg.scripts['version:patch']).toBeDefined();
    expect(rootPkg.scripts['version:minor']).toBeDefined();
    expect(rootPkg.scripts['version:major']).toBeDefined();
  });
});
