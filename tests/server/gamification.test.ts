import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { resetDbForTesting } from '../../src/server/db/index.js';
import { FastifyInstance } from 'fastify';

describe('Milestone 5: Gamification, Scoreboard & Weekly Rescue Report', () => {
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
      payload: { email: 'gamer@kitchen.com', password: 'password123', displayName: 'Chef Score' },
    });
    userToken = JSON.parse(regRes.payload).token;

    // Create household with weekly waste target = 2 items
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Pact Warriors', weeklyWasteTarget: 2.0 },
    });
    householdId = JSON.parse(hhRes.payload).household.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('tracks weekly scoreboard, pact adherence, and waste reduction score', async () => {
    // 1. Initial scoreboard
    const initRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/scoreboard`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(initRes.statusCode).toBe(200);
    const initBoard = JSON.parse(initRes.payload).scoreboard;
    expect(initBoard.rescuedCount).toBe(0);
    expect(initBoard.wastedCount).toBe(0);
    expect(initBoard.isPactMet).toBe(true);
    expect(initBoard.weeklyTarget).toBe(2.0);

    // 2. Add and cook an item (rescue)
    const item1 = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Mushrooms', category: 'produce', quantity: 200, unit: 'g' },
    });
    const item1Id = JSON.parse(item1.payload).item.id;

    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${item1Id}/cook`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { amount: 200 },
    });

    // 3. Mark another item as wasted
    const item2 = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Sour Milk', category: 'dairy', quantity: 1, unit: 'l' },
    });
    const item2Id = JSON.parse(item2.payload).item.id;

    await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${item2Id}/waste`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { amount: 1 },
    });

    // 4. Check updated scoreboard
    const updatedRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/scoreboard`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const board = JSON.parse(updatedRes.payload).scoreboard;
    expect(board.rescuedCount).toBe(1);
    expect(board.wastedCount).toBe(1);
    expect(board.isPactMet).toBe(true); // 1 <= 2.0
    expect(board.scorePercentage).toBe(50); // 1 / 2 = 50%
    expect(board.recentEvents.length).toBe(2);
  });

  it('unlocks badges such as Onion Survivor and Freezer Archaeologist', async () => {
    // 1. Add an item expiring today (critical urgency)
    const todayISO = new Date().toISOString().split('T')[0];
    const itemRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: 'Lonely Onion', category: 'produce', quantity: 1, unit: 'piece', expiryDate: todayISO },
    });
    const itemId = JSON.parse(itemRes.payload).item.id;

    // 2. Rescue the critical onion
    const cookRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/items/${itemId}/cook`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { amount: 1 },
    });

    expect(cookRes.statusCode).toBe(200);
    const cookPayload = JSON.parse(cookRes.payload);
    expect(cookPayload.newBadges).toContain('onion_survivor');

    // 3. Verify badge appears in household badges endpoint
    const badgesRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/badges`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(badgesRes.statusCode).toBe(200);
    const badgesData = JSON.parse(badgesRes.payload);
    const onionBadge = badgesData.badges.find((b: any) => b.key === 'onion_survivor');
    expect(onionBadge).toBeDefined();
    expect(onionBadge.isUnlocked).toBe(true);
    expect(onionBadge.title).toBe('Onion Survivor');
    expect(onionBadge.icon).toBe('/assets/badge_onion_survivor.png');
  });

  it('generates a complete weekly report card with Sir Expiry commentary', async () => {
    // Fetch weekly report
    const reportRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/report/weekly`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(reportRes.statusCode).toBe(200);
    const report = JSON.parse(reportRes.payload).report;
    expect(report.householdName).toBe('Pact Warriors');
    expect(report.weekStart).toBeDefined();
    expect(report.commentary).toBeDefined();
    expect(report.cardBackgroundImage).toBe('/assets/weekly_report_bg.png');
    expect(report.mascotImage).toBeDefined();
  });
});
