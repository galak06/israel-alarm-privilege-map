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
// Children reduce the score — they slow shelter response, require carrying/guiding,
// and increase the number of people you are responsible for protecting.
const FAMILY_SCORE: Record<FamilyStatus, number> = {
  divorced_with_children:  0,  // sole caretaker + kids: most vulnerable
  divorced:                3,  // alone, no dependents but legally complex
  single:                  5,  // only yourself to protect, neutral
  married_with_children:   6,  // partner helps, but kids add burden and slow response
  relationship:            7,  // partner support, no dependents
  married:                10,  // stable partnership, no dependents: most privileged
};

// Location score (0–10): proximity to emergency services, hospitals, infrastructure.
// Center cities have the richest support ecosystem; south has sustained conflict & less infrastructure.
const LOCATION_SCORE: Record<City['region'], number> = {
  center:    10,  // Tel Aviv metro — best hospitals, emergency services, infrastructure
  jerusalem:  8,  // Major city, good infrastructure, but active conflict zone
  north:      5,  // Galilee/Golan — Hezbollah threat, sparser emergency services
  south:      3,  // Gaza envelope — sustained conflict, economic disadvantage
};

// Scoring breakdown:
//   timeScore     0–20   warning time adequacy (relative to shelter type)
//   shelterScore  0–20   shelter quality
//   safetyScore   0–30   last-30d alert frequency + notification burden (dominant factor)
//                         No alerts → full 30 pts regardless of shelter/time.
//                         Notification burden: advance warnings require physically going to an
//                         external shelter. People without a mamad must leave every time —
//                         up to 12 penalty points subtracted based on notif count × shelter vuln.
//   gapScore      0–30   average hours between alarm events (30d window) (dominant factor)
//                         No alerts → full 30 pts. Computed as: (30×24)/max(1,alertCountTotal),
//                         capped at MAX_GAP_HOURS. Measures alarm-free rest time.
//   locationScore 0–10   city region infrastructure & support
//   familyScore   0–10   family situation (personal only)
//
//   City max:     20+20+30+30+10         = 110
//   Personal max: 20+20+30+30+10+10      = 120

// Normalize notification count: 20 notifications/month = max burden
const MAX_NOTIF = 20;

// Gap normalization: 72h minimum gap between alarms = full score (≈ one calm day between each alarm)
// Uses actual minimum gap from 30d history when available; falls back to count-based estimate.
const MAX_GAP_HOURS = 72;

// Shelter vulnerability to advance-warning burden (mamad = can shelter in place, no burden)
const NOTIF_SHELTER_VULN: Record<ShelterType, number> = {
  mamad:     0.0,  // in-unit safe room — no need to go anywhere
  shelter:   0.5,  // building shelter — leave apartment but stay inside building
  stairwell: 0.9,  // reinforced stairwell — leave apartment, very limited protection
  public:    1.0,  // must go outside — maximum burden
};

export function calcPrivilegeScorePersonal(
  city: City,
  shelter: ShelterType,
  familyStatus: FamilyStatus,
): PrivilegeScore {
  const timeAdequacy  = Math.min(1, city.alarmSeconds / MIN_TIME_NEEDED[shelter]);
  const timeScore     = Math.round(timeAdequacy * 20 * 10) / 10;
  const shelterScore  = Math.round((SHELTER_WEIGHT[shelter] * 20) * 10) / 10;
  const notifPenalty  = Math.min(1, city.notificationCount / MAX_NOTIF) * NOTIF_SHELTER_VULN[shelter] * 12;
  const safetyScore   = Math.max(0, Math.round(((1 - city.alertCountNormalized) * 30 - notifPenalty) * 10) / 10);
  const gapHours      = city.minGapHours ?? (30 * 24) / Math.max(1, city.alertCountTotal);
  const gapScore      = Math.round(Math.min(30, (gapHours / MAX_GAP_HOURS) * 30) * 10) / 10;
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
  const shelterScore = Math.round(((mamad * 1.0 + stairwell * SHELTER_WEIGHT.stairwell) * 20) * 10) / 10;

  // Notification burden: weighted by fraction of residents without a mamad
  const notifPenalty  = Math.min(1, city.notificationCount / MAX_NOTIF) * (1 - mamad) * 12;
  const safetyScore   = Math.max(0, Math.round(((1 - city.alertCountNormalized) * 30 - notifPenalty) * 10) / 10);
  const gapHours      = city.minGapHours ?? (30 * 24) / Math.max(1, city.alertCountTotal);
  const gapScore      = Math.round(Math.min(30, (gapHours / MAX_GAP_HOURS) * 30) * 10) / 10;
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
