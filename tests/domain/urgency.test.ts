import { describe, it, expect } from 'vitest';
import { calculateUrgency, calculateDaysRemaining } from '../../src/domain/urgency.js';

describe('Urgency Calculator', () => {
  const refDate = '2026-10-15';

  it('calculates days remaining correctly across dates', () => {
    expect(calculateDaysRemaining('2026-10-15', refDate)).toBe(0);
    expect(calculateDaysRemaining('2026-10-16', refDate)).toBe(1);
    expect(calculateDaysRemaining('2026-10-14', refDate)).toBe(-1);
    expect(calculateDaysRemaining('2026-10-25', refDate)).toBe(10);
    expect(calculateDaysRemaining(null, refDate)).toBeNull();
    expect(calculateDaysRemaining('invalid-date', refDate)).toBeNull();
  });

  it('assigns critical tier to expired items', () => {
    const result = calculateUrgency({
      expiryDate: '2026-10-14',
      quantity: 1,
      referenceDate: refDate,
    });
    expect(result.tier).toBe('critical');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.daysRemaining).toBe(-1);
    expect(result.explanation).toContain('Expired');
  });

  it('assigns critical tier to items expiring today or tomorrow', () => {
    const today = calculateUrgency({
      expiryDate: '2026-10-15',
      quantity: 2,
      referenceDate: refDate,
    });
    expect(today.tier).toBe('critical');
    expect(today.daysRemaining).toBe(0);

    const tomorrow = calculateUrgency({
      expiryDate: '2026-10-16',
      quantity: 1,
      referenceDate: refDate,
    });
    expect(tomorrow.tier).toBe('critical');
    expect(tomorrow.daysRemaining).toBe(1);
  });

  it('scales score when candidate recipes are available', () => {
    const withoutRecipes = calculateUrgency({
      expiryDate: '2026-10-18', // 3 days left
      quantity: 1,
      candidateRecipeCount: 0,
      referenceDate: refDate,
    });

    const withRecipes = calculateUrgency({
      expiryDate: '2026-10-18', // 3 days left
      quantity: 1,
      candidateRecipeCount: 3,
      referenceDate: refDate,
    });

    expect(withRecipes.score).toBeGreaterThan(withoutRecipes.score);
  });

  it('scales score when quantity is large', () => {
    const smallQty = calculateUrgency({
      expiryDate: '2026-10-20',
      quantity: 1,
      referenceDate: refDate,
    });

    const largeQty = calculateUrgency({
      expiryDate: '2026-10-20',
      quantity: 20,
      referenceDate: refDate,
    });

    expect(largeQty.score).toBeGreaterThan(smallQty.score);
  });

  it('reduces urgency when item is frozen', () => {
    const fresh = calculateUrgency({
      expiryDate: '2026-10-16',
      quantity: 1,
      isFrozen: false,
      referenceDate: refDate,
    });

    const frozen = calculateUrgency({
      expiryDate: '2026-10-16',
      quantity: 1,
      isFrozen: true,
      referenceDate: refDate,
    });

    expect(frozen.score).toBeLessThan(fresh.score);
  });

  it('handles null expiry gracefully with default baseline', () => {
    const result = calculateUrgency({
      expiryDate: null,
      quantity: 1,
      referenceDate: refDate,
    });

    expect(result.daysRemaining).toBeNull();
    expect(result.tier).toBe('low');
    expect(result.score).toBe(30);
  });
});
