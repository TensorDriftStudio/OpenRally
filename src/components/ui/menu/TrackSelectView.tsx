import type { LevelPreset } from '@/types/level';
import { useGymkhanaStore } from '@/store/gymkhanaStore';
import { getRecommendedTireForLevel } from '@/config/levelRegistry';
import { getTireDefinition } from '@/config/tireRegistry';
import { menuStyles, getFocusStyle, formatLapTime } from './menuStyles';
import type { MenuView } from './types';
import { STAGE_BANNERS } from './HeroShowcase';

interface TrackSelectViewProps {
  availableLevels: LevelPreset[];
  selectedLevelId: string;
  bestLapTimes: Record<string, number>;
  focusedIndex: number;
  textColor: string;
  subtitleColor: string;
  onPointerMoveItem: (index: number, e: React.PointerEvent) => void;
  onSelectTrack: (levelId: string) => void;
  onSelectView: (view: MenuView) => void;
}

export function TrackSelectView({
  availableLevels,
  selectedLevelId,
  bestLapTimes,
  focusedIndex,
  textColor,
  subtitleColor,
  onPointerMoveItem,
  onSelectTrack,
  onSelectView,
}: TrackSelectViewProps) {
  return (
    <div
      className="track-subview menu-scalable-container"
      style={{ ...menuStyles.subView, color: textColor, width: '100%', minWidth: '540px', maxWidth: '880px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <h2 style={{ ...menuStyles.subViewTitle, margin: 0 }}>Tracks & Stages</h2>
        <span
          style={{
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'rgba(227, 24, 55, 0.15)',
            border: '1px solid rgba(227, 24, 55, 0.4)',
            color: '#F87171',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '1px',
          }}
        >
          STEP 1 / 3
        </span>
      </div>
      <p className="track-subtitle-compact" style={{ ...menuStyles.subtitle, color: subtitleColor, margin: '0 0 10px 0', fontSize: '12px' }}>
        Select your rally course to begin the race configuration.
      </p>

      <div className="track-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '10px', width: '100%' }}>
        {availableLevels.map((lvl, index) => {
          const isSelected = selectedLevelId === lvl.id;
          const bestTime = bestLapTimes[lvl.id] ?? null;
          const bannerUrl = lvl.bannerUrl || (STAGE_BANNERS as Record<string, string>)[lvl.id] || '/images/stages/island_circuit.jpg';
          const recTire = getRecommendedTireForLevel(lvl);
          const recTireDef = getTireDefinition(recTire);

          return (
            <div
              key={lvl.id}
              className="track-card-compact"
              style={{
                ...menuStyles.trackCard,
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '12px',
                alignItems: 'center',
                minHeight: '44px',
                borderColor: isSelected ? '#E31837' : 'rgba(255, 255, 255, 0.08)',
                background: isSelected
                  ? 'linear-gradient(90deg, rgba(227, 24, 55, 0.18) 0%, rgba(27, 54, 93, 0.12) 100%)'
                  : 'rgba(255, 255, 255, 0.03)',
                padding: '10px 12px',
                boxSizing: 'border-box',
                ...getFocusStyle(focusedIndex === index),
              }}
              onPointerMove={(e) => onPointerMoveItem(index, e)}
              onClick={() => onSelectTrack(lvl.id)}
            >
              {/* Photographic Stage Thumbnail */}
              <div
                className="track-thumb-compact"
                style={{
                  width: '120px',
                  height: '74px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  flexShrink: 0,
                }}
              >
                <img
                  src={bannerUrl}
                  alt={lvl.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
              </div>

              {/* Stage Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#F1F5F9' }}>{lvl.name}</span>
                  <span style={{
                    ...menuStyles.difficultyBadge,
                    fontSize: '10px',
                    padding: '2px 6px',
                    background: lvl.difficulty === 'easy' ? '#059669' : lvl.difficulty === 'medium' ? '#D97706' : '#DC2626',
                  }}>
                    {lvl.difficulty.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Surface: <strong style={{ color: '#E2E8F0' }}>{lvl.surfaceDescription}</strong>
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        color: recTireDef.color,
                        background: recTireDef.badgeBg,
                        border: `1px solid ${recTireDef.badgeBorder}`,
                        letterSpacing: '0.4px',
                      }}
                    >
                      {recTireDef.icon} {recTireDef.label} Spec
                    </span>
                  </div>
                  {lvl.supportedModes?.includes('gymkhana_blitz') ? (
                    (() => {
                      const gymScore = useGymkhanaStore.getState().getBestScoreForLevel(lvl.id);
                      const hasRecord = gymScore !== null && gymScore > 0;
                      return (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: hasRecord ? '#F59E0B' : '#64748B',
                          letterSpacing: '0.5px',
                        }}>
                          {hasRecord ? `${gymScore.toLocaleString('en-US')} PTS` : '0 PTS'}
                        </span>
                      );
                    })()
                  ) : (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: bestTime ? '#38BDF8' : '#64748B',
                      letterSpacing: '0.5px',
                    }}>
                      {bestTime ? formatLapTime(bestTime) : '--:--.--'}
                    </span>
                  )}
                </div>

                <p className="track-desc-compact" style={{ fontSize: '11px', color: '#94A3B8', margin: 0, lineHeight: 1.3 }}>
                  {lvl.description}
                </p>

                {isSelected && (
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#E31837', marginTop: '1px', letterSpacing: '1px' }}>
                    ✓ ACTIVE STAGE
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button 
        className="track-back-btn"
        style={{ 
          ...menuStyles.button, 
          ...menuStyles.secondaryButton,
          color: textColor,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          marginTop: '12px', 
          width: '100%',
          minHeight: '44px',
          justifyContent: 'center',
          ...getFocusStyle(focusedIndex === availableLevels.length),
        }} 
        onPointerMove={(e) => onPointerMoveItem(availableLevels.length, e)}
        onClick={() => onSelectView('main')}
      >
        Back
      </button>
    </div>
  );
}
