/**
 * Security Test Suite:
 * 1. Cross-household IDOR attack - a valid authenticated session must NOT access another household's items.
 *    Expect HTTP 403 with a clear error code.
 * 2. Scheduler distributed job lock race - two concurrent runners attempting to acquire the same lock must
 *    result in exactly one winner. The loser must not run the job.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting, getDb } from '../../src/server/db/index.js';
import { acquireJobLock, releaseJobLock } from '../../src/server/services/scheduler.js';
import { FastifyInstance } from 'fastify';

describe('Security: Cross-Household IDOR & Scheduler Lock Race', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    resetDbForTesting(':memory:');
    app = buildApp({ dbPath: ':memory:', enableLogging: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks a valid session from reading or modifying a different household\'s items (IDOR guard)', async () => {
    // --- Create Alice (owns Household A) ---
    const aliceRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'alice@idor.test', password: 'password123', displayName: 'Alice' },
    });
    expect(aliceRes.statusCode).toBe(201);
    const aliceToken = JSON.parse(aliceRes.payload).token;

    const hhARes = await app.inject({
      method: 'POST', url: '/api/households',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { name: 'Alice Home', weeklyWasteTarget: 2 },
    });
    expect(hhARes.statusCode).toBe(201);
    const hhAId = JSON.parse(hhARes.payload).household.id;

    // Alice adds an item to her household
    const itemRes = await app.inject({
      method: 'POST', url: `/api/households/${hhAId}/items`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { name: 'Secret Cheese', category: 'dairy', quantity: 3, unit: 'piece' },
    });
    expect(itemRes.statusCode).toBe(201);
    const secretItemId = JSON.parse(itemRes.payload).item.id;

    // --- Create Mallory (owns a DIFFERENT Household B, never joined Household A) ---
    const malloryRes = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'mallory@idor.test', password: 'password123', displayName: 'Mallory Attacker' },
    });
    expect(malloryRes.statusCode).toBe(201);
    const malloryToken = JSON.parse(malloryRes.payload).token;

    // Mallory creates her own household (she is a valid user with a real session)
    const hhBRes = await app.inject({
      method: 'POST', url: '/api/households',
      headers: { authorization: `Bearer ${malloryToken}` },
      payload: { name: 'Mallory Evil Lair' },
    });
    expect(hhBRes.statusCode).toBe(201);

    // ATTACK 1: Mallory tries to list items in Alice's household
    const getAttack = await app.inject({
      method: 'GET', url: `/api/households/${hhAId}/items`,
      headers: { authorization: `Bearer ${malloryToken}` },
    });
    expect(getAttack.statusCode).toBe(403);
    const getBody = JSON.parse(getAttack.payload);
    expect(getBody.error).toMatch(/FORBIDDEN|ACCESS_DENIED|MEMBER_REVOKED|not a member/i);

    // ATTACK 2: Mallory tries to POST a new item directly into Alice's household
    const postAttack = await app.inject({
      method: 'POST', url: `/api/households/${hhAId}/items`,
      headers: { authorization: `Bearer ${malloryToken}` },
      payload: { name: 'Mallory Poison', category: 'other', quantity: 1, unit: 'piece' },
    });
    expect(postAttack.statusCode).toBe(403);

    // ATTACK 3: Mallory tries to cook/delete an item she knows the ID of
    const cookAttack = await app.inject({
      method: 'POST', url: `/api/households/${hhAId}/items/${secretItemId}/cook`,
      headers: { authorization: `Bearer ${malloryToken}` },
      payload: { amount: 1 },
    });
    expect(cookAttack.statusCode).toBe(403);

    // ATTACK 4: Mallory tries to delete Alice's item
    const deleteAttack = await app.inject({
      method: 'DELETE', url: `/api/households/${hhAId}/items/${secretItemId}`,
      headers: { authorization: `Bearer ${malloryToken}` },
    });
    expect(deleteAttack.statusCode).toBe(403);

    // Verify Alice's item is untouched
    const aliceItems = await app.inject({
      method: 'GET', url: `/api/households/${hhAId}/items`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    const aliceBody = JSON.parse(aliceItems.payload);
    expect(aliceBody.items.length).toBe(1);
    expect(aliceBody.items[0].name).toBe('Secret Cheese');
    // Still at original quantity (Mallory's cook attack was blocked)
    expect(aliceBody.items[0].current_quantity).toBe(3);
  });

  it('ensures distributed job lock: only one of two concurrent runners acquires the lock', async () => {
    // Both runners target the same job name simultaneously
    const jobName = 'daily_rescue_board';
    const worker1 = 'replica-1-worker';
    const worker2 = 'replica-2-worker';

    // Simulate two processes trying to acquire the same lock at the same moment
    const lock1 = acquireJobLock(jobName, worker1, 300);
    const lock2 = acquireJobLock(jobName, worker2, 300);

    // Exactly one must win
    const wins = [lock1, lock2].filter(Boolean).length;
    expect(wins).toBe(1);

    // The loser must not hold the lock
    const db = getDb();
    const lockRow = db.prepare('SELECT locked_by FROM job_locks WHERE job_name = ?').get(jobName) as any;
    expect(lockRow).toBeDefined();
    // The lock holder is deterministically one of the two workers
    expect([worker1, worker2]).toContain(lockRow.locked_by);

    // If worker1 won, worker2 should not have the lock
    if (lock1) {
      expect(lockRow.locked_by).toBe(worker1);
      expect(lock2).toBe(false);
    } else {
      expect(lockRow.locked_by).toBe(worker2);
      expect(lock1).toBe(false);
    }

    // Winner can release the lock
    const winner = lock1 ? worker1 : worker2;
    releaseJobLock(jobName, winner);
    const afterRelease = db.prepare('SELECT * FROM job_locks WHERE job_name = ?').get(jobName);
    expect(afterRelease).toBeUndefined();

    // After release, either worker can re-acquire
    const reacquire = acquireJobLock(jobName, worker2, 300);
    expect(reacquire).toBe(true);
    releaseJobLock(jobName, worker2);
  });
});
