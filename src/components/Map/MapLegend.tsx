import { legendEntries, privilegeLegendEntries } from '../../utils/colorScale';
import type { ColorMode, Language } from '../../types';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';

interface Props {
  colorMode: ColorMode;
  language: Language;
  hidden?: boolean;
}

export default function MapLegend({ colorMode, language, hidden }: Props) {
  if (hidden) return null;
  const t = language === 'he' ? he : en;
  const entries = colorMode === 'time' ? legendEntries : privilegeLegendEntries;
  const title = colorMode === 'time' ? t.legend.timeTitle : t.legend.privilegeTitle;

  return (
    <div className="map-legend">
      <div className="legend-title">{title}</div>
      {entries.map((e) => (
        <div key={e.label} className="legend-row">
          <span className="legend-swatch" style={{ background: e.color }} />
          <span>{e.label}</span>
        </div>
      ))}
    </div>
  );
}
