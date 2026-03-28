import type { City, FamilyStatus, PrivilegeScore, ShelterType } from '../types';
import { ALERTS_ENABLED } from './featureFlags';

// Minimum seconds needed to reach each shelter type
// mamad = inside your apartment, stairwell = leave flat but stay in building, etc.
const MIN_TIME_NEEDED: Record<ShelterType, number> = {
  mamad:     15,   // a few steps inside your apartment
  stairwell: 25,   // walk to stairwell
  shelter:   45,   // go to building's shelter room
  public:    90,   // exit building + reach public shelter
};

const SHELTER_WEIGHT: Record<ShelterType, number> = {
  mamad:     1.0,  // in-apartment safe room
  shelter:   0.75, // dedicated building shelter room (leave apartment, stay in building)
  stairwell: 0.2,  // reinforced stairwell — thin walls, open staircase, very limited protection
  public:    0.0,  // public shelter outside
};

// Family status score (0–10): personal factor only
// Children significantly increase the burden: they slow shelter response, require carrying/guiding,
// and add immense psychological stress and responsibility.
const FAMILY_SCORE: Record<FamilyStatus, number> = {
  divorced_with_children:  0,  // sole caretaker + kids: most vulnerable, no backup
  divorced:                4,  // alone, potentially shared custody stress/uncertainty
  single:                  5,  // only yourself to protect, neutral
  married_with_children:   7,  // partner helps, but kids add burden and slow response
  relationship:            8,  // partner support, no dependents, less legal formality
  married:                10,  // stable partnership, no dependents: most privileged
};

// Location score (0–10): proximity to emergency services, hospitals, infrastructure.
// Higher score = better access to resources and infrastructure support.
const LOCATION_SCORE: Record<City['region'], number> = {
  center:    10,  // Tel Aviv metro — highest density of hospitals, emergency services, and infrastructure
  jerusalem:  9,  // Major city, excellent infrastructure, but complex logistics
  north:      6,  // Galilee/Golan — sparser emergency services, more rural terrain
  south:      4,  // Gaza envelope/Negev — sustained conflict history, economic and infra gaps
};

// Scoring breakdown (Total 120 Personal / 110 City):
//   timeScore     0–20   warning time adequacy (relative to shelter type)
//   shelterScore  0–20   shelter quality and accessibility
//   safetyScore   0–30   last-30d alert frequency + notification burden
//                         Notification burden: advance warnings require physically going to an
//                         external shelter. People without a mamad must leave every time.
//   gapScore      0–30   average hours between alarm events + clumping (barrage) penalty.
//                         Measures quality of rest and predictability.
//   locationScore 0–10   city region infrastructure & support resources
//   familyScore   0–10   personal family situation (support vs. dependents)

// Normalize notification count
const MAX_NOTIF_24H = 15;
const MAX_NOTIF_30D = 120;

// Gap normalization: 24h average gap between alarms = full score
const MAX_GAP_HOURS = 24;
const MIN_GAP_THRESHOLD = 1; // Hours. Anything below this is considered a "barrage" burden.

// Shelter vulnerability to advance-warning burden (mamad = can shelter in place, no burden)
const NOTIF_SHELTER_VULN: Record<ShelterType, number> = {
  mamad:     0.0,  // in-unit safe room — no need to go anywhere
  shelter:   0.5,  // building shelter — leave apartment but stay inside building
  stairwell: 0.9,  // reinforced stairwell — leave apartment, very limited protection
  public:    1.0,  // must go outside — maximum burden
};

function calculateGapScore(alertCountTotal: number, minGapHours?: number): number {
  if (alertCountTotal === 0) return 30;

  const avgGapHours = (30 * 24) / alertCountTotal;
  // Use square root for a less harsh drop-off: sqrt(avg / max) * 30
  let score = Math.min(1, Math.sqrt(avgGapHours / MAX_GAP_HOURS)) * 30;

  // Penalize for clumping (barrages) if we have at least 2 alarms
  if (alertCountTotal > 1 && minGapHours !== undefined && minGapHours !== null) {
    // If min gap is less than 1 hour, subtract up to 5 points
    const clumpingPenalty = Math.max(0, 1 - (minGapHours / MIN_GAP_THRESHOLD)) * 5;
    score = Math.max(0, score - clumpingPenalty);
  }
  
  return Math.round(score * 10) / 10;
}

