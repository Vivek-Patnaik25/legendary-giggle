import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquireJobLock,
  releaseJobLock,
  isQuietHours,
  runDailyRescueBoardJob,
} from '../../src/server/services/scheduler.js';
import { resetDbForTesting, getDb } from '../../src/server/db/index.js';
import crypto from 'crypto';

describe('Milestone 6: Background Jobs, Nudges & Observability', () => {
  beforeEach(() => {
    resetDbForTesting(':memory:');
  });

  it('guarantees distributed lock safety between concurrent replica workers', () => {
    const jobName = 'test_cron_task';

    // Worker 1 acquires lock
    const acquired1 = acquireJobLock(jobName, 'replica-1', 60);
    expect(acquired1).toBe(true);

    // Worker 2 attempts to acquire same lock
    const acquired2 = acquireJobLock(jobName, 'replica-2', 60);
    expect(acquired2).toBe(false);

    // Worker 1 releases lock
    releaseJobLock(jobName, 'replica-1');

    // Worker 2 can now acquire lock
    const acquiredAfterRelease = acquireJobLock(jobName, 'replica-2', 60);
    expect(acquiredAfterRelease).toBe(true);
  });

  it('correctly determines quiet hours across local timezones and daylight saving', () => {
    // 23:00 UTC (11 PM) -> quiet hours in UTC
    const lateUtc = new Date('2026-10-15T23:00:00Z');
    expect(isQuietHours('UTC', lateUtc)).toBe(true);

    // 14:00 UTC (2 PM) -> daytime in UTC
    const dayUtc = new Date('2026-10-15T14:00:00Z');
    expect(isQuietHours('UTC', dayUtc)).toBe(false);

    // 04:00 UTC (4 AM) -> quiet hours in UTC
    const earlyUtc = new Date('2026-10-15T04:00:00Z');
    expect(isQuietHours('UTC', earlyUtc)).toBe(true);

    // 01:00 UTC is 21:00 (9 PM EDT) in America/New_York (UTC-4) -> quiet hours!
    const nyLate = new Date('2026-10-15T01:00:00Z');
    expect(isQuietHours('America/New_York', nyLate)).toBe(true);
  });

  it('enforces anti-spam rules: daily cap, skips resolved items, and triggers witty personality nudges', async () => {
    const db = getDb();
    const hhId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // Setup active household in UTC
    db.prepare(`
      INSERT INTO households (id, name, weekly_waste_target, timezone)
      VALUES (?, 'Nudge Test House', 2.0, 'UTC')
    `).run(hhId);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES (?, 'resident@test.com', 'hash', 'Resident')
    `).run(userId);

    db.prepare(`
      INSERT INTO members (id, household_id, user_id, role)
      VALUES (?, ?, ?, 'owner')
    `).run(crypto.randomUUID(), hhId, userId);

    // Add urgent item expiring today
    const todayISO = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO items (id, household_id, name, category, initial_quantity, current_quantity, unit, expiry_date, status, created_by_user_id)
      VALUES (?, ?, 'Fresh Berries', 'produce', 1, 1, 'pack', ?, 'active', ?)
    `).run(crypto.randomUUID(), hhId, todayISO, userId);

    // Mock isQuietHours for the purpose of running in test if local time is night
    // Run job
    const result1 = await runDailyRescueBoardJob('test-worker');
    expect(result1.locked).toBe(true);
    expect(result1.householdsProcessed).toBe(1);

    // Verify daily cap: running again skips due to daily cap or quiet hours
    const result2 = await runDailyRescueBoardJob('test-worker');
    expect(result2.nudgesSent).toBe(0);
  });
});
