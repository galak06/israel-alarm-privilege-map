/**
 * Per-city live alert cache — Redalert API only.
 *
 * Fetches two date windows in parallel from redalert.orielhaim.com:
 *   - 24h window  → alertCount  (displayed as "last 24h")
 *   - 30d window  → alertCountTotal + alertCountNormalized (scoring)
 *
 * Results are stored in localStorage with a 24h TTL.
 * API key injected at build time via VITE_REDALERT_API_KEY.
 */

const REDALERT_CACHE_KEY    = 'redalert_v3';
const REDALERT_CITY_PREFIX  = 'redalert_city_v1_';
const TTL_MS                = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT         = 8_000;

const ALARM_TYPES = new Set(['missiles', 'hostileAircraftIntrusion', 'terroristInfiltration', 'radiologicalEvent', 'hazardousMaterials', 'tsunami', 'earthQuake']);

export interface LiveAlerts {
  alertCount?:           number;  // real alarms 24h (missiles/aircraft/infiltration/etc.)
  notificationCount?:    number;  // newsFlash 24h
  alertCountTotal?:      number;  // all types 30d  (Redalert /stats/cities)
  alertCountNormalized?: number;  // 0-1 vs dataset max (Redalert)
  fetchedAt:             number;
}

interface CityHistoryCache {
  alertCount:        number;
  notificationCount: number;
  fetchedAt:         number;
}

interface RedalertRow {
  city:      string;
  count30d:  number;
  count24h:  number;
}

interface RedalertCache {
  rows:      RedalertRow[];
  maxCount:  number;   // max of count30d across all cities
  fetchedAt: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function lsRead<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : null; }
  catch { return null; }
}
function lsWrite(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

// ── Per-city 24h split (history endpoint) ────────────────────────────────────

function readCityCache(nameHe: string): CityHistoryCache | null {
  const c = lsRead<CityHistoryCache>(REDALERT_CITY_PREFIX + nameHe);
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

async function fetchCityHistory(apiKey: string, cityName: string): Promise<CityHistoryCache | null> {
  const now    = new Date().toISOString();
  const ago24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const LIMIT  = 100;
  let offset   = 0;
  let alarms   = 0;
  let newsFlashCount = 0;

  try {
    while (true) {
      const url = `https://redalert.orielhaim.com/api/stats/history?cityName=${encodeURIComponent(cityName)}&startDate=${ago24h}&endDate=${now}&limit=${LIMIT}&offset=${offset}`;
      const res = await withTimeout(
        fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }),
        FETCH_TIMEOUT,
      );
      if (!res?.ok) return null;
      const json = await res.json();
      const page: Array<{ type?: string }> = json.data ?? [];
      for (const event of page) {
        if (event.type === 'newsFlash') newsFlashCount++;
        else if (event.type && ALARM_TYPES.has(event.type)) alarms++;
      }
      offset += page.length;
      if (page.length < LIMIT || offset >= (json.pagination?.total ?? Infinity)) break;
    }
    return { alertCount: alarms, notificationCount: newsFlashCount, fetchedAt: Date.now() };
  } catch { return null; }
}

// ── Redalert bulk fetch (/stats/cities) ───────────────────────────────────────

async function fetchWindow(apiKey: string, startDate: string, endDate: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  let offset = 0;
  const LIMIT = 500;

  while (true) {
    const url = `https://redalert.orielhaim.com/api/stats/cities?startDate=${startDate}&endDate=${endDate}&limit=${LIMIT}&offset=${offset}`;
    const res = await withTimeout(
      fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }),
      FETCH_TIMEOUT,
    );
    if (!res?.ok) break;
    const json = await res.json();
    const page: Array<{ city?: string; name?: string; count?: number }> = json.data ?? [];
    for (const r of page) {
      const city = r.city ?? r.name;
      if (city) result.set(city, (result.get(city) ?? 0) + (r.count ?? 0));
    }
    offset += page.length;
    if (page.length < LIMIT || offset >= (json.pagination?.total ?? Infinity)) break;
  }
  return result;
}

async function fetchRedalert(): Promise<RedalertCache | null> {
  const key = import.meta.env.VITE_REDALERT_API_KEY as string | undefined;
  if (!key) return null;

  const now     = new Date().toISOString();
  const ago24h  = new Date(Date.now() -      24 * 3600 * 1000).toISOString();
  const ago30d  = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  try {
    const [map24h, map30d] = await Promise.all([
      fetchWindow(key, ago24h, now),
      fetchWindow(key, ago30d, now),
    ]);

    if (map30d.size === 0) return null;

    const rows: RedalertRow[] = [];
    map30d.forEach((count30d, city) => {
      rows.push({ city, count30d, count24h: map24h.get(city) ?? 0 });
    });
    // also add cities with 24h alerts but no 30d entry (edge case)
    map24h.forEach((count24h, city) => {
      if (!map30d.has(city)) rows.push({ city, count30d: 0, count24h });
    });

    const maxCount = Math.max(1, ...rows.map((r) => r.count30d));
    return { rows, maxCount, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

function readCache(): RedalertCache | null {
  const c = lsRead<RedalertCache>(REDALERT_CACHE_KEY);
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

function findCity(rows: RedalertRow[], nameHe: string): RedalertRow | undefined {
  const exact = rows.find((r) => r.city === nameHe);
  if (exact) return exact;
  const base = nameHe.split(/[\s\-–]/)[0].trim();
  return rows.find((r) =>
    r.city.startsWith(base) || base.startsWith(r.city.split(/[\s\-–]/)[0].trim())
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getLiveAlerts(nameHe: string): Promise<LiveAlerts | null> {
  const apiKey = import.meta.env.VITE_REDALERT_API_KEY as string | undefined;

  // Fetch bulk 30d stats and per-city 24h split in parallel
  let redalertCache = readCache();
  const cityHistoryCached = readCityCache(nameHe);

  const [freshBulk, freshHistory] = await Promise.all([
    redalertCache       ? Promise.resolve(null) : fetchRedalert(),
    cityHistoryCached   ? Promise.resolve(null) : (apiKey ? fetchCityHistory(apiKey, nameHe) : Promise.resolve(null)),
  ]);

  if (freshBulk)    { redalertCache = freshBulk; lsWrite(REDALERT_CACHE_KEY, freshBulk); }
  const cityHistory = cityHistoryCached ?? freshHistory;
  if (freshHistory) lsWrite(REDALERT_CITY_PREFIX + nameHe, freshHistory);

  if (!redalertCache) return null;
  const row = findCity(redalertCache.rows, nameHe);
  if (!row) return null;

  const result: LiveAlerts = {
    alertCountTotal:      row.count30d,
    alertCountNormalized: row.count30d / redalertCache.maxCount,
    fetchedAt:            Date.now(),
  };

  if (cityHistory) {
    result.alertCount        = cityHistory.alertCount;
    result.notificationCount = cityHistory.notificationCount;
  } else {
    // fallback: use bulk 24h count (all types combined)
    result.alertCount = row.count24h;
  }

  return result;
}

export function cacheAgeMinutes(): number | null {
  const c = lsRead<RedalertCache>(REDALERT_CACHE_KEY);
  if (!c || Date.now() - c.fetchedAt > TTL_MS) return null;
  return Math.floor((Date.now() - c.fetchedAt) / 60_000);
}
