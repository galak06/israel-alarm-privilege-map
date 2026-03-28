import type { City, Language } from '../../types';
import { calcPrivilegeScore } from '../../utils/privilegeCalc';
import { ALERTS_ENABLED } from '../../utils/featureFlags';
import { colorForPrivilege } from '../../utils/colorScale';
import { en } from '../../i18n/en';
import { he } from '../../i18n/he';

interface Props {
  city: City;
  language: Language;
}

export default function PrivilegeScoreCard({ city, language }: Props) {
  const t = language === 'he' ? he : en;
  const score = calcPrivilegeScore(city);
  const scoreMax = ALERTS_ENABLED ? 110 : 90;
  const color = colorForPrivilege((score.total / scoreMax) * 100);
  const labelText = t.cityInfo.privilegeLabels[score.label];

  return (
    <div className="score-card">
      <div className="score-header">{t.cityInfo.privilegeScore}</div>
      <div className="score-circle" style={{ borderColor: color, color }}>
        <span className="score-number">{score.total.toFixed(1)}</span>
        <span className="score-label">{labelText}</span>
      </div>
      <div className="score-breakdown">
        <div className="score-row">
          <span>{t.cityInfo.timeScore}</span>
          <span>{score.timeScore.toFixed(1)}/20</span>
        </div>
        <div className="score-row">
          <span>{t.cityInfo.shelterScore}</span>
          <span>{score.shelterScore.toFixed(1)}/20</span>
        </div>
        {ALERTS_ENABLED && (
          <>
            <div className="score-row">
              <span>{t.cityInfo.safetyScore}</span>
              <span>{score.safetyScore.toFixed(1)}/30</span>
            </div>
            <div className="score-row">
              <span>{t.cityInfo.gapScore}</span>
              <span>{score.gapScore.toFixed(1)}/30</span>
            </div>
          </>
        )}
        <div className="score-row">
          <span>{t.cityInfo.locationScore}</span>
          <span>{score.locationScore.toFixed(0)}/10</span>
        </div>
        <div className="score-row score-total">
          <span>{t.cityInfo.total}</span>
          <span>{score.total.toFixed(1)}/{scoreMax}</span>
        </div>
      </div>
    </div>
  );
}
