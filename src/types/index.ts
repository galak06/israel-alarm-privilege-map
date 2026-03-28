export type ShelterType = 'mamad' | 'shelter' | 'stairwell' | 'public';
export type FamilyStatus = 'divorced_with_children' | 'divorced' | 'single' | 'relationship' | 'married' | 'married_with_children';
export type ColorMode = 'time' | 'privilege';
export type Language = 'he' | 'en';
export type ThreatSource = 'hamas' | 'hezbollah' | 'iran';

export interface ShelterDistribution {
  mamad: number;      // 0–1 fraction of housing with in-unit safe room
  stairwell: number;
  public: number;
}

export interface City {
  id: string;
  nameHe: string;
  nameEn: string;
  lat: number;
  lng: number;
  alarmSeconds: number;          // Official Pikud HaOref time
  shelterDistribution: ShelterDistribution;
  population?: number;
  region: 'north' | 'center' | 'south' | 'jerusalem';
  threatSources: ThreatSource[];
  alertCount: number;            // Real alarms 24h (missiles/aircraft/infiltration — live fetch)
  notificationCount: number;     // Advance warnings 24h (newsFlash — live fetch)
  alertCountTotal: number;       // Real alarms 30d (baked in localities.json from history)
  notificationCountTotal?: number; // Advance warnings 30d (baked in localities.json from history)
  alertCountNormalized: number;  // 0–1 normalized from alertCountTotal
  minGapHours?: number;          // Minimum gap between consecutive real alarms in 30d (undefined = ≤1 alarm)
}

export interface PrivilegeScore {
  total: number;         // 0–120 personal / 0–110 city (with ALERTS_ENABLED)
  timeScore: number;     // 0–20 (warning time adequacy)
  shelterScore: number;  // 0–20 (shelter quality)
  safetyScore: number;   // 0–30 (inverse of last-30d alert frequency + notification burden)
  gapScore: number;      // 0–30 (average hours between alarms and rest time)
  locationScore: number; // 0–10 (city region: infrastructure & support resources)
  familyScore: number;   // 0–10 (family status factor, personal only)
  label: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
}
