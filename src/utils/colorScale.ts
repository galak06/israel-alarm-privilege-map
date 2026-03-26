export function colorForSeconds(seconds: number): string {
  if (seconds === 0) return '#d32f2f';
  if (seconds <= 15) return '#e53935';
  if (seconds <= 30) return '#f57c00';
  if (seconds <= 45) return '#fbc02d';
  if (seconds <= 60) return '#fdd835';
  if (seconds <= 90) return '#8bc34a';
  if (seconds <= 120) return '#43a047';
  return '#1b5e20';
}

export function colorForPrivilege(score: number): string {
  // Privilege score thresholds (aligned with privilegeLegendEntries)
  if (score < 20) return '#d32f2f'; // Very Low
  if (score < 40) return '#f57c00'; // Low
  if (score < 60) return '#fdd835'; // Medium
  if (score < 80) return '#8bc34a'; // High
  return '#1b5e20'; // Very High
}

export const legendEntries = [
  { label: '0s', color: '#d32f2f' },
  { label: '1–15s', color: '#e53935' },
  { label: '16–30s', color: '#f57c00' },
  { label: '31–45s', color: '#fbc02d' },
  { label: '46–60s', color: '#fdd835' },
  { label: '61–90s', color: '#8bc34a' },
  { label: '91–120s', color: '#43a047' },
  { label: '121s+', color: '#1b5e20' },
];

export const privilegeLegendEntries = [
  { label: 'Very Low (0–19)', color: '#d32f2f' },
  { label: 'Low (20–39)', color: '#f57c00' },
  { label: 'Medium (40–59)', color: '#fdd835' },
  { label: 'High (60–79)', color: '#8bc34a' },
  { label: 'Very High (80+)', color: '#1b5e20' },
];
