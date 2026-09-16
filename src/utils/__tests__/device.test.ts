import { describe, it, expect, afterEach } from 'vitest';
import {
  isAndroid,
  isMobileDevice,
  isMobileOrAndroid,
  calculateDprConfig,
  calculateTargetDpr,
  MOBILE_MAX_DPR,
  DESKTOP_MAX_DPR,
  MOBILE_MAX_PIXELS,
  DESKTOP_HIGH_MAX_PIXELS,
  DESKTOP_VERY_HIGH_MAX_PIXELS,
  getClampedAnisotropy,
} from '../device';

describe('Device Detection & DPR Scaling', () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  describe('isAndroid', () => {
    it('detects Capacitor native android platform', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          Capacitor: {
            getPlatform: () => 'android',
          },
        },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(true);
    });

    it('returns false for Capacitor iOS or web platform', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          Capacitor: {
            getPlatform: () => 'ios',
          },
        },
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('detects Android user agents (e.g. Pixel 10 Pro)', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) AppleWebKit/537.36' },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(true);
    });

    it('detects generic lowercase android user agents', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'mozilla/5.0 (linux; u; android 14; en-us)' },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(true);
    });

    it('returns false for iPhone / iOS user agents', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('returns false for desktop browsers', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0' },
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(false);
    });

    it('safely handles missing Capacitor or navigator in SSR / headless mode', () => {
      Object.defineProperty(globalThis, 'window', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      expect(isAndroid()).toBe(false);
    });
  });

  describe('isMobileDevice', () => {
    it('detects Android user agents as mobile', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) AppleWebKit/537.36' },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('detects iPhone user agents as mobile', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('detects iPad / iPod user agents as mobile', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)' },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('returns false for standard desktop browsers', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0' },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('detects Capacitor native platform runtime', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Custom WebView)' },
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'window', {
        value: {
          Capacitor: {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
          },
        },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('detects mobile touch pointer with compact screen dimension', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'GenericBrowser/1.0' },
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'window', {
        value: {
          innerWidth: 448,
          innerHeight: 997,
          matchMedia: (query: string) => ({
            matches: query === '(pointer: coarse)',
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          }),
        },
        configurable: true,
        writable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });
  });

  describe('calculateDprConfig on Google Pixel 10 Pro (DPR = 3.0, isMobile = true)', () => {
    const pixelDpr = 3.0;

    it('caps very_high quality to 1.75 on mobile', () => {
      const config = calculateDprConfig({
        windowDpr: pixelDpr,
        graphicsQuality: 'very_high',
        resolutionScale: 1.0,
        isMobile: true,
      });
      expect(config.baseDpr).toBe(MOBILE_MAX_DPR);
      expect(config.targetDpr).toBe(1.75);
      expect(config.dprTuple).toEqual([0.5, 1.75]);
    });

    it('caps high quality to 1.50 on mobile', () => {
      const config = calculateDprConfig({
        windowDpr: pixelDpr,
        graphicsQuality: 'high',
        resolutionScale: 1.0,
        isMobile: true,
      });
      expect(config.targetDpr).toBe(1.5);
      expect(config.dprTuple).toEqual([0.5, 1.5]);
    });

    it('scales correctly for medium quality (1.00)', () => {
      const config = calculateDprConfig({
        windowDpr: pixelDpr,
        graphicsQuality: 'medium',
        resolutionScale: 1.0,
        isMobile: true,
      });
      expect(config.targetDpr).toBe(1.0);
      expect(config.dprTuple).toEqual([0.5, 1.0]);
    });

    it('scales correctly for low quality (0.75)', () => {
      const config = calculateDprConfig({
        windowDpr: pixelDpr,
        graphicsQuality: 'low',
        resolutionScale: 1.0,
        isMobile: true,
      });
      expect(config.targetDpr).toBe(0.75);
      expect(config.dprTuple).toEqual([0.5, 0.75]);
    });

    it('prevents resolutionScale from exceeding mobile thermal cap', () => {
      const config = calculateDprConfig({
        windowDpr: pixelDpr,
        graphicsQuality: 'very_high',
        resolutionScale: 1.5, // 150% super sampling
        isMobile: true,
      });
      expect(config.targetDpr).toBeLessThanOrEqual(MOBILE_MAX_DPR);
      expect(config.targetDpr).toBe(1.75);
    });

    it('handles extreme devicePixelRatio (e.g. 3.5) safely', () => {
      const config = calculateDprConfig({
        windowDpr: 3.5,
        graphicsQuality: 'high',
        resolutionScale: 1.0,
        isMobile: true,
      });
      expect(config.baseDpr).toBe(MOBILE_MAX_DPR);
      expect(config.targetDpr).toBe(1.5);
    });

    it('computes calculateTargetDpr accurately with matching range', () => {
      const res = calculateTargetDpr(3.0, 'very_high', 1.0, true);
      expect(res.targetDpr).toBe(1.75);
      expect(res.dprRange).toEqual([0.5, 1.75]);
    });
  });

  describe('calculateDprConfig on Desktop (isMobile = false)', () => {
    it('allows 2.0 DPR on Desktop with very_high quality', () => {
      const config = calculateDprConfig({
        windowDpr: 2.0,
        graphicsQuality: 'very_high',
        resolutionScale: 1.0,
        isMobile: false,
      });
      expect(config.baseDpr).toBe(DESKTOP_MAX_DPR);
      expect(config.targetDpr).toBe(2.0);
      expect(config.dprTuple).toEqual([0.5, 2.0]);
    });

    it('handles 1080p standard monitor (DPR 1.0) without artificially scaling up', () => {
      const config = calculateDprConfig({
        windowDpr: 1.0,
        graphicsQuality: 'very_high',
        resolutionScale: 1.0,
        isMobile: false,
      });
      expect(config.baseDpr).toBe(1.0);
      expect(config.targetDpr).toBe(1.0);
      expect(config.dprTuple).toEqual([0.5, 1.0]);
    });

    it('always produces a valid [minDpr, maxDpr] tuple where min <= max', () => {
      const scales = [0.5, 0.75, 1.0, 1.25, 1.5];
      const qualities = ['low', 'medium', 'high', 'very_high'] as const;
      for (const res of scales) {
        for (const q of qualities) {
          const config = calculateDprConfig({
            windowDpr: 2.5,
            graphicsQuality: q,
            resolutionScale: res,
            isMobile: false,
          });
          expect(config.dprTuple[0]).toBeLessThanOrEqual(config.dprTuple[1]);
        }
      }
    });

    it('locks dprTuple to [targetDpr, targetDpr] when dynamicResolution is false', () => {
      const config = calculateDprConfig({
        windowDpr: 2.0,
        graphicsQuality: 'high',
        resolutionScale: 1.0,
        isMobile: false,
        dynamicResolution: false,
      });
      expect(config.targetDpr).toBe(1.5);
      expect(config.dprTuple).toEqual([1.5, 1.5]);
    });
  });

  describe('calculateDprConfig Pixel Ceiling Clamping (Fill-Rate Guard)', () => {
    it('clamps mobile DPR to protect against GPU thermal throttling on ultra-high res phones', () => {
      // e.g. 1080x2400 mobile screen at windowDpr 3.0, very_high quality (target would normally be 1.75)
      const vpWidth = 1080;
      const vpHeight = 2400;
      const config = calculateDprConfig({
        windowDpr: 3.0,
        graphicsQuality: 'very_high',
        resolutionScale: 1.0,
        isMobile: true,
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
      });

      const effectivePixels = vpWidth * vpHeight * config.targetDpr * config.targetDpr;
      expect(effectivePixels).toBeLessThanOrEqual(MOBILE_MAX_PIXELS + 1);
      // Math.sqrt(2_150_000 / 2_592_000) ~= 0.9107
      expect(config.targetDpr).toBeCloseTo(Math.sqrt(MOBILE_MAX_PIXELS / (vpWidth * vpHeight)), 3);
    });

    it('clamps desktop 4K screen on high quality to protect desktop GPU fill-rate', () => {
      const vpWidth = 3840;
      const vpHeight = 2160;
      const config = calculateDprConfig({
        windowDpr: 2.0,
        graphicsQuality: 'high',
        resolutionScale: 1.0,
        isMobile: false,
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
      });

      const effectivePixels = vpWidth * vpHeight * config.targetDpr * config.targetDpr;
      expect(effectivePixels).toBeLessThanOrEqual(DESKTOP_HIGH_MAX_PIXELS + 1);
      expect(config.targetDpr).toBeCloseTo(Math.sqrt(DESKTOP_HIGH_MAX_PIXELS / (vpWidth * vpHeight)), 3);
    });

    it('allows 4K UHD rendering on desktop with very_high quality up to DESKTOP_VERY_HIGH_MAX_PIXELS', () => {
      const vpWidth = 3840;
      const vpHeight = 2160;
      const config = calculateDprConfig({
        windowDpr: 1.0,
        graphicsQuality: 'very_high',
        resolutionScale: 1.0,
        isMobile: false,
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
      });

      // 3840 * 2160 * 1.0 = 8.294M <= 8.3M
      expect(config.targetDpr).toBe(1.0);
      const effectivePixels = vpWidth * vpHeight * config.targetDpr * config.targetDpr;
      expect(effectivePixels).toBeLessThanOrEqual(DESKTOP_VERY_HIGH_MAX_PIXELS);
    });

    it('does not artificially clamp standard 1080p desktop monitors', () => {
      const vpWidth = 1920;
      const vpHeight = 1080;
      const config = calculateDprConfig({
        windowDpr: 1.0,
        graphicsQuality: 'high',
        resolutionScale: 1.0,
        isMobile: false,
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
      });

      // 1920 * 1080 * 1.0 = 2.07M, well below 3.7M
      expect(config.targetDpr).toBe(1.0);
    });
  });

  describe('getClampedAnisotropy', () => {
    it('clamps anisotropy to <= 2 on mobile devices across all base values', () => {
      expect(getClampedAnisotropy(16, true)).toBe(2);
      expect(getClampedAnisotropy(8, true)).toBe(2);
      expect(getClampedAnisotropy(4, true)).toBe(2);
      expect(getClampedAnisotropy(2, true)).toBe(2);
      expect(getClampedAnisotropy(1, true)).toBe(1);
    });

    it('preserves full anisotropic filtering fidelity on desktop devices', () => {
      expect(getClampedAnisotropy(16, false)).toBe(16);
      expect(getClampedAnisotropy(8, false)).toBe(8);
      expect(getClampedAnisotropy(2, false)).toBe(2);
      expect(getClampedAnisotropy(1, false)).toBe(1);
    });

    it('safely handles degenerate and non-finite inputs', () => {
      expect(getClampedAnisotropy(0, true)).toBe(1);
      expect(getClampedAnisotropy(-10, false)).toBe(1);
      expect(getClampedAnisotropy(NaN, true)).toBe(1);
      expect(getClampedAnisotropy(Infinity, true)).toBe(1);
    });
  });

  describe('isMobileOrAndroid', () => {
    it('returns true when running on Android (e.g. Pixel 10 Pro)', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) AppleWebKit/537.36' },
        configurable: true,
        writable: true,
      });
      expect(isMobileOrAndroid()).toBe(true);
    });

    it('returns true when running on Capacitor native Android', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          Capacitor: {
            getPlatform: () => 'android',
          },
        },
        configurable: true,
        writable: true,
      });
      expect(isMobileOrAndroid()).toBe(true);
    });

    it('returns true for iPhone or iOS devices', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        configurable: true,
        writable: true,
      });
      expect(isMobileOrAndroid()).toBe(true);
    });

    it('returns false for desktop browsers', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0' },
        configurable: true,
        writable: true,
      });
      expect(isMobileOrAndroid()).toBe(false);
    });
  });
});
