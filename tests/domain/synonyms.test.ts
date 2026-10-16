import { describe, it, expect } from 'vitest';
import {
  cleanIngredientName,
  areIngredientsMatching,
} from '../../src/domain/synonyms.js';

describe('Synonym & Ingredient Matcher Engine', () => {
  it('correctly maps culinary synonyms', () => {
    // Coriander / Cilantro
    expect(cleanIngredientName('coriander')).toBe('cilantro');
    expect(cleanIngredientName('fresh cilantro leaves')).toBe('cilantro');
    expect(areIngredientsMatching('coriander', 'cilantro')).toBe(true);

    // Aubergine / Eggplant
    expect(cleanIngredientName('aubergine')).toBe('eggplant');
    expect(cleanIngredientName('eggplant')).toBe('eggplant');
    expect(areIngredientsMatching('organic aubergines', 'eggplant')).toBe(true);

    // Capsicum / Bell Pepper
    expect(cleanIngredientName('capsicum')).toBe('bell pepper');
    expect(cleanIngredientName('sweet pepper')).toBe('bell pepper');
    expect(areIngredientsMatching('green capsicum', 'bell pepper')).toBe(true);

    // Courgette / Zucchini
    expect(cleanIngredientName('courgette')).toBe('zucchini');
    expect(areIngredientsMatching('fresh courgettes', 'zucchini')).toBe(true);

    // Scallion / Spring Onion / Green Onion
    expect(cleanIngredientName('spring onion')).toBe('scallion');
    expect(cleanIngredientName('green onion')).toBe('scallion');
    expect(areIngredientsMatching('green onions', 'scallion')).toBe(true);
  });

  it('strips culinary noise words and handles plurals', () => {
    expect(areIngredientsMatching('2 cans of diced organic tomatoes', 'canned tomatoes')).toBe(true);
    expect(areIngredientsMatching('raw sliced chicken breast', 'chicken')).toBe(true);
    expect(areIngredientsMatching('chopped yellow onions', 'onion')).toBe(true);
    expect(areIngredientsMatching('greek yogurt', 'plain yogurt')).toBe(true);
  });

  it('rejects clearly non-matching ingredients', () => {
    expect(areIngredientsMatching('milk', 'salmon')).toBe(false);
    expect(areIngredientsMatching('garlic', 'chocolate')).toBe(false);
    expect(areIngredientsMatching('eggplant', 'cheddar cheese')).toBe(false);
  });
});
