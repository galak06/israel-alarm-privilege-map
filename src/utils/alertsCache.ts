/**
 * Per-city live alert cache using the Redalert API.
 *
 * On first city select (or when cache is stale) fetches the full 30-day
 * city stats from redalert.orielhaim.com (all cities in one request).
 * The dataset is stored in localStorage with a 24h TTL so subsequent
 * city selections are instant.
 *
 * The API key is injected at build time via VITE_REDALERT_API_KEY
 * (sourced from the REDALERT_API_KEY GitHub Secret — never in source).
 *
 * Falls back silently to static localities.json data if the API is
 * unreachable or the key is not set.
 */

const CACHE_KEY = 'redalert_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface LiveAlerts {
  alertCountTotal: number;       // 30-day total across all alert types
  alertCountNormalized: number;  // 0–1 normalized against current dataset max
  fetchedAt: number;
}

interface RedalertRow {
  city: string;
  count: number;
}

interface AllCitiesCache {
  rows: RedalertRow[];
  maxCount: number;
  fetchedAt: number;
}

function readCache(): AllCitiesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: AllCitiesCache = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(entry: AllCitiesCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* quota or private browsing */ }
}

async function fetchRedalert(): Promise<AllCitiesCache | null> {
  const key = import.meta.env.VITE_REDALERT_API_KEY as string | undefined;
  if (!key) return null;

  const endDate   = new Date().toISOString();
  const startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const rows: RedalertRow[] = [];
  let offset = 0;
  const LIMIT = 500;

  try {
    while (true) {
      const url = `https://redalert.orielhaim.com/api/stats/cities?startDate=${startDate}&endDate=${endDate}&limit=${LIMIT}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const page: Array<{ city?: string; name?: string; count?: number }> = json.data ?? [];
      for (const r of page) {
        const city = r.city ?? r.name;
        if (city) rows.push({ city, count: r.count ?? 0 });
      }
      offset += page.length;
      if (page.length < LIMIT || offset >= (json.pagination?.total ?? Infinity)) break;
    }
  } catch {
    return null; // CORS or network error
  }

  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return { rows, maxCount, fetchedAt: Date.now() };
}

function findCity(rows: RedalertRow[], nameHe: string): RedalertRow | undefined {
  // Exact match first
  const exact = rows.find((r) => r.city === nameHe);
  if (exact) return exact;
  // Substring fallback (handles district suffixes like "אשדוד - א,ב,ד,ה")
  const base = nameHe.split(/[\s-–]/)[0].trim();
  return rows.find((r) => r.city.startsWith(base) || base.startsWith(r.city.split(/[\s-–]/)[0].trim()));
}

/**
 * Returns live alert data for a city, backed by a 24h localStorage cache.
 * Returns null on failure — caller should use static data.
 */
export async function getLiveAlerts(nameHe: string): Promise<LiveAlerts | null> {
  let cache = readCache();

  if (!cache) {
    cache = await fetchRedalert();
    if (!cache) return null;
    writeCache(cache);
  }

  const row = findCity(cache.rows, nameHe);
  if (!row) return null;

  return {
    alertCountTotal: row.count,
    alertCountNormalized: row.count / cache.maxCount,
    fetchedAt: cache.fetchedAt,
  };
}

/** How old is the cache in minutes. Returns null if no valid cache. */
export function cacheAgeMinutes(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: AllCitiesCache = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > TTL_MS) return null;
    return Math.floor((Date.now() - entry.fetchedAt) / 60_000);
  } catch {
    return null;
  }
}
