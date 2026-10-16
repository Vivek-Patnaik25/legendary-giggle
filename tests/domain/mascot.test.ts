import { describe, it, expect } from 'vitest';
import {
  determineMascotMood,
  getSirExpiryStatus,
} from '../../src/domain/mascot.js';

describe('Sir Expiry Mascot Engine', () => {
  it('determines appropriate moods according to inventory crisis level', () => {
    // 0 expired, 0 urgent, 0 total -> calm
    expect(determineMascotMood(0, 0, 0)).toBe('calm');

    // 0 expired, 0 urgent, 5 total -> watchful
    expect(determineMascotMood(0, 0, 5)).toBe('watchful');

    // 1 urgent item expiring soon -> worried
    expect(determineMascotMood(1, 0, 5)).toBe('worried');

    // Expired items or 3+ urgent items -> panicked
    expect(determineMascotMood(0, 1, 5)).toBe('panicked');
    expect(determineMascotMood(3, 0, 5)).toBe('panicked');
  });

  it('interpolates template variables into witty, non-shaming dialogue', () => {
    const status = getSirExpiryStatus('worried', {
      urgentItemName: 'Crème Fraîche',
      urgentCount: 2,
    });

    expect(status.mood).toBe('worried');
    expect(status.quote).toBeDefined();
    expect(status.title).toBe('Sir Expiry is Agitated');
    expect(status.image).toContain('sir_expiry_worried.png');
  });

  it('generates celebratory quotes for food rescue', () => {
    const status = getSirExpiryStatus('celebrating', {
      rescuedItemName: 'Sourdough Loaf',
      streakWeeks: 4,
    });

    expect(status.mood).toBe('celebrating');
    expect(status.title).toBe('Sir Expiry Applauds!');
  });
});
