/**
 * GA4 custom event helpers.
 * All events are no-ops if gtag is not loaded (dev / blocked by adblock).
 */

declare function gtag(...args: unknown[]): void;

function track(eventName: string, params: Record<string, unknown> = {}) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  } catch {
    // gtag not available
  }
}

export function trackCitySelect(cityId: string, cityName: string, source: 'map' | 'search') {
  track('city_select', { city_id: cityId, city_name: cityName, source });
}

export function trackShelterSelect(shelterType: string, cityId: string) {
  track('shelter_select', { shelter_type: shelterType, city_id: cityId });
}

export function trackLanguageToggle(newLanguage: string) {
  track('language_toggle', { language: newLanguage });
}

export function trackColorModeChange(mode: string) {
  track('color_mode_change', { mode });
}

export function trackThreatFilterChange(threat: string | null) {
  track('threat_filter_change', { threat: threat ?? 'all' });
}
