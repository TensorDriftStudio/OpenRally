/**
 * Device detection and DPI scaling utilities for OpenRally.
 */

/**
 * Detects whether the current client is running on Android.
 * Evaluates Capacitor native platform ('android') and navigator.userAgent.
 * Safe for SSR and headless environments.
 */
export function isAndroid(): boolean {
  // 1. Capacitor native app runtime check
  if (typeof window !== 'undefined') {
    const anyWindow = window as unknown as {
      Capacitor?: { getPlatform?: () => string };
    };
    if (anyWindow.Capacitor?.getPlatform?.() === 'android') {
      return true;
    }
  }

  // 2. Android user-agent matching
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    if (/Android/i.test(navigator.userAgent)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects whether the current client is a mobile device or touch-first mobile environment.
 * Evaluates Capacitor native runtime, user-agent strings, and pointer/viewport media queries.
 */
export function isMobileDevice(): boolean {
  // 1. Capacitor native app runtime check
  if (typeof window !== 'undefined') {
    const anyWindow = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    };
    if (anyWindow.Capacitor?.isNativePlatform?.() || anyWindow.Capacitor?.getPlatform?.() === 'android') {
      return true;
    }
  }

  // 2. Mobile user-agent matching (Android, iOS, iPadOS)
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent;
    if (/Android|iPhone|iPad|iPod/i.test(ua)) {
      return true;
    }
  }

  // 3. Touch-first coarse pointer with mobile-scale viewport (avoids false-positive on desktop touchscreens)
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    typeof window.innerWidth === 'number' &&
    typeof window.innerHeight === 'number' &&
    Math.min(window.innerWidth, window.innerHeight) <= 600
  ) {
    return true;
  }

  return false;
}

/**
 * Mobile DPR ceiling:
 * On ultra-dense mobile displays (e.g. Google Pixel 10 Pro at 1344x2992, DPR 3.0-3.5),
 * uncapped rendering demands over 4 Megapixels per pass plus post-processing shaders,
 * triggering severe GPU thermal throttling within 60-90 seconds.
 * Clamping to 1.75 yields ~1.37 MP (~284 effective PPI), perfectly balancing retina clarity
 * with sustained 60 FPS performance.
 */
export const MOBILE_MAX_DPR = 1.75;
export const DESKTOP_MAX_DPR = 2.0;

/**
 * Maximum rendered pixel ceilings to protect GPU fill-rate and memory bandwidth:
 * - Mobile: ~2.15 Megapixels (~1080p, prevents thermal throttling on 1440p+ phones)
 * - Desktop High: ~3.7 Megapixels (~1440p, protects integrated GPUs and laptops)
 * - Desktop Very High: ~8.3 Megapixels (4K UHD)
 */
export const MOBILE_MAX_PIXELS = 2_150_000;
export const DESKTOP_HIGH_MAX_PIXELS = 3_700_000;
export const DESKTOP_VERY_HIGH_MAX_PIXELS = 8_300_000;

