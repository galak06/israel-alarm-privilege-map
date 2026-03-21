/**
 * Update alertCount in public/localities.json based on new alert data.
 * Category 1 = rocket/missile fire (ירי רקטות וטילים) → alertCount
 * Category 14 = advance notification → notificationCount
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

// Process category 1 (rocket fire) alerts
const cat1 = alerts.filter(a => a.category === 1);
// Use a Set of unique (name) to count unique alert events per locality
// (one alert wave = multiple localities at same timestamp)
// Count distinct alertDate+name combinations as individual alerts
const alertCounts = new Map();
cat1.forEach(a => {
  const key = a.data;
  alertCounts.set(key, (alertCounts.get(key) || 0) + 1);
});

alertCounts.forEach((count, name) => {
  const idx = nameToIndex.get(name);
  if (idx !== undefined) {
    localities[idx].alertCount = (localities[idx].alertCount || 0) + count;
    matched++;
  } else {
    unmatched.add(name);
  }
});

// Process category 14 (advance notifications) if any
const cat14 = alerts.filter(a => a.category === 14);
const notifCounts = new Map();
cat14.forEach(a => {
  notifCounts.set(a.data, (notifCounts.get(a.data) || 0) + 1);
});
notifCounts.forEach((count, name) => {
  const idx = nameToIndex.get(name);
  if (idx !== undefined) {
    localities[idx].notificationCount = (localities[idx].notificationCount || 0) + count;
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
