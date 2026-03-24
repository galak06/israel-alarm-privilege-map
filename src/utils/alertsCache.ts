/**
 * Per-city live alert cache.
 *
 * On city select, attempts to fetch fresh alert counts directly from the
 * Pikud HaOref API. Results are stored in localStorage with a 24h TTL.
 *
 * If the API call fails (CORS, network error, etc.) the caller falls back
 * to the static values already baked into localities.json.
 */

const CACHE_PREFIX = 'alerts_v1_';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface LiveAlerts {
  alertCount: number;       // rockets/aircraft last 30d (from 24h window rolled up)
  notificationCount: number; // advance warnings last 30d
  alertCountTotal: number;  // all categories last 30d
  fetchedAt: number;        // Date.now() at fetch time
}

function cacheKey(nameHe: string) {
  return CACHE_PREFIX + nameHe;
}

function readCache(nameHe: string): LiveAlerts | null {
  try {
    const raw = localStorage.getItem(cacheKey(nameHe));
    if (!raw) return null;
    const entry: LiveAlerts = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > TTL_MS) return null; // stale
    return entry;
  } catch {
    return null;
  }
}

function writeCache(nameHe: string, entry: LiveAlerts) {
  try {
    localStorage.setItem(cacheKey(nameHe), JSON.stringify(entry));
  } catch { /* storage quota or private browsing */ }
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

async function parseOrefResponse(res: Response): Promise<unknown[]> {
  if (!res.ok) return [];
  const text = await res.text();
  if (!text?.trim()) return [];
  try { return JSON.parse(text); } catch { return []; }
}

async function fetchFromOref(nameHe: string): Promise<LiveAlerts | null> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const toDate  = fmtDate(now);
  const from24  = fmtDate(yesterday);
  const from30  = fmtDate(thirtyDaysAgo);

  const base      = 'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx';
  const cityParam = `city_0=${encodeURIComponent(nameHe)}`;

  const [recs24, recs30] = await Promise.all([
    fetch(`${base}?lang=he&mode=1&fromDate=${from24}&toDate=${toDate}&${cityParam}`).then(parseOrefResponse),
    fetch(`${base}?lang=he&mode=1&fromDate=${from30}&toDate=${toDate}&${cityParam}`).then(parseOrefResponse),
  ]);

  let alertCount = 0;
  let notificationCount = 0;

  for (const r of recs24 as Array<{ category?: number }>) {
    const cat = r.category;
    if (cat === 1 || cat === 2 || cat === 13) alertCount++;
    else if (cat === 14) notificationCount++;
  }

  const alertCountTotal = recs30.length;

  return { alertCount, notificationCount, alertCountTotal, fetchedAt: Date.now() };
}

/**
 * Returns live alert counts for a city, using localStorage cache (24h TTL).
 * Returns null if both cache and API fail — caller should use static data.
 */
export async function getLiveAlerts(nameHe: string): Promise<LiveAlerts | null> {
  const cached = readCache(nameHe);
  if (cached) return cached;

  try {
    const fresh = await fetchFromOref(nameHe);
    if (fresh) writeCache(nameHe, fresh);
    return fresh;
  } catch {
    return null; // CORS or network — silent fallback
  }
}

/** How old is the cached entry, in minutes. Returns null if no cache. */
export function cacheAgeMinutes(nameHe: string): number | null {
  try {
    const raw = localStorage.getItem(cacheKey(nameHe));
    if (!raw) return null;
    const entry: LiveAlerts = JSON.parse(raw);
    return Math.floor((Date.now() - entry.fetchedAt) / 60_000);
  } catch {
    return null;
  }
}
