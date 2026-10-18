import { OFFLINE_RECIPES, Recipe, RecipeIngredient } from '../data/offlineRecipes.js';
import { areIngredientsMatching } from '../../domain/synonyms.js';
import { getDb } from '../db/index.js';

export interface PantryItemSummary {
  id: string;
  name: string;
  category: string;
  current_quantity: number;
  unit: string;
  urgency: {
    score: number;
    tier: 'critical' | 'high' | 'medium' | 'low';
    daysRemaining: number | null;
  };
}

export interface RankedRecipe extends Recipe {
  matchingScore: number;
  pantryItemsUsedCount: number;
  urgentItemsUsedCount: number;
  usedPantryItems: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    urgencyTier: string;
  }[];
  missingIngredients: RecipeIngredient[];
  missingCount: number;
  isRescueCandidate: boolean;
}

const THE_MEAL_DB_URL = process.env.THE_MEAL_DB_URL || 'https://www.themealdb.com/api/json/v1/1';
const CACHE_TTL_SECONDS = 86400; // 24 hours

/**
 * Fetch and parse recipes from TheMealDB with cache support and graceful offline fallback
 */
async function fetchTheMealDbRecipes(searchQuery: string = 'chicken'): Promise<Recipe[]> {
  const db = getDb();
  const cacheKey = `mealdb:search:${searchQuery.toLowerCase()}`;

  // 1. Check SQLite cache
  const cached = db.prepare(`
    SELECT value FROM cache_entries
    WHERE key = ? AND expires_at > datetime('now')
  `).get(cacheKey) as { value: string } | undefined;

  if (cached) {
    try {
      return JSON.parse(cached.value);
    } catch {
      // ignore
    }
  }

  // 2. Fetch from TheMealDB free API with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${THE_MEAL_DB_URL}/search.php?s=${encodeURIComponent(searchQuery)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.meals && Array.isArray(data.meals)) {
        const parsedRecipes: Recipe[] = data.meals.slice(0, 15).map((m: any) => {
          const ingredients: RecipeIngredient[] = [];
          for (let i = 1; i <= 20; i++) {
            const ingName = m[`strIngredient${i}`];
            const measure = m[`strMeasure${i}`] || '';
            if (ingName && String(ingName).trim().length > 0) {
              ingredients.push({
                name: String(ingName).trim(),
                quantity: 1, // Normalized default
                unit: measure.trim() || 'piece',
              });
            }
          }

          const instructions = (m.strInstructions || '')
            .split(/\r?\n/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 5);

          return {
            id: `mealdb-${m.idMeal}`,
            title: m.strMeal,
            category: m.strCategory || 'General',
            prepTimeMinutes: 30,
            servings: 4,
            instructions: instructions.length > 0 ? instructions : [m.strInstructions],
            ingredients,
            source: 'themealdb',
            imageUrl: m.strMealThumb,
            tags: m.strTags ? m.strTags.split(',').map((t: string) => t.trim()) : [],
          };
        });

        if (parsedRecipes.length > 0) {
          // Cache successful response
          db.prepare(`
            INSERT INTO cache_entries (key, value, expires_at)
            VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
          `).run(cacheKey, JSON.stringify(parsedRecipes), CACHE_TTL_SECONDS);

          return parsedRecipes;
        }
      }
    }
  } catch (err: any) {
    // API down, network timeout, or offline - fall through gracefully to offline recipes
    console.warn('TheMealDB unavailable, using bundled offline recipe dataset:', err.message);
  }

  return [];
}

/**
 * Ranks all available recipes based on household pantry items:
 * - Prioritizes recipes using the most at-risk items
 * - Penalizes missing ingredients
 * - Explicitly surfaces exact missing count and list
 */
