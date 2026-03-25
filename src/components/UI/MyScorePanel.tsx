import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react';
import type { City, FamilyStatus, Language, ShelterType } from '../../types';
import { calcPrivilegeScore, calcPrivilegeScorePersonal } from '../../utils/privilegeCalc';
import { ALERTS_ENABLED } from '../../utils/featureFlags';
import { colorForPrivilege } from '../../utils/colorScale';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';
import { trackShelterSelect } from '../../utils/analytics';
import { getLiveAlerts, cacheAgeMinutes, type LiveAlerts } from '../../utils/alertsCache';

interface Props {
  language: Language;
  cities: City[];
  selectedCity?: City | null;
  onCitySelect: (city: City) => void;
}

const SHELTER_OPTIONS: ShelterType[] = ['mamad', 'shelter', 'stairwell', 'public'];
const FAMILY_OPTIONS: FamilyStatus[] = ['divorced_with_children', 'divorced', 'single', 'married_with_children', 'relationship', 'married'];
const MAX_RESULTS = 8;

// Fix 1: defined outside component — not recreated on every render
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function CityAutocomplete({
  cities,
  language,
  placeholder,
  initialCity,
  onSelect,
}: {
  cities: City[];
  language: Language;
  placeholder: string;
  initialCity?: City | null;
  onSelect: (city: City) => void;
}) {
  const initialName = initialCity ? (language === 'he' ? initialCity.nameHe : initialCity.nameEn) : '';
  const [query, setQuery] = useState(initialName);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [selectedName, setSelectedName] = useState(initialName);

  useEffect(() => {
    if (!initialCity) return;
    const name = language === 'he' ? initialCity.nameHe : initialCity.nameEn;
    setQuery(name);
    setSelectedName(name);
  }, [initialCity?.id]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fix 2: q computed once, reused in both useMemo and render
  const q = useMemo(() => query.trim().toLowerCase(), [query]);

  const results = useMemo(() => {
    if (!q) return [];
    return cities
      .filter((c) => c.nameHe.includes(query.trim()) || c.nameEn.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [q, query, cities]);

  function selectCity(city: City) {
    const name = language === 'he' ? city.nameHe : city.nameEn;
    setSelectedName(name);
    setQuery(name);
    setOpen(false);
    onSelect(city);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setSelectedName('');
    setHighlighted(0);
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // Fix 4: Escape reverts to last selected name
      if (selectedName) setQuery(selectedName);
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCity(results[highlighted]);
    }
  }

  function handleClear() {
    setQuery('');
    setSelectedName('');
    setOpen(false);
    inputRef.current?.focus();
  }

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.closest('.autocomplete-wrap')?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    const item = listRef.current?.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  return (
    <div className="autocomplete-wrap">
      <div className="autocomplete-input-row">
        <input
          ref={inputRef}
          id="city-search"
          name="city-search"
          className="autocomplete-input"
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={handleInput}
          onFocus={() => { if (query && !selectedName) setOpen(true); }}
          onKeyDown={handleKeyDown}
          dir="rtl"
          autoComplete="off"
        />
        {query && (
          <button className="autocomplete-clear" onClick={handleClear} tabIndex={-1}>×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="autocomplete-list" ref={listRef} role="listbox">
          {results.map((city, i) => {
            const primary = language === 'he' ? city.nameHe : city.nameEn;
            const secondary = language === 'he' ? city.nameEn : city.nameHe;
            return (
              <li
                key={city.id}
                className={`autocomplete-item ${i === highlighted ? 'highlighted' : ''}`}
                role="option"
                onMouseDown={() => selectCity(city)}
                onMouseEnter={() => setHighlighted(i)}
              >
                <span className="ac-primary"><Highlight text={primary} q={q} /></span>
                <span className="ac-secondary"><Highlight text={secondary} q={q} /></span>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="autocomplete-empty">
          {language === 'he' ? 'לא נמצאו תוצאות' : 'No results found'}
        </div>
      )}
    </div>
  );
}

export default function MyScorePanel({ language, cities, selectedCity: externalCity, onCitySelect }: Props) {
  const t = language === 'he' ? he : en;
  const [city, setCity] = useState<City | null>(externalCity ?? null);
  const [shelter, setShelter] = useState<ShelterType>('stairwell');
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>('single');
  const [liveAlerts, setLiveAlerts] = useState<LiveAlerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const fetchSeqRef = useRef(0);

  // Sync when App restores a city on refresh (externalCity arrives after cities load)
  useEffect(() => {
    if (!externalCity || city?.id === externalCity.id) return;
    const seq = ++fetchSeqRef.current;
    setCity(externalCity);
    setLiveAlerts(null);
    setAlertsLoading(true);
    getLiveAlerts(externalCity.nameHe).then((alerts) => {
      if (fetchSeqRef.current !== seq) return;
      setLiveAlerts(alerts);
      setAlertsLoading(false);
    });
  }, [externalCity?.id]);
  const shelterSelectId = useId();
  const familySelectId = useId();

  // Merge static city data with live alert data — only override fields that are present
  const enrichedCity = useMemo<City | null>(() => {
    if (!city) return null;
    if (!liveAlerts) return city;
    return {
      ...city,
      ...(liveAlerts.alertCount        !== undefined && { alertCount:        liveAlerts.alertCount }),
      ...(liveAlerts.notificationCount !== undefined && { notificationCount: liveAlerts.notificationCount }),
    };
  }, [city, liveAlerts]);

  const personal = enrichedCity ? calcPrivilegeScorePersonal(enrichedCity, shelter, familyStatus) : null;
  const cityAvg = enrichedCity ? calcPrivilegeScore(enrichedCity) : null;

  const handleSelect = useCallback((selected: City) => {
    const seq = ++fetchSeqRef.current;
    setCity(selected);
    setLiveAlerts(null);
    setAlertsLoading(true);
    onCitySelect(selected);
    getLiveAlerts(selected.nameHe).then((alerts) => {
      if (fetchSeqRef.current !== seq) return; // stale — a newer city was selected
      setLiveAlerts(alerts);
      setAlertsLoading(false);
    });
  }, [onCitySelect]);

  return (
    <div className="my-score-panel">
      <div className="my-score-title">{t.myScore.title}</div>

      <CityAutocomplete
        cities={cities}
        language={language}
        placeholder={t.myScore.searchPlaceholder}
        initialCity={externalCity}
        onSelect={handleSelect}
      />

      {city && (
        <>
          <label className="select-label" htmlFor={shelterSelectId}>{t.myScore.shelterLabel}</label>
          <select
            id={shelterSelectId}
            className="choice-select"
            value={shelter}
            onChange={(e) => { setShelter(e.target.value as ShelterType); if (city) trackShelterSelect(e.target.value as ShelterType, city.id); }}
          >
            {SHELTER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{t.myScore[opt]}</option>
            ))}
          </select>

          <label className="select-label" htmlFor={familySelectId}>{t.myScore.familyLabel}</label>
          <select
            id={familySelectId}
            className="choice-select"
            value={familyStatus}
            onChange={(e) => setFamilyStatus(e.target.value as FamilyStatus)}
          >
            {FAMILY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{t.myScore[opt]}</option>
            ))}
          </select>

          {alertsLoading && (
            <div className="alerts-status alerts-loading">{t.myScore.alertsLoading}</div>
          )}
          {!alertsLoading && city && (
            <div className="alerts-status">
              {liveAlerts
                ? t.myScore.alertsLive.replace('{min}', String(cacheAgeMinutes() ?? 0))
                : t.myScore.alertsStatic}
            </div>
          )}

          {!alertsLoading && personal !== null && cityAvg !== null && (
            <div className="personal-result">
              <div
                className="personal-score-circle"
                style={{ borderColor: colorForPrivilege((personal.total / (ALERTS_ENABLED ? 120 : 100)) * 100), color: colorForPrivilege((personal.total / (ALERTS_ENABLED ? 120 : 100)) * 100) }}
              >
                <span className="personal-score-num">{personal.total.toFixed(1)}</span>
                <span className="personal-score-sublabel">
                  {t.cityInfo.privilegeLabels[personal.label]}
                </span>
              </div>
              <div className="personal-compare">
                <span>{t.myScore.compareNote}:</span>
                <span className="compare-avg" style={{ color: colorForPrivilege(cityAvg.total) }}>
                  {cityAvg.total.toFixed(1)}
                </span>
              </div>
              <div className="personal-breakdown">
                <div className="personal-row">
                  <span>{t.cityInfo.timeScore}</span>
                  <span>{personal.timeScore.toFixed(1)} / 20</span>
                </div>
                <div className="personal-row">
                  <span>{t.cityInfo.shelterScore}</span>
                  <span>{personal.shelterScore.toFixed(1)} / 20</span>
                </div>
                {ALERTS_ENABLED && (
                  <>
                    <div className="personal-row">
                      <span>{t.cityInfo.safetyScore}</span>
                      <span>{personal.safetyScore.toFixed(1)} / 30</span>
                    </div>
                    <div className="personal-row">
                      <span>{t.cityInfo.gapScore}</span>
                      <span>{personal.gapScore.toFixed(1)} / 30</span>
                    </div>
                  </>
                )}
                <div className="personal-row">
                  <span>{t.cityInfo.locationScore}</span>
                  <span>{personal.locationScore.toFixed(0)} / 10</span>
                </div>
                <div className="personal-row">
                  <span>{t.cityInfo.familyScore}</span>
                  <span>{personal.familyScore.toFixed(0)} / 10</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
