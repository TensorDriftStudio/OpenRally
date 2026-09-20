import { useEffect, useRef, useState, memo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getLastInputType, isTouchDevice, type InputType } from '@/utils/input/touch';

interface RpmTick {
  key: number;
  deg: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isMajor: boolean;
  isRedline: boolean;
}

// Precomputed RPM ticks (0 - 8,000 RPM across a 270° arc) to avoid per-render GC pressure
const RPM_TICKS: RpmTick[] = (() => {
  const ticks: RpmTick[] = [];
  const cx = 170;
  const cy = 88;
  const totalTicks = 16; // Major every 1,000 RPM, minor every 500 RPM

  for (let i = 0; i <= totalTicks; i++) {
    const isMajor = i % 2 === 0;
    const rpmValue = i / 2; // 0, 0.5, 1, 1.5 ... 8
    const deg = 135 + i * (270 / totalTicks); // 135° to 405° (45°)
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rOuter = 66;
    const rInner = isMajor ? 58 : 62;
    const isRedline = rpmValue >= 6.5;

    ticks.push({
      key: i,
      deg,
      x1: cx + rOuter * cos,
      y1: cy + rOuter * sin,
      x2: cx + rInner * cos,
      y2: cy + rInner * sin,
      isMajor,
      isRedline,
    });
  }
  return ticks;
})();

const ARC_CIRCUMFERENCE = 402.12; // 2 * Math.PI * 64
const ARC_LENGTH = 301.6; // 270° span of radius 64

/**
 * Modern Forza Horizon & The Crew inspired HUD Instrument Cluster.
 * Features an unobtrusive floating glassmorphism dial, sweeping progressive dynamic RPM arc,
 * bold central digital speedometer, sleek motorsport gear indicator, and integrated ABS/TCS/ESP annunciators.
 * Uses transient Zustand store updates for 0 React re-renders during 60/120 FPS gameplay.
 */
