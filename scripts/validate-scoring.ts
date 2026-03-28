import { calcPrivilegeScore, calcPrivilegeScorePersonal } from '../src/utils/privilegeCalc';
import { City } from '../src/types';

const mockCity = (overrides: Partial<City> = {}): City => ({
  id: 'test',
  nameHe: 'בדיקה',
  nameEn: 'Test',
  lat: 32.0,
  lng: 34.8,
  alarmSeconds: 60,
  shelterDistribution: { mamad: 0.4, stairwell: 0.3, public: 0.3 },
  region: 'center',
  threatSources: ['iran'],
  alertCount: 0,
  notificationCount: 0,
  alertCountTotal: 0,
  alertCountNormalized: 0,
  ...overrides
});

console.log('--- Privilege Score Validation ---\n');

// Scenario 1: Quiet City vs Moderately Active City
const quietCity = mockCity({ alertCountTotal: 0, alertCountNormalized: 0 });
const activeCity = mockCity({ alertCountTotal: 10, alertCountNormalized: 0.2 }); // 10 alerts in 30 days

console.log('Scenario 1: Alert Sensitivity (Square Root vs Linear)');
const scoreQuiet = calcPrivilegeScore(quietCity);
const scoreActive = calcPrivilegeScore(activeCity);
console.log(`Quiet City: ${scoreQuiet.safetyScore}/30 (Safety), ${scoreQuiet.gapScore}/30 (Gap), Total: ${scoreQuiet.total}`);
console.log(`Active City (10 alerts): ${scoreActive.safetyScore}/30 (Safety), ${scoreActive.gapScore}/30 (Gap), Total: ${scoreActive.total}`);
// With sqrt(0.2) ≈ 0.44, safetyScore ≈ (1-0.44)*30 = 16.8 (previously would be 0.8*30=24)
// With 10 alerts, avgGap = 72h. sqrt(72/24) capped at 1.0 -> 30/30.

// Scenario 2: Barrage vs Distributed Alerts
const distributedCity = mockCity({ alertCountTotal: 5, minGapHours: 144 }); // 5 alerts spread out
const barrageCity = mockCity({ alertCountTotal: 5, minGapHours: 0.2 });    // 5 alerts in a barrage

console.log('\nScenario 2: Barrage Penalty (minGapHours)');
const scoreDist = calcPrivilegeScore(distributedCity);
const scoreBarrage = calcPrivilegeScore(barrageCity);
console.log(`Distributed (5 alerts): Gap Score: ${scoreDist.gapScore}/30`);
console.log(`Barrage (5 alerts):     Gap Score: ${scoreBarrage.gapScore}/30`);

// Scenario 3: Shelter Type Impact on Notification Penalty
const cityWithNotifs = mockCity({ notificationCountTotal: 20 });
console.log('\nScenario 3: Notification Burden by Shelter Type');
const mamadUser = calcPrivilegeScorePersonal(cityWithNotifs, 'mamad', 'single');
const publicUser = calcPrivilegeScorePersonal(cityWithNotifs, 'public', 'single');
console.log(`Mamad User:   Safety Score: ${mamadUser.safetyScore}/30 (Penalty: 0)`);
console.log(`Public Shelter User: Safety Score: ${publicUser.safetyScore}/30 (Penalty applied)`);

// Scenario 4: Family Status Privilege
console.log('\nScenario 4: Family Status Comparison');
const married = calcPrivilegeScorePersonal(quietCity, 'mamad', 'married');
const divorcedKids = calcPrivilegeScorePersonal(quietCity, 'mamad', 'divorced_with_children');
console.log(`Married (no kids): Family Score: ${married.familyScore}/10`);
console.log(`Divorced with kids: Family Score: ${divorcedKids.familyScore}/10`);