export function calcPrivilegeScorePersonal(
  city: City,
  shelter: ShelterType,
  familyStatus: FamilyStatus,
): PrivilegeScore {
  const timeAdequacy  = Math.min(1, city.alarmSeconds / MIN_TIME_NEEDED[shelter]);
  const timeScore     = Math.round(timeAdequacy * 20 * 10) / 10;
  const shelterScore  = Math.round((SHELTER_WEIGHT[shelter] * 20) * 10) / 10;

  // Notification burden: 24h (live) and 30d (baked) components (max 10 points total penalty)
  const notifPenalty24h = Math.min(1, city.notificationCount / MAX_NOTIF_24H) * NOTIF_SHELTER_VULN[shelter] * 5;
  const notifPenalty30d = Math.min(1, (city.notificationCountTotal ?? 0) / MAX_NOTIF_30D) * NOTIF_SHELTER_VULN[shelter] * 5;
  const notifPenalty = notifPenalty24h + notifPenalty30d;

  // safetyScore (0-30): Use square root for alertCountNormalized to make it less harsh.
  // (1 - sqrt(norm)) * 30
  const baseSafety = (1 - Math.sqrt(city.alertCountNormalized)) * 30;
  const safetyScore = Math.max(0, Math.round((baseSafety - notifPenalty) * 10) / 10);
  
  const gapScore      = calculateGapScore(city.alertCountTotal, city.minGapHours);

  const locationScore = LOCATION_SCORE[city.region] ?? 5;
  const familyScore   = FAMILY_SCORE[familyStatus];
  
  const total = Math.round(
    (timeScore + shelterScore + locationScore + familyScore + (ALERTS_ENABLED ? safetyScore + gapScore : 0)) * 10
  ) / 10;
  
  return { total, timeScore, shelterScore, safetyScore, gapScore, locationScore, familyScore, label: scoreLabel(total, true) };
}

export function calcPrivilegeScore(city: City): PrivilegeScore {
  const { mamad, stairwell } = city.shelterDistribution;
  const pub = city.shelterDistribution.public;
  const bldgShelter = Math.max(0, 1 - mamad - stairwell - pub);
  const weightedMinTime = mamad * MIN_TIME_NEEDED.mamad
    + stairwell * MIN_TIME_NEEDED.stairwell
    + bldgShelter * MIN_TIME_NEEDED.shelter
    + pub * MIN_TIME_NEEDED.public;
    
  const timeScore    = Math.round(Math.min(1, city.alarmSeconds / weightedMinTime) * 20 * 10) / 10;
  const shelterScore = Math.round(((mamad * 1.0 + stairwell * SHELTER_WEIGHT.stairwell + bldgShelter * SHELTER_WEIGHT.shelter) * 20) * 10) / 10;

  // Notification burden (max 10 points total penalty)
  const notifPenalty24h = Math.min(1, city.notificationCount / MAX_NOTIF_24H) * (1 - mamad) * 5;
  const notifPenalty30d = Math.min(1, (city.notificationCountTotal ?? 0) / MAX_NOTIF_30D) * (1 - mamad) * 5;
  const notifPenalty = notifPenalty24h + notifPenalty30d;

  const baseSafety = (1 - Math.sqrt(city.alertCountNormalized)) * 30;
  const safetyScore = Math.max(0, Math.round((baseSafety - notifPenalty) * 10) / 10);
  
  const gapScore      = calculateGapScore(city.alertCountTotal, city.minGapHours);

  const locationScore = LOCATION_SCORE[city.region] ?? 5;

  const total = Math.round(
    (timeScore + shelterScore + locationScore + (ALERTS_ENABLED ? safetyScore + gapScore : 0)) * 10
  ) / 10;
  
  return { total, timeScore, shelterScore, safetyScore, gapScore, locationScore, familyScore: 0, label: scoreLabel(total, false) };
}

// Labels use percentage of max
function scoreLabel(total: number, personal: boolean): PrivilegeScore['label'] {
  const max = personal
    ? (ALERTS_ENABLED ? 120 : 100)
    : (ALERTS_ENABLED ? 110 : 90);
  const pct = total / max;
  if (pct < 0.20) return 'very-low';
  if (pct < 0.40) return 'low';
  if (pct < 0.60) return 'medium';
  if (pct < 0.80) return 'high';
  return 'very-high';
}
