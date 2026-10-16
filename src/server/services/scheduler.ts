import { getDb } from '../db/index.js';
import { calculateUrgency } from '../../domain/urgency.js';
import { checkFreezerRediscovery } from '../../domain/expiry.js';
import { getSirExpiryStatus } from '../../domain/mascot.js';
import { eventHub } from './events.js';
import crypto from 'crypto';

export interface JobExecutionResult {
  jobName: string;
  locked: boolean;
  householdsProcessed: number;
  nudgesSent: number;
  skippedQuietHours: number;
  skippedDailyCap: number;
}

/**
 * Checks whether the current time in the household's local timezone falls within quiet hours (21:00 to 08:00)
 * Uses native Intl.DateTimeFormat for robust time zone and DST resolution.
 */
export function isQuietHours(timeZone: string = 'UTC', date: Date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    const hour = hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();

    // Quiet hours: 21:00 (9 PM) through 08:00 (8 AM)
    return hour >= 21 || hour < 8;
  } catch {
    // If timezone string is invalid, fallback to UTC
    const utcHour = date.getUTCHours();
    return utcHour >= 21 || utcHour < 8;
  }
}

/**
 * Atomically acquires a distributed database lock for background job execution across replicas
 */
export function acquireJobLock(jobName: string, workerId: string, ttlSeconds: number = 300): boolean {
  const db = getDb();
  try {
    // Clean up expired lock or acquire if free
    const result = db.prepare(`
      INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
      VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'))
      ON CONFLICT(job_name) DO UPDATE SET
        locked_by = excluded.locked_by,
        locked_at = datetime('now'),
        expires_at = excluded.expires_at
      WHERE job_locks.expires_at < datetime('now') OR job_locks.locked_by = excluded.locked_by
    `).run(jobName, workerId, ttlSeconds);

    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Releases a distributed database lock
 */
export function releaseJobLock(jobName: string, workerId: string): void {
  const db = getDb();
  try {
    db.prepare('DELETE FROM job_locks WHERE job_name = ? AND locked_by = ?').run(jobName, workerId);
  } catch {
    // ignore
  }
}

/**
 * Daily background job:
 * - Scans active households
 * - Evaluates Rescue Board urgency
 * - Sends anti-spam personality nudges (Sir Expiry)
 * - Safe for concurrent multi-replica clusters via database-backed locks
 */
export async function runDailyRescueBoardJob(workerId: string = 'worker-1'): Promise<JobExecutionResult> {
  const jobName = 'daily_rescue_board';
  const hasLock = acquireJobLock(jobName, workerId, 180);

  if (!hasLock) {
    return {
      jobName,
      locked: false,
      householdsProcessed: 0,
      nudgesSent: 0,
      skippedQuietHours: 0,
      skippedDailyCap: 0,
    };
  }

  const db = getDb();
  let householdsProcessed = 0;
  let nudgesSent = 0;
  let skippedQuietHours = 0;
  let skippedDailyCap = 0;

  try {
    const households = db.prepare(`
      SELECT id, name, timezone FROM households WHERE deleted_at IS NULL
    `).all() as any[];

    const todayISO = new Date().toISOString().split('T')[0];

    for (const hh of households) {
      householdsProcessed++;

      // 1. Check Quiet Hours in household local timezone
      if (isQuietHours(hh.timezone)) {
        skippedQuietHours++;
        continue;
      }

      // 2. Check Daily Cap: max 1 nudge per day per household
      const existingNudge = db.prepare(`
        SELECT id FROM audit_logs
        WHERE household_id = ? AND action = 'nudge_sent' AND created_at >= date('now', 'start of day')
      `).get(hh.id);

      if (existingNudge) {
        skippedDailyCap++;
        continue;
      }

      // 3. Scan active pantry items (only active, ignoring already-dealt-with items)
      const items = db.prepare(`
        SELECT id, name, category, current_quantity, unit, expiry_date, is_frozen, frozen_at
        FROM items
        WHERE household_id = ? AND deleted_at IS NULL AND status = 'active' AND current_quantity > 0
      `).all(hh.id) as any[];

      let mostUrgentItem: any = null;
      let highestUrgencyScore = 0;
      let rediscoveredItem: any = null;

      for (const item of items) {
        const urgency = calculateUrgency({
          expiryDate: item.expiry_date,
          quantity: item.current_quantity,
          isFrozen: Boolean(item.is_frozen),
        });

        if (urgency.score > highestUrgencyScore) {
          highestUrgencyScore = urgency.score;
          mostUrgentItem = item;
        }

        if (item.is_frozen && item.frozen_at) {
          const rediscovery = checkFreezerRediscovery(item.frozen_at);
          if (rediscovery.isRediscovered && !rediscoveredItem) {
            rediscoveredItem = item;
          }
        }
      }

      // 4. If an urgent item (tier high/critical, score >= 60) or rediscovered freezer item exists, send a nudge
      if (mostUrgentItem && highestUrgencyScore >= 60) {
        const mascot = getSirExpiryStatus('worried', { urgentItemName: mostUrgentItem.name });

        // Dispatch notification to household's members in local dev inbox
        const members = db.prepare(`
          SELECT u.email FROM members m
          JOIN users u ON m.user_id = u.id
          WHERE m.household_id = ? AND m.deleted_at IS NULL
        `).all(hh.id) as { email: string }[];

        for (const member of members) {
          db.prepare(`
            INSERT INTO local_messages (id, recipient_email, subject, body)
            VALUES (?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            member.email,
            `Sir Expiry's Urgent Dispatch: ${mostUrgentItem.name} Needs Rescue!`,
            `${mascot.quote}\n\nRescue Board recommends cooking tonight with ${mostUrgentItem.name}.`
          );
        }

        // Audit log to enforce daily cap
        db.prepare(`
          INSERT INTO audit_logs (id, household_id, action, target_type, target_id, details)
          VALUES (?, ?, 'nudge_sent', 'household', ?, ?)
        `).run(crypto.randomUUID(), hh.id, hh.id, JSON.stringify({ item: mostUrgentItem.name, urgency: highestUrgencyScore }));

        eventHub.publish(hh.id, 'NUDGE_SENT', {
          householdId: hh.id,
          itemName: mostUrgentItem.name,
          urgencyScore: highestUrgencyScore,
          quote: mascot.quote,
        });

        nudgesSent++;
      } else if (rediscoveredItem) {
        const mascot = getSirExpiryStatus('watchful', { urgentItemName: rediscoveredItem.name });

        const members = db.prepare(`
          SELECT u.email FROM members m
          JOIN users u ON m.user_id = u.id
          WHERE m.household_id = ? AND m.deleted_at IS NULL
        `).all(hh.id) as { email: string }[];

        for (const member of members) {
          db.prepare(`
            INSERT INTO local_messages (id, recipient_email, subject, body)
            VALUES (?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            member.email,
            `Freezer Archaeology: Rediscovered ${rediscoveredItem.name}!`,
            `Sir Expiry reports: An archaeological wonder was discovered in the freezer! ${rediscoveredItem.name} has been resting in the frost and is ready for culinary revival.`
          );
        }

        db.prepare(`
          INSERT INTO audit_logs (id, household_id, action, target_type, target_id, details)
          VALUES (?, ?, 'nudge_sent', 'household', ?, ?)
        `).run(crypto.randomUUID(), hh.id, hh.id, JSON.stringify({ item: rediscoveredItem.name, type: 'rediscovery' }));

        nudgesSent++;
      }
    }
  } finally {
    releaseJobLock(jobName, workerId);
  }

  return {
    jobName,
    locked: true,
    householdsProcessed,
    nudgesSent,
    skippedQuietHours,
    skippedDailyCap,
  };
}
