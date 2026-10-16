import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { authenticate, verifyHouseholdAccess } from '../middleware/auth.js';
import { eventHub } from '../services/events.js';

export async function householdRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // Create Household
  fastify.post('/', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { name, weeklyWasteTarget, timezone } = request.body as any || {};

    if (!name || String(name).trim().length === 0) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Household name is required' });
    }

    const cleanName = String(name).trim().slice(0, 80);
    const target = Number(weeklyWasteTarget) > 0 ? Number(weeklyWasteTarget) : 2.0;
    const tz = String(timezone || 'UTC').trim();

    const householdId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO households (id, name, weekly_waste_target, timezone)
        VALUES (?, ?, ?, ?)
      `).run(householdId, cleanName, target, tz);

      db.prepare(`
        INSERT INTO members (id, household_id, user_id, role)
        VALUES (?, ?, ?, 'owner')
      `).run(memberId, householdId, userId);

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, 'create_household', 'household', ?, ?)
      `).run(crypto.randomUUID(), householdId, userId, householdId, JSON.stringify({ name: cleanName }));
    })();

    return reply.status(201).send({
      message: 'Household created successfully',
      household: { id: householdId, name: cleanName, weeklyWasteTarget: target, timezone: tz, role: 'owner' },
    });
  });

  // Get User's Households
  fastify.get('/', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    const households = db.prepare(`
      SELECT h.id, h.name, h.weekly_waste_target, h.timezone, m.role, h.created_at
      FROM members m
      JOIN households h ON m.household_id = h.id
      WHERE m.user_id = ? AND m.deleted_at IS NULL AND h.deleted_at IS NULL
      ORDER BY h.created_at ASC
    `).all(userId);

    return reply.send({ households });
  });

  // Get Specific Household
  fastify.get('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { role } = verifyHouseholdAccess(id, request.user!.id);

    const household = db.prepare(`
      SELECT id, name, weekly_waste_target, timezone, created_at FROM households WHERE id = ?
    `).get(id) as any;

    const members = db.prepare(`
      SELECT m.id, m.user_id, m.role, m.created_at, u.display_name, u.email
      FROM members m
      JOIN users u ON m.user_id = u.id
      WHERE m.household_id = ? AND m.deleted_at IS NULL
    `).all(id);

    return reply.send({
      household,
      userRole: role,
      members,
    });
  });

  // Update Household (Owner only)
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner']);

    const { name, weeklyWasteTarget, timezone } = request.body as any || {};

    const updates: string[] = [];
    const params: any[] = [];

    if (name) {
      updates.push('name = ?');
      params.push(String(name).trim().slice(0, 80));
    }
    if (weeklyWasteTarget !== undefined) {
      const target = Math.max(0, Number(weeklyWasteTarget));
      updates.push('weekly_waste_target = ?');
      params.push(target);
    }
    if (timezone) {
      updates.push('timezone = ?');
      params.push(String(timezone).trim());
    }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE households SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      eventHub.publish(id, 'HOUSEHOLD_UPDATED', { id });
    }

    const updated = db.prepare('SELECT id, name, weekly_waste_target, timezone FROM households WHERE id = ?').get(id);
    return reply.send({ message: 'Household updated', household: updated });
  });

  // Delete Household (Owner only, Soft Delete)
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner']);

    db.transaction(() => {
      db.prepare("UPDATE households SET deleted_at = datetime('now') WHERE id = ?").run(id);
      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id)
        VALUES (?, ?, ?, 'delete_household', 'household', ?)
      `).run(crypto.randomUUID(), id, request.user!.id, id);
    })();

    eventHub.publish(id, 'HOUSEHOLD_DELETED', { householdId: id });
    return reply.send({ message: 'Household deleted successfully' });
  });

  // Create Invite (Owner or Member)
  fastify.post('/:id/invites', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const { role = 'member', expiresInDays = 7 } = request.body as any || {};
    const inviteRole = role === 'guest' ? 'guest' : 'member';
    const days = Math.min(30, Math.max(1, Number(expiresInDays) || 7));

    const inviteId = crypto.randomUUID();
    const code = crypto.randomBytes(4).toString('hex'); // 8 char code

    db.prepare(`
      INSERT INTO invites (id, household_id, code, role, inviter_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'))
    `).run(inviteId, id, code, inviteRole, request.user!.id, days);

    return reply.status(201).send({
      message: 'Invite link generated',
      invite: { id: inviteId, code, role: inviteRole, expiresInDays: days },
    });
  });

  // List Active Invites
  fastify.get('/:id/invites', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner', 'member']);

    const invites = db.prepare(`
      SELECT i.id, i.code, i.role, i.expires_at, i.created_at, u.display_name as inviter_name
      FROM invites i
      JOIN users u ON i.inviter_user_id = u.id
      WHERE i.household_id = ? AND i.revoked_at IS NULL AND i.redeemed_at IS NULL AND i.expires_at > datetime('now')
    `).all(id);

    return reply.send({ invites });
  });

  // Revoke Invite (Owner only)
  fastify.delete('/:id/invites/:inviteId', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, inviteId } = request.params as { id: string; inviteId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner']);

    db.prepare(`
      UPDATE invites SET revoked_at = datetime('now')
      WHERE id = ? AND household_id = ?
    `).run(inviteId, id);

    return reply.send({ message: 'Invite revoked' });
  });

  // Remove Member (Owner only)
  fastify.delete('/:id/members/:memberUserId', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, memberUserId } = request.params as { id: string; memberUserId: string };
    verifyHouseholdAccess(id, request.user!.id, ['owner']);

    if (memberUserId === request.user!.id) {
      return reply.status(400).send({ error: 'FORBIDDEN', message: 'Household owner cannot remove themselves.' });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE members SET deleted_at = datetime('now')
        WHERE household_id = ? AND user_id = ?
      `).run(id, memberUserId);

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id)
        VALUES (?, ?, ?, 'remove_member', 'user', ?)
      `).run(crypto.randomUUID(), id, request.user!.id, memberUserId);
    })();

    eventHub.publish(id, 'MEMBER_REMOVED', { householdId: id, removedUserId: memberUserId });
    return reply.send({ message: 'Member removed from household' });
  });
}

/**
 * Public invite routes (checking and redeeming)
 */
export async function inviteRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb();

  // Rate limit invite redemption
  const inviteRateLimit = {
    max: 15,
    timeWindow: '1 minute',
  };

  // Inspect Invite
  fastify.get('/:code', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };

    const invite = db.prepare(`
      SELECT i.code, i.role, i.expires_at, i.revoked_at, i.redeemed_at, h.name as household_name, h.id as household_id
      FROM invites i
      JOIN households h ON i.household_id = h.id
      WHERE i.code = ? AND h.deleted_at IS NULL
    `).get(code) as any;

    if (!invite) {
      return reply.status(404).send({ error: 'INVITE_NOT_FOUND', message: 'Invite link is invalid or expired' });
    }

    const isExpired = new Date(invite.expires_at).getTime() < Date.now();
    const isRevoked = invite.revoked_at !== null;
    const isRedeemed = invite.redeemed_at !== null;

    if (isExpired || isRevoked || isRedeemed) {
      return reply.status(410).send({
        error: 'INVITE_INACTIVE',
        message: isRevoked ? 'This invite was revoked' : (isExpired ? 'This invite has expired' : 'This invite was already used'),
      });
    }

    return reply.send({
      code: invite.code,
      householdId: invite.household_id,
      householdName: invite.household_name,
      role: invite.role,
    });
  });

  // Redeem Invite
  fastify.post('/:code/redeem', { preHandler: [authenticate], config: { rateLimit: inviteRateLimit } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const userId = request.user!.id;

    const invite = db.prepare(`
      SELECT i.id, i.household_id, i.role, i.expires_at, i.revoked_at, i.redeemed_at, h.name as household_name
      FROM invites i
      JOIN households h ON i.household_id = h.id
      WHERE i.code = ? AND h.deleted_at IS NULL
    `).get(code) as any;

    if (!invite) {
      return reply.status(404).send({ error: 'INVITE_NOT_FOUND', message: 'Invite link is invalid' });
    }

    if (invite.revoked_at || invite.redeemed_at || new Date(invite.expires_at).getTime() < Date.now()) {
      return reply.status(410).send({ error: 'INVITE_INACTIVE', message: 'Invite is no longer active' });
    }

    // Check if user is already an active member
    const existing = db.prepare(`
      SELECT id, role, deleted_at FROM members
      WHERE household_id = ? AND user_id = ?
    `).get(invite.household_id, userId) as any;

    if (existing && existing.deleted_at === null) {
      return reply.send({
        message: 'You are already a member of this household',
        householdId: invite.household_id,
        role: existing.role,
      });
    }

    db.transaction(() => {
      if (existing) {
        // Re-activate member
        db.prepare(`
          UPDATE members SET role = ?, deleted_at = NULL WHERE id = ?
        `).run(invite.role, existing.id);
      } else {
        // Add new member
        db.prepare(`
          INSERT INTO members (id, household_id, user_id, role)
          VALUES (?, ?, ?, ?)
        `).run(crypto.randomUUID(), invite.household_id, userId, invite.role);
      }

      // Mark invite redeemed
      db.prepare(`
        UPDATE invites
        SET redeemed_at = datetime('now'), redeemed_by_user_id = ?
        WHERE id = ?
      `).run(userId, invite.id);

      db.prepare(`
        INSERT INTO audit_logs (id, household_id, user_id, action, target_type, target_id)
        VALUES (?, ?, ?, 'redeem_invite', 'invite', ?)
      `).run(crypto.randomUUID(), invite.household_id, userId, invite.id);
    })();

    eventHub.publish(invite.household_id, 'MEMBER_JOINED', { householdId: invite.household_id, userId, role: invite.role });

    return reply.send({
      message: `Joined household '${invite.household_name}' as ${invite.role}`,
      householdId: invite.household_id,
      householdName: invite.household_name,
      role: invite.role,
    });
  });
}
