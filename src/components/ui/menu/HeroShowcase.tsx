import type { VehiclePreset } from '@/types/vehicle';
import type { LevelPreset } from '@/types/level';
import { formatLapTime } from './menuStyles';

export const STAGE_BANNERS: Record<string, string> = {
  level1_island: '/images/stages/island_circuit.jpg',
  level2_desert: '/images/stages/desert_canyon.jpg',
  level3_sweden: '/images/stages/sweden_snow.jpg',
  level4_britain: '/images/stages/highland_castle.jpg',
  level5_gymkhana: '/images/stages/apex_gymkhana.jpg',
};

interface HeroShowcaseProps {
  vehicle: VehiclePreset;
  level: LevelPreset;
  bestLapTime: number | null;
  gamepadConnected: boolean;
  gamepadName: string;
  gamepadType: 'xbox' | 'dualsense' | 'generic' | null;
  onOpenGarage: () => void;
  onOpenTracks: () => void;
}

export function HeroShowcase({
  vehicle,
  level,
  bestLapTime,
  gamepadConnected,
  gamepadName,
  gamepadType,
  onOpenGarage,
  onOpenTracks,
}: HeroShowcaseProps) {
  const stageBanner = level.bannerUrl || STAGE_BANNERS[level.id] || STAGE_BANNERS.level1_island;

  return (
    <div style={styles.container} className="hero-showcase-container">
      {/* Active Vehicle Card */}
      <div style={styles.card} className="hero-showcase-card">
        <div style={styles.cardHeader}>
          <span style={styles.cardSectionTag}>01 // ACTIVE MACHINE</span>
          <button style={styles.cardActionLink} onClick={onOpenGarage}>
            GARAGE ➜
          </button>
        </div>

        {/* Performant 2D Vehicle Showcase Card (Interactive 3D viewing in Garage) */}
        <div
          style={styles.carShowcaseContainer}
          onClick={onOpenGarage}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenGarage();
            }
          }}
          title="Click to inspect vehicle in 3D Garage"
        >
          <div style={styles.showcaseHeaderRow}>
            <span style={styles.specBadge}>{vehicle.category.toUpperCase()} SPEC</span>
            <span style={styles.inspectLink}>3D GARAGE ➜</span>
          </div>

          <div style={styles.showcaseGraphicRow}>
            <div style={styles.emblemWrapper}>
              <img
                src="/openrally_emblem.png"
                alt={vehicle.name}
                style={styles.showcaseEmblem}
              />
            </div>
            <div style={styles.showcaseCarInfo}>
              <div style={styles.showcaseBadgeGroup}>
                <span style={styles.drivePill}>{vehicle.stats.driveType}</span>
                <span style={styles.chassisPill}>COMPETITION SPEC</span>
              </div>
              <span style={styles.showcaseVehicleTitle}>{vehicle.name}</span>
              <span style={styles.showcaseVehicleSubtitle}>
                Top Speed {vehicle.config.engine.maxSpeed} km/h • High Output Turbo
              </span>
            </div>
          </div>

          <div style={styles.showcaseFooterRow}>
            <span style={styles.showcaseHint}>INTERACTIVE 3D INSPECTION IN GARAGE</span>
            <span style={styles.showcaseSpeedVal}>{vehicle.config.engine.maxSpeed} KM/H</span>
          </div>
        </div>

        <div style={styles.vehicleTitleRow}>
          <h2 style={styles.vehicleName}>{vehicle.name}</h2>
          <span style={styles.driveBadge}>{vehicle.stats.driveType}</span>
        </div>

        <p style={styles.vehicleDesc} className="hero-vehicle-desc">{vehicle.description}</p>

        {/* Telemetry Stat Grid */}
        <div style={styles.telemetryGrid}>
          <div style={styles.telemetryItem}>
            <span style={styles.statLabel}>TOP SPEED</span>
            <span style={styles.statNumber}>
              {vehicle.config.engine.maxSpeed} <span style={styles.statUnit}>km/h</span>
            </span>
            <div style={styles.meterTrack}>
              <div
                style={{
                  ...styles.meterFill,
                  width: `${Math.min((vehicle.config.engine.maxSpeed / 240) * 100, 100)}%`,
                  background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                }}
              />
            </div>
          </div>

          <div style={styles.telemetryItem}>
            <span style={styles.statLabel}>ACCELERATION</span>
            <span style={styles.statNumber}>
              {vehicle.stats.acceleration.toFixed(1)} <span style={styles.statUnit}>/ 10</span>
            </span>
            <div style={styles.meterTrack}>
              <div
                style={{
                  ...styles.meterFill,
                  width: `${(vehicle.stats.acceleration / 10) * 100}%`,
                  background: 'linear-gradient(90deg, #10B981, #34D399)',
                }}
              />
            </div>
          </div>

          <div style={styles.telemetryItem}>
            <span style={styles.statLabel}>HANDLING</span>
            <span style={styles.statNumber}>
              {vehicle.stats.handling.toFixed(1)} <span style={styles.statUnit}>/ 10</span>
            </span>
            <div style={styles.meterTrack}>
              <div
                style={{
                  ...styles.meterFill,
                  width: `${(vehicle.stats.handling / 10) * 100}%`,
                  background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)',
                }}
              />
            </div>
          </div>

          <div style={styles.telemetryItem}>
            <span style={styles.statLabel}>OFFROAD</span>
            <span style={styles.statNumber}>
              {vehicle.stats.offroad.toFixed(1)} <span style={styles.statUnit}>/ 10</span>
            </span>
            <div style={styles.meterTrack}>
              <div
                style={{
                  ...styles.meterFill,
                  width: `${(vehicle.stats.offroad / 10) * 100}%`,
                  background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Active Stage Card with Photographic Banner */}
      <div style={styles.card} className="hero-showcase-compact-stage">
        <div style={styles.cardHeader}>
          <span style={styles.cardSectionTag}>02 // SELECTED STAGE</span>
          <button style={styles.cardActionLink} onClick={onOpenTracks}>
            SELECT STAGE ➜
          </button>
        </div>

        {/* Stage Photographic Hero Preview */}
        <div
          style={{
            ...styles.stageBannerContainer,
            backgroundImage: `linear-gradient(180deg, rgba(13, 19, 32, 0.2) 0%, rgba(8, 12, 20, 0.92) 80%), url(${stageBanner})`,
          }}
        >
          <div style={styles.stageBannerHeader}>
            <span
              style={{
                ...styles.difficultyBadge,
                background:
                  level.difficulty === 'easy'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : level.difficulty === 'medium'
                    ? 'rgba(245, 158, 11, 0.3)'
                    : 'rgba(239, 68, 68, 0.3)',
                borderColor:
                  level.difficulty === 'easy'
                    ? '#10B981'
                    : level.difficulty === 'medium'
                    ? '#F59E0B'
                    : '#EF4444',
                color:
                  level.difficulty === 'easy'
                    ? '#34D399'
                    : level.difficulty === 'medium'
                    ? '#FBBF24'
                    : '#F87171',
              }}
            >
              {level.difficulty.toUpperCase()}
            </span>
          </div>

          <div style={styles.stageBannerFooter}>
            <div>
              <h3 style={styles.stageName}>{level.name}</h3>
              <span style={styles.stageSurfaceText}>Surface: {level.surfaceDescription}</span>
            </div>
            <div style={styles.stageRecordCol}>
              <span style={styles.recordLabel}>STAGE RECORD</span>
              <span style={styles.recordValue}>
                {bestLapTime && bestLapTime > 0 ? formatLapTime(bestLapTime) : '--:--.--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Status Strip */}
      <div style={styles.statusStrip}>
        <div style={styles.statusLeft}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: gamepadConnected
                ? gamepadType === 'dualsense'
                  ? '#0070D1'
                  : '#107C10'
                : '#38BDF8',
              boxShadow: gamepadConnected
                ? gamepadType === 'dualsense'
                  ? '0 0 8px #0070D1'
                  : '0 0 8px #107C10'
                : '0 0 8px #38BDF8',
            }}
          />
          <span style={styles.statusText}>
            {gamepadConnected
              ? `CONTROLLER: ${gamepadName || (gamepadType === 'dualsense' ? 'Sony DualSense' : 'Xbox Controller')}`
              : 'INPUT: KEYBOARD / MOUSE'}
          </span>
        </div>
        <span style={styles.telemetryTag}>SIMULATION 60 HZ</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    boxSizing: 'border-box',
  },
  card: {
    background: 'linear-gradient(135deg, rgba(16, 23, 38, 0.85) 0%, rgba(10, 14, 24, 0.92) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '14px',
    padding: '18px 20px',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '8px',
  },
  cardSectionTag: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '1.5px',
    color: '#E31837',
    textTransform: 'uppercase',
  },
  cardActionLink: {
    background: 'transparent',
    border: 'none',
    color: '#94A3B8',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    cursor: 'pointer',
    padding: '10px 14px',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '6px',
    transition: 'color 0.15s ease',
    touchAction: 'manipulation',
    boxSizing: 'border-box',
  },
  carShowcaseContainer: {
    position: 'relative',
    width: '100%',
    height: '170px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'radial-gradient(ellipse at 30% 20%, rgba(27, 43, 76, 0.75) 0%, rgba(11, 16, 29, 0.95) 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '12px 14px',
    boxSizing: 'border-box',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.35)',
    transition: 'border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
  },
  showcaseHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specBadge: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '1.2px',
    color: '#E31837',
    background: 'rgba(227, 24, 55, 0.12)',
    border: '1px solid rgba(227, 24, 55, 0.3)',
    borderRadius: '4px',
    padding: '2px 7px',
  },
  inspectLink: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '1px',
    color: '#38BDF8',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  showcaseGraphicRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '4px 0',
  },
  emblemWrapper: {
    width: '68px',
    height: '68px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  showcaseEmblem: {
    width: '46px',
    height: '46px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(227, 24, 55, 0.4))',
  },
  showcaseCarInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflow: 'hidden',
  },
  showcaseBadgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  drivePill: {
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.8px',
    color: '#FFFFFF',
    background: 'linear-gradient(90deg, #991B1B, #E31837)',
    borderRadius: '3px',
    padding: '1px 5px',
  },
  chassisPill: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: '#94A3B8',
  },
  showcaseVehicleTitle: {
    fontSize: '18px',
    fontWeight: 800,
    letterSpacing: '0.5px',
    color: '#F8FAFC',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  showcaseVehicleSubtitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  showcaseFooterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    paddingTop: '6px',
  },
  showcaseHint: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
  },
  showcaseSpeedVal: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#38BDF8',
    letterSpacing: '0.5px',
  },
  vehicleTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleName: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    letterSpacing: '0.5px',
    color: '#F8FAFC',
  },
  driveBadge: {
    padding: '4px 10px',
    borderRadius: '6px',
    background: 'linear-gradient(90deg, #991B1B, #E31837)',
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '1px',
  },
  vehicleDesc: {
    margin: 0,
    fontSize: '12px',
    color: '#94A3B8',
    lineHeight: 1.4,
  },
  telemetryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 16px',
    marginTop: '2px',
  },
  telemetryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statNumber: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#F1F5F9',
  },
  statUnit: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  meterTrack: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  stageBannerContainer: {
    width: '100%',
    minHeight: '130px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
  },
  stageBannerHeader: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  stageBannerFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: '10px',
  },
  stageName: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    letterSpacing: '0.5px',
    color: '#FFFFFF',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
  },
  stageSurfaceText: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#CBD5E1',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
  },
  stageRecordCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  recordLabel: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '1px',
    color: '#94A3B8',
    textTransform: 'uppercase',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
  },
  recordValue: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#38BDF8',
    letterSpacing: '0.5px',
    fontVariantNumeric: 'tabular-nums',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
  },
  difficultyBadge: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '1px',
    backdropFilter: 'blur(6px)',
  },
  statusStrip: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
    padding: '10px 16px',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#CBD5E1',
    textTransform: 'uppercase',
  },
  telemetryTag: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#64748B',
  },
};
