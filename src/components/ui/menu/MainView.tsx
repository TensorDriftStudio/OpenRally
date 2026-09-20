import { menuStyles, getFocusStyle } from './menuStyles';
import type { MenuView } from './types';

interface MainViewProps {
  isPause: boolean;
  isMultiplayer?: boolean;
  focusedIndex: number;
  textColor: string;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSelectView: (view: MenuView) => void;
  onResume: () => void;
  onReset: () => void;
  onReturnToMainMenu: () => void;
  onOpenGarage?: () => void;
}

export function MainView({
  isPause,
  isMultiplayer,
  focusedIndex,
  textColor,
  onPointerMoveItem,
  onSelectView,
  onResume,
  onReset,
  onReturnToMainMenu,
}: MainViewProps) {
  return (
    <div style={menuStyles.buttonGroup} className={isPause ? "pause-action-list" : "menu-action-grid"}>
      {isPause ? (
        <>
          <button
            className="pause-action-button"
            style={{
              ...menuStyles.button,
              ...(focusedIndex === 0 ? menuStyles.primaryButton : menuStyles.secondaryButton),
              color: focusedIndex === 0 ? '#FFFFFF' : textColor,
              ...getFocusStyle(focusedIndex === 0),
            }}
            onPointerMove={(e) => onPointerMoveItem(0, e)}
            onClick={onResume}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>01 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>RESUME STAGE</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Continue driving (ESC)</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 0 ? 1 : 0.4 }}>►</span>
          </button>

          <button
            className="pause-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: textColor,
              ...getFocusStyle(focusedIndex === 1),
            }}
            onPointerMove={(e) => onPointerMoveItem(1, e)}
            onClick={onReset}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>02 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>{isMultiplayer ? 'RECOVER VEHICLE' : 'RESTART STAGE'}</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">
                  {isMultiplayer ? 'Reset car to track / checkpoint (lap penalized)' : 'Reset car to stage spawn point'}
                </span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 1 ? 1 : 0.4 }}>►</span>
          </button>

          <button
            className="pause-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: textColor,
              ...getFocusStyle(focusedIndex === 2),
            }}
            onPointerMove={(e) => onPointerMoveItem(2, e)}
            onClick={() => onSelectView('options')}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>03 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>OPTIONS</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Graphics, audio, controls & gameplay</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 2 ? 1 : 0.4 }}>►</span>
          </button>

          <button
            className="pause-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: '#F87171',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              ...getFocusStyle(focusedIndex === 3),
            }}
            onPointerMove={(e) => onPointerMoveItem(3, e)}
            onClick={onReturnToMainMenu}
          >
            <div style={styles.buttonContent}>
              <span style={{ ...styles.indexTag, color: '#EF4444' }}>04 //</span>
              <div style={styles.textCol}>
                <span style={{ ...styles.buttonLabel, color: '#F87171' }}>RETURN TO MAIN MENU</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Abandon current stage</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, color: '#EF4444', opacity: focusedIndex === 3 ? 1 : 0.4 }}>✕</span>
          </button>
        </>
      ) : (
        <>
          <button
            className="menu-action-button"
            style={{
              ...menuStyles.button,
              ...(focusedIndex === 0 ? menuStyles.primaryButton : menuStyles.secondaryButton),
              color: focusedIndex === 0 ? '#FFFFFF' : textColor,
              ...getFocusStyle(focusedIndex === 0),
            }}
            onPointerMove={(e) => onPointerMoveItem(0, e)}
            onClick={() => onSelectView('tracks')}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>01 //</span>
              <div style={styles.textCol}>
                <span style={focusedIndex === 0 ? styles.buttonLabelPrimary : styles.buttonLabel}>PLAY</span>
                <span style={focusedIndex === 0 ? styles.buttonSubLabelPrimary : styles.buttonSubLabel} className="menu-action-sublabel">Select Stage, Game Mode &amp; Vehicle</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 0 ? 1 : 0.3 }}>►</span>
          </button>

          <button
            className="menu-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: textColor,
              ...getFocusStyle(focusedIndex === 1),
            }}
            onPointerMove={(e) => onPointerMoveItem(1, e)}
            onClick={() => onSelectView('multiplayer')}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>02 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>MULTIPLAYER</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Online lobbies &amp; local split-screen</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 1 ? 1 : 0.3 }}>►</span>
          </button>

          <button
            className="menu-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: textColor,
              ...getFocusStyle(focusedIndex === 2),
            }}
            onPointerMove={(e) => onPointerMoveItem(2, e)}
            onClick={() => onSelectView('options')}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>03 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>OPTIONS</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Graphics, audio, controls &amp; gameplay</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 2 ? 1 : 0.3 }}>►</span>
          </button>

          <button
            className="menu-action-button"
            style={{
              ...menuStyles.button,
              ...menuStyles.secondaryButton,
              color: textColor,
              ...getFocusStyle(focusedIndex === 3),
            }}
            onPointerMove={(e) => onPointerMoveItem(3, e)}
            onClick={() => onSelectView('credits')}
          >
            <div style={styles.buttonContent}>
              <span style={styles.indexTag}>04 //</span>
              <div style={styles.textCol}>
                <span style={styles.buttonLabel}>CREDITS</span>
                <span style={styles.buttonSubLabel} className="menu-action-sublabel">Game creator &amp; open-source engine</span>
              </div>
            </div>
            <span style={{ ...styles.chevron, opacity: focusedIndex === 3 ? 1 : 0.3 }}>►</span>
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  buttonContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  indexTag: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#E31837',
    letterSpacing: '1px',
    fontFamily: 'monospace',
  },
  textCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    textAlign: 'left',
  },
  buttonLabel: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#F1F5F9',
  },
  buttonLabelPrimary: {
    fontSize: '16px',
    fontWeight: 800,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  buttonSubLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#94A3B8',
    letterSpacing: '0.2px',
  },
  buttonSubLabelPrimary: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: '0.2px',
  },
  chevron: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#FFFFFF',
    transition: 'opacity 0.15s ease',
  },
};

