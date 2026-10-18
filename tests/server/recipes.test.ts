import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting } from '../../src/server/db/index.js';
import { FastifyInstance } from 'fastify';

describe('Milestone 4: Barcode Lookup, Recipe Intelligence & Offline Fallbacks', () => {
  let app: FastifyInstance;
  let userToken: string;
  let householdId: string;

  beforeEach(async () => {
    resetDbForTesting(':memory:');
    app = buildApp({ dbPath: ':memory:', enableLogging: false });

    // Register user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'chef@kitchen.com', password: 'password123', displayName: 'Chef Gusteau' },
    });
    userToken = JSON.parse(regRes.payload).token;

    // Create household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Gusteau Pantry' },
    });
    householdId = JSON.parse(hhRes.payload).household.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('performs cached barcode lookup and gracefully falls back to manual entry', async () => {
    // 1. Lookup a fake / unknown barcode
    const res = await app.inject({
      method: 'GET',
      url: '/api/lookup/barcode/0000000000000',
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.product).toBeDefined();
    expect(body.product.found).toBe(false);
    expect(body.product.source).toBe('manual');
  });

  it('ranks rescue recipes by prioritizing at-risk pantry items and provides exact missing ingredients', async () => {
    // Add urgent eggs expiring today
    const todayISO = new Date().toISOString().split('T')[0];
    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Eggs', category: 'dairy', quantity: 6, unit: 'piece', expiryDate: todayISO },
    });

    // Add urgent bell pepper expiring tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Capsicum', category: 'produce', quantity: 2, unit: 'piece', expiryDate: tomorrow },
    });

    // Add non-urgent staple rice (expires in 100 days)
    const future = new Date(Date.now() + 100 * 86400000).toISOString().split('T')[0];
    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Basmati Rice', category: 'pantry_staple', quantity: 500, unit: 'g', expiryDate: future },
    });

    // Fetch top 3 rescue recipes
    const rescueRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/recipes/rescue`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(rescueRes.statusCode).toBe(200);
    const data = JSON.parse(rescueRes.payload);
    expect(data.recipes.length).toBeGreaterThan(0);
    expect(data.recipes.length).toBeLessThanOrEqual(3);

    // The top recipe should be Frittata or Shakshuka because they use both urgent eggs and capsicum (bell pepper synonym)
    const topRecipe = data.recipes[0];
    expect(topRecipe.isRescueCandidate).toBe(true);
    expect(topRecipe.urgentItemsUsedCount).toBeGreaterThanOrEqual(1);
    expect(topRecipe.missingCount).toBeDefined();
    expect(Array.isArray(topRecipe.missingIngredients)).toBe(true);
    expect(topRecipe.source).toBe('bundled_offline');
  });

  it('generates smart shopping hints without suggesting items already in the pantry', async () => {
    // Add pasta and tomato puree
    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Pasta', category: 'pantry_staple', quantity: 400, unit: 'g' },
    });

    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Tomato Puree', category: 'pantry_staple', quantity: 300, unit: 'g' },
    });

    const hintsRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/recipes/shopping-hints`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(hintsRes.statusCode).toBe(200);
    const hints = JSON.parse(hintsRes.payload).hints;
    expect(Array.isArray(hints)).toBe(true);

    // Verify smart hints never suggest pasta or tomato puree
    for (const hint of hints) {
      expect(hint.ingredient.toLowerCase()).not.toContain('pasta');
      expect(hint.ingredient.toLowerCase()).not.toContain('tomato');
      expect(hint.unlocksRecipeCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('allows members to claim and unclaim items', async () => {
    // Add item
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Greek Yogurt', category: 'dairy', quantity: 1, unit: 'piece' },
    });
    const itemId = JSON.parse(addRes.payload).item.id;

    // Claim item
    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${itemId}/claim`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { claim: true },
    });
    expect(claimRes.statusCode).toBe(200);
    expect(JSON.parse(claimRes.payload).item.claimed_by_name).toBe('Chef Gusteau');

    // Unclaim item
    const unclaimRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${itemId}/claim`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { claim: false },
    });
    expect(unclaimRes.statusCode).toBe(200);
    expect(JSON.parse(unclaimRes.payload).item.claimed_by_user_id).toBeNull();
  });

  it('ranks cook suggestions by expiring items first, avoids "Uses 0 from your fridge" at the top, and updates after an item is used', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Add expiring Greek Yogurt
    const yogurtRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Greek Yogurt', category: 'dairy', quantity: 1, unit: 'piece', expiry_date: todayStr },
    });
    const yogurtId = JSON.parse(yogurtRes.payload).item.id;

    // Add expiring Brown Onion
    const onionRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Brown Onion', category: 'produce', quantity: 2, unit: 'piece', expiry_date: tomorrowStr },
    });
    const onionId = JSON.parse(onionRes.payload).item.id;

    // Add non-expiring staple
    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Penne Pasta', category: 'pantry_staple', quantity: 500, unit: 'g', expiry_date: '2027-01-01' },
    });

    // 1. Initial ranked recipes
    const initialRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/recipes/rescue`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(initialRes.statusCode).toBe(200);
    const initialRecipes = JSON.parse(initialRes.payload).recipes;
    expect(initialRecipes.length).toBeGreaterThan(0);

    // Never show "Uses 0 from your fridge" at top when items are available
    expect(initialRecipes[0].pantryItemsUsedCount).toBeGreaterThan(0);
    expect(initialRecipes[0].urgentItemsUsedCount).toBeGreaterThan(0);

    // 2. Mark Greek Yogurt as used
    const cookRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${yogurtId}/cook`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { quantity: 1 },
    });
    expect(cookRes.statusCode).toBe(200);

    // 3. Fetch ranked recipes after Greek Yogurt is used
    const afterCookRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/recipes/rescue`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(afterCookRes.statusCode).toBe(200);
    const updatedRecipes = JSON.parse(afterCookRes.payload).recipes;
    expect(updatedRecipes.length).toBeGreaterThan(0);

    // Top suggestion must never be "Uses 0" and must use remaining expiring item (Brown Onion)
    const topSuggestion = updatedRecipes[0];
    expect(topSuggestion.pantryItemsUsedCount).toBeGreaterThan(0);
    expect(topSuggestion.urgentItemsUsedCount).toBeGreaterThanOrEqual(1);

    const usedNames = topSuggestion.usedPantryItems.map((p: any) => p.name.toLowerCase());
    expect(usedNames).toContain('brown onion');
    expect(usedNames).not.toContain('greek yogurt');
  });
});
