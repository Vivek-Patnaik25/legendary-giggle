import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting } from '../../src/server/db/index.js';
import { FastifyInstance } from 'fastify';

describe('Guest Trial Flow & Local Analytics Events', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetDbForTesting(':memory:');
    app = buildApp({ dbPath: ':memory:', enableLogging: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an instant guest session with initial household without credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.isGuest).toBe(true);
    expect(body.user.email).toContain('@local.pantryrescue');
    expect(body.households).toHaveLength(1);
    expect(body.households[0].name).toBe('My Kitchen');
    expect(body.token).toBeDefined();

    // Verify /me recognizes the guest
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.isGuest).toBe(true);
  });

  it('allows claiming a guest account to convert to permanent email/password', async () => {
    // 1. Create guest
    const guestRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
    });
    const { token, households } = guestRes.json();
    const hhId = households[0].id;

    // 2. Add an item as guest
    const itemRes = await app.inject({
      method: 'POST',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Trial Apple',
        category: 'produce',
        quantity: 2,
        unit: 'piece',
      },
    });
    expect(itemRes.statusCode).toBe(201);

    // 3. Claim account with real credentials
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/auth/claim-guest',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'claimed_cook@example.com',
        password: 'SecurePassword123!',
        displayName: 'Claimed Chef',
      },
    });
    expect(claimRes.statusCode).toBe(200);
    const claimBody = claimRes.json();
    expect(claimBody.user.isGuest).toBe(false);
    expect(claimBody.user.email).toBe('claimed_cook@example.com');

    // 4. Verify item still belongs to the claimed user's household
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/households/${hhId}/items`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items[0].name).toBe('Trial Apple');
  });

  it('records and summarizes local activation and retention analytics events', async () => {
    const eventsToRecord = [
      'first_item_added',
      'first_cook',
      'day_1_return',
      'items_used_per_week',
      'wasted_items_per_week',
    ];

    for (const eventType of eventsToRecord) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analytics/events',
        payload: {
          eventType,
          eventData: { count: 1, test: true },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().status).toBe('recorded');
    }

    // Invalid event rejection
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/analytics/events',
      payload: { eventType: 'invalid_event' },
    });
    expect(invalidRes.statusCode).toBe(400);

    // Summary endpoint
    const summaryRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/summary',
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();
    expect(summary.totalEvents).toBeGreaterThanOrEqual(5);
    expect(summary.summary.first_item_added).toBeGreaterThanOrEqual(1);
    expect(summary.summary.first_cook).toBeGreaterThanOrEqual(1);
  });
});
