import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';
import { authenticate, verifyHouseholdAccess } from '../middleware/auth.js';
import { lookupBarcode } from '../services/barcode.js';
import { rankRescueRecipes, PantryItemSummary } from '../services/recipeEngine.js';
import { generateSmartShoppingHints } from '../services/shoppingHints.js';
import { calculateUrgency } from '../../domain/urgency.js';
import { eventHub } from '../services/events.js';

export async function barcodeRoutes(fastify: FastifyInstance): Promise<void> {
  // Barcode Lookup Endpoint (cached, Open Food Facts, free)
  fastify.get('/barcode/:code', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const product = await lookupBarcode(code);
    return reply.send({ product });
  });
}

export async function recipeRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // Helper: load active pantry items for household with urgency calculations
  function getHouseholdPantryItems(householdId: string): PantryItemSummary[] {
    const rawItems = db.prepare(`
      SELECT id, name, category, current_quantity, unit, expiry_date, is_frozen
      FROM items
      WHERE household_id = ? AND deleted_at IS NULL AND status = 'active' AND current_quantity > 0
    `).all(householdId) as any[];

    return rawItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      current_quantity: item.current_quantity,
      unit: item.unit,
      urgency: calculateUrgency({
        expiryDate: item.expiry_date,
        quantity: item.current_quantity,
        isFrozen: Boolean(item.is_frozen),
      }),
    }));
  }

  // Top 3 Rescue Recipe Suggestions for the Rescue Board
  fastify.get('/:id/recipes/rescue', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const pantryItems = getHouseholdPantryItems(id);
    const topRescueRecipes = await rankRescueRecipes(pantryItems, { limit: 3 });

    return reply.send({
      recipes: topRescueRecipes,
      activePantryItemsCount: pantryItems.length,
    });
  });

  // Full Recipe Explorer with search and category filters
  fastify.get('/:id/recipes', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const { query, category, limit } = request.query as any || {};
    const pantryItems = getHouseholdPantryItems(id);

    const ranked = await rankRescueRecipes(pantryItems, {
      query,
      category,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    return reply.send({
      recipes: ranked,
      totalCount: ranked.length,
    });
  });

  // Smart Shopping Hints Endpoint
  fastify.get('/:id/recipes/shopping-hints', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const pantryItems = getHouseholdPantryItems(id);
    const rankedRecipes = await rankRescueRecipes(pantryItems);
    const hints = generateSmartShoppingHints(rankedRecipes, pantryItems);

    return reply.send({ hints });
  });

  // Item Claim Endpoint ("this yogurt is mine" - visible but not strictly enforced)
  fastify.post('/:id/items/:itemId/claim', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const item = db.prepare('SELECT id, name, claimed_by_user_id FROM items WHERE id = ? AND household_id = ? AND deleted_at IS NULL').get(itemId, id) as any;
    if (!item) {
      return reply.status(404).send({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const { claim = true } = request.body as any || {};
    const newClaimedUserId = claim ? request.user!.id : null;

    db.prepare("UPDATE items SET claimed_by_user_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newClaimedUserId, itemId);

    const updated = db.prepare(`
      SELECT i.*, u.display_name as claimed_by_name
      FROM items i
      LEFT JOIN users u ON i.claimed_by_user_id = u.id
      WHERE i.id = ?
    `).get(itemId);

    eventHub.publish(id, 'ITEM_UPDATED', { item: updated });

    return reply.send({
      message: claim ? `You claimed ${item.name}` : `Unclaimed ${item.name}`,
      item: updated,
    });
  });
}
