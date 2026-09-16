import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { TelemetryHUD } from './TelemetryHUD';
import { Minimap } from './Minimap';
import { AnalogGauges, TimingBoard, GymkhanaBoard, TagBoard } from './gauges';
import { GymkhanaCompleteModal } from './GymkhanaCompleteModal';
import { TagCompleteModal } from './TagCompleteModal';
import { MultiplayerHUD } from './MultiplayerHUD';
import { RolloverAlert } from './RolloverAlert';
import { SpeedEffects } from './SpeedEffects';

/**
 * Rally HUD overlay — authentic twin-gauge rally cluster (analog Speedometer & Tachometer),
 * rally stage roadbook minimap, telemetry data, and rally timing board.
 * Subcomponents use high-performance transient DOM updates for 0 React re-renders during gameplay.
 */
export function HUD() {
  const gameState = useGameStore((s) => s.gameState);
  const isSceneReady = useGameStore((s) => s.isSceneReady);
  const gameMusicVolume = useSettingsStore((s) => s.gameMusicVolume);

  const bgmRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume = gameMusicVolume;
    }
  }, [gameMusicVolume, gameState, isSceneReady]);

  // Handle browser autoplay policy by starting game music on user interaction
  useEffect(() => {
    if (gameState !== 'playing' || !isSceneReady) return;

    const playBgm = () => {
      if (bgmRef.current && bgmRef.current.paused) {
        bgmRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', playBgm);
    window.addEventListener('keydown', playBgm);

    playBgm();

    return () => {
      window.removeEventListener('pointerdown', playBgm);
      window.removeEventListener('keydown', playBgm);
    };
  }, [gameState, isSceneReady]);

  if (gameState !== 'playing' || !isSceneReady) return null;

  return (
    <div id="hud" style={styles.container}>
      {/* Dynamic High-Speed Peripheral Vignette & Radial Wind Streaks */}
      <SpeedEffects />

      {/* Background Music */}
      <audio ref={bgmRef} src="/sounds/freeroam-music.mp3" autoPlay loop />

      {/* Physics Telemetry Gauge (Friction, Wheel Angular Velocity, G-Forces) */}
      <TelemetryHUD />

      {/* Rally Stage Minimap */}
      <Minimap />

      {/* Stage Timing Card & 3-2-1-GO Countdown (Time Attack mode) */}
      <TimingBoard />

      {/* Gymkhana Blitz Timer, Drift Score Card & Countdown */}
      <GymkhanaBoard />

      {/* Rally Tag Board, Countdown & Role Status */}
      <TagBoard />

      {/* Authentic Rally Twin-Gauge Cluster (Speedometer & Tachometer) */}
      <AnalogGauges />

      {/* Gymkhana Blitz Stage Complete Results Modal */}
      <GymkhanaCompleteModal />

      {/* Rally Tag Stage Complete Results Modal */}
      <TagCompleteModal />

      {/* Online Multiplayer Gymkhana Arena Status & Roster */}
      <MultiplayerHUD />

      {/* Vehicle Rollover / Inverted Roof Alert and Recovery Prompt */}
      <RolloverAlert />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    zIndex: 10,
  },
};
