/**
 * Loads localities from the generated JSON db (src/data/localities.json).
 * Falls back to the hand-curated cities.ts if the JSON hasn't been generated yet.
 */
import { useState, useEffect } from 'react';
import type { City } from '../types';
import { cities as fallbackCities } from '../data/cities';

interface LocalityRecord {
  id: string;
  nameHe: string;
  nameEn: string;
  lat: number;
  lng: number;
  alarmSeconds: number;
  shelterDistribution: { mamad: number; stairwell: number; public: number };
  region: 'north' | 'center' | 'south' | 'jerusalem';
  threatSources: Array<'hamas' | 'hezbollah' | 'iran'>;
  alertCount?: number;
  notificationCount?: number;
  alertCountTotal?: number;
  alertCountNormalized?: number;
}

function toCity(r: LocalityRecord): City {
  return {
    id: r.id,
    nameHe: r.nameHe,
    nameEn: r.nameEn,
    lat: r.lat,
    lng: r.lng,
    alarmSeconds: r.alarmSeconds,
    shelterDistribution: r.shelterDistribution,
    region: r.region,
    threatSources: r.threatSources,
    alertCount: r.alertCount ?? 0,
    notificationCount: r.notificationCount ?? 0,
    alertCountTotal: r.alertCountTotal ?? r.alertCount ?? 0,
    alertCountNormalized: r.alertCountNormalized ?? 0,
  };
}

export function useLocalities(): { cities: City[]; loaded: boolean } {
  const [cities, setLocalities] = useState<City[]>(fallbackCities);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/localities.json')
      .then((r) => {
        if (!r.ok) throw new Error('localities.json not found');
        return r.json();
      })
      .then((data: LocalityRecord[]) => {
        setLocalities(data.map(toCity));
        setLoaded(true);
      })
      .catch(() => {
        // JSON not generated yet — keep fallback cities
        setLoaded(true);
      });
  }, []);

  return { cities, loaded };
}
