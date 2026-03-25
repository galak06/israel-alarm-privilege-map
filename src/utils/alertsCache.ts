/**
 * Per-city live 24h alert cache — Redalert only (CORS-compatible).
 *
 * Fetches /api/stats/history for the last 24h and aggregates per city:
 *   - alertCount       → real alarms (missiles / aircraft / infiltration / earthquake)
 *   - notificationCount → advance warnings (newsFlash)
 *
 * 30d totals (alertCountTotal, alertCountNormalized, minGapHours) are baked into
 * localities.json by the hourly server-side script and do not need a browser fetch.
 *
 * Results are stored in localStorage with a 1h TTL.
 * API key injected at build time via VITE_REDALERT_API_KEY.
 */

const CACHE_KEY    = 'redalert_v4';
const TTL_MS       = 60 * 60 * 1000;   // 1h — refresh each hour
const FETCH_TIMEOUT = 8_000;

const REAL_TYPES  = new Set(['missiles', 'hostileAircraftIntrusion', 'terroristInfiltration', 'earthQuake']);
const NOTIF_TYPES = new Set(['newsFlash']);

export interface LiveAlerts {
  alertCount?:        number;  // real alarms last 24h
  notificationCount?: number;  // advance warnings last 24h
  fetchedAt:          number;
}

interface CityEntry { alarms: number; notifs: number }

interface AlertCache {
  cities:    Record<string, CityEntry>;
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

// ── 24h history fetch ─────────────────────────────────────────────────────────

async function fetch24hHistory(apiKey: string): Promise<AlertCache | null> {
  const now    = new Date().toISOString();
  const ago24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const cities: Record<string, CityEntry> = {};
  let offset = 0;

  try {
    while (true) {
      const url = `https://redalert.orielhaim.com/api/stats/history?startDate=${ago24h}&endDate=${now}&limit=100&offset=${offset}`;
      const res = await withTimeout(
        fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }),
        FETCH_TIMEOUT,
      );
      if (!res?.ok) break;
      const json = await res.json();
      const records: Array<{ type: string; cities: Array<{ name: string }> }> = json.data ?? [];

      for (const record of records) {
        const isReal  = REAL_TYPES.has(record.type);
        const isNotif = NOTIF_TYPES.has(record.type);
        if (!isReal && !isNotif) continue;
        for (const city of record.cities ?? []) {
          const name = city.name;
          if (!cities[name]) cities[name] = { alarms: 0, notifs: 0 };
          if (isReal)  cities[name].alarms++;
          else         cities[name].notifs++;
        }
      }

      offset += records.length;
      if (!json.pagination?.hasMore) break;
    }
  } catch {
    return null;
  }

  return { cities, fetchedAt: Date.now() };
}

function readCache(): AlertCache | null {
  const c = lsRead<AlertCache>(CACHE_KEY);
  return c && Date.now() - c.fetchedAt < TTL_MS ? c : null;
}

function findCity(cities: Record<string, CityEntry>, nameHe: string): CityEntry | undefined {
  if (cities[nameHe]) return cities[nameHe];
  const base = nameHe.split(/[\s\-–]/)[0].trim();
  const key = Object.keys(cities).find((k) =>
    k.startsWith(base) || base.startsWith(k.split(/[\s\-–]/)[0].trim())
  );
  return key ? cities[key] : undefined;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getLiveAlerts(nameHe: string): Promise<LiveAlerts | null> {
  const apiKey = import.meta.env.VITE_REDALERT_API_KEY as string | undefined;
  if (!apiKey) return null;

  let cache = readCache();
  if (!cache) {
    const fresh = await fetch24hHistory(apiKey);
    if (fresh) { cache = fresh; lsWrite(CACHE_KEY, fresh); }
  }

  if (!cache) return null;
  const entry = findCity(cache.cities, nameHe);

  return {
    alertCount:        entry?.alarms ?? 0,
    notificationCount: entry?.notifs  ?? 0,
    fetchedAt:         cache.fetchedAt,
  };
}

export function cacheAgeMinutes(): number | null {
  const c = lsRead<AlertCache>(CACHE_KEY);
  if (!c || Date.now() - c.fetchedAt > TTL_MS) return null;
  return Math.floor((Date.now() - c.fetchedAt) / 60_000);
}
