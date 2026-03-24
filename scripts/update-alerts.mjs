/**
 * Update alertCount in public/localities.json based on new alert data.
 * Category 1, 2, 3 = real alarms (sirens)
 * Category 14 = advance notification
 * Category 13 = event ended → ignored
 *
 * Usage: node scripts/update-alerts.mjs <alerts-json-file>
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localitiesPath = join(__dirname, '../public/localities.json');

const alertsArg = process.argv[2];
let alerts;
if (alertsArg) {
  alerts = JSON.parse(readFileSync(alertsArg, 'utf8'));
} else {
  // Read from stdin
  const stdin = readFileSync('/dev/stdin', 'utf8');
  alerts = JSON.parse(stdin);
}

const localities = JSON.parse(readFileSync(localitiesPath, 'utf8'));

// Build a map from nameHe → locality index for fast lookup
const nameToIndex = new Map();
localities.forEach((loc, i) => {
  nameToIndex.set(loc.nameHe, i);
});

let matched = 0;
let unmatched = new Set();

// Use sets to de-duplicate multiple records for the same minute/city
// Map: CityName -> Set of "YYYY-MM-DD HH:mm" strings
const cityAlarmMinutes = new Map();
const cityNotifMinutes = new Map();

alerts.forEach(a => {
  const cat = a.category;
  const name = a.data;
  const timeStr = a.alertDate || ""; // "2024-03-24 16:09:42"
  if (!name || !timeStr) return;

  const minuteKey = timeStr.slice(0, 16); // "2024-03-24 16:09"

  if (cat === 1 || cat === 2 || cat === 3) {
    if (!cityAlarmMinutes.has(name)) cityAlarmMinutes.set(name, new Set());
    cityAlarmMinutes.get(name).add(minuteKey);
  } else if (cat === 14) {
    if (!cityNotifMinutes.has(name)) cityNotifMinutes.set(name, new Set());
    cityNotifMinutes.get(name).add(minuteKey);
  }
});

cityAlarmMinutes.forEach((minutes, name) => {
  const idx = nameToIndex.get(name);
  if (idx !== undefined) {
    localities[idx].alertCount = (localities[idx].alertCount || 0) + minutes.size;
    matched++;
  } else {
    unmatched.add(name);
  }
});

cityNotifMinutes.forEach((minutes, name) => {
  const idx = nameToIndex.get(name);
  if (idx !== undefined) {
    localities[idx].notificationCount = (localities[idx].notificationCount || 0) + minutes.size;
  }
});

// Recalculate alertCountNormalized across all localities
const maxAlert = Math.max(...localities.map(l => l.alertCount || 0));
localities.forEach(loc => {
  loc.alertCountNormalized = maxAlert > 0 ? (loc.alertCount || 0) / maxAlert : 0;
});

writeFileSync(localitiesPath, JSON.stringify(localities, null, 2));

console.log(`Updated ${matched} locality alert counts.`);
console.log(`Max alertCount: ${maxAlert}`);
if (unmatched.size > 0) {
  console.log(`Unmatched locality names (${unmatched.size}):`);
  [...unmatched].sort().forEach(n => console.log('  -', n));
}
