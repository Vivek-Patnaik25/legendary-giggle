import { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export type HouseholdRole = 'owner' | 'member' | 'guest';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    householdRole?: HouseholdRole;
  }
}

/**
 * Extracts and verifies the user session from cookies or Bearer auth header
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const db = getDb();
  
  // Check cookie, Authorization header, or query token (for SSE EventSource)
  let sessionId = request.cookies?.pantry_session;
  if (!sessionId && request.headers.authorization?.startsWith('Bearer ')) {
    sessionId = request.headers.authorization.slice(7).trim();
  }
  if (!sessionId && (request.query as any)?.token) {
    sessionId = String((request.query as any).token).trim();
  }

  if (!sessionId) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  const session = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.email, u.display_name
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `).get(sessionId) as { id: string; user_id: string; expires_at: string; email: string; display_name: string } | undefined;

  if (!session) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  request.user = {
    id: session.user_id,
    email: session.email,
    displayName: session.display_name,
  };
}

/**
 * Household scoping guard - rigorously verifies membership, soft-deletion, and permissions on EVERY query
 */
export function verifyHouseholdAccess(
  householdId: string,
  userId: string,
  allowedRoles: HouseholdRole[] = ['owner', 'member', 'guest']
): { role: HouseholdRole } {
  const db = getDb();

  // 1. Verify household existence and check for soft-deletion
  const household = db.prepare(`
    SELECT id, deleted_at FROM households WHERE id = ?
  `).get(householdId) as { id: string; deleted_at: string | null } | undefined;

  if (!household) {
    const error: any = new Error('Household not found');
    error.statusCode = 404;
    error.code = 'HOUSEHOLD_NOT_FOUND';
    throw error;
  }

  if (household.deleted_at !== null) {
    const error: any = new Error('This household has been deleted.');
    error.statusCode = 410;
    error.code = 'HOUSEHOLD_DELETED';
    throw error;
  }

  // 2. Verify active membership
  const member = db.prepare(`
    SELECT role, deleted_at FROM members
    WHERE household_id = ? AND user_id = ?
  `).get(householdId, userId) as { role: HouseholdRole; deleted_at: string | null } | undefined;

  if (!member || member.deleted_at !== null) {
    const error: any = new Error('Your membership in this household has been revoked.');
    error.statusCode = 403;
    error.code = 'MEMBER_REVOKED';
    throw error;
  }

  // 3. Check role authorization
  if (!allowedRoles.includes(member.role)) {
    const error: any = new Error(`Action forbidden for role '${member.role}'. Required: ${allowedRoles.join(' or ')}.`);
    error.statusCode = 403;
    error.code = 'FORBIDDEN_ROLE';
    throw error;
  }

  return { role: member.role };
}