export interface DprCalculationParams {
  windowDpr?: number;
  graphicsQuality: 'low' | 'medium' | 'high' | 'very_high';
  resolutionScale?: number;
  isMobile?: boolean;
  dynamicResolution?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface DprCalculationResult {
  baseDpr: number;
  qualityMaxDpr: number;
  targetDpr: number;
  dprTuple: [number, number];
}

/**
 * Computes the target DPR and the [minDpr, maxDpr] tuple for R3F Canvas.
 */
export function calculateDprConfig({
  windowDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  graphicsQuality,
  resolutionScale = 1.0,
  isMobile = isMobileDevice(),
  dynamicResolution = true,
  viewportWidth,
  viewportHeight,
}: DprCalculationParams): DprCalculationResult {
  const safeBase = Number.isFinite(windowDpr) && windowDpr > 0 ? windowDpr : 1.0;
  const maxCap = isMobile ? MOBILE_MAX_DPR : DESKTOP_MAX_DPR;

  // Clamp base DPR to device ceiling
  const baseDpr = Math.min(safeBase, maxCap);

  // Determine quality ceiling
  const qualityMaxDpr =
    graphicsQuality === 'very_high'
      ? maxCap
      : graphicsQuality === 'high'
      ? Math.min(1.5, maxCap)
      : graphicsQuality === 'medium'
      ? 1.0
      : 0.75;

  const clampedResolutionScale = Math.max(0.5, Math.min(2.0, resolutionScale));

  // Calculate raw target DPR
  const rawTarget = Math.min(baseDpr, qualityMaxDpr) * clampedResolutionScale;

  // On mobile, guarantee the target DPR never breaches the thermal ceiling even with super-sampling
  let clampedTargetDpr = isMobile ? Math.min(rawTarget, MOBILE_MAX_DPR) : rawTarget;

  // Clamp target DPR by maximum rendered pixel count to avoid GPU fill-rate exhaustion on 4K/QHD displays
  const vpWidth = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : undefined);
  const vpHeight = viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : undefined);

  if (vpWidth && vpHeight && Number.isFinite(vpWidth) && Number.isFinite(vpHeight) && vpWidth > 0 && vpHeight > 0) {
    const maxPixels = isMobile
      ? MOBILE_MAX_PIXELS
      : graphicsQuality === 'very_high'
      ? DESKTOP_VERY_HIGH_MAX_PIXELS
      : DESKTOP_HIGH_MAX_PIXELS;

    const currentPixels = vpWidth * vpHeight * clampedTargetDpr * clampedTargetDpr;
    if (currentPixels > maxPixels) {
      const pixelCapDpr = Math.sqrt(maxPixels / (vpWidth * vpHeight));
      clampedTargetDpr = Math.min(clampedTargetDpr, pixelCapDpr);
    }
  }

  const targetDpr = clampedTargetDpr;

  // Dynamic range for R3F AdaptiveDpr / performance regression
  const minDpr = dynamicResolution ? Math.min(0.5 * clampedResolutionScale, targetDpr) : targetDpr;
  const maxDpr = dynamicResolution ? Math.max(0.5, targetDpr) : targetDpr;

  return {
    baseDpr,
    qualityMaxDpr,
    targetDpr,
    dprTuple: [minDpr, maxDpr],
  };
}

/**
 * Direct calculation helper compatible with contracts / unit tests.
 */
export function calculateTargetDpr(
  baseDpr: number,
  graphicsQuality: 'very_high' | 'high' | 'medium' | 'low',
  resolutionScale: number = 1.0,
  isMobile: boolean = true
): { targetDpr: number; dprRange: [number, number] } {
  const res = calculateDprConfig({
    windowDpr: baseDpr,
    graphicsQuality,
    resolutionScale,
    isMobile,
  });
  return {
    targetDpr: res.targetDpr,
    dprRange: res.dprTuple,
  };
}

/**
 * Texture anisotropy clamping utility for mobile GPU fill-rate optimization.
 * Clamps texture anisotropy to <= 2 on mobile devices (e.g. Google Pixel 10 Pro)
 * to alleviate tile-based deferred rendering (TBDR) memory bandwidth and fill-rate limits,
 * while preserving full desktop/Steam graphical fidelity (up to 16x).
 *
 * Handles degenerate/non-finite inputs safely by falling back to 1 (isotropic filtering).
 *
 * @param baseAnisotropy - Desired base anisotropic filtering level (e.g. 16, 8, 4).
 * @param isMobile - Whether the device is mobile (defaults to isMobileDevice()).
 * @returns Clamped anisotropy level (<= 2 on mobile, baseAnisotropy on desktop).
 */
export function getClampedAnisotropy(
  baseAnisotropy: number,
  isMobile: boolean = isMobileDevice()
): number {
  if (!Number.isFinite(baseAnisotropy) || baseAnisotropy < 1) {
    return 1;
  }
  return isMobile ? Math.min(baseAnisotropy, 2) : baseAnisotropy;
}

/**
 * Detects whether the current environment is a mobile device or running on Android.
 * Enforces mobile-safe WebGL features (such as BasicShadowMap with NearestFilter DepthTexture)
 * to strictly adhere to mobile OpenGL ES 3.0 driver limitations.
 */
export function isMobileOrAndroid(): boolean {
  return isMobileDevice() || isAndroid();
}

