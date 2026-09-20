/**
 * OpenRally Game Engine Version
 * Single source of truth for UI badges, telemetry payloads, diagnostics, and multiplayer handshakes.
 *
 * NOTE: Synchronized automatically with package.json and server/src/version.ts via scripts/bumpVersion.mjs.
 */
export const GAME_VERSION = '1.1.0';

/**
 * Protocol version for binary/JSON network packets.
 * Mismatched protocol versions reject client connections with VERSION_MISMATCH.
 */
export const PROTOCOL_VERSION = '1.1';
