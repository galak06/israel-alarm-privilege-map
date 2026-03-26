import { useState, useEffect } from 'react';
import type { City, Language, ThreatSource } from '../../types';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';
import { ALERTS_ENABLED } from '../../utils/featureFlags';
import { getLiveAlerts, type LiveAlerts } from '../../utils/alertsCache';

interface Props {
  city: City | null;
  language: Language;
}

export default function CityInfoPanel({ city, language }: Props) {
  const t = language === 'he' ? he : en;
  const [liveAlerts, setLiveAlerts] = useState<LiveAlerts | null>(null);

  useEffect(() => {
    if (!city) { setLiveAlerts(null); return; }
    setLiveAlerts(null);
    getLiveAlerts(city.nameHe).then(setLiveAlerts);
  }, [city?.id]);

  const alertCount      = liveAlerts?.alertCount        ?? city?.alertCount        ?? 0;
  const notifCount      = liveAlerts?.notificationCount ?? city?.notificationCount ?? 0;
  const alertCountTotal = city?.alertCountTotal ?? 0;
  const isLive          = liveAlerts !== null;

  if (!city) {
    return (
      <div className="city-panel city-panel-empty">
        <p>{t.cityInfo.noCity}</p>
      </div>
    );
  }

  const name = language === 'he' ? city.nameHe : city.nameEn;
  const bothNames = language === 'he'
    ? `${city.nameHe} · ${city.nameEn}`
    : `${city.nameEn} · ${city.nameHe}`;

  const { mamad, stairwell, public: pub } = city.shelterDistribution;

  return (
    <div className="city-panel">
      <h2 className="city-name">{name}</h2>
      <p className="city-both-names">{bothNames}</p>

      <div className="city-stat">
        <span className="stat-label">{t.cityInfo.region}</span>
        <span className="stat-value">{t.regions[city.region]}</span>
      </div>

      <div className="city-stat alarm-time-stat">
        <span className="stat-label">{t.cityInfo.alarmTime}</span>
        <span className="stat-value alarm-value">
          {city.alarmSeconds}
          <span className="unit"> {t.cityInfo.seconds}</span>
        </span>
      </div>

      <div className="city-stat">
        <span className="stat-label">{t.cityInfo.threatSources}</span>
        <div className="threat-badges">
          {city.threatSources.map((threat) => (
            <ThreatBadge key={threat} threat={threat} label={t.cityInfo.threats[threat]} />
          ))}
        </div>
      </div>

      {ALERTS_ENABLED && (
        <>
          <div className="city-stat alert-count-stat">
            <span className="stat-label">🚨 {t.cityInfo.alertCount}</span>
            <span className="stat-value alert-count-value">
              {(isLive || alertCount > 0) ? alertCount.toLocaleString() : '—'}
              {(isLive || alertCount > 0) && <span className="unit"> {t.cityInfo.alertCountSuffix}</span>}
              {isLive && <span className="live-badge">live</span>}
            </span>
          </div>

          {isLive && notifCount > 0 && (
            <div className="city-stat">
              <span className="stat-label">🔔 {t.cityInfo.notificationCount}</span>
              <span className="stat-value" style={{ color: '#f57c00' }}>
                {notifCount.toLocaleString()}
                <span className="unit"> {t.cityInfo.alertCountSuffix}</span>
              </span>
            </div>
          )}

          <div className="city-stat">
            <span className="stat-label">📊 {t.cityInfo.alertCountTotal}</span>
            <span className="stat-value">
              {alertCountTotal > 0 ? alertCountTotal.toLocaleString() : '—'}
              {alertCountTotal > 0 && <span className="unit"> {t.cityInfo.alertCountSuffix}</span>}
            </span>
          </div>
        </>
      )}

      {city.population && (
        <div className="city-stat">
          <span className="stat-label">{t.cityInfo.population}</span>
          <span className="stat-value">{city.population.toLocaleString()}</span>
        </div>
      )}

      <div className="shelter-section">
        <div className="stat-label">{t.cityInfo.shelterBreakdown}</div>
        <div className="shelter-bars">
          <ShelterBar label={t.cityInfo.mamad} value={mamad} color="#4caf50" />
          <ShelterBar label={t.cityInfo.stairwell} value={stairwell} color="#ff9800" />
          <ShelterBar label={t.cityInfo.public} value={pub} color="#f44336" />
        </div>
      </div>

    </div>
  );
}

const THREAT_STYLES: Record<ThreatSource, { bg: string; color: string }> = {
  hamas: { bg: '#1a7c3e', color: '#fff' },
  hezbollah: { bg: '#ffd700', color: '#000' },
  iran: { bg: '#c62828', color: '#fff' },
};

function ThreatBadge({ threat, label }: { threat: ThreatSource; label: string }) {
  const style = THREAT_STYLES[threat];
  return (
    <span className="threat-badge" style={{ background: style.bg, color: style.color }}>
      {label}
    </span>
  );
}

function ShelterBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="shelter-bar-row">
      <span className="shelter-bar-label">{label}</span>
      <div className="shelter-bar-track">
        <div
          className="shelter-bar-fill"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
      <span className="shelter-bar-pct">{Math.round(value * 100)}%</span>
    </div>
  );
}
