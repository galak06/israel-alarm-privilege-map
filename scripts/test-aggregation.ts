
// Simple script to test 24h aggregation logic with timestamps
const REAL_TYPES  = new Set(['missiles', 'hostileAircraftIntrusion', 'terroristInfiltration', 'earthQuake']);
const NOTIF_TYPES = new Set(['newsFlash']);

function aggregate(records: Array<{ type: string; timestamp: string; cities: Array<{ name: string }> }>, ago24hMs: number) {
  const cities: Record<string, { alarms: number; notifs: number }> = {};

  for (const record of records) {
    // Logic from alertsCache.ts
    const tsStr = record.timestamp.includes('T') ? record.timestamp : record.timestamp.replace(' ', 'T');
    const tsMs = new Date(tsStr).getTime();
    
    if (isNaN(tsMs) || tsMs < ago24hMs) {
        console.log(`   Skipping old/invalid record: ${record.timestamp} (parsed as ${new Date(tsMs).toISOString()})`);
        continue;
    }

    const type = record.type;
    const isReal  = REAL_TYPES.has(type);
    const isNotif = NOTIF_TYPES.has(type);
    if (!isReal && !isNotif) continue;

    for (const city of record.cities ?? []) {
      const name = city.name;
      if (!cities[name]) {
        cities[name] = { alarms: 0, notifs: 0 };
      }
      if (isReal) cities[name].alarms++;
      else cities[name].notifs++;
    }
  }
  return cities;
}

const now = Date.now();
const ago24hMs = now - 24 * 3600 * 1000;

const testData = [
  {
    "type": "missiles",
    "timestamp": new Date(now - 1000).toISOString(), // 1s ago
    "cities": [{ "name": "שניר" }]
  },
  {
    "type": "missiles",
    "timestamp": new Date(now - 3600 * 1000).toISOString(), // 1h ago
    "cities": [{ "name": "שניר" }]
  },
  {
    "type": "missiles",
    "timestamp": new Date(now - 25 * 3600 * 1000).toISOString(), // 25h ago (SHOULD BE SKIPPED)
    "cities": [{ "name": "שניר" }]
  },
  {
    "type": "missiles",
    "timestamp": "2024-01-01 12:00:00", // VERY OLD (SHOULD BE SKIPPED)
    "cities": [{ "name": "שניר" }]
  },
  {
    "type": "newsFlash",
    "timestamp": new Date(now - 2 * 3600 * 1000).toISOString(), // 2h ago
    "cities": [{ "name": "שניר" }]
  }
];

console.log('--- Running Aggregation Test ---');
console.log('Now:', new Date(now).toISOString());
console.log('24h ago threshold:', new Date(ago24hMs).toISOString());

const result = aggregate(testData, ago24hMs);
console.log('\nResult for שניר:', result['שניר']);

if (result['שניר']?.alarms === 2 && result['שניר']?.notifs === 1) {
    console.log('\n✅ TEST PASSED: correctly aggregated 2 alarms and 1 notif in last 24h.');
} else {
    console.log('\n❌ TEST FAILED: expected 2 alarms and 1 notif.');
    process.exit(1);
}
