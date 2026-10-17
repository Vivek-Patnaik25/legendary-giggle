/**
 * Concurrent Offline Delta Sync Test Suite:
 * Simulates two offline clients cooking the same item simultaneously.
 * Requirements verified:
 * 1. Both clients' deltas must survive — total deduction = sum of both operations.
 * 2. A replayed request (same Idempotency-Key) must NOT duplicate the delta.
 * 3. The audit log must contain exactly the right number of delta records.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting, getDb } from '../../src/server/db/index.js';
import { FastifyInstance } from 'fastify';

describe('Concurrent Offline Delta Sync & Idempotency Replay', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    resetDbForTesting(':memory:');
    app = buildApp({ dbPath: ':memory:', enableLogging: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('both offline clients\' cooking deltas survive after sync; replay of either request does not double-count', async () => {
    // ---- Setup: register user, create household, add item ----
    const userRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'concurrent@test.com', password: 'password123', displayName: 'Delta Tester' },
    });
    expect(userRes.statusCode).toBe(201);
    const token = JSON.parse(userRes.payload).token;

    const hhRes = await app.inject({
      method: 'POST', url: '/api/households',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Delta Test Kitchen' },
    });
    expect(hhRes.statusCode).toBe(201);
    const hhId = JSON.parse(hhRes.payload).household.id;

    // Add 10 eggs
    const addRes = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Eggs', category: 'dairy', quantity: 10, unit: 'piece' },
    });
    expect(addRes.statusCode).toBe(201);
    const itemId = JSON.parse(addRes.payload).item.id;

    // ---- Simulate two offline clients with unique idempotency keys ----
    const clientAKey = 'offline-client-A-cook-eggs-session-001';
    const clientBKey = 'offline-client-B-cook-eggs-session-002';

    // Client A (went offline, queued cook 3 eggs)
    const clientAFirst = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items/${itemId}/cook`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': clientAKey },
      payload: { amount: 3 },
    });
    expect(clientAFirst.statusCode).toBe(200);
    const afterClientA = JSON.parse(clientAFirst.payload).item.current_quantity;
    expect(afterClientA).toBe(7); // 10 - 3 = 7

    // Client B (independently queued cook 4 eggs while offline)
    const clientBFirst = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items/${itemId}/cook`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': clientBKey },
      payload: { amount: 4 },
    });
    expect(clientBFirst.statusCode).toBe(200);
    const afterBoth = JSON.parse(clientBFirst.payload).item.current_quantity;
    // Both deltas must survive: 10 - 3 - 4 = 3
    expect(afterBoth).toBe(3);

    // ---- Verify audit log has exactly 2 cook delta records for this item ----
    const db = getDb();
    const deltas = db.prepare(
      "SELECT * FROM item_deltas WHERE item_id = ? AND reason = 'cook' ORDER BY created_at ASC"
    ).all(itemId) as any[];
    expect(deltas.length).toBe(2);
    expect(deltas[0].delta).toBe(-3);
    expect(deltas[1].delta).toBe(-4);
    expect(deltas[0].idempotency_key).toBe(clientAKey);
    expect(deltas[1].idempotency_key).toBe(clientBKey);

    // ---- Now replay Client A's request (same idempotency key, simulating network retry) ----
    const clientAReplay = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items/${itemId}/cook`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': clientAKey },
      payload: { amount: 3 },
    });
    // Must return the same 200 response as the original
    expect(clientAReplay.statusCode).toBe(200);
    // Must indicate it was replayed, not a fresh operation
    expect(clientAReplay.headers['x-cache']).toBe('IDEMPOTENT-REPLAY');

    // ---- Quantity must NOT have changed after the replay ----
    const finalItem = db.prepare('SELECT current_quantity FROM items WHERE id = ?').get(itemId) as any;
    expect(finalItem.current_quantity).toBe(3); // Still 3, not 0

    // ---- Cook delta count must still be exactly 2 (no duplicate was inserted) ----
    const deltasAfterReplay = db.prepare(
      "SELECT * FROM item_deltas WHERE item_id = ? AND reason = 'cook'"
    ).all(itemId) as any[];
    expect(deltasAfterReplay.length).toBe(2);

    // ---- Scoreboard events must also be exactly 2 ----
    const scoreEvents = db.prepare(
      "SELECT * FROM scoreboard_events WHERE item_id = ? AND event_type = 'rescued'"
    ).all(itemId) as any[];
    expect(scoreEvents.length).toBe(2);
  });

  it('item that is cooked down to zero is marked consumed and excluded from active pantry', async () => {
    const userRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'zero@test.com', password: 'password123', displayName: 'Zero Tester' },
    });
    const token = JSON.parse(userRes.payload).token;

    const hhRes = await app.inject({
      method: 'POST', url: '/api/households',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Zero Kitchen' },
    });
    const hhId = JSON.parse(hhRes.payload).household.id;

    const addRes = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Last Onion', category: 'produce', quantity: 1, unit: 'piece' },
    });
    const itemId = JSON.parse(addRes.payload).item.id;

    // Cook the entire quantity
    const cookAll = await app.inject({
      method: 'POST', url: `/api/households/${hhId}/items/${itemId}/cook`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 1 },
    });
    expect(cookAll.statusCode).toBe(200);
    const body = JSON.parse(cookAll.payload);
    expect(body.item.status).toBe('consumed');
    expect(body.item.current_quantity).toBe(0);

    // Item should not appear in active pantry listing
    const activeItems = await app.inject({
      method: 'GET', url: `/api/households/${hhId}/items?status=active`,
      headers: { authorization: `Bearer ${token}` },
    });
    const activeBody = JSON.parse(activeItems.payload);
    const itemStillActive = activeBody.items.find((i: any) => i.id === itemId);
    expect(itemStillActive).toBeUndefined();
  });
});
