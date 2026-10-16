import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // Rate limit registration and login
  const authRateLimit = {
    max: 20,
    timeWindow: '1 minute',
  };

  /**
   * Helper: create a session and set HTTP-only cookie
   */
  function createSession(userId: string, reply: FastifyReply): string {
    const sessionId = crypto.randomUUID();
    // 30 days validity
    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `).run(sessionId, userId);

    reply.setCookie('pantry_session', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    });

    return sessionId;
  }

  // Register
  fastify.post('/register', { config: { rateLimit: authRateLimit } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password, displayName } = request.body as any || {};

    if (!email || !password || !displayName) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Email, password, and display name are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail.includes('@') || cleanEmail.length > 255) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid email address' });
    }

    if (String(password).length < 6) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return reply.status(409).send({ error: 'EMAIL_EXISTS', message: 'An account with this email already exists' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const cleanName = String(displayName).trim().slice(0, 50);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES (?, ?, ?, ?)
    `).run(userId, cleanEmail, passwordHash, cleanName);

    // Record welcome / verification message into local dev inbox
    db.prepare(`
      INSERT INTO local_messages (id, recipient_email, subject, body, token)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      cleanEmail,
      'Welcome to Pantry Rescue!',
      `Hello ${cleanName}, welcome to Pantry Rescue! Your account is active and ready to rescue ingredients.`,
      null
    );

    const sessionId = createSession(userId, reply);

    return reply.status(201).send({
      message: 'Account created successfully',
      user: { id: userId, email: cleanEmail, displayName: cleanName },
      token: sessionId,
    });
  });

  // Login
  fastify.post('/login', { config: { rateLimit: authRateLimit } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as any || {};

    if (!email || !password) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Email and password are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare(`
      SELECT id, email, password_hash, display_name FROM users WHERE email = ?
    `).get(cleanEmail) as { id: string; email: string; password_hash: string; display_name: string } | undefined;

    if (!user) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const sessionId = createSession(user.id, reply);

    return reply.send({
      message: 'Logged in successfully',
      user: { id: user.id, email: user.email, displayName: user.display_name },
      token: sessionId,
    });
  });

  // Logout
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    let sessionId = request.cookies?.pantry_session;
    if (!sessionId && request.headers.authorization?.startsWith('Bearer ')) {
      sessionId = request.headers.authorization.slice(7).trim();
    }

    if (sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }

    reply.clearCookie('pantry_session', { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // Current User & Households
  fastify.get('/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    const user = db.prepare(`
      SELECT id, email, display_name, created_at FROM users WHERE id = ?
    `).get(userId) as any;

    const households = db.prepare(`
      SELECT h.id, h.name, h.weekly_waste_target, h.timezone, m.role, h.created_at
      FROM members m
      JOIN households h ON m.household_id = h.id
      WHERE m.user_id = ? AND m.deleted_at IS NULL AND h.deleted_at IS NULL
    `).all(userId);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        display_name: user.display_name,
        createdAt: user.created_at,
      },
      households,
    });
  });

  // Forgot Password (generates reset token in local dev inbox)
  fastify.post('/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email } = request.body as any || {};
    if (!email) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Email is required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, display_name FROM users WHERE email = ?').get(cleanEmail) as any;

    // Constant-time response to prevent email enumeration
    if (user) {
      const resetToken = crypto.randomBytes(24).toString('hex');
      db.prepare(`
        INSERT INTO local_messages (id, recipient_email, subject, body, token)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        cleanEmail,
        'Pantry Rescue Password Reset',
        `Use this reset token to change your password: ${resetToken}`,
        resetToken
      );
    }

    return reply.send({
      message: 'If the email exists, a reset link has been dispatched to your local inbox.',
      notice: 'In development, check /api/dev/inbox to view sent messages and tokens.',
    });
  });

  // Reset Password using token
  fastify.post('/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token, newPassword } = request.body as any || {};
    if (!token || !newPassword || String(newPassword).length < 6) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Valid token and new password (min 6 chars) required' });
    }

    const msg = db.prepare(`
      SELECT recipient_email FROM local_messages
      WHERE token = ? AND created_at > datetime('now', '-2 hours')
    `).get(token) as { recipient_email: string } | undefined;

    if (!msg) {
      return reply.status(400).send({ error: 'INVALID_TOKEN', message: 'Reset token is invalid or has expired' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(newHash, msg.recipient_email);
    db.prepare('DELETE FROM local_messages WHERE token = ?').run(token);

    return reply.send({ message: 'Password has been reset successfully. Please log in.' });
  });

  // Dev Inbox (Zero paid external email service dependency)
  fastify.get('/dev/inbox', async (_request: FastifyRequest, reply: FastifyReply) => {
    const messages = db.prepare(`
      SELECT id, recipient_email, subject, body, token, created_at
      FROM local_messages
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    return reply.send({ messages });
  });
}
