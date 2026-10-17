/**
 * Local Analytics Logger (100% private, zero external dependencies)
 * Tracks: first_item_added, first_cook, day_1_return, items_used_per_week, wasted_items_per_week
 */

export type AnalyticsEventType =
  | 'first_item_added'
  | 'first_cook'
  | 'day_1_return'
  | 'items_used_per_week'
  | 'wasted_items_per_week';

export async function trackLocalEvent(
  eventType: AnalyticsEventType,
  eventData: Record<string, any> = {},
  householdId?: string
): Promise<void> {
  try {
    // Dedup one-time milestone events in localStorage
    if (eventType === 'first_item_added') {
      if (localStorage.getItem('tracked_first_item_added')) return;
      localStorage.setItem('tracked_first_item_added', 'true');
    }

    if (eventType === 'first_cook') {
      if (localStorage.getItem('tracked_first_cook')) return;
      localStorage.setItem('tracked_first_cook', 'true');
    }

    if (eventType === 'day_1_return') {
      if (localStorage.getItem('tracked_day_1_return')) return;
      localStorage.setItem('tracked_day_1_return', 'true');
    }

    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        eventData,
        householdId,
      }),
    });
  } catch {
    // Network or server offline; fail silently without disrupting user experience
  }
}

// Check day-1 return on client initialization
export function checkDay1Return(): void {
  try {
    const firstSeen = localStorage.getItem('app_first_seen_timestamp');
    const now = Date.now();
    if (!firstSeen) {
      localStorage.setItem('app_first_seen_timestamp', String(now));
      return;
    }

    const diffHours = (now - parseInt(firstSeen, 10)) / (1000 * 60 * 60);
    // If returning between 24 and 48 hours after first open
    if (diffHours >= 24 && diffHours <= 48) {
      trackLocalEvent('day_1_return', { hoursAfterFirstOpen: Math.round(diffHours) });
    }
  } catch {
    // ignore
  }
}
