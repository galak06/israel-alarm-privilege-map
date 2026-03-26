import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { City, ColorMode, Language } from '../../types';
import { colorForSeconds, colorForPrivilege } from '../../utils/colorScale';
import { calcPrivilegeScore } from '../../utils/privilegeCalc';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';

interface Props {
  city: City;
  colorMode: ColorMode;
  language: Language;
  zoom: number;
  isSelected: boolean;
  onClick: (city: City) => void;
}

function makeIcon(color: string, isSelected: boolean, label: string, zoom: number) {
  // Scale marker with zoom: small at overview, full size when zoomed in
  const base = zoom <= 8 ? 14 : zoom <= 9 ? 18 : zoom <= 10 ? 24 : 32;
  const size = isSelected ? base + 8 : base;
  const showLabel = zoom >= 9 || isSelected;
  const border = isSelected ? `3px solid #000` : `2px solid rgba(255,255,255,0.9)`;
  const shadow = isSelected
    ? '0 0 0 3px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.4)'
    : '0 1px 4px rgba(0,0,0,0.3)';

  const labelHtml = showLabel ? `
    <div style="
      position:absolute;
      top:${size + 2}px;
      left:50%;
      transform:translateX(-50%);
      white-space:nowrap;
      background:rgba(255,255,255,0.92);
      color:#111;
      font-size:11px;
      font-weight:${isSelected ? 700 : 600};
      padding:1px 5px;
      border-radius:3px;
      box-shadow:0 1px 3px rgba(0,0,0,0.2);
      pointer-events:none;
    ">${label}</div>` : '';

  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      background:${color};
      border:${border};
      border-radius:50%;
      box-shadow:${shadow};
      cursor:pointer;
    "></div>
    ${labelHtml}
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size + (showLabel ? 20 : 0)],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function CityMarker({ city, colorMode, language, zoom, isSelected, onClick }: Props) {
  const t = language === 'he' ? he : en;
  const score = calcPrivilegeScore(city);
  const color =
    colorMode === 'time'
      ? colorForSeconds(city.alarmSeconds)
      : colorForPrivilege(score.total);

  const name = language === 'he' ? city.nameHe : city.nameEn;
  const icon = makeIcon(color, isSelected, name, zoom);

  return (
    <Marker
      position={[city.lat, city.lng]}
      icon={icon}
      eventHandlers={{ click: () => onClick(city) }}
    >
      <Tooltip>
        <strong>{name}</strong><br />
        {colorMode === 'time' ? (
          <>{city.alarmSeconds}s</>
        ) : (
          <>{score.total.toFixed(1)} — {t.cityInfo.privilegeLabels[score.label]}</>
        )}
      </Tooltip>
    </Marker>
  );
}
