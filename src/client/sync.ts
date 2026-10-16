import { getOfflineDb, QueuedMutation, OfflineItem } from './db/index.js';

export interface SyncOutcome {
  syncedCount: number;
  failedCount: number;
  revokedHouseholds: string[];
  deletedHouseholds: string[];
}

/**
 * Enqueue a mutation when offline or performing optimistic updates
 */
export async function queueMutation(mutation: Omit<QueuedMutation, 'timestamp'>): Promise<void> {
  const db = await getOfflineDb();
  await db.put('mutations', {
    ...mutation,
    timestamp: Date.now(),
  });
}

/**
 * Get count of pending offline mutations
 */
export async function getPendingMutationsCount(): Promise<number> {
  try {
    const db = await getOfflineDb();
    return await db.count('mutations');
  } catch {
    return 0;
  }
}

/**
 * Purge all cached local data for a household (e.g. upon member revocation or household deletion)
 */
export async function purgeLocalHouseholdData(householdId: string): Promise<void> {
  const db = await getOfflineDb();
  const tx = db.transaction(['items', 'mutations', 'households'], 'readwrite');

  // Remove household items
  const items = await tx.objectStore('items').index('by-household').getAll(householdId);
  for (const item of items) {
    await tx.objectStore('items').delete(item.id);
  }

  // Remove queued mutations for this household
  const mutations = await tx.objectStore('mutations').getAll();
  for (const m of mutations) {
    if (m.householdId === householdId) {
      await tx.objectStore('mutations').delete(m.idempotencyKey);
    }
  }

  // Remove household record
  await tx.objectStore('households').delete(householdId);
  await tx.done;
}

/**
 * Flush the offline mutation queue to the server sequentially
 * Safely handles member revocation (403 MEMBER_REVOKED) and deleted households (410 HOUSEHOLD_DELETED)
 */
export async function flushSyncQueue(): Promise<SyncOutcome> {
  if (!navigator.onLine) {
    return { syncedCount: 0, failedCount: 0, revokedHouseholds: [], deletedHouseholds: [] };
  }

  const db = await getOfflineDb();
  const mutations = await db.getAllFromIndex('mutations', 'by-timestamp');
  if (mutations.length === 0) {
    return { syncedCount: 0, failedCount: 0, revokedHouseholds: [], deletedHouseholds: [] };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const revokedHouseholds: string[] = [];
  const deletedHouseholds: string[] = [];

  for (const mutation of mutations) {
    try {
      const response = await fetch(mutation.endpoint, {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': mutation.idempotencyKey,
        },
        body: mutation.payload ? JSON.stringify(mutation.payload) : undefined,
      });

      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (data.error === 'MEMBER_REVOKED') {
          revokedHouseholds.push(mutation.householdId);
          await purgeLocalHouseholdData(mutation.householdId);
          continue;
        }
      }

      if (response.status === 410) {
        const data = await response.json().catch(() => ({}));
        if (data.error === 'HOUSEHOLD_DELETED') {
          deletedHouseholds.push(mutation.householdId);
          await purgeLocalHouseholdData(mutation.householdId);
          continue;
        }
      }

      if (response.ok || response.status === 409 || response.status === 404) {
        // Success or terminal conflict: remove from queue
        await db.delete('mutations', mutation.idempotencyKey);
        syncedCount++;
      } else {
        failedCount++;
      }
    } catch {
      // Network dropped again; keep remaining mutations in queue
      failedCount++;
      break;
    }
  }

  return {
    syncedCount,
    failedCount,
    revokedHouseholds,
    deletedHouseholds,
  };
}
