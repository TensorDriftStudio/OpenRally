import { describe, it, expect, beforeEach } from 'vitest';
import { parseServerMessage } from '../packetValidator';
import { useMultiplayerStore } from '@/store/multiplayerStore';
import { GAME_VERSION } from '@/config/version';

describe('Multiplayer Version Handshake & Compatibility Enforcement', () => {
  beforeEach(() => {
    useMultiplayerStore.getState().reset();
  });

  it('correctly decodes and validates version_mismatch packets from server', () => {
    const rawPacket = {
      type: 'version_mismatch',
      serverVersion: '1.2.0',
      clientVersion: '1.1.0',
      message: 'Server version 1.2.0 is incompatible with client 1.1.0. Please update your game.',
    };

    const parsed = parseServerMessage(rawPacket);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('version_mismatch');

    if (parsed?.type === 'version_mismatch') {
      expect(parsed.serverVersion).toBe('1.2.0');
      expect(parsed.clientVersion).toBe('1.1.0');
      expect(parsed.message).toContain('Server version 1.2.0');
    }
  });

  it('sets version_mismatch state in useMultiplayerStore', () => {
    const store = useMultiplayerStore.getState();
    expect(store.status).toBe('disconnected');
    expect(store.versionMismatch).toBeNull();

    store.setStatus('version_mismatch');
    store.setVersionMismatch({
      serverVersion: '1.2.0',
      clientVersion: GAME_VERSION,
    });
    store.setError('Game update required');

    const updated = useMultiplayerStore.getState();
    expect(updated.status).toBe('version_mismatch');
    expect(updated.versionMismatch).toEqual({
      serverVersion: '1.2.0',
      clientVersion: GAME_VERSION,
    });
    expect(updated.error).toBe('Game update required');
  });

  it('clears versionMismatch on store reset', () => {
    const store = useMultiplayerStore.getState();
    store.setStatus('version_mismatch');
    store.setVersionMismatch({ serverVersion: '1.2.0', clientVersion: '1.1.0' });

    store.reset();
    const clean = useMultiplayerStore.getState();
    expect(clean.status).toBe('disconnected');
    expect(clean.versionMismatch).toBeNull();
  });
});
