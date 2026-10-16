import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDb } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { householdRoutes, inviteRoutes } from './routes/households.js';
import { pantryRoutes } from './routes/pantry.js';

export interface BuildAppOptions {
  dbPath?: string;
  enableLogging?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = fastify({
    logger: options.enableLogging ?? false,
    genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
    bodyLimit: 1048576, // 1MB limit for strict request size protection
  });

  // Attach Request-ID to all responses
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // CORS
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Cookies
  app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'dev-secret-at-least-32-chars-long-12345',
    parseOptions: {},
  });

  // Rate Limiter
  app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // Serve static assets from public/assets
  const assetsDir = path.resolve(process.cwd(), 'public/assets');
  if (fs.existsSync(assetsDir)) {
    app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false,
    });
  }

  // Health Endpoint
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(options.dbPath);
    let dbStatus = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    return reply.send({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      db: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics Endpoint
  app.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(options.dbPath);
    const usersCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    const householdsCount = (db.prepare('SELECT COUNT(*) as count FROM households WHERE deleted_at IS NULL').get() as any)?.count || 0;
    const itemsCount = (db.prepare('SELECT COUNT(*) as count FROM items WHERE deleted_at IS NULL').get() as any)?.count || 0;
    const deltasCount = (db.prepare('SELECT COUNT(*) as count FROM item_deltas').get() as any)?.count || 0;
    const scoreboardEventsCount = (db.prepare('SELECT COUNT(*) as count FROM scoreboard_events').get() as any)?.count || 0;

    return reply.send({
      users: usersCount,
      activeHouseholds: householdsCount,
      activeItems: itemsCount,
      totalDeltasLogged: deltasCount,
      scoreboardEventsLogged: scoreboardEventsCount,
      memoryUsage: process.memoryUsage(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // Register API Routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(householdRoutes, { prefix: '/api/households' });
  app.register(inviteRoutes, { prefix: '/api/invites' });
  app.register(pantryRoutes, { prefix: '/api/households' });

  // Centralized Error Handler
  app.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Server Internal Error:', error);
    }
    const code = error.code || 'INTERNAL_SERVER_ERROR';
    const message = statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : (error.message || 'Error processing request');

    reply.status(statusCode).send({
      error: code,
      message,
      requestId: request.id,
    });
  });

  return app;
}
