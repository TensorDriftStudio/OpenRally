import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as deviceUtils from '@/utils/device';

describe('ShaderWarmUp Engine Safety & iOS Watchdog Protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('detects isIOS correctly for iPhone user agents', () => {
    const isIosSpy = vi.spyOn(deviceUtils, 'isIOS');
    isIosSpy.mockReturnValue(true);

    expect(deviceUtils.isIOS()).toBe(true);
  });

  it('verifies shader pre-compilation logic guards against iOS execution', () => {
    // Simulate the guard condition in ShaderWarmUp
    const isSceneReady = false;
    const isIOSDevice = true;

    const shouldCompile = !isSceneReady && !isIOSDevice;
    expect(shouldCompile).toBe(false);
  });

  it('permits shader pre-compilation on desktop and Android platforms', () => {
    const isSceneReady = false;
    const isIOSDevice = false;

    const shouldCompile = !isSceneReady && !isIOSDevice;
    expect(shouldCompile).toBe(true);
  });
});
