import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { authenticate, verifyHouseholdAccess } from '../middleware/auth.js';
import { checkIdempotency, recordIdempotentResponse } from '../middleware/idempotency.js';
import { calculateUrgency } from '../../domain/urgency.js';
import { normaliseUnit, applyQuantityDelta } from '../../domain/units.js';
import { estimateExpiryDate, applyFreezerExtension } from '../../domain/expiry.js';
import { determineMascotMood, getSirExpiryStatus } from '../../domain/mascot.js';
import { eventHub } from '../services/events.js';

/**
 * Strips dangerous HTML/script characters to prevent XSS while preserving emojis, RTL, and UTF-8 text
 */
function sanitizeString(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

export async function pantryRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // List Items with Urgency Scoring & Pagination
  fastify.get('/:id/items', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { role } = verifyHouseholdAccess(id, request.user!.id);

    const query = request.query as any || {};
    const location = query.location as string; // fridge, freezer, pantry, or all
    const status = query.status as string || 'active'; // active or all
    const search = query.search as string;
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['i.household_id = ?', 'i.deleted_at IS NULL'];
    const params: any[] = [id];

    if (status !== 'all') {
      conditions.push('i.status = ?');
      params.push(status);
    }

    if (location && location !== 'all') {
      conditions.push('i.location = ?');
      params.push(location);
    }

    if (search && search.trim()) {
      conditions.push('(i.name LIKE ? OR i.notes LIKE ? OR i.category LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const totalCount = (db.prepare(`
      SELECT COUNT(*) as count FROM items i WHERE ${whereClause}
    `).get(...params) as any).count;

    // Fetch items with claimer display name
    const rawItems = db.prepare(`
      SELECT i.*, u.display_name as claimed_by_name
      FROM items i
      LEFT JOIN users u ON i.claimed_by_user_id = u.id
      WHERE ${whereClause}
      ORDER BY i.expiry_date ASC, i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    // Calculate dynamic urgency score for each item
    let urgentCount = 0;
    let expiredCount = 0;
    let mostUrgentItemName = '';

    const items = rawItems.map(item => {
      const urgency = calculateUrgency({
        expiryDate: item.expiry_date,
        quantity: item.current_quantity,
        isFrozen: Boolean(item.is_frozen),
      });

      if (urgency.tier === 'critical') {
        if (urgency.daysRemaining !== null && urgency.daysRemaining < 0) {
          expiredCount++;
        } else {
          urgentCount++;
        }
        if (!mostUrgentItemName) {
          mostUrgentItemName = item.name;
        }
      }

      return {
        ...item,
        is_frozen: Boolean(item.is_frozen),
        is_leftover: Boolean(item.is_leftover),
        urgency,
      };
    });

    // Sort by urgency score descending by default
    items.sort((a, b) => b.urgency.score - a.urgency.score);

    // Calculate Sir Expiry Mascot state
    const mascot = getSirExpiryStatus(undefined, {
      urgentCount,
      expiredCount,
      totalCount,
      urgentItemName: mostUrgentItemName,
    });

    return reply.send({
      items,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      mascot,
      userRole: role,
    });
  });

  // Add Item (Fast add, presets, barcode, or category defaults)
  fastify.post('/:id/items', { preHandler: [authenticate, checkIdempotency] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const body = request.body as any || {};
    const {
      name,
      category = 'general',
      location = 'fridge',
      quantity = 1,
      unit = 'piece',
      expiryDate,
      notes = '',
      barcode = null,
      isLeftover = false,
      isFrozen = false,
      claimedByUserId = null,
    } = body;

    if (!name || String(name).trim().length === 0) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Item name is required' });
    }

    const sanitizedName = sanitizeString(name).slice(0, 150);
    const sanitizedCategory = sanitizeString(category).slice(0, 50).toLowerCase();
    const sanitizedNotes = sanitizeString(notes).slice(0, 500);
    const cleanUnit = normaliseUnit(unit);
    const cleanQty = Math.max(0.01, Math.round(Number(quantity || 1) * 100) / 100);

    // Apply category default expiry if missing
    let finalExpiry = expiryDate;
    if (!finalExpiry || String(finalExpiry).trim().length === 0) {
      finalExpiry = estimateExpiryDate(sanitizedCategory, isFrozen ? 'freezer' : location);
    }

    const itemId = crypto.randomUUID();
    const deltaId = crypto.randomUUID();
    const idempotencyKey = request.headers['idempotency-key'] as string || body.idempotencyKey || null;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO items (
          id, household_id, name, category, location,
          initial_quantity, current_quantity, unit, expiry_date,
          is_frozen, frozen_at, claimed_by_user_id, notes,
          barcode, is_leftover, status, created_by_user_id
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 'active', ?
        )
      `).run(
        itemId, id, sanitizedName, sanitizedCategory, location,
        cleanQty, cleanQty, cleanUnit, finalExpiry,
        isFrozen ? 1 : 0, isFrozen ? new Date().toISOString() : null, claimedByUserId, sanitizedNotes,
        barcode, isLeftover ? 1 : 0, request.user!.id
      );

      // Record initial quantity delta
      db.prepare(`
        INSERT INTO item_deltas (
          id, item_id, household_id, user_id, delta, unit, reason, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, 'initial', ?)
      `).run(deltaId, itemId, id, request.user!.id, cleanQty, cleanUnit, idempotencyKey);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'add_item', 'item', ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, JSON.stringify({ name: sanitizedName, quantity: cleanQty }));
    })();

    const createdItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    const responsePayload = { message: 'Item added successfully', item: createdItem };

    if (idempotencyKey) {
      recordIdempotentResponse(idempotencyKey, 201, responsePayload);
    }

    eventHub.publish(id, 'ITEM_ADDED', { item: createdItem });
    return reply.status(201).send(responsePayload);
  });

  // Edit Item (Last-writer-wins for metadata, deltas for quantities)
  fastify.patch('/:id/items/:itemId', { preHandler: [authenticate, checkIdempotency] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const existing = db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ? AND deleted_at IS NULL').get(itemId, id) as any;
    if (!existing) {
      return reply.status(404).send({ error: 'ITEM_NOT_FOUND', message: 'Item not found in this household' });
    }

    const body = request.body as any || {};
    const idempotencyKey = request.headers['idempotency-key'] as string || body.idempotencyKey || null;

    db.transaction(() => {
      // 1. Quantity Delta update if requested
      if (body.quantityDelta !== undefined) {
        const delta = Number(body.quantityDelta);
        const deltaResult = applyQuantityDelta(existing.current_quantity, delta);

        db.prepare("UPDATE items SET current_quantity = ?, updated_at = datetime('now') WHERE id = ?")
          .run(deltaResult.newQuantity, itemId);

        db.prepare(`
          INSERT INTO item_deltas (id, item_id, household_id, user_id, delta, unit, reason, idempotency_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(), itemId, id, request.user!.id,
          delta, existing.unit, body.deltaReason || 'adjust', idempotencyKey
        );

        if (deltaResult.isDepleted) {
          db.prepare("UPDATE items SET status = 'consumed' WHERE id = ?").run(itemId);
        }
      }

      // 2. Metadata updates (Last-Writer-Wins)
      const updates: string[] = [];
      const params: any[] = [];

      if (body.name) {
        updates.push('name = ?');
        params.push(sanitizeString(body.name).slice(0, 150));
      }
      if (body.category) {
        updates.push('category = ?');
        params.push(sanitizeString(body.category).slice(0, 50).toLowerCase());
      }
      if (body.location) {
        updates.push('location = ?');
        params.push(body.location);
      }
      if (body.expiryDate !== undefined) {
        updates.push('expiry_date = ?');
        params.push(body.expiryDate);
      }
      if (body.notes !== undefined) {
        updates.push('notes = ?');
        params.push(sanitizeString(body.notes).slice(0, 500));
      }
      if (body.claimedByUserId !== undefined) {
        updates.push('claimed_by_user_id = ?');
        params.push(body.claimedByUserId);
      }
      if (body.isFrozen !== undefined) {
        const freezingNow = Boolean(body.isFrozen) && !existing.is_frozen;
        updates.push('is_frozen = ?');
        params.push(body.isFrozen ? 1 : 0);

        if (freezingNow) {
          const extension = applyFreezerExtension(existing.expiry_date, existing.category);
          updates.push('expiry_date = ?');
          params.push(extension.newExpiryDate);
          updates.push("frozen_at = datetime('now')");
        }
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        params.push(itemId);
        db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'update_item', 'item', ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, JSON.stringify(body));
    })();

    const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    const responsePayload = { message: 'Item updated successfully', item: updatedItem };

    if (idempotencyKey) {
      recordIdempotentResponse(idempotencyKey, 200, responsePayload);
    }

    eventHub.publish(id, 'ITEM_UPDATED', { item: updatedItem });
    return reply.send(responsePayload);
  });

  // Cook / Use Item (Delta decrement & Rescue recording)
  fastify.post('/:id/items/:itemId/cook', { preHandler: [authenticate, checkIdempotency] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const item = db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ? AND deleted_at IS NULL').get(itemId, id) as any;
    if (!item) {
      return reply.status(404).send({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const { amount = item.current_quantity } = request.body as any || {};
    const usedQty = Math.min(item.current_quantity, Math.max(0.01, Number(amount)));
    const deltaResult = applyQuantityDelta(item.current_quantity, -usedQty);
    const idempotencyKey = request.headers['idempotency-key'] as string || (request.body as any)?.idempotencyKey || null;

    db.transaction(() => {
      // 1. Update item quantity and status
      const newStatus = deltaResult.isDepleted ? 'consumed' : item.status;
      db.prepare("UPDATE items SET current_quantity = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(deltaResult.newQuantity, newStatus, itemId);

      // 2. Record delta
      db.prepare(`
        INSERT INTO item_deltas (id, item_id, household_id, user_id, delta, unit, reason, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, 'cook', ?)
      `).run(crypto.randomUUID(), itemId, id, request.user!.id, -usedQty, item.unit, idempotencyKey);

      // 3. Record rescue in scoreboard_events
      const todayISO = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO scoreboard_events (id, household_id, user_id, item_id, event_type, quantity, unit, date)
        VALUES (?, ?, ?, ?, 'rescued', ?, ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, usedQty, item.unit, todayISO);

      // 4. Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'cook_item', 'item', ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, JSON.stringify({ usedQuantity: usedQty, remaining: deltaResult.newQuantity }));
    })();

    const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    const responsePayload = {
      message: `Rescued ${usedQty} ${item.unit} of ${item.name}!`,
      item: updatedItem,
      rescuedAmount: usedQty,
    };

    if (idempotencyKey) {
      recordIdempotentResponse(idempotencyKey, 200, responsePayload);
    }

    eventHub.publish(id, 'ITEM_RESCUED', { item: updatedItem, rescuedAmount: usedQty });
    return reply.send(responsePayload);
  });

  // Mark Item as Waste
  fastify.post('/:id/items/:itemId/waste', { preHandler: [authenticate, checkIdempotency] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const item = db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ? AND deleted_at IS NULL').get(itemId, id) as any;
    if (!item) {
      return reply.status(404).send({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const { amount = item.current_quantity } = request.body as any || {};
    const wastedQty = Math.min(item.current_quantity, Math.max(0.01, Number(amount)));
    const deltaResult = applyQuantityDelta(item.current_quantity, -wastedQty);
    const idempotencyKey = request.headers['idempotency-key'] as string || (request.body as any)?.idempotencyKey || null;

    db.transaction(() => {
      const newStatus = deltaResult.isDepleted ? 'wasted' : item.status;
      db.prepare("UPDATE items SET current_quantity = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(deltaResult.newQuantity, newStatus, itemId);

      db.prepare(`
        INSERT INTO item_deltas (id, item_id, household_id, user_id, delta, unit, reason, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, 'waste', ?)
      `).run(crypto.randomUUID(), itemId, id, request.user!.id, -wastedQty, item.unit, idempotencyKey);

      const todayISO = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO scoreboard_events (id, household_id, user_id, item_id, event_type, quantity, unit, date)
        VALUES (?, ?, ?, ?, 'wasted', ?, ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, wastedQty, item.unit, todayISO);

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'waste_item', 'item', ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, JSON.stringify({ wastedQuantity: wastedQty, remaining: deltaResult.newQuantity }));
    })();

    const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    const responsePayload = {
      message: `Marked ${wastedQty} ${item.unit} of ${item.name} as wasted`,
      item: updatedItem,
      wastedAmount: wastedQty,
    };

    if (idempotencyKey) {
      recordIdempotentResponse(idempotencyKey, 200, responsePayload);
    }

    eventHub.publish(id, 'ITEM_WASTED', { item: updatedItem, wastedAmount: wastedQty });
    return reply.send(responsePayload);
  });

  // Soft Delete Item (Deleting an active item counts as waste unless marked otherwise)
  fastify.delete('/:id/items/:itemId', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const item = db.prepare('SELECT * FROM items WHERE id = ? AND household_id = ? AND deleted_at IS NULL').get(itemId, id) as any;
    if (!item) {
      return reply.status(404).send({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const { markAsConsumed = false } = (request.query as any) || {};

    db.transaction(() => {
      // If deleting an active item and not explicitly marked consumed, count remaining as wasted!
      if (item.status === 'active' && item.current_quantity > 0 && !markAsConsumed) {
        const todayISO = new Date().toISOString().split('T')[0];
        db.prepare(`
          INSERT INTO scoreboard_events (id, household_id, user_id, item_id, event_type, quantity, unit, date)
          VALUES (?, ?, ?, ?, 'wasted', ?, ?, ?)
        `).run(crypto.randomUUID(), id, request.user!.id, itemId, item.current_quantity, item.unit, todayISO);

        db.prepare("UPDATE items SET status = 'wasted' WHERE id = ?").run(itemId);
      } else if (markAsConsumed) {
        db.prepare("UPDATE items SET status = 'consumed' WHERE id = ?").run(itemId);
      }

      db.prepare("UPDATE items SET deleted_at = datetime('now') WHERE id = ?").run(itemId);

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'delete_item', 'item', ?, ?)
      `).run(crypto.randomUUID(), id, request.user!.id, itemId, JSON.stringify({ itemStatus: item.status, countedAsWaste: !markAsConsumed }));
    })();

    eventHub.publish(id, 'ITEM_DELETED', { itemId });
    return reply.send({ message: 'Item removed from pantry' });
  });

  // Real-Time SSE Stream for Household
  fastify.get('/:id/events', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    eventHub.subscribe(id, reply);
  });

  // Fallback Polling for Household Events
  fastify.get('/:id/events/poll', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const since = (request.query as any)?.since as string;
    const events = eventHub.poll(id, since);
    return reply.send({ events });
  });
}
