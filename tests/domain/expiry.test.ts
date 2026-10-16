import { describe, it, expect } from 'vitest';
import {
  estimateExpiryDate,
  applyFreezerExtension,
  checkFreezerRediscovery,
} from '../../src/domain/expiry.js';

describe('Expiry & Freezer Engine', () => {
  const refDate = '2026-10-15T00:00:00.000Z';

  it('estimates expiry dates from category defaults', () => {
    // Dairy in fridge: +7 days -> 2026-10-22
    const dairyFridge = estimateExpiryDate('dairy', 'fridge', refDate);
    expect(dairyFridge).toBe('2026-10-22');

    // Meat in fridge: +3 days -> 2026-10-18
    const meatFridge = estimateExpiryDate('meat', 'fridge', refDate);
    expect(meatFridge).toBe('2026-10-18');

    // Seafood in fridge: +2 days -> 2026-10-17
    const seafoodFridge = estimateExpiryDate('seafood', 'fridge', refDate);
    expect(seafoodFridge).toBe('2026-10-17');

    // Leftovers in fridge: +3 days -> 2026-10-18
    const leftoversFridge = estimateExpiryDate('leftovers', 'fridge', refDate);
    expect(leftoversFridge).toBe('2026-10-18');

    // Meat in freezer: +180 days
    const meatFreezer = estimateExpiryDate('meat', 'freezer', refDate);
    expect(meatFreezer).toBe('2027-04-13');

    // General fallback: +7 days in fridge
    const unknownCat = estimateExpiryDate('exotic_dragonfruit', 'fridge', refDate);
    expect(unknownCat).toBe('2026-10-22');
  });

  it('extends existing expiry when moving to freezer', () => {
    const initialExpiry = '2026-10-18';
    const extension = applyFreezerExtension(initialExpiry, 'meat');
    expect(extension.daysAdded).toBe(180);
    expect(extension.newExpiryDate).toBe('2027-04-16');
  });

  it('detects freezer rediscovered items over the threshold', () => {
    const frozenLongAgo = '2026-07-01'; // >100 days before 2026-10-15
    const resultLong = checkFreezerRediscovery(frozenLongAgo, refDate, 60);
    expect(resultLong.isRediscovered).toBe(true);
    expect(resultLong.daysFrozen).toBeGreaterThanOrEqual(90);

    const frozenRecently = '2026-10-01'; // 14 days before 2026-10-15
    const resultRecent = checkFreezerRediscovery(frozenRecently, refDate, 60);
    expect(resultRecent.isRediscovered).toBe(false);
    expect(resultRecent.daysFrozen).toBe(14);

    const empty = checkFreezerRediscovery(null, refDate);
    expect(empty.isRediscovered).toBe(false);
  });
});
