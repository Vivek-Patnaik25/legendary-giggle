import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  const VALID_EVENT_TYPES = new Set([
    'first_item_added',
    'first_cook',
    'day_1_return',
    'items_used_per_week',
    'wasted_items_per_week',
  ]);

  // Log an analytics event locally
  fastify.post('/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventType, eventData, householdId } = request.body as any || {};

    if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
      return reply.status(400).send({
        error: 'INVALID_EVENT_TYPE',
        message: `Event type must be one of: ${Array.from(VALID_EVENT_TYPES).join(', ')}`,
      });
    }

    const eventId = crypto.randomUUID();
    const userId = (request as any).user?.id || null;
    const dataStr = typeof eventData === 'object' ? JSON.stringify(eventData) : '{}';

    db.prepare(`
      INSERT INTO analytics_events (id, household_id, user_id, event_type, event_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, householdId || null, userId, eventType, dataStr);

    return reply.status(201).send({
      status: 'recorded',
      id: eventId,
      eventType,
    });
  });

  // Get local analytics summary (100% offline-friendly, zero external tracking)
  fastify.get('/summary', async (_request: FastifyRequest, reply: FastifyReply) => {
    const counts = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events
      GROUP BY event_type
    `).all() as { event_type: string; count: number }[];

    const summary: Record<string, number> = {};
    for (const row of counts) {
      summary[row.event_type] = row.count;
    }

    return reply.send({
      summary,
      totalEvents: Object.values(summary).reduce((a, b) => a + b, 0),
    });
  });
}
