import { useState, useEffect } from 'react';
import type { City, ColorMode, Language, ThreatSource } from './types';
import { useLocalities } from './hooks/useLocalities';
import AlarmMap from './components/Map/AlarmMap';
import Header from './components/UI/Header';
import CityInfoPanel from './components/UI/CityInfoPanel';
import FilterPanel from './components/Controls/FilterPanel';
import MyScorePanel from './components/UI/MyScorePanel';
import { trackCitySelect, trackLanguageToggle, trackColorModeChange, trackThreatFilterChange } from './utils/analytics';

const LAST_CITY_KEY = 'lastCityId';

export default function App() {
  const [language, setLanguage] = useState<Language>('he');
  const [colorMode, setColorMode] = useState<ColorMode>('time');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [threatFilter, setThreatFilter] = useState<ThreatSource | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { cities, loaded } = useLocalities();

  useEffect(() => {
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Restore last selected city after cities load
  useEffect(() => {
    if (!loaded || cities.length === 0 || selectedCity) return;
    try {
      const savedId = localStorage.getItem(LAST_CITY_KEY);
      if (!savedId) return;
      const city = cities.find((c) => c.id === savedId);
      if (city) { setSelectedCity(city); setDrawerOpen(true); }
    } catch { /* localStorage unavailable */ }
  }, [loaded, cities]);

  const toggleLanguage = () => {
    const next = language === 'he' ? 'en' : 'he';
    trackLanguageToggle(next);
    setLanguage(next);
  };

  function handleCityClick(city: City, source: 'map' | 'search' = 'map') {
    trackCitySelect(city.id, city.nameEn, source);
    setSelectedCity(city);
    setDrawerOpen(true);
    try { localStorage.setItem(LAST_CITY_KEY, city.id); } catch { /* quota */ }
  }

  function handleColorModeChange(mode: ColorMode) {
    trackColorModeChange(mode);
    setColorMode(mode);
  }

  function handleThreatFilterChange(threat: ThreatSource | null) {
    trackThreatFilterChange(threat);
    setThreatFilter(threat);
  }

  return (
    <div className="app-layout">
      <Header
        language={language}
        onToggleLanguage={toggleLanguage}
        cityCount={cities.length}
        loaded={loaded}
        onMenuToggle={() => setDrawerOpen((o) => !o)}
      />
      <div className="main-content">
        {drawerOpen && (
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
        )}
        <aside className={`sidebar${drawerOpen ? ' drawer-open' : ''}`}>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
          <MyScorePanel language={language} cities={cities} onCitySelect={(c) => handleCityClick(c, 'search')} />
          <FilterPanel
            colorMode={colorMode}
            language={language}
            threatFilter={threatFilter}
            onColorModeChange={handleColorModeChange}
            onThreatFilterChange={handleThreatFilterChange}
          />
          <CityInfoPanel city={selectedCity} language={language} />
        </aside>
        <main className="map-area">
          <AlarmMap
            colorMode={colorMode}
            language={language}
            cities={cities}
            selectedCity={selectedCity}
            threatFilter={threatFilter}
            drawerOpen={drawerOpen}
            onCityClick={handleCityClick}
          />
        </main>
      </div>
    </div>
  );
}
