import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnalogGauges } from '../gauges/AnalogGauges';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

describe('Modern Forza / The Crew Instrument Cluster (AnalogGauges)', () => {
  beforeEach(() => {
    useGameStore.setState({
      gameState: 'playing',
      speed: 124,
      rpm: 5400,
      gear: 3,
      absActive: false,
      tcsActive: false,
      espActive: false,
      selectedTireType: 'gravel',
    });
    useSettingsStore.setState({
      absEnabled: true,
      tcsEnabled: true,
      espEnabled: true,
      transmissionMode: 'manual',
    });
  });

  it('renders the cluster container with id="rally-cluster"', () => {
    const html = renderToString(<AnalogGauges />);
    expect(html).toContain('id="rally-cluster"');
  });

  it('renders the modern sweeping tachometer arc and shift light halo', () => {
    const html = renderToString(<AnalogGauges />);
    expect(html).toContain('forzaRpmGrad');
    expect(html).toContain('shiftHaloGlow');
    expect(html).toContain('KM/H');
  });

  it('renders driving assist annunciators for ABS, TCS, and ESP', () => {
    const html = renderToString(<AnalogGauges />);
    expect(html).toContain('>ABS<');
    expect(html).toContain('>TCS<');
    expect(html).toContain('>ESP<');
  });

  it('omits redundant tire compound badge and noisy numeric RPM text for aesthetic simplicity', () => {
    const html = renderToString(<AnalogGauges />);
    expect(html).not.toContain('>GRAVEL<');
    expect(html).not.toContain('>ASPHALT<');
    expect(html).not.toContain('>SNOW<');
    expect(html).not.toContain('>RPM<');
  });

  it('renders motorsport transmission mode indicator', () => {
    const html = renderToString(<AnalogGauges />);
    expect(html).toContain('>MANUAL<');
  });
});