export const AnalogGauges = memo(function AnalogGauges() {
  const gameState = useGameStore((s) => s.gameState);
  const storeTransmission = useSettingsStore((s) => s.transmissionMode);
  const transmissionMode = useSettingsStore.getState().transmissionMode ?? storeTransmission;
  const storeTouchControlMode = useSettingsStore((s) => s.touchControlMode);
  const touchControlMode = useSettingsStore.getState().touchControlMode ?? storeTouchControlMode;
  const [activeInputType, setActiveInputType] = useState<InputType>(() => getLastInputType());
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768 || window.innerHeight < 520;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768 || window.innerHeight < 520);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleInputSwitch = (e?: Event) => {
      if (e && 'detail' in e && typeof (e as CustomEvent).detail?.modality === 'string') {
        setActiveInputType((e as CustomEvent).detail.modality);
      } else {
        setActiveInputType(getLastInputType());
      }
    };
    window.addEventListener('pointerdown', handleInputSwitch, { passive: true });
    window.addEventListener('touchstart', handleInputSwitch, { passive: true });
    window.addEventListener('keydown', handleInputSwitch, { passive: true });
    window.addEventListener('openrally-input-switch', handleInputSwitch as EventListener);
    return () => {
      window.removeEventListener('pointerdown', handleInputSwitch);
      window.removeEventListener('touchstart', handleInputSwitch);
      window.removeEventListener('keydown', handleInputSwitch);
      window.removeEventListener('openrally-input-switch', handleInputSwitch as EventListener);
    };
  }, []);

  const effectiveInputType = getLastInputType() || activeInputType;
  const isTouchActive =
    touchControlMode === 'always' ||
    (touchControlMode === 'auto' &&
      (effectiveInputType === 'touch' || isTouchDevice()) &&
      effectiveInputType !== 'keyboard' &&
      effectiveInputType !== 'gamepad');

  const isMobile = isTouchActive || isMobileScreen;

  const speedTextRef = useRef<HTMLSpanElement>(null);
  const gearTextRef = useRef<HTMLSpanElement>(null);
  const rpmArcRef = useRef<SVGCircleElement>(null);
  const rpmNeedleRef = useRef<SVGGElement>(null);
  const speedNeedleRef = useRef<SVGGElement>(null);
  const shiftLightRef = useRef<SVGCircleElement>(null);
  const absIndicatorRef = useRef<HTMLSpanElement>(null);
  const tcsIndicatorRef = useRef<HTMLSpanElement>(null);
  const espIndicatorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const updateGameHUD = (state: ReturnType<typeof useGameStore.getState>) => {
      // 1. Digital Speed Readout
      if (speedTextRef.current) {
        speedTextRef.current.innerText = state.speed.toString();
      }

      // 2. Motorsport Gear Indicator
      if (gearTextRef.current) {
        let gearText = 'N';
        if (state.gear === -1) gearText = 'R';
        else if (state.gear > 0) gearText = state.gear.toString();
        gearTextRef.current.innerText = gearText;

        if (state.gear === -1) {
          gearTextRef.current.style.color = '#ef4444';
          gearTextRef.current.style.textShadow = '0 0 10px rgba(239, 68, 68, 0.8)';
        } else if (state.gear === 0) {
          gearTextRef.current.style.color = '#94a3b8';
          gearTextRef.current.style.textShadow = 'none';
        } else {
          gearTextRef.current.style.color = '#fbbf24';
          gearTextRef.current.style.textShadow = '0 0 8px rgba(251, 191, 36, 0.6)';
        }
      }

      // 3. Sweeping Tachometer Arc & Needle Pointer
      const maxRpm = 8000;
      const rpmFraction = Math.min(Math.max(0, state.rpm / maxRpm), 1);
      const rpmAngle = -135 + rpmFraction * 270;

      if (rpmArcRef.current) {
        const offset = ARC_LENGTH * (1 - rpmFraction);
        rpmArcRef.current.style.strokeDashoffset = offset.toFixed(1);
      }

      if (rpmNeedleRef.current) {
        rpmNeedleRef.current.setAttribute('transform', `rotate(${rpmAngle} 170 88)`);
      }

      // 4. Subtle Speedometer Needle Accent
      const maxSpeed = 240;
      const speedFraction = Math.min(Math.max(0, state.speed / maxSpeed), 1);
      const speedAngle = -135 + speedFraction * 270;
      if (speedNeedleRef.current) {
        speedNeedleRef.current.setAttribute('transform', `rotate(${speedAngle} 170 88)`);
      }

      // 5. Forza Style Shift Light Halo Pulse
      if (shiftLightRef.current) {
        const isShiftWarning = state.rpm >= 6800;
        shiftLightRef.current.style.opacity = isShiftWarning ? '1' : '0';
        shiftLightRef.current.style.filter = isShiftWarning
          ? 'drop-shadow(0 0 14px #ff1e1e)'
          : 'none';
      }

      // 6. Driving Assists Annunciators (ABS, TCS, ESP)
      const { absEnabled, tcsEnabled, espEnabled } = useSettingsStore.getState();

      if (absIndicatorRef.current) {
        if (!absEnabled) {
          absIndicatorRef.current.style.color = '#ef4444';
          absIndicatorRef.current.style.background = 'rgba(239, 68, 68, 0.15)';
          absIndicatorRef.current.style.borderColor = 'rgba(239, 68, 68, 0.45)';
          absIndicatorRef.current.style.opacity = '0.7';
          absIndicatorRef.current.style.boxShadow = 'none';
        } else if (state.absActive) {
          absIndicatorRef.current.style.color = '#fbbf24';
          absIndicatorRef.current.style.background = 'rgba(245, 158, 11, 0.28)';
          absIndicatorRef.current.style.borderColor = '#f59e0b';
          absIndicatorRef.current.style.opacity = '1.0';
          absIndicatorRef.current.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.75)';
        } else {
          absIndicatorRef.current.style.color = '#64748b';
          absIndicatorRef.current.style.background = 'rgba(255, 255, 255, 0.03)';
          absIndicatorRef.current.style.borderColor = 'rgba(148, 163, 184, 0.12)';
          absIndicatorRef.current.style.opacity = '0.35';
          absIndicatorRef.current.style.boxShadow = 'none';
        }
      }

      if (tcsIndicatorRef.current) {
        if (!tcsEnabled) {
          tcsIndicatorRef.current.style.color = '#ef4444';
          tcsIndicatorRef.current.style.background = 'rgba(239, 68, 68, 0.15)';
          tcsIndicatorRef.current.style.borderColor = 'rgba(239, 68, 68, 0.45)';
          tcsIndicatorRef.current.style.opacity = '0.7';
          tcsIndicatorRef.current.style.boxShadow = 'none';
        } else if (state.tcsActive) {
          tcsIndicatorRef.current.style.color = '#fbbf24';
          tcsIndicatorRef.current.style.background = 'rgba(245, 158, 11, 0.28)';
          tcsIndicatorRef.current.style.borderColor = '#f59e0b';
          tcsIndicatorRef.current.style.opacity = '1.0';
          tcsIndicatorRef.current.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.75)';
        } else {
          tcsIndicatorRef.current.style.color = '#64748b';
          tcsIndicatorRef.current.style.background = 'rgba(255, 255, 255, 0.03)';
          tcsIndicatorRef.current.style.borderColor = 'rgba(148, 163, 184, 0.12)';
          tcsIndicatorRef.current.style.opacity = '0.35';
          tcsIndicatorRef.current.style.boxShadow = 'none';
        }
      }

      if (espIndicatorRef.current) {
        if (!espEnabled) {
          espIndicatorRef.current.style.color = '#ef4444';
          espIndicatorRef.current.style.background = 'rgba(239, 68, 68, 0.15)';
          espIndicatorRef.current.style.borderColor = 'rgba(239, 68, 68, 0.45)';
          espIndicatorRef.current.style.opacity = '0.7';
          espIndicatorRef.current.style.boxShadow = 'none';
        } else if (state.espActive) {
          espIndicatorRef.current.style.color = '#38bdf8';
          espIndicatorRef.current.style.background = 'rgba(56, 189, 248, 0.28)';
          espIndicatorRef.current.style.borderColor = '#0284c7';
          espIndicatorRef.current.style.opacity = '1.0';
          espIndicatorRef.current.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.75)';
        } else {
          espIndicatorRef.current.style.color = '#64748b';
          espIndicatorRef.current.style.background = 'rgba(255, 255, 255, 0.03)';
          espIndicatorRef.current.style.borderColor = 'rgba(148, 163, 184, 0.12)';
          espIndicatorRef.current.style.opacity = '0.35';
          espIndicatorRef.current.style.boxShadow = 'none';
        }
      }
    };

    updateGameHUD(useGameStore.getState());
    const unsubGame = useGameStore.subscribe(updateGameHUD);

    return () => unsubGame();
  }, [gameState]);

  const clusterStyle: React.CSSProperties = {
    ...styles.rallyCluster,
    ...(isMobile
      ? {
          left: 'calc(16px + var(--sal, 0px))',
          top: 'calc(68px + var(--sat, 0px))',
          bottom: 'auto',
          right: 'auto',
          transform: 'scale(0.60)',
          transformOrigin: 'top left',
        }
      : {
          bottom: 'calc(20px + var(--sab))',
          right: 'calc(20px + var(--sar))',
          left: 'auto',
          top: 'auto',
          transform: 'none',
        }),
  };

  return (
    <div id="rally-cluster" style={clusterStyle}>
      <svg viewBox="0 0 340 175" style={styles.clusterSvg}>
        <defs>
          {/* Forza Sweeping Multi-Stop Tachometer Arc Gradient */}
          <linearGradient id="forzaRpmGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#38bdf8" />
            <stop offset="70%" stopColor="#fbbf24" />
            <stop offset="85%" stopColor="#f59e0b" />
            <stop offset="92%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>

          {/* Unobtrusive Dark Glass Radial Backdrop */}
          <radialGradient id="dialGlassBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(15, 23, 42, 0.72)" />
            <stop offset="75%" stopColor="rgba(10, 15, 26, 0.85)" />
            <stop offset="100%" stopColor="rgba(7, 10, 18, 0.94)" />
          </radialGradient>

          {/* Subtle Shift Glow Filter */}
          <filter id="shiftHaloGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ─── Floating Circular Instrument Disc (Unobtrusive & Clean) ─── */}
        <circle
          cx="170"
          cy="88"
          r="77"
          fill="url(#dialGlassBg)"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1.5"
        />
        <circle
          cx="170"
          cy="88"
          r="75"
          fill="none"
          stroke="rgba(56, 189, 248, 0.10)"
          strokeWidth="1"
        />

        {/* ─── Luminous Shift Light Perimeter Halo Pulse (Flashing Red at Redline) ─── */}
        <circle
          ref={shiftLightRef}
          cx="170"
          cy="88"
          r="77"
          fill="none"
          stroke="#ef4444"
          strokeWidth="3.5"
          filter="url(#shiftHaloGlow)"
          opacity="0"
          style={{ transition: 'opacity 0.08s ease-out' }}
        />

        {/* ─── Tachometer Background Track Arc (270° from 135° to 405°) ─── */}
        <circle
          cx="170"
          cy="88"
          r="64"
          fill="none"
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth="5"
          strokeDasharray={`${ARC_LENGTH} ${ARC_CIRCUMFERENCE}`}
          transform="rotate(135 170 88)"
        />

        {/* ─── Dynamic Sweeping Progressive RPM Arc ─── */}
        <circle
          ref={rpmArcRef}
          cx="170"
          cy="88"
          r="64"
          fill="none"
          stroke="url(#forzaRpmGrad)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${ARC_CIRCUMFERENCE}`}
          strokeDashoffset={ARC_LENGTH}
          transform="rotate(135 170 88)"
        />

        {/* ─── Precomputed RPM Graduation Ticks ─── */}
        {RPM_TICKS.map((tick) => (
          <line
            key={tick.key}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.isRedline ? '#ef4444' : tick.isMajor ? '#f8fafc' : 'rgba(255, 255, 255, 0.25)'}
            strokeWidth={tick.isMajor ? 2 : 1}
          />
        ))}

        {/* ─── Luminous RPM Cursor Needle Tip ─── */}
        <g ref={rpmNeedleRef} transform="rotate(-135 170 88)">
          <line
            x1="170"
            y1="34"
            x2="170"
            y2="23"
            stroke="#38bdf8"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="170" cy="24" r="2.2" fill="#ffffff" />
        </g>

        {/* ─── Subtle Speed Needle Arc Accent ─── */}
        <g ref={speedNeedleRef} transform="rotate(-135 170 88)" opacity="0.25">
          <circle cx="170" cy="18" r="1.8" fill="#38bdf8" />
        </g>
      </svg>

      {/* ─── Central Unified Instrument Stack (Prevents Any Element Collisions) ─── */}
      <div style={styles.centerStack}>
        {/* Motorsport Gear & Transmission Indicator */}
        <div style={styles.gearRow}>
          <span ref={gearTextRef} style={styles.gearText}>N</span>
          <span style={styles.gearSubLabel}>
            {transmissionMode === 'manual' ? 'MANUAL' : 'AUTO'}
          </span>
        </div>

        {/* Central Digital Speedometer & Unit Readout */}
        <span ref={speedTextRef} style={styles.speedNumber}>0</span>
        <span style={styles.speedUnit}>KM/H</span>

        {/* Driving Assists Annunciator Bar (ABS, TCS, ESP) */}
        <div style={styles.assistsContainer}>
          <span ref={absIndicatorRef} style={styles.assistPill}>ABS</span>
          <span ref={tcsIndicatorRef} style={styles.assistPill}>TCS</span>
          <span ref={espIndicatorRef} style={styles.assistPill}>ESP</span>
        </div>
      </div>
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  rallyCluster: {
    position: 'absolute',
    bottom: 'calc(20px + var(--sab))',
    right: 'calc(20px + var(--sar))',
    width: '340px',
    height: '175px',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  clusterSvg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    filter: 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.75))',
  },
  centerStack: {
    position: 'absolute',
    left: '100px',
    top: '36px',
    width: '140px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 2,
  },
  gearRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '2px',
  },
  gearText: {
    fontSize: '19px',
    fontWeight: 900,
    color: '#fbbf24',
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    lineHeight: 1,
    textShadow: '0 0 8px rgba(251, 191, 36, 0.6)',
    transition: 'color 0.15s ease, text-shadow 0.15s ease',
  },
  gearSubLabel: {
    fontSize: '7px',
    fontWeight: 800,
    color: '#64748b',
    letterSpacing: '1.2px',
    marginTop: '1px',
    textTransform: 'uppercase',
    lineHeight: 1,
  },
  speedNumber: {
    fontSize: '38px',
    fontWeight: 900,
    fontStyle: 'italic',
    color: '#ffffff',
    fontFamily: "'Rajdhani', 'Segoe UI', Impact, sans-serif",
    lineHeight: 0.85,
    letterSpacing: '-1px',
    textShadow: '0 2px 14px rgba(0, 0, 0, 0.95)',
  },
  speedUnit: {
    fontSize: '9px',
    fontWeight: 900,
    color: '#38bdf8',
    letterSpacing: '2.5px',
    marginTop: '3px',
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    textShadow: '0 0 8px rgba(56, 189, 248, 0.6)',
    lineHeight: 1,
  },
  assistsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    marginTop: '7px',
  },
  assistPill: {
    fontSize: '7.5px',
    fontWeight: 900,
    letterSpacing: '0.8px',
    fontFamily: "'Segoe UI', Roboto, monospace",
    padding: '1.5px 4px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    color: '#64748b',
    opacity: 0.35,
    lineHeight: 1,
    transition: 'color 0.1s ease, background 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease, opacity 0.1s ease',
  },
};

