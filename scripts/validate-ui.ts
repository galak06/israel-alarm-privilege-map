import { calcPrivilegeScore, calcPrivilegeScorePersonal } from '../src/utils/privilegeCalc';
import { City } from '../src/types';

const mockCity = (overrides: Partial<City> = {}): City => ({
  id: 'test',
  nameHe: 'בדיקה',
  nameEn: 'Test',
  lat: 32.0,
  lng: 34.8,
  alarmSeconds: 60,
  shelterDistribution: { mamad: 0.5, stairwell: 0.3, public: 0.2 },
  region: 'center',
  threatSources: ['iran'],
  alertCount: 0,
  notificationCount: 0,
  alertCountTotal: 0,
  alertCountNormalized: 0,
  ...overrides
});

console.log('--- UI & Logic Validation ---\n');

// 1. Validate score ranges for City
const cityScore = calcPrivilegeScore(mockCity());
console.log('City Score Breakdown (Max 110):');
console.log(`Time: ${cityScore.timeScore}/20`);
console.log(`Shelter: ${cityScore.shelterScore}/20`);
console.log(`Safety: ${cityScore.safetyScore}/30`);
console.log(`Gap: ${cityScore.gapScore}/30`);
console.log(`Location: ${cityScore.locationScore}/10`);
console.log(`Total: ${cityScore.total}/110`);
if (cityScore.timeScore > 20 || cityScore.shelterScore > 20 || cityScore.safetyScore > 30 || cityScore.gapScore > 30) {
  console.error('❌ ERROR: Score components exceed new limits!');
} else {
  console.log('✅ UI Component Limits OK');
}

// 2. Validate Personal Score Ranges
const personalScore = calcPrivilegeScorePersonal(mockCity(), 'mamad', 'married');
console.log('\nPersonal Score Breakdown (Max 120):');
console.log(`Time: ${personalScore.timeScore}/20`);
console.log(`Shelter: ${personalScore.shelterScore}/20`);
console.log(`Safety: ${personalScore.safetyScore}/30`);
console.log(`Gap: ${personalScore.gapScore}/30`);
console.log(`Location: ${personalScore.locationScore}/10`);
console.log(`Family: ${personalScore.familyScore}/10`);
console.log(`Total: ${personalScore.total}/120`);
if (personalScore.familyScore > 10) {
  console.error('❌ ERROR: Family score exceeds 10!');
} else {
  console.log('✅ Personal Component Limits OK');
}

// 3. Validate Labels (ensure they use percentages correctly)
console.log('\nLabel Threshold Validation:');
const veryHighCity = mockCity({ alertCountTotal: 0, alarmSeconds: 90 }); // Should be high privilege
const vhScore = calcPrivilegeScore(veryHighCity);
console.log(`Very High Example (Total ${vhScore.total}/110): Label = ${vhScore.label}`);

const veryLowCity = mockCity({ 
  alertCountTotal: 100, 
  alertCountNormalized: 1.0, 
  alarmSeconds: 0,
  region: 'south',
  shelterDistribution: { mamad: 0, stairwell: 0, public: 1.0 }
});
const vlScore = calcPrivilegeScore(veryLowCity);
console.log(`Very Low Example (Total ${vlScore.total}/110): Label = ${vlScore.label}`);
