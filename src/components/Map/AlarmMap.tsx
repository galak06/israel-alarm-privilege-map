import { useState } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import type { City, ColorMode, Language, ThreatSource } from '../../types';
import CityMarker from './CityMarker';
import MapLegend from './MapLegend';

// Major cities shown at default zoom (7). IDs match our original curated set.
const MAJOR_CITY_NAMES_HE = new Set([
  'תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'אשדוד', 'אשקלון',
  'פתח תקווה', 'ראשון לציון', 'רמת גן', 'רחובות', 'מודיעין מכבים רעות',
  'חדרה', 'עכו', 'נהריה', 'קריית שמונה', 'טבריה', 'צפת', 'נצרת',
  'דימונה', 'אילת', 'שדרות', 'קריית גת', 'מטולה', 'באר אורה',
  'הרצליה', 'הרצליה גליל ים', 'הרצליה - גליל ים', 'הרצליה - מערב',
]);

function isMajor(city: City): boolean {
  return MAJOR_CITY_NAMES_HE.has(city.nameHe);
}

// Zoom thresholds:
//   < 9  → major cities only (~25)
//   9–10 → major + cities with alarm ≤ 45s
//   11+  → all localities
function shouldShow(city: City, zoom: number): boolean {
  if (zoom >= 11) return true;
  if (zoom >= 9) return city.alarmSeconds <= 45 || isMajor(city);
  return isMajor(city);
}

interface InnerProps {
  cities: City[];
  colorMode: ColorMode;
  language: Language;
  selectedCity: City | null;
  threatFilter: ThreatSource | null;
  onCityClick: (city: City) => void;
}

function MapMarkers({ cities, colorMode, language, selectedCity, threatFilter, onCityClick }: InnerProps) {
  const [zoom, setZoom] = useState(7);

  useMapEvents({
    zoomend(e) {
      setZoom(e.target.getZoom());
    },
  });

  const visible = cities.filter((c) => {
    if (threatFilter && !c.threatSources.includes(threatFilter)) return false;
    // Always show selected city regardless of zoom
    if (selectedCity?.id === c.id) return true;
    return shouldShow(c, zoom);
  });

  return (
    <>
      {visible.map((city) => (
        <CityMarker
          key={`${city.id}-${colorMode}`}
          city={city}
          colorMode={colorMode}
          language={language}
          zoom={zoom}
          isSelected={selectedCity?.id === city.id}
          onClick={onCityClick}
        />
      ))}
    </>
  );
}

interface Props {
  colorMode: ColorMode;
  language: Language;
  cities: City[];
  selectedCity: City | null;
  threatFilter: ThreatSource | null;
  drawerOpen?: boolean;
  onCityClick: (city: City) => void;
}

export default function AlarmMap({ colorMode, language, cities, selectedCity, threatFilter, drawerOpen, onCityClick }: Props) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={[31.5, 34.8]}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        maxBounds={[[29.0, 33.5], [33.5, 36.0]]}
        maxBoundsViscosity={0.8}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapMarkers
          cities={cities}
          colorMode={colorMode}
          language={language}
          selectedCity={selectedCity}
          threatFilter={threatFilter}
          onCityClick={onCityClick}
        />
      </MapContainer>
      <MapLegend colorMode={colorMode} language={language} hidden={drawerOpen} />
    </div>
  );
}
