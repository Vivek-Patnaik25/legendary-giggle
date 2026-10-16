import { RankedRecipe, PantryItemSummary } from './recipeEngine.js';
import { areIngredientsMatching, cleanIngredientName } from '../../domain/synonyms.js';

export interface ShoppingHint {
  ingredient: string;
  suggestedUnit: string;
  unlocksRecipeCount: number;
  recipes: string[];
}

/**
 * Computes 1-2 complementary ingredients to complete near-ready recipes.
 * Strictly verifies that suggestions are NOT already in the household pantry.
 */
export function generateSmartShoppingHints(
  rankedRecipes: RankedRecipe[],
  pantryItems: PantryItemSummary[]
): ShoppingHint[] {
  // Map of missing ingredient -> recipe titles
  const hintMap: Map<string, { unit: string; recipes: Set<string> }> = new Map();

  // Inspect recipes that only need 1 or 2 missing ingredients
  const nearReadyRecipes = rankedRecipes
    .filter(r => r.missingCount >= 1 && r.missingCount <= 2 && r.pantryItemsUsedCount >= 1);

  for (const recipe of nearReadyRecipes) {
    for (const missing of recipe.missingIngredients) {
      const cleanMissing = cleanIngredientName(missing.name);

      // Verify this ingredient is definitely NOT in pantry
      const alreadyInPantry = pantryItems.some(item =>
        item.current_quantity > 0 && areIngredientsMatching(item.name, missing.name)
      );

      if (!alreadyInPantry && cleanMissing.length > 1) {
        if (!hintMap.has(cleanMissing)) {
          hintMap.set(cleanMissing, { unit: missing.unit || 'piece', recipes: new Set() });
        }
        hintMap.get(cleanMissing)!.recipes.add(recipe.title);
      }
    }
  }

  // Convert to array and rank by how many recipes each ingredient unlocks
  const hints: ShoppingHint[] = Array.from(hintMap.entries()).map(([ingredient, data]) => ({
    ingredient,
    suggestedUnit: data.unit,
    unlocksRecipeCount: data.recipes.size,
    recipes: Array.from(data.recipes),
  }));

  hints.sort((a, b) => b.unlocksRecipeCount - a.unlocksRecipeCount);

  // Return top 2 smart suggestions
  return hints.slice(0, 2);
}