export async function rankRescueRecipes(
  pantryItems: PantryItemSummary[],
  options: { query?: string; category?: string; limit?: number } = {}
): Promise<RankedRecipe[]> {
  // Load bundled offline recipes
  let candidateRecipes: Recipe[] = [...OFFLINE_RECIPES];

  // Try fetching additional recipes from TheMealDB when search query or category is provided
  if (options.query) {
    const externalRecipes = await fetchTheMealDbRecipes(options.query);
    if (externalRecipes.length > 0) {
      candidateRecipes = [...candidateRecipes, ...externalRecipes];
    }
  }

  // Filter by category if requested
  if (options.category && options.category !== 'all') {
    const catLower = options.category.toLowerCase();
    candidateRecipes = candidateRecipes.filter(r => r.category.toLowerCase().includes(catLower));
  }

  // Filter by search query if provided
  if (options.query && options.query.trim()) {
    const qLower = options.query.toLowerCase().trim();
    candidateRecipes = candidateRecipes.filter(r =>
      r.title.toLowerCase().includes(qLower) ||
      r.ingredients.some(i => i.name.toLowerCase().includes(qLower))
    );
  }

  const ranked: RankedRecipe[] = candidateRecipes.map(recipe => {
    const usedPantryItems: RankedRecipe['usedPantryItems'] = [];
    const missingIngredients: RecipeIngredient[] = [];
    let urgentScoreSum = 0;
    let urgentCount = 0;

    for (const reqIng of recipe.ingredients) {
      // Find matching pantry item using culinary synonym engine
      const matchedPantry = pantryItems.find(p =>
        p.current_quantity > 0 && areIngredientsMatching(p.name, reqIng.name)
      );

      if (matchedPantry) {
        usedPantryItems.push({
          id: matchedPantry.id,
          name: matchedPantry.name,
          quantity: matchedPantry.current_quantity,
          unit: matchedPantry.unit,
          urgencyTier: matchedPantry.urgency.tier,
        });

        urgentScoreSum += matchedPantry.urgency.score;
        if (matchedPantry.urgency.tier === 'critical' || matchedPantry.urgency.tier === 'high') {
          urgentCount++;
        }
      } else {
        missingIngredients.push(reqIng);
      }
    }

    // Matching score formula:
    // Urgency score contribution + items used bonus - missing ingredients penalty + rescue candidate boost
    const rescueBonus = urgentCount > 0 ? 30 : 0;
    const requiredMissingCount = missingIngredients.filter(m => !m.optional).length;
    const optionalMissingCount = missingIngredients.filter(m => m.optional).length;
    const matchingScore = Math.round(
      (urgentScoreSum * 0.5) +
      (usedPantryItems.length * 20) -
      (requiredMissingCount * 15 + optionalMissingCount * 5) +
      rescueBonus
    );

    return {
      ...recipe,
      matchingScore,
      pantryItemsUsedCount: usedPantryItems.length,
      urgentItemsUsedCount: urgentCount,
      usedPantryItems,
      missingIngredients,
      missingCount: missingIngredients.length,
      isRescueCandidate: urgentCount > 0,
    };
  });

  // Sort priority:
  // 1. Has pantry items: recipes using >= 1 fridge item ALWAYS rank above "Uses 0 from your fridge"
  // 2. Has expiring/urgent items: recipes using expiring items rank first
  // 3. More expiring items used first
  // 4. Overall matching score descending (includes urgentScoreSum, items used bonus, missing penalty)
  // 5. Tie-break: fewer missing ingredients
  ranked.sort((a, b) => {
    const aHasPantry = a.pantryItemsUsedCount > 0 ? 1 : 0;
    const bHasPantry = b.pantryItemsUsedCount > 0 ? 1 : 0;
    if (aHasPantry !== bHasPantry) {
      return bHasPantry - aHasPantry; // Never show "Uses 0 from your fridge" at top if recipes use items
    }

    const aHasUrgent = a.urgentItemsUsedCount > 0 ? 1 : 0;
    const bHasUrgent = b.urgentItemsUsedCount > 0 ? 1 : 0;
    if (aHasUrgent !== bHasUrgent) {
      return bHasUrgent - aHasUrgent; // Rank by expiring items first
    }

    if (b.urgentItemsUsedCount !== a.urgentItemsUsedCount) {
      return b.urgentItemsUsedCount - a.urgentItemsUsedCount;
    }

    if (b.matchingScore !== a.matchingScore) {
      return b.matchingScore - a.matchingScore;
    }

    return a.missingCount - b.missingCount;
  });

  if (options.limit && options.limit > 0) {
    return ranked.slice(0, options.limit);
  }

  return ranked;
}
