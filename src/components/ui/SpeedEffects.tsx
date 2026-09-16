import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';

interface Streak {
  angle: number;
  distRatio: number; // 0.0 (near center) to 1.0 (screen edge)
  speed: number;
  length: number;
  alpha: number;
}

/**
 * Lightweight, zero-GC visual speed effects overlay.
 * Features dynamic high-speed tunnel-vision vignette and radial wind streaks
 * that activate seamlessly above 80 km/h, providing visceral visual speed feedback.
 *
 * All telemetry updates use direct DOM/canvas refs with 0 React re-renders during gameplay.
 */
export function SpeedEffects() {
  const vignetteRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animId: number | null = null;
    const canvas = canvasRef.current;
    const vignette = vignetteRef.current;
    const ctx = canvas?.getContext('2d') ?? null;

    // Fixed pool of 24 radial speed streak lines
    const NUM_STREAKS = 24;
    const streaks: Streak[] = [];
    for (let i = 0; i < NUM_STREAKS; i++) {
      streaks.push({
        angle: Math.random() * Math.PI * 2,
        distRatio: 0.3 + Math.random() * 0.7,
        speed: 1.2 + Math.random() * 1.6,
        length: 0.08 + Math.random() * 0.14,
        alpha: 0.2 + Math.random() * 0.5,
      });
    }

    let lastTime = performance.now();

    const handleResize = () => {
      if (!canvas) return;
      const w = Math.max(window.innerWidth, document.documentElement.clientWidth || 0);
      const h = Math.max(window.innerHeight, document.documentElement.clientHeight || 0);
      canvas.width = w;
      canvas.height = h;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    const renderLoop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const speed = useGameStore.getState().speed;
      const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;

      // ─── 1. Dynamic Peripheral Tunnel Vignette ───
      // Fades in above 70 km/h, max opacity ~0.42 at 180 km/h
      if (vignette) {
        if (safeSpeed < 70) {
          vignette.style.opacity = '0';
        } else {
          const ratio = Math.min((safeSpeed - 70) / 110, 1.0);
          const opacity = Math.round(ratio * ratio * 0.42 * 100) / 100;
          vignette.style.opacity = `${opacity}`;
        }
      }

      // ─── 2. Radial High-Speed Wind Streaks ───
      if (canvas && ctx) {
        if (safeSpeed < 85) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const speedFactor = Math.min((safeSpeed - 85) / 95, 1.0);
          const maxRadius = Math.hypot(canvas.width, canvas.height) * 0.5;
          const cx = canvas.width * 0.5;
          const cy = canvas.height * 0.52; // slightly biased towards horizon/road

          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';

          for (let i = 0; i < NUM_STREAKS; i++) {
            const s = streaks[i];
            s.distRatio += s.speed * speedFactor * dt * 2.5;

            // Loop back towards inner boundary when reaching screen edge
            if (s.distRatio > 1.05) {
              s.distRatio = 0.35 + Math.random() * 0.2;
              s.angle = Math.random() * Math.PI * 2;
            }

            const rInner = s.distRatio * maxRadius;
            const rOuter = (s.distRatio + s.length * speedFactor) * maxRadius;

            const cosA = Math.cos(s.angle);
            const sinA = Math.sin(s.angle);

            const x1 = cx + cosA * rInner;
            const y1 = cy + sinA * rInner;
            const x2 = cx + cosA * rOuter;
            const y2 = cy + sinA * rOuter;

            const streakAlpha = s.alpha * speedFactor * Math.min(1.0, (s.distRatio - 0.3) * 3);
            ctx.strokeStyle = `rgba(255, 255, 255, ${streakAlpha.toFixed(3)})`;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, []);

  return (
    <div
      className="speed-effects-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 5,
        transform: 'none',
      }}
    >
      {/* High-speed peripheral vignette */}
      <div
        ref={vignetteRef}
        className="speed-effects-vignette"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.85) 100%)',
          opacity: 0,
          transition: 'opacity 0.15s ease-out',
          pointerEvents: 'none',
        }}
      />
      {/* Radial wind streaks */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
