import type { Language } from '../../types';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';

interface Props {
  language: Language;
  cityCount: number;
  loaded: boolean;
  onToggleLanguage: () => void;
  onMenuToggle: () => void;
}

export default function Header({ language, cityCount, loaded, onToggleLanguage, onMenuToggle }: Props) {
  const t = language === 'he' ? he : en;

  return (
    <header className="app-header">
      <button className="menu-toggle" onClick={onMenuToggle} aria-label="Toggle menu">☰</button>
      <div className="header-text">
        <h1 className="header-title">{t.title}</h1>
        <p className="header-subtitle">
          {t.subtitle}
          {loaded && (
            <span className="locality-count"> · {cityCount.toLocaleString()} {language === 'he' ? 'יישובים' : 'localities'}</span>
          )}
        </p>
      </div>
      <button className="lang-toggle" onClick={onToggleLanguage}>
        {language === 'he' ? 'EN' : 'עב'}
      </button>
    </header>
  );
}
