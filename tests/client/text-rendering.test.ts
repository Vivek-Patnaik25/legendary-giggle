import { describe, it, expect } from 'vitest';
import { cleanText, pluralize, formatUnit, formatQuantityWithUnit } from '../../src/client/utils/text.js';

describe('UI Text Rendering & Formatting Safety', () => {
  it('prevents [object Object] and extracts name or title from ingredient objects', () => {
    const rawIngredientObj = { name: 'Fresh Garlic', quantity: 2, unit: 'clove' };
    const rawRecipeObj = { title: 'Tomato & Basil Soup' };

    const cleanedIng = cleanText(rawIngredientObj);
    const cleanedRecipe = cleanText(rawRecipeObj);

    expect(cleanedIng).toBe('Fresh Garlic');
    expect(cleanedRecipe).toBe('Tomato & Basil Soup');

    expect(cleanedIng).not.toContain('[object');
    expect(cleanedRecipe).not.toContain('[object');
  });

  it('decodes HTML entities (&amp;, &quot;, &#39;) without double escaping', () => {
    const textWithEntities = 'Salt &amp; Pepper &quot;Crunch&quot; &#39;Special&#39;';
    const cleaned = cleanText(textWithEntities);

    expect(cleaned).toBe('Salt & Pepper "Crunch" \'Special\'');
    expect(cleaned).not.toContain('&amp;');
    expect(cleaned).not.toContain('&quot;');
    expect(cleaned).not.toContain('&#39;');
  });

  it('fails if any rendered recipe Needs line contains [object or &amp;', () => {
    const mockRecipe = {
      title: 'Pasta Primavera',
      missingIngredients: [
        { name: 'Bell Pepper &amp; Onions', quantity: 1, unit: 'piece' },
        { name: 'Olive Oil', quantity: 15, unit: 'ml' },
      ],
    };

    // Exactly replicate TodayView.tsx rendering line
    const needsLine = `Needs: ${mockRecipe.missingIngredients
      .map((m: any) => cleanText(typeof m === 'object' ? m?.name : m))
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')}`;

    expect(needsLine).toBe('Needs: Bell Pepper & Onions, Olive Oil');
    expect(needsLine).not.toContain('[object');
    expect(needsLine).not.toContain('&amp;');
  });

  it('enforces correct unit formatting and pluralization for piece and litres', () => {
    expect(pluralize(1, 'piece')).toBe('1 piece');
    expect(pluralize(2, 'piece')).toBe('2 pieces');
    expect(pluralize(1, 'week')).toBe('1 week');
    expect(pluralize(3, 'week')).toBe('3 weeks');

    expect(formatUnit(1, 'l')).toBe('L');
    expect(formatUnit(2, 'litres')).toBe('L');
    expect(formatQuantityWithUnit(1, 'l')).toBe('1 L');
    expect(formatQuantityWithUnit(2, 'l')).toBe('2 L');
    expect(formatQuantityWithUnit(1, 'piece')).toBe('1 piece');
    expect(formatQuantityWithUnit(2, 'piece')).toBe('2 pieces');
    expect(formatQuantityWithUnit(1, 'pieces')).toBe('1 piece');
    expect(formatQuantityWithUnit(2, 'pieces')).toBe('2 pieces');
  });

  it('filters out 1g and sub-gram activity entries from recent activity feeds', () => {
    const rawEvents = [
      { id: '1', quantity: 1, unit: 'g', user_name: 'Alex', event_type: 'rescued' },
      { id: '2', quantity: 0.5, unit: 'g', user_name: 'Alex', event_type: 'rescued' },
      { id: '3', quantity: 200, unit: 'g', user_name: 'Alex', event_type: 'rescued' },
      { id: '4', quantity: 1, unit: 'piece', user_name: 'Alex', event_type: 'rescued' },
      { id: '5', quantity: 1, unit: 'l', user_name: 'Alex', event_type: 'rescued' },
    ];

    const filtered = rawEvents.filter(evt => {
      const isGram = (evt.unit || '').toLowerCase().trim() === 'g';
      const qty = Number(evt.quantity) || 0;
      return !(isGram && qty <= 1);
    });

    expect(filtered.length).toBe(3);
    expect(filtered.map(f => f.id)).toEqual(['3', '4', '5']);
    expect(formatQuantityWithUnit(filtered[0].quantity, filtered[0].unit)).toBe('200 g');
    expect(formatQuantityWithUnit(filtered[1].quantity, filtered[1].unit)).toBe('1 piece');
    expect(formatQuantityWithUnit(filtered[2].quantity, filtered[2].unit)).toBe('1 L');
  });

  it('verifies all bundled offline recipes have ingredients that match instructions', async () => {
    const { OFFLINE_RECIPES } = await import('../../src/server/data/offlineRecipes.js');

    expect(OFFLINE_RECIPES.length).toBeGreaterThan(0);

    for (const recipe of OFFLINE_RECIPES) {
      const fullInstructions = recipe.instructions.join(' ').toLowerCase();
      // Every recipe must have ingredients
      expect(recipe.ingredients.length).toBeGreaterThan(0);

      // Verify each non-optional ingredient is reflected in the instructions
      for (const ing of recipe.ingredients) {
        const ingRoot = ing.name.split(' ')[0].toLowerCase();
        const isInInstructions = fullInstructions.includes(ing.name.toLowerCase()) || fullInstructions.includes(ingRoot);
        expect(isInInstructions, `Recipe "${recipe.title}" ingredient "${ing.name}" should be mentioned in instructions`).toBe(true);
      }
    }
  });
});
