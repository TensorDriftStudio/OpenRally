/**
 * OpenRally Dedicated Multiplayer Server Version
 * Single source of truth for server build identity and client handshake verification.
 *
 * NOTE: Synchronized automatically with package.json and src/config/version.ts via scripts/bumpVersion.mjs.
 */
export const SERVER_VERSION = '1.2.0';

/**
 * Protocol version for binary/JSON network packets.
 * Mismatched protocol versions reject client connections with VERSION_MISMATCH.
 */
export const PROTOCOL_VERSION = '1.2';
