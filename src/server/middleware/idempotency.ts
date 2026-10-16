import { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';

/**
 * Validates and checks idempotency keys to ensure network retries never duplicate operations
 */
export async function checkIdempotency(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = request.headers['idempotency-key'] as string || (request.body as any)?.idempotencyKey;
  if (!key) return;

  const db = getDb();
  const cacheKey = `idempotency:${key}`;

  const existing = db.prepare(`
    SELECT value FROM cache_entries
    WHERE key = ? AND expires_at > datetime('now')
  `).get(cacheKey) as { value: string } | undefined;

  if (existing) {
    try {
      const cached = JSON.parse(existing.value);
      reply
        .header('X-Cache', 'IDEMPOTENT-REPLAY')
        .status(cached.statusCode || 200)
        .send(cached.body);
      return;
    } catch {
      // In case of corrupt cache entry, continue processing
    }
  }
}

/**
 * Stores the response for an idempotency key
 */
export function recordIdempotentResponse(key: string, statusCode: number, body: any): void {
  if (!key) return;
  const db = getDb();
  const cacheKey = `idempotency:${key}`;
  const value = JSON.stringify({ statusCode, body });

  // Store for 24 hours
  db.prepare(`
    INSERT INTO cache_entries (key, value, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
  `).run(cacheKey, value);
}
