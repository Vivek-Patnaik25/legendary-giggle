import { describe, it, expect } from 'vitest';
import { getBadgeProgress, getDaysElapsedInWeek } from '../../src/client/utils/badges.js';

describe('Badges Progress & Pact Keeper Unlock Rule', () => {
  it('Pact Keeper must not show 100% while locked', () => {
    // Test for every day of the week (Monday through Sunday)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      // 2026-10-19 is a Monday, so adding dayOffset covers Mon..Sun
      const refDate = new Date(`2026-10-${19 + dayOffset}T12:00:00Z`);

      const progress = getBadgeProgress('pact_keeper', false, {
        rescued: 2,
        wasted: 0,
        target: 2.0,
        isPactMet: true,
        refDate,
      });

      // Assert locked progress is never 100%
      expect(progress.percent).toBeLessThan(100);
      expect(progress.percent).toBeGreaterThan(0);
      expect(progress.percent).toBeLessThanOrEqual(85);

      // Assert label matches the 7-day unlock rule
      expect(progress.label).toMatch(/\d+ of 7 days below waste limit/);
      expect(progress.total).toBe(7);
      expect(progress.current).toBeLessThanOrEqual(6);
    }
  });

  it('Pact Keeper resets to 0% with warning when waste target is exceeded', () => {
    const progress = getBadgeProgress('pact_keeper', false, {
      rescued: 1,
      wasted: 4,
      target: 2.0,
      isPactMet: false,
    });

    expect(progress.percent).toBe(0);
    expect(progress.current).toBe(0);
    expect(progress.label).toBe('Waste limit exceeded this week');
  });

  it('Pact Keeper shows 100% and Unlocked when earned', () => {
    const progress = getBadgeProgress('pact_keeper', true, {
      rescued: 5,
      wasted: 0,
      target: 2.0,
      isPactMet: true,
    });

    expect(progress.percent).toBe(100);
    expect(progress.label).toBe('Unlocked');
  });

  it('calculates fractional progress correctly for other badges', () => {
    // Scrappy Chef: 3 out of 5 rescues
    const chef = getBadgeProgress('scrappy_chef', false, { rescued: 3 });
    expect(chef.current).toBe(3);
    expect(chef.total).toBe(5);
    expect(chef.percent).toBe(60);
    expect(chef.label).toBe('3 of 5 rescues this week');

    // Freezer Archaeologist: 0 of 60 days
    const freezer = getBadgeProgress('freezer_archaeologist', false);
    expect(freezer.current).toBe(0);
    expect(freezer.total).toBe(60);
    expect(freezer.percent).toBe(0);
  });
});
