import type { City, FamilyStatus, PrivilegeScore, ShelterType } from '../types';
import { ALERTS_ENABLED } from './featureFlags';

const MAX_TIME = 180;

const SHELTER_WEIGHT: Record<ShelterType, number> = {
  mamad:     1.0,  // in-apartment safe room
  shelter:   0.75, // dedicated building shelter room (leave apartment, stay in building)
  stairwell: 0.5,  // reinforced stairwell
  public:    0.0,  // public shelter outside
};

// Family status score (0–10): personal factor only
const FAMILY_SCORE: Record<FamilyStatus, number> = {
  divorced_with_children:  0,  // sole caretaker of dependents, most vulnerable
  divorced:                3,  // legally complex, occasional childcare
  single:                  5,  // only yourself to protect, neutral
  relationship:            7,  // partner support
  married:                 8,  // stable partnership, shared responsibility
  married_with_children:  10,  // partner + children: full support system
};

// Location score (0–10): proximity to emergency services, hospitals, infrastructure.
// Center cities have the richest support ecosystem; south has sustained conflict & less infrastructure.
const LOCATION_SCORE: Record<City['region'], number> = {
  center:    10,  // Tel Aviv metro — best hospitals, emergency services, infrastructure
  jerusalem:  8,  // Major city, good infrastructure, but active conflict zone
  north:      5,  // Galilee/Golan — Hezbollah threat, sparser emergency services
  south:      3,  // Gaza envelope — sustained conflict, economic disadvantage
};

// Scoring breakdown (ALERTS_ENABLED=false):
//   timeScore     0–40   warning time
//   shelterScore  0–40   shelter quality
//   locationScore 0–10   city region infrastructure & support
//   familyScore   0–10   family situation (personal only)
//   safetyScore   0–10   last-30d alert frequency + notification burden — GATED by ALERTS_ENABLED flag
//                         Notification burden: advance warnings (cat=14) require physically going to an
//                         external shelter. People without a mamad must get dressed and go outside every
//                         time — up to 4 penalty points subtracted based on notification count × shelter
//                         vulnerability (0 penalty if you have a mamad).
//
//   City max (flag off):  40+40+10      = 90
//   City max (flag on):   40+40+10+10   = 100
//   Personal max (off):   40+40+10+10   = 100
//   Personal max (on):    40+40+10+10+10= 110

// Normalize notification count: 20 notifications/month = max burden
const MAX_NOTIF = 20;

// Shelter vulnerability to advance-warning burden (mamad = can shelter in place, no burden)
const NOTIF_SHELTER_VULN: Record<ShelterType, number> = {
  mamad:     0.0,  // in-unit safe room — no need to go anywhere
  shelter:   0.5,  // building shelter — leave apartment but stay inside building
  stairwell: 0.75, // reinforced stairwell — leave apartment, stay in building
  public:    1.0,  // must go outside — maximum burden
};

export function calcPrivilegeScorePersonal(
  city: City,
  shelter: ShelterType,
  familyStatus: FamilyStatus,
): PrivilegeScore {
  const timeScore     = Math.round((Math.min(40, (city.alarmSeconds / MAX_TIME) * 40)) * 10) / 10;
  const shelterScore  = Math.round((SHELTER_WEIGHT[shelter] * 40) * 10) / 10;
  const notifPenalty  = Math.min(1, city.notificationCount / MAX_NOTIF) * NOTIF_SHELTER_VULN[shelter] * 4;
  const safetyScore   = Math.max(0, Math.round(((1 - city.alertCountNormalized) * 10 - notifPenalty) * 10) / 10);
  const locationScore = LOCATION_SCORE[city.region] ?? 5;
  const familyScore   = FAMILY_SCORE[familyStatus];
  const total = Math.round(
    (timeScore + shelterScore + locationScore + familyScore + (ALERTS_ENABLED ? safetyScore : 0)) * 10
  ) / 10;
  return { total, timeScore, shelterScore, safetyScore, locationScore, familyScore, label: scoreLabel(total, true) };
}

export function calcPrivilegeScore(city: City): PrivilegeScore {
  const timeScore    = Math.round((Math.min(40, (city.alarmSeconds / MAX_TIME) * 40)) * 10) / 10;

  const { mamad, stairwell } = city.shelterDistribution;
  const shelterScore = Math.round(((mamad * 1.0 + stairwell * 0.5) * 40) * 10) / 10;

  // Notification burden: weighted by fraction of residents without a mamad
  const notifPenalty  = Math.min(1, city.notificationCount / MAX_NOTIF) * (1 - mamad) * 4;
  const safetyScore   = Math.max(0, Math.round(((1 - city.alertCountNormalized) * 10 - notifPenalty) * 10) / 10);
  const locationScore = LOCATION_SCORE[city.region] ?? 5;

  const total = Math.round(
    (timeScore + shelterScore + locationScore + (ALERTS_ENABLED ? safetyScore : 0)) * 10
  ) / 10;
  return { total, timeScore, shelterScore, safetyScore, locationScore, familyScore: 0, label: scoreLabel(total, false) };
}

// Labels use percentage of max
function scoreLabel(total: number, personal: boolean): PrivilegeScore['label'] {
  const max = personal
    ? (ALERTS_ENABLED ? 110 : 100)
    : (ALERTS_ENABLED ? 100 : 90);
  const pct = total / max;
  if (pct < 0.20) return 'very-low';
  if (pct < 0.40) return 'low';
  if (pct < 0.60) return 'medium';
  if (pct < 0.80) return 'high';
  return 'very-high';
}
