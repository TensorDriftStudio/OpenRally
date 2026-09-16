import { menuStyles, getFocusStyle } from './menuStyles';
import type { MenuView } from './types';

interface CreditsViewProps {
  focusedIndex: number;
  textColor: string;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSelectView: (view: MenuView) => void;
}

const GITHUB_REPO_URL = 'https://github.com/TensorDriftStudio/OpenRally';

/**
 * Clean Credits screen showing creator TensorDriftStudio (Dawid Warzocha) and GitHub repository link.
 */
export function CreditsView({
  focusedIndex,
  textColor,
  onPointerMoveItem,
  onSelectView,
}: CreditsViewProps) {
  return (
    <div style={{ ...menuStyles.subView, color: textColor, width: '100%', minWidth: '420px' }}>
      <h2 style={menuStyles.subViewTitle}>Credits</h2>

      {/* Creator Card */}
      <div
        style={{
          width: '100%',
          padding: '24px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(27, 54, 93, 0.2) 0%, rgba(227, 24, 55, 0.2) 100%)',
          border: '1.5px solid rgba(227, 24, 55, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '8px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: '#FFFFFF',
            background: '#E31837',
            padding: '4px 12px',
            borderRadius: '20px',
          }}
        >
          Creator
        </span>

        <h3
          style={{
            margin: '4px 0 0 0',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            color: '#F8FAFC',
          }}
        >
          TensorDriftStudio{' '}
          <span style={{ fontWeight: 600, fontSize: '18px', opacity: 0.85, color: '#CBD5E1' }}>
            (Dawid Warzocha)
          </span>
        </h3>
      </div>

      {/* GitHub Project Link Button (Index 0) */}
      <div style={{ width: '100%', marginTop: '4px' }}>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...menuStyles.button,
            ...menuStyles.secondaryButton,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            color: textColor,
            borderColor: 'rgba(255, 255, 255, 0.12)',
            textDecoration: 'none',
            boxSizing: 'border-box',
            ...getFocusStyle(focusedIndex === 0),
          }}
          onPointerMove={(e) => onPointerMoveItem(0, e)}
        >
          <svg
            height="18"
            width="18"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>GitHub: TensorDriftStudio/OpenRally ↗</span>
        </a>
      </div>

      {/* Back to Main Menu Button (Index 1) */}
      <div style={{ width: '100%', marginTop: '4px' }}>
        <button
          style={{
            ...menuStyles.button,
            ...menuStyles.secondaryButton,
            borderColor: 'rgba(255, 255, 255, 0.12)',
            color: textColor,
            width: '100%',
            justifyContent: 'center',
            ...getFocusStyle(focusedIndex === 1),
          }}
          onPointerMove={(e) => onPointerMoveItem(1, e)}
          onClick={() => onSelectView('main')}
        >
          Back to Main Menu
        </button>
      </div>
    </div>
  );
}
