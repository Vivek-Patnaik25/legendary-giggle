import { describe, it, expect } from 'vitest';
import {
  normaliseUnit,
  convertQuantity,
  applyQuantityDelta,
  getUnitDefinition,
} from '../../src/domain/units.js';

describe('Units & Conversion Engine', () => {
  it('normalises unit aliases to canonical representations', () => {
    expect(normaliseUnit('grams')).toBe('g');
    expect(normaliseUnit('g')).toBe('g');
    expect(normaliseUnit('KILOS')).toBe('kg');
    expect(normaliseUnit('millilitre')).toBe('ml');
    expect(normaliseUnit('c')).toBe('cup');
    expect(normaliseUnit('can')).toBe('tin');
    expect(normaliseUnit('pcs')).toBe('piece');
    expect(normaliseUnit('tbsp')).toBe('tbsp');
    expect(normaliseUnit(null)).toBe('piece');
    expect(normaliseUnit('')).toBe('piece');
  });

  it('converts within mass category accurately', () => {
    // 1 kg = 1000 g
    const toGrams = convertQuantity(1, 'kg', 'g');
    expect(toGrams.success).toBe(true);
    expect(toGrams.convertedQuantity).toBe(1000);

    // 500 g = 0.5 kg
    const toKg = convertQuantity(500, 'g', 'kg');
    expect(toKg.success).toBe(true);
    expect(toKg.convertedQuantity).toBe(0.5);

    // 1 lb = 453.59 g
    const lbToG = convertQuantity(1, 'lb', 'g');
    expect(lbToG.success).toBe(true);
    expect(lbToG.convertedQuantity).toBe(453.59);
  });

  it('converts within volume category accurately', () => {
    // 1 l = 1000 ml
    const lToMl = convertQuantity(1, 'l', 'ml');
    expect(lToMl.success).toBe(true);
    expect(lToMl.convertedQuantity).toBe(1000);

    // 1 cup = 240 ml
    const cupToMl = convertQuantity(1, 'cup', 'ml');
    expect(cupToMl.success).toBe(true);
    expect(cupToMl.convertedQuantity).toBe(240);

    // 1 tbsp = 3 tsp (15 ml vs 5 ml)
    const tbspToTsp = convertQuantity(1, 'tbsp', 'tsp');
    expect(tbspToTsp.success).toBe(true);
    expect(tbspToTsp.convertedQuantity).toBe(3);
  });

  it('rejects nonsense conversions with a clear, helpful message', () => {
    const massToVolume = convertQuantity(500, 'g', 'ml');
    expect(massToVolume.success).toBe(false);
    expect(massToVolume.error).toContain('Cannot convert between mass');
    expect(massToVolume.error).toContain('volume');

    const countToMass = convertQuantity(2, 'piece', 'kg');
    expect(countToMass.success).toBe(false);
    expect(countToMass.error).toContain('Cannot convert between count');
  });

  it('handles decimal quantities without floating-point artifacts', () => {
    const res = convertQuantity(0.333, 'kg', 'g');
    expect(res.success).toBe(true);
    expect(res.convertedQuantity).toBe(330); // 0.33 * 1000
  });

  it('predictably applies quantity deltas, including "used more than I had"', () => {
    // Standard reduction: 5 - 2 = 3
    const normal = applyQuantityDelta(5, -2);
    expect(normal.previousQuantity).toBe(5);
    expect(normal.delta).toBe(-2);
    expect(normal.newQuantity).toBe(3);
    expect(normal.isDepleted).toBe(false);
    expect(normal.overusedAmount).toBe(0);

    // Complete depletion: 2 - 2 = 0
    const depleted = applyQuantityDelta(2, -2);
    expect(depleted.newQuantity).toBe(0);
    expect(depleted.isDepleted).toBe(true);
    expect(depleted.overusedAmount).toBe(0);

    // Over-consumption: 2 - 5 = clamped to 0, overused 3
    const overused = applyQuantityDelta(2, -5);
    expect(overused.newQuantity).toBe(0);
    expect(overused.isDepleted).toBe(true);
    expect(overused.overusedAmount).toBe(3);

    // Positive delta (adding stock): 3 + 2 = 5
    const added = applyQuantityDelta(3, 2);
    expect(added.newQuantity).toBe(5);
    expect(added.isDepleted).toBe(false);
  });
});
