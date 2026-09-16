import { useGameStore } from '@/store/gameStore';
import { setTouchInput } from '@/utils/input/touch';

/**
 * High-visibility rally HUD alert notifying driver when vehicle is inverted on roof/side.
 * Prompts driver with gamepad / keyboard recovery actions.
 */
export function RolloverAlert() {
  const isRolledOver = useGameStore((s) => s.isRolledOver);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const gamepadType = useGameStore((s) => s.gamepadType);

  if (!isRolledOver) return null;

  const buttonGlyph = gamepadConnected
    ? gamepadType === 'dualsense'
      ? '▲ (Triangle)'
      : '(Y)'
    : '[R]';

  const handleTouchRecover = (e: React.PointerEvent) => {
    e.stopPropagation();
    setTouchInput({ reset: true });
  };

  return (
    <div
      style={styles.backdrop}
      data-testid="rollover-alert"
      onPointerDown={handleTouchRecover}
    >
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.warningIcon}>⚠️</span>
          <span style={styles.title}>VEHICLE ROLLED OVER</span>
        </div>
        <div style={styles.actionPrompt}>
          Press <strong style={styles.keyBadge}>{buttonGlyph}</strong> to reset vehicle
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'absolute',
    top: '16%',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    pointerEvents: 'auto',
    cursor: 'pointer',
    animation: 'pulse 1.5s infinite ease-in-out',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.92) 0%, rgba(153, 27, 27, 0.95) 100%)',
    border: '2px solid rgba(254, 202, 202, 0.85)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65), 0 0 24px rgba(239, 68, 68, 0.45)',
    borderRadius: '12px',
    padding: '12px 24px',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  warningIcon: {
    fontSize: '20px',
  },
  title: {
    fontFamily: "'Russo One', Impact, sans-serif",
    fontSize: '18px',
    fontWeight: 800,
    letterSpacing: '1.5px',
    color: '#ffffff',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  },
  actionPrompt: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: '0.4px',
  },
  keyBadge: {
    background: '#ffffff',
    color: '#991b1b',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 800,
    fontSize: '13px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
};
