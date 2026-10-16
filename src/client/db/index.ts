import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface QueuedMutation {
  idempotencyKey: string;
  householdId: string;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  payload?: any;
  timestamp: number;
  description: string;
}

export interface OfflineItem {
  id: string;
  household_id: string;
  name: string;
  category: string;
  location: string;
  initial_quantity: number;
  current_quantity: number;
  unit: string;
  expiry_date: string | null;
  is_frozen: boolean;
  status: 'active' | 'consumed' | 'wasted';
  claimed_by_name?: string | null;
  notes?: string;
  is_leftover?: boolean;
  urgency?: any;
}

interface PantryRescueDB extends DBSchema {
  items: {
    key: string;
    value: OfflineItem;
    indexes: { 'by-household': string };
  };
  mutations: {
    key: string;
    value: QueuedMutation;
    indexes: { 'by-timestamp': number };
  };
  households: {
    key: string;
    value: any;
  };
  meta: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<PantryRescueDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<PantryRescueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PantryRescueDB>('pantry_rescue_offline', 1, {
      upgrade(db) {
        // Items store
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('by-household', 'household_id');

        // Offline mutation queue
        const mutationStore = db.createObjectStore('mutations', { keyPath: 'idempotencyKey' });
        mutationStore.createIndex('by-timestamp', 'timestamp');

        // Households cache
        db.createObjectStore('households', { keyPath: 'id' });

        // Metadata
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}
