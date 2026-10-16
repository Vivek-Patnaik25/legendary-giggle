import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';
import { authenticate, verifyHouseholdAccess } from '../middleware/auth.js';
import {
  calculateHouseholdScoreboard,
  generateWeeklyReportCard,
  BADGE_DEFINITIONS,
} from '../services/gamification.js';

export async function scoreboardRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // Scoreboard Stats & Progress
  fastify.get('/:id/scoreboard', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const scoreboard = calculateHouseholdScoreboard(id);
    return reply.send({ scoreboard });
  });

  // Badges Earned & Available
  fastify.get('/:id/badges', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const unlocked = db.prepare(`
      SELECT b.id, b.badge_key, b.unlocked_at, b.metadata
      FROM badges b
      WHERE b.household_id = ?
      ORDER BY b.unlocked_at DESC
    `).all(id) as any[];

    const unlockedKeys = new Set(unlocked.map(b => b.badge_key));

    const badges = Object.values(BADGE_DEFINITIONS).map(def => {
      const unlockRecord = unlocked.find(u => u.badge_key === def.key);
      return {
        ...def,
        isUnlocked: unlockedKeys.has(def.key),
        unlockedAt: unlockRecord ? unlockRecord.unlocked_at : null,
        metadata: unlockRecord ? JSON.parse(unlockRecord.metadata || '{}') : null,
      };
    });

    return reply.send({
      badges,
      unlockedCount: unlocked.length,
      totalBadgesCount: Object.keys(BADGE_DEFINITIONS).length,
    });
  });

  // Weekly Rescue Report Card
  fastify.get('/:id/report/weekly', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id);

    const report = generateWeeklyReportCard(id);
    return reply.send({ report });
  });
}
