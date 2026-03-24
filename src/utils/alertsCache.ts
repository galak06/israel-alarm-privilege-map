/**
 * Per-city live alert cache.
 *
 * Fetches from two sources in parallel (both with 8s timeout):
 *   - Redalert API  → alertCountTotal, alertCountNormalized  (all cities, one request)
 *   - /api/oref-proxy.php → alertCount, notificationCount   (per city, server-side proxy)
 *
 * Results are stored in localStorage with a 24h TTL.
 * Fields are optional — only populated when the source succeeds.
 * Callers fall back to static data for any missing field.
 */

const REDALERT_CACHE_KEY  = 'redalert_v1';
const OREF_CACHE_PREFIX   = 'oref_v1_';
const TTL_MS              = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS    = 8_000;

export interface LiveAlerts {
  alertCount?:           number;  // rockets last 30d  (oref proxy)
  notificationCount?:    number;  // advance warnings  (oref proxy)
  alertCountTotal?:      number;  // all types 30d     (redalert)
  alertCountNormalized?: number;  // 0-1 vs dataset max (redalert)
  fetchedAt:             number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

function lsRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch { return null; }
}

function lsWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── Redalert (all-cities totals) ─────────────────────────────────────────────

interface RedalertRow   { city: string; count: number; }
interface RedalertCache { rows: RedalertRow[]; maxCount: number; fetchedAt: number; }

function readRedalertCache(): RedalertCache | null {
  const c = lsRead<RedalertCache>(REDALERT_CACHE_KEY);
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

async function fetchRedalert(): Promise<RedalertCache | null> {
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
      const res = await withTimeout(
        fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } }),
        FETCH_TIMEOUT_MS,
      );
      if (!res?.ok) break;
      const json = await res.json();
      const page: Array<{ city?: string; name?: string; count?: number }> = json.data ?? [];
      for (const r of page) {
        const city = r.city ?? r.name;
        if (city) rows.push({ city, count: r.count ?? 0 });
      }
      offset += page.length;
      if (page.length < LIMIT || offset >= (json.pagination?.total ?? Infinity)) break;
    }
  } catch { return null; }

  if (rows.length === 0) return null;
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return { rows, maxCount, fetchedAt: Date.now() };
}

function findCity(rows: RedalertRow[], nameHe: string): RedalertRow | undefined {
  const exact = rows.find((r) => r.city === nameHe);
  if (exact) return exact;
  const base = nameHe.split(/[\s\-–]/)[0].trim();
  return rows.find((r) => r.city.startsWith(base) || base.startsWith(r.city.split(/[\s\-–]/)[0].trim()));
}

// ── Oref proxy (per-city rockets / notifications) ────────────────────────────

interface OrefEntry { alertCount: number; notificationCount: number; fetchedAt: number; }

function readOrefCache(nameHe: string): OrefEntry | null {
  const c = lsRead<OrefEntry>(OREF_CACHE_PREFIX + nameHe);
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

async function fetchOrefProxy(nameHe: string): Promise<OrefEntry | null> {
  try {
    const res = await withTimeout(
      fetch(`/api/oref-proxy.php?city=${encodeURIComponent(nameHe)}`),
      FETCH_TIMEOUT_MS,
    );
    if (!res?.ok) return null;
    const json = await res.json() as { alertCount?: number; notificationCount?: number };
    return { alertCount: json.alertCount ?? 0, notificationCount: json.notificationCount ?? 0, fetchedAt: Date.now() };
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns live alert data for a city. Fields are only set when their source
 * succeeded — callers should fall back to static data for missing fields.
 * Returns null only if both sources fail entirely.
 */
export async function getLiveAlerts(nameHe: string): Promise<LiveAlerts | null> {
  const cachedRedalert = readRedalertCache();
  const cachedOref     = readOrefCache(nameHe);

  const [freshRedalert, freshOref] = await Promise.all([
    cachedRedalert ? Promise.resolve(null) : fetchRedalert(),
    cachedOref     ? Promise.resolve(null) : fetchOrefProxy(nameHe),
  ]);

  const redalert = cachedRedalert ?? freshRedalert;
  const oref     = cachedOref     ?? freshOref;

  if (freshRedalert) lsWrite(REDALERT_CACHE_KEY, freshRedalert);
  if (freshOref)     lsWrite(OREF_CACHE_PREFIX + nameHe, freshOref);

  if (!redalert && !oref) return null;

  const result: LiveAlerts = { fetchedAt: Date.now() };

  if (oref) {
    result.alertCount        = oref.alertCount;
    result.notificationCount = oref.notificationCount;
  }

  if (redalert) {
    const row = findCity(redalert.rows, nameHe);
    if (row) {
      result.alertCountTotal      = row.count;
      result.alertCountNormalized = row.count / redalert.maxCount;
    }
  }

  // Return null if we got a response but couldn't populate any useful field
  if (
    result.alertCount        === undefined &&
    result.notificationCount === undefined &&
    result.alertCountTotal   === undefined
  ) return null;

  return result;
}

/** Minutes since the redalert cache was last populated. Null if no valid cache. */
export function cacheAgeMinutes(): number | null {
  const c = lsRead<RedalertCache>(REDALERT_CACHE_KEY);
  if (!c || Date.now() - c.fetchedAt > TTL_MS) return null;
  return Math.floor((Date.now() - c.fetchedAt) / 60_000);
}
