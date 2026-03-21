import type { ColorMode, Language, ThreatSource } from '../../types';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';

const THREATS: ThreatSource[] = ['hamas', 'hezbollah', 'iran'];

const THREAT_COLORS: Record<ThreatSource, string> = {
  hamas: '#1a7c3e',
  hezbollah: '#ffd700',
  iran: '#c62828',
};

interface Props {
  colorMode: ColorMode;
  language: Language;
  threatFilter: ThreatSource | null;
  onColorModeChange: (mode: ColorMode) => void;
  onThreatFilterChange: (threat: ThreatSource | null) => void;
}

export default function FilterPanel({
  colorMode,
  language,
  threatFilter,
  onColorModeChange,
  onThreatFilterChange,
}: Props) {
  const t = language === 'he' ? he : en;

  return (
    <div className="filter-panel">
      <div className="filter-group">
        <div className="filter-label">{t.colorMode.label}</div>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${colorMode === 'time' ? 'active' : ''}`}
            onClick={() => onColorModeChange('time')}
          >
            {t.colorMode.time}
          </button>
          <button
            className={`toggle-btn ${colorMode === 'privilege' ? 'active' : ''}`}
            onClick={() => onColorModeChange('privilege')}
          >
            {t.colorMode.privilege}
          </button>
        </div>
      </div>

      <div className="filter-group" style={{ marginTop: 12 }}>
        <div className="filter-label">{t.threatFilter.label}</div>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${threatFilter === null ? 'active' : ''}`}
            onClick={() => onThreatFilterChange(null)}
          >
            {t.threatFilter.all}
          </button>
          {THREATS.map((threat) => (
            <button
              key={threat}
              className={`toggle-btn threat-btn ${threatFilter === threat ? 'active' : ''}`}
              style={
                threatFilter === threat
                  ? { background: THREAT_COLORS[threat], borderColor: THREAT_COLORS[threat], color: threat === 'hezbollah' ? '#000' : '#fff' }
                  : { borderColor: THREAT_COLORS[threat], color: THREAT_COLORS[threat] }
              }
              onClick={() => onThreatFilterChange(threat === threatFilter ? null : threat)}
            >
              {t.cityInfo.threats[threat]}
            </button>
          ))}
        </div>
      </div>

      <div className="about-text">{t.about.text}</div>
    </div>
  );
}
