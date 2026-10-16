import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting } from '../../src/server/db/index.js';
import { FastifyInstance } from 'fastify';

describe('Milestone 3: API, Auth, Household Scoping & Concurrency', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    resetDbForTesting(':memory:');
    app = buildApp({ dbPath: ':memory:', enableLogging: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('handles user registration, login, and dev inbox token tracking', async () => {
    // 1. Register User
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'password123',
        displayName: 'Alice Chef',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regBody = JSON.parse(regRes.payload);
    expect(regBody.user.email).toBe('alice@example.com');
    expect(regBody.token).toBeDefined();

    const aliceToken = regBody.token;

    // 2. Fetch /api/auth/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.payload);
    expect(meBody.user.displayName).toBe('Alice Chef');

    // 3. Check Dev Inbox (no paid email required)
    const inboxRes = await app.inject({
      method: 'GET',
      url: '/api/auth/dev/inbox',
    });
    expect(inboxRes.statusCode).toBe(200);
    const inboxBody = JSON.parse(inboxRes.payload);
    expect(inboxBody.messages.length).toBeGreaterThanOrEqual(1);
    expect(inboxBody.messages[0].recipient_email).toBe('alice@example.com');
  });

  it('enforces strict household scoping and RBAC (owner, member, guest)', async () => {
    // Register Alice (Owner)
    const aliceRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alice@test.com', password: 'password123', displayName: 'Alice' },
    });
    const aliceToken = JSON.parse(aliceRes.payload).token;

    // Register Bob (Member)
    const bobRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bob@test.com', password: 'password123', displayName: 'Bob' },
    });
    const bobToken = JSON.parse(bobRes.payload).token;

    // Register Charlie (Guest)
    const charlieRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'charlie@test.com', password: 'password123', displayName: 'Charlie' },
    });
    const charlieToken = JSON.parse(charlieRes.payload).token;

    // Register Eve (Attacker / Outsider)
    const eveRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'eve@test.com', password: 'password123', displayName: 'Eve' },
    });
    const eveToken = JSON.parse(eveRes.payload).token;

    // Alice creates household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { name: 'Green Kitchen', weeklyWasteTarget: 2.0 },
    });
    const hhId = JSON.parse(hhRes.payload).household.id;

    // Alice creates invites for Bob (member) and Charlie (guest)
    const bobInviteRes = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/invites`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { role: 'member' },
    });
    const bobCode = JSON.parse(bobInviteRes.payload).invite.code;

    const charlieInviteRes = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/invites`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { role: 'guest' },
    });
    const charlieCode = JSON.parse(charlieInviteRes.payload).invite.code;

    // Bob redeems invite
    const bobRedeem = await app.inject({
      method: 'POST',
      url: `/api/invites/${bobCode}/redeem`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobRedeem.statusCode).toBe(200);

    // Charlie redeems invite
    const charlieRedeem = await app.inject({
      method: 'POST',
      url: `/api/invites/${charlieCode}/redeem`,
      headers: { authorization: `Bearer ${charlieToken}` },
    });
    expect(charlieRedeem.statusCode).toBe(200);

    // Member (Bob) can add item
    const bobAddItem = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { name: 'Fresh Milk', category: 'dairy', quantity: 2, unit: 'l' },
    });
    expect(bobAddItem.statusCode).toBe(201);
    const itemId = JSON.parse(bobAddItem.payload).item.id;

    // Guest (Charlie) can VIEW items
    const charlieView = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${charlieToken}` },
    });
    expect(charlieView.statusCode).toBe(200);
    expect(JSON.parse(charlieView.payload).items.length).toBe(1);

    // Guest (Charlie) CANNOT ADD items (view only)
    const charlieAdd = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${charlieToken}` },
      payload: { name: 'Yogurt', category: 'dairy', quantity: 1 },
    });
    expect(charlieAdd.statusCode).toBe(403);

    // Outsider (Eve) has zero access
    const eveView = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${eveToken}` },
    });
    expect(eveView.statusCode).toBe(403);
  });

  it('guarantees idempotency on network retries without duplicating items', async () => {
    // Register user & create household
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'sync@test.com', password: 'password123', displayName: 'SyncTester' },
    });
    const token = JSON.parse(userRes.payload).token;

    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Sync Haven' },
    });
    const hhId = JSON.parse(hhRes.payload).household.id;

    const idempotencyKey = 'retry-key-uuid-12345';

    // First request
    const firstReq = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      payload: { name: 'Eggs', category: 'dairy', quantity: 12, unit: 'piece' },
    });
    expect(firstReq.statusCode).toBe(201);
    const firstItemId = JSON.parse(firstReq.payload).item.id;

    // Duplicate request with identical idempotency key (simulating network retry)
    const retryReq = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      payload: { name: 'Eggs', category: 'dairy', quantity: 12, unit: 'piece' },
    });
    expect(retryReq.statusCode).toBe(201);
    expect(retryReq.headers['x-cache']).toBe('IDEMPOTENT-REPLAY');
    expect(JSON.parse(retryReq.payload).item.id).toBe(firstItemId);

    // Verify exactly 1 item exists in pantry
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(listRes.payload).items.length).toBe(1);
  });

  it('records cooking rescues and counts active deletion as waste in audit scoreboard', async () => {
    // Setup
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'chef@test.com', password: 'password123', displayName: 'Chef Mario' },
    });
    const token = JSON.parse(userRes.payload).token;

    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Mario Kitchen' },
    });
    const hhId = JSON.parse(hhRes.payload).household.id;

    // Add Tomato
    const item1 = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Tomatoes', category: 'produce', quantity: 4, unit: 'piece' },
    });
    const tomatoId = JSON.parse(item1.payload).item.id;

    // Add Lettuce
    const item2 = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Lettuce', category: 'produce', quantity: 1, unit: 'piece' },
    });
    const lettuceId = JSON.parse(item2.payload).item.id;

    // Cook 2 tomatoes (rescued)
    const cookRes = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items/${tomatoId}/cook`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 2 },
    });
    expect(cookRes.statusCode).toBe(200);
    expect(JSON.parse(cookRes.payload).item.current_quantity).toBe(2);

    // Delete Lettuce while active (should count as waste!)
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/households/${hhId}/items/${lettuceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // Verify scoreboard events in database
    const metricsRes = await app.inject({
      method: 'GET',
      url: '/metrics',
    });
    const metrics = JSON.parse(metricsRes.payload);
    expect(metrics.scoreboardEventsLogged).toBe(2); // 1 rescue, 1 waste
  });

  it('handles member revocation and household deletion with clear HTTP status codes', async () => {
    // Owner & Member
    const ownerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owner@test.com', password: 'password123', displayName: 'Owner' },
    });
    const ownerToken = JSON.parse(ownerRes.payload).token;

    const memberRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'member@test.com', password: 'password123', displayName: 'Member' },
    });
    const memberToken = JSON.parse(memberRes.payload).token;
    const memberId = JSON.parse(memberRes.payload).user.id;

    // Create household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Household To Revoke' },
    });
    const hhId = JSON.parse(hhRes.payload).household.id;

    // Invite & join
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/invites`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'member' },
    });
    const code = JSON.parse(inviteRes.payload).invite.code;

    await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/redeem`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    // Owner removes member
    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/api/households/${hhId}/members/${memberId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(removeRes.statusCode).toBe(200);

    // Member attempts access -> 403 MEMBER_REVOKED
    const syncRes = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(syncRes.statusCode).toBe(403);
    expect(JSON.parse(syncRes.payload).error).toBe('MEMBER_REVOKED');

    // Owner deletes household -> 410 HOUSEHOLD_DELETED on subsequent queries
    await app.inject({
      method: 'DELETE',
      url: `/api/households/${hhId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const deletedQuery = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(deletedQuery.statusCode).toBe(410);
    expect(JSON.parse(deletedQuery.payload).error).toBe('HOUSEHOLD_DELETED');
  });
});
