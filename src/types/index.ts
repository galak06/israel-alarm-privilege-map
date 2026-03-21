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
  alertCount: number;            // Rocket alarms only — tzevaadom threat=0, 30-day rolling cache
  notificationCount: number;     // Advance warnings — tzevaadom threat=5, 30-day rolling cache
  alertCountTotal: number;       // All alert types — redalert 30-day total (for score normalization)
  alertCountNormalized: number;  // 0–1 normalized from alertCountTotal
}

export interface PrivilegeScore {
  total: number;         // 0–110 personal / 0–100 city
  timeScore: number;     // 0–40
  shelterScore: number;  // 0–40
  safetyScore: number;   // 0–10 (inverse of last-30d alert frequency)
  locationScore: number; // 0–10 (city region: infrastructure & support resources)
  familyScore: number;   // 0–10 (family status factor, personal only)
  label: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
}
