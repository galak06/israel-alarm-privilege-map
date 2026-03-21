/**
 * fetch-localities.mjs
 *
 * One-time data pipeline:
 *   1. Fetch ~1,400 Israeli localities + migun_time from Pikud HaOref
 *   2. Geocode them in bulk via OSM Overpass API (single request for all Hebrew names)
 *   3. Merge, estimate shelter distribution, assign threat sources by region
 *   4. Write src/data/localities.json
 *
 * Usage:  node scripts/fetch-localities.mjs
 * Re-run any time to refresh from Pikud HaOref.
 * Geocoding cache is saved to scripts/geocache.json.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_FILE = join(__dirname, 'geocache.json');
// Write to public/ so it's served as a static asset (loaded at runtime, not bundled)
const OUT_FILE = join(ROOT, 'public', 'localities.json');

// ── 1. Pikud HaOref ─────────────────────────────────────────────────────────

async function fetchOrefLocalities() {
  console.log('📡 Fetching localities from Pikud HaOref…');
  const res = await fetch(
    'https://alerts-history.oref.org.il/Shared/Ajax/GetDistricts.aspx?lang=en',
    {
      headers: {
        'Referer': 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (compatible; locality-fetcher/1.0)',
      },
    }
  );
  if (!res.ok) throw new Error(`Pikud HaOref returned ${res.status}`);
  const data = await res.json();
  console.log(`   ✓ Got ${data.length} localities`);
  return data;
}

// ── 2. OSM Overpass geocoding ────────────────────────────────────────────────

async function fetchOsmLocalities() {
  console.log('🗺  Fetching Israeli localities from OSM Overpass…');
  const query = `
[out:json][timeout:90];
(
  node["place"]["name:he"](29.0,33.5,33.5,36.0);
  way["place"]["name:he"](29.0,33.5,33.5,36.0);
  relation["place"]["name:he"](29.0,33.5,33.5,36.0);
);
out center;
  `.trim();

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
  const data = await res.json();
  console.log(`   ✓ Got ${data.elements.length} OSM elements`);
  return data.elements;
}

function buildGeoIndex(osmElements) {
  const index = new Map(); // Hebrew name → {lat, lng}
  for (const el of osmElements) {
    const nameHe = el.tags?.['name:he'];
    if (!nameHe) continue;
    const lat = el.type === 'node' ? el.lat : el.center?.lat;
    const lng = el.type === 'node' ? el.lon : el.center?.lon;
    if (lat && lng && !index.has(nameHe)) {
      index.set(nameHe, { lat, lng });
    }
  }
  return index;
}

// ── 3. Region → threat sources mapping ──────────────────────────────────────

function threatSources(areaname, lat) {
  const a = (areaname || '').toLowerCase();
  const threats = new Set();

  // Northern areas → Hezbollah
  if (
    a.includes('galilee') || a.includes('golan') || a.includes('haifa') ||
    a.includes('carmel') || a.includes('acre') || a.includes('akko') ||
    a.includes('kinneret') || a.includes('tiberias') || a.includes('tzfat') ||
    a.includes('safed') || a.includes('nahariya') || a.includes('kiryat shmona') ||
    a.includes('upper') || lat >= 32.5
  ) {
    threats.add('hezbollah');
  }

  // Southern / Gaza-adjacent → Hamas
  if (
    a.includes('gaza') || a.includes('sha\'ar hanegev') || a.includes('shaar hanegev') ||
    a.includes('eshkol') || a.includes('sdot negev') || a.includes('lachish') ||
    a.includes('ashkelon') || a.includes('ashdod') || a.includes('kiryat gat') ||
    a.includes('beer sheva') || a.includes('be\'er sheva') || a.includes('negev') ||
    lat < 31.8
  ) {
    threats.add('hamas');
  }

  // Central / Dan metro → Hamas
  if (
    a.includes('tel aviv') || a.includes('dan') || a.includes('sharon') ||
    a.includes('center') || a.includes('rishon') || a.includes('rehovot') ||
    a.includes('petah tikva') || a.includes('netanya') || a.includes('herzliya') ||
    (lat >= 31.8 && lat <= 32.5)
  ) {
    threats.add('hamas');
  }

  // Iran: all major population centers
  if (
    a.includes('tel aviv') || a.includes('dan') || a.includes('jerusalem') ||
    a.includes('haifa') || a.includes('beer sheva') || a.includes('negev') ||
    a.includes('arava') || a.includes('eilat')
  ) {
    threats.add('iran');
  }

  // Deep south (Arava, Eilat) → Iran only
  if (lat < 30.5) {
    threats.delete('hamas');
    threats.delete('hezbollah');
    threats.add('iran');
  }

  if (threats.size === 0) threats.add('hamas'); // default
  return [...threats];
}

// ── 4. Shelter distribution estimate (from migun_time + region) ─────────────

function shelterDistribution(migunTime) {
  // Post-1992 buildings require mamad; newer cities have more
  if (migunTime === 0)   return { mamad: 0.15, stairwell: 0.40, public: 0.45 };
  if (migunTime <= 15)   return { mamad: 0.20, stairwell: 0.40, public: 0.40 };
  if (migunTime <= 30)   return { mamad: 0.30, stairwell: 0.40, public: 0.30 };
  if (migunTime <= 45)   return { mamad: 0.38, stairwell: 0.37, public: 0.25 };
  if (migunTime <= 60)   return { mamad: 0.42, stairwell: 0.35, public: 0.23 };
  if (migunTime <= 90)   return { mamad: 0.52, stairwell: 0.33, public: 0.15 };
  if (migunTime <= 120)  return { mamad: 0.60, stairwell: 0.30, public: 0.10 };
  return                        { mamad: 0.65, stairwell: 0.28, public: 0.07 };
}

function regionFromAreaname(areaname, lat) {
  const a = (areaname || '').toLowerCase();
  if (a.includes('jerusalem') || a.includes('judea') || a.includes('beit shemesh')) return 'jerusalem';
  if (lat >= 32.5 || a.includes('galilee') || a.includes('golan') || a.includes('haifa') ||
      a.includes('carmel') || a.includes('kinneret') || a.includes('akko') || a.includes('acre') ||
      a.includes('upper') || a.includes('lower')) return 'north';
  if (lat < 31.5 || a.includes('negev') || a.includes('arava') || a.includes('eilat') ||
      a.includes('beer sheva') || a.includes('gaza') || a.includes('lachish') ||
      a.includes('ashkelon') || a.includes('kiryat gat')) return 'south';
  return 'center';
}

// ── 5. Nominatim fallback for cache misses ───────────────────────────────────

async function nominatimGeocode(nameHe, nameEn) {
  await new Promise(r => setTimeout(r, 1100)); // respect rate limit
  const query = encodeURIComponent(`${nameHe}, ישראל`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=il`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'israel-alarm-map/1.0 (educational project)' }
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (results.length === 0) {
    // Try English name
    const q2 = encodeURIComponent(`${nameEn}, Israel`);
    const res2 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1&countrycodes=il`,
      { headers: { 'User-Agent': 'israel-alarm-map/1.0 (educational project)' } }
    );
    await new Promise(r => setTimeout(r, 1100));
    if (!res2.ok) return null;
    const r2 = await res2.json();
    if (r2.length === 0) return null;
    return { lat: parseFloat(r2[0].lat), lng: parseFloat(r2[0].lon) };
  }
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// ── 6. Alert counts — two-source approach ────────────────────────────────────
//
// Source A — redalert.orielhaim.com (requires REDALERT_API_KEY)
//   Returns 30-day combined count (all alert types) per city.
//   Used for: alertCountNormalized (score normalization — reliable 30-day window)
//
// Source B — api.tzevaadom.co.il (no auth, last ~24h)
//   Returns individual alert events with threat type:
//     threat=0 → real rocket alarm (צבע אדום)
//     threat=5 → advance warning notification (התרעה מוקדמת)
//   Accumulated daily in scripts/alerts-cache.json (rolling 30-day history)
//   Used for: alertCount (rockets) + notificationCount (advance warnings) in UI

const ALERTS_CACHE_FILE = join(__dirname, 'alerts-cache.json');
const RETENTION_DAYS = 30;

function loadAlertsCache() {
  if (!existsSync(ALERTS_CACHE_FILE)) return { days: {} };
  try {
    return JSON.parse(readFileSync(ALERTS_CACHE_FILE, 'utf8'));
  } catch {
    return { days: {} };
  }
}

function saveAlertsCache(cache) {
  writeFileSync(ALERTS_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function pruneAlertsCache(cache) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
  for (const day of Object.keys(cache.days)) {
    if (day < cutoff) delete cache.days[day];
  }
}

// Fetch tzevaadom, group by date, return { date → { cityName → { r, n } } }
async function fetchTzevaadomByDate() {
  console.log('📡 Fetching recent alerts from api.tzevaadom.co.il…');
  try {
    const res = await fetch('https://api.tzevaadom.co.il/alerts-history', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; locality-fetcher/1.0)', 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const groups = await res.json();
    const arr = Array.isArray(groups) ? groups : [];

    const byDate = {}; // date → { cityName → { r: rockets, n: notifications } }
    for (const group of arr) {
      for (const alert of (group.alerts ?? [])) {
        if (alert.isDrill) continue;
        const isRocket = alert.threat === 0;
        const isNotif  = alert.threat === 5;
        if (!isRocket && !isNotif) continue;

        const date = new Date(alert.time * 1000).toISOString().slice(0, 10);
        if (!byDate[date]) byDate[date] = {};

        for (const city of (alert.cities ?? [])) {
          if (!byDate[date][city]) byDate[date][city] = { r: 0, n: 0 };
          if (isRocket) byDate[date][city].r += 1;
          if (isNotif)  byDate[date][city].n += 1;
        }
      }
    }

    const dates = Object.keys(byDate);
    const totalEvents = arr.reduce((s, g) => s + (g.alerts?.length ?? 0), 0);
    console.log(`   ✓ ${totalEvents} events across ${dates.length} date(s): ${dates.join(', ')}`);
    return byDate;
  } catch (e) {
    console.warn(`   ⚠ tzevaadom failed: ${e.message}`);
    return {};
  }
}

// Fetch redalert 30-day totals (all types combined) for score normalization
async function fetchRedalertTotals(apiKey) {
  const endDate   = new Date().toISOString();
  const startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  console.log(`📡 Fetching 30-day totals from redalert.orielhaim.com…`);
  console.log(`   📅 ${startDate.slice(0,10)} → ${endDate.slice(0,10)}`);

  const totals = {};
  const LIMIT = 500;
  let offset = 0;
  let pageTotal = null;

  try {
    while (true) {
      const url = `https://redalert.orielhaim.com/api/stats/cities?startDate=${startDate}&endDate=${endDate}&limit=${LIMIT}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json', 'User-Agent': 'locality-fetcher/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = json.data ?? [];
      if (pageTotal === null) pageTotal = json.pagination?.total ?? rows.length;

      for (const row of rows) {
        const name = row.city ?? row.name;
        if (name) totals[name] = (totals[name] ?? 0) + (row.count ?? 1);
      }

      offset += rows.length;
      process.stdout.write(`\r   Fetched ${offset} / ${pageTotal ?? '?'} cities`);
      if (rows.length < LIMIT || offset >= (pageTotal ?? Infinity)) break;
      await new Promise(r => setTimeout(r, 200));
    }
    process.stdout.write('\n');
    console.log(`   ✓ ${Object.keys(totals).length} cities have alerts`);
  } catch (e) {
    console.warn(`   ⚠ redalert failed: ${e.message}`);
  }
  return totals;
}

// Build rolling 30-day sums from cache: { cityName → { rockets, notifications } }
function sumAlertsCache(cache) {
  const sums = {};
  for (const dayCities of Object.values(cache.days)) {
    for (const [city, counts] of Object.entries(dayCities)) {
      if (!sums[city]) sums[city] = { rockets: 0, notifications: 0 };
      sums[city].rockets       += counts.r ?? 0;
      sums[city].notifications += counts.n ?? 0;
    }
  }
  return sums;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load geocache
  const geocache = existsSync(CACHE_FILE)
    ? JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    : {};
  console.log(`💾 Geocache has ${Object.keys(geocache).length} entries`);

  // ── Alert data (two sources) ─────────────────────────────────────────────
  // Load accumulated daily cache
  const alertsCache = loadAlertsCache();
  const cachedDays = Object.keys(alertsCache.days).length;
  console.log(`📦 Alerts cache has ${cachedDays} day(s) of history`);

  // Fetch tzevaadom → group by date → update cache (replace each date, never double-count)
  const tzevaadomByDate = await fetchTzevaadomByDate();
  for (const [date, cities] of Object.entries(tzevaadomByDate)) {
    alertsCache.days[date] = cities; // overwrite that day — idempotent
  }
  pruneAlertsCache(alertsCache);
  alertsCache.lastUpdated = new Date().toISOString();
  saveAlertsCache(alertsCache);
  console.log(`💾 Alerts cache saved (${Object.keys(alertsCache.days).length} days, ${RETENTION_DAYS}-day window)`);

  // Sum rolling 30-day rockets + notifications from cache
  const alertSums = sumAlertsCache(alertsCache); // { cityName → { rockets, notifications } }

  // Fetch redalert 30-day totals (all types) for score normalization
  let redalertTotals = {};
  const apiKey = process.env.REDALERT_API_KEY;
  if (apiKey) {
    redalertTotals = await fetchRedalertTotals(apiKey);
  } else {
    console.warn('⚠  REDALERT_API_KEY not set — score normalization will use cache rockets count.');
  }

  // Fetch Oref data
  const orefLocalities = await fetchOrefLocalities();

  // Fetch OSM data for bulk geocoding
  let osmIndex;
  try {
    const osmElements = await fetchOsmLocalities();
    osmIndex = buildGeoIndex(osmElements);
    console.log(`   ✓ OSM index has ${osmIndex.size} Hebrew-named places`);
  } catch (e) {
    console.warn('   ⚠ OSM Overpass failed, will use Nominatim fallback:', e.message);
    osmIndex = new Map();
  }

  // Merge and geocode
  const localities = [];
  let nominatimCount = 0;
  let skipCount = 0;

  for (let i = 0; i < orefLocalities.length; i++) {
    const loc = orefLocalities[i];
    const nameHe = loc.label_he || loc.label;
    const nameEn = loc.label || nameHe;

    // Coords: geocache → OSM index → Nominatim → skip
    let coords = geocache[nameHe];

    if (!coords) {
      coords = osmIndex.get(nameHe);
      if (coords) {
        geocache[nameHe] = coords;
      }
    }

    if (!coords) {
      // For compound names like "אשדוד - א,ב,ד,ה", try the base city name first
      const baseNameHe = nameHe.split(/[-–,]/)[0].trim();
      if (baseNameHe !== nameHe) {
        coords = geocache[baseNameHe] || osmIndex.get(baseNameHe) || null;
        if (coords) {
          geocache[nameHe] = coords; // cache under full name too
        }
      }
    }

    if (!coords) {
      // null in cache means previously tried and not found — skip immediately
      if (geocache[nameHe] === null) { skipCount++; continue; }

      process.stdout.write(`   🔍 Nominatim [${i + 1}/${orefLocalities.length}]: ${nameHe}… `);
      coords = await nominatimGeocode(nameHe, nameEn);
      if (coords) {
        geocache[nameHe] = coords;
        process.stdout.write(`✓ (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})\n`);
        nominatimCount++;
        // Save cache every 20 Nominatim lookups
        if (nominatimCount % 20 === 0) {
          writeFileSync(CACHE_FILE, JSON.stringify(geocache, null, 2));
        }
      } else {
        geocache[nameHe] = null; // cache the failure
        process.stdout.write('✗ not found\n');
        skipCount++;
        continue;
      }
    }

    const { lat, lng } = coords;
    const migunTime = loc.migun_time ?? 90;

    // Match alert counts: exact match first, then substring containment
    const findKey = (map, name) => {
      if (map[name] !== undefined) return name;
      return Object.keys(map).find(k => name.includes(k) || k.includes(name)) ?? null;
    };

    const cacheKey       = findKey(alertSums, nameHe);
    const alertCount     = cacheKey ? (alertSums[cacheKey].rockets       ?? 0) : 0;
    const notifCount     = cacheKey ? (alertSums[cacheKey].notifications  ?? 0) : 0;

    // redalert total (all types) for score normalization — falls back to alertCount
    const redalertKey    = findKey(redalertTotals, nameHe);
    const alertCountTotal = redalertKey ? (redalertTotals[redalertKey] ?? alertCount) : alertCount;

    localities.push({
      id: `oref-${loc.id}`,
      nameHe,
      nameEn,
      lat,
      lng,
      alarmSeconds: migunTime,
      shelterDistribution: shelterDistribution(migunTime),
      region: regionFromAreaname(loc.areaname, lat),
      threatSources: threatSources(loc.areaname, lat),
      areaname: loc.areaname,
      orefId: loc.id,
      alertCount,                     // rockets only (tzevaadom cache)
      notificationCount: notifCount,  // advance warnings (tzevaadom cache)
      alertCountTotal,                // all types 30d (redalert, for score)
    });
  }

  // Normalize using redalert total (reliable 30-day all-type count)
  const maxTotal = Math.max(1, ...localities.map(l => l.alertCountTotal));
  for (const loc of localities) {
    loc.alertCountNormalized = Math.round((loc.alertCountTotal / maxTotal) * 1000) / 1000;
  }

  const herzliyaCities = localities.filter(l => l.nameHe?.includes('הרצליה'));
  const cacheDaysCount = Object.keys(alertsCache.days).length;
  console.log(`\n📊 Cache: ${cacheDaysCount} days | redalert max: ${maxTotal}`);
  console.log(`   Herzliya: ${herzliyaCities.map(l => `${l.nameHe} r=${l.alertCount} n=${l.notificationCount}`).join(', ')}`);

  // Save geocache
  writeFileSync(CACHE_FILE, JSON.stringify(geocache, null, 2));
  console.log(`💾 Geocache saved (${Object.keys(geocache).length} entries)`);

  // Write output
  writeFileSync(OUT_FILE, JSON.stringify(localities, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Localities saved: ${localities.length}`);
  console.log(`   Skipped (no coords): ${skipCount}`);
  console.log(`   Nominatim lookups: ${nominatimCount}`);
  console.log(`   Output: ${OUT_FILE}`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
