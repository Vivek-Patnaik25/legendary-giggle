import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.js';
import { getOfflineDb } from '../db/index.js';
import { queueMutation, flushSyncQueue, getPendingMutationsCount, purgeLocalHouseholdData } from '../sync.js';
import confetti from 'canvas-confetti';
import { trackLocalEvent, checkDay1Return } from '../analytics.js';
import { cleanText } from '../utils/text.js';
import { apiFetch, getAuthToken } from '../api.js';

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  location: 'fridge' | 'freezer' | 'pantry';
  initial_quantity: number;
  current_quantity: number;
  unit: string;
  expiry_date: string | null;
  is_frozen: boolean;
  status: 'active' | 'consumed' | 'wasted';
  claimed_by_name?: string | null;
  claimed_by_user_id?: string | null;
  notes?: string;
  is_leftover?: boolean;
  urgency: {
    score: number;
    tier: 'critical' | 'high' | 'medium' | 'low';
    daysRemaining: number | null;
    explanation: string;
  };
}

interface PantryContextType {
  items: PantryItem[];
  rescueRecipes: any[];
  shoppingHints: any[];
  scoreboard: any | null;
  badges: any[];
  mascot: any | null;
  isLoading: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  activeFilter: string;
  setActiveFilter: (f: string) => void;
  addItem: (payload: any) => Promise<void>;
  editItem: (itemId: string, payload: any) => Promise<void>;
  cookItem: (itemId: string, amount?: number) => Promise<void>;
  wasteItem: (itemId: string, amount?: number) => Promise<void>;
  deleteItem: (itemId: string, markAsConsumed?: boolean) => Promise<void>;
  claimItem: (itemId: string, claim?: boolean) => Promise<void>;
  refreshPantry: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const PantryContext = createContext<PantryContextType | undefined>(undefined);

export const PantryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentHousehold } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [rescueRecipes, setRescueRecipes] = useState<any[]>([]);
  const [shoppingHints, setShoppingHints] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<any | null>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [mascot, setMascot] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkDay1Return();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = async () => {
    const outcome = await flushSyncQueue();
    const count = await getPendingMutationsCount();
    setPendingSyncCount(count);

    if (outcome.syncedCount > 0) {
      refreshPantry();
    }
  };

  const refreshPantry = useCallback(async () => {
    if (!currentHousehold) {
      setItems([]);
      setRescueRecipes([]);
      setShoppingHints([]);
      setScoreboard(null);
      setBadges([]);
      setMascot(null);
      return;
    }

    const hhId = currentHousehold.id;
    setIsLoading(true);

    try {
      if (navigator.onLine) {
        // Fetch items
        const itemsRes = await apiFetch(`/api/households/${hhId}/items?status=active`);
        if (itemsRes.ok) {
          const data = await itemsRes.json();
          const cleanItems = (data.items || []).map((i: any) => ({
            ...i,
            name: cleanText(i.name),
            category: cleanText(i.category),
          }));
          setItems(cleanItems);
          setMascot(data.mascot || null);

          // Save to IndexedDB cache
          const db = await getOfflineDb();
          const tx = db.transaction('items', 'readwrite');
          for (const item of cleanItems) {
            await tx.store.put(item);
          }
          await tx.done;
        }

        // Fetch top 3 rescue recipes
        const rescueRes = await apiFetch(`/api/households/${hhId}/recipes/rescue`);
        if (rescueRes.ok) {
          const rData = await rescueRes.json();
          const cleanRecipes = (rData.recipes || []).map((r: any) => ({
            ...r,
            title: cleanText(r.title),
            usedPantryItems: (r.usedPantryItems || []).map((u: any) => ({
              ...u,
              name: cleanText(u.name),
            })),
            missingIngredients: (r.missingIngredients || []).map((m: any) => ({
              ...(typeof m === 'object' ? m : { name: m }),
              name: cleanText(typeof m === 'object' ? m.name : m),
            })),
          }));
          setRescueRecipes(cleanRecipes);
        }

        // Fetch smart shopping hints
        const hintsRes = await apiFetch(`/api/households/${hhId}/recipes/shopping-hints`);
        if (hintsRes.ok) {
          const hData = await hintsRes.json();
          setShoppingHints(hData.hints || []);
        }

        // Fetch scoreboard
        const sbRes = await apiFetch(`/api/households/${hhId}/scoreboard`);
        if (sbRes.ok) {
          const sbData = await sbRes.json();
          setScoreboard(sbData.scoreboard || null);
        }

        // Fetch badges
        const bRes = await apiFetch(`/api/households/${hhId}/badges`);
        if (bRes.ok) {
          const bData = await bRes.json();
          setBadges(bData.badges || []);
        }
      } else {
        // Offline: Load from IndexedDB
        const db = await getOfflineDb();
        const cachedItems = await db.getAllFromIndex('items', 'by-household', hhId);
        setItems(cachedItems.filter(i => i.status === 'active') as any[]);
      }
    } catch (err) {
      console.warn('Error loading pantry data:', err);
    } finally {
      setIsLoading(false);
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
  }, [currentHousehold]);

  useEffect(() => {
    refreshPantry();
  }, [refreshPantry]);

  // Real-Time SSE listener with auto-polling fallback
  useEffect(() => {
    if (!currentHousehold || !navigator.onLine) return;

    let eventSource: EventSource | null = null;
    let pollInterval: any = null;

    try {
      const token = getAuthToken();
      const sseUrl = token
        ? `/api/households/${currentHousehold.id}/events?token=${encodeURIComponent(token)}`
        : `/api/households/${currentHousehold.id}/events`;
      eventSource = new EventSource(sseUrl);
      eventSource.onmessage = () => {
        refreshPantry();
      };
      eventSource.onerror = () => {
        eventSource?.close();
        // Fallback to polling every 10 seconds
        pollInterval = setInterval(() => {
          refreshPantry();
        }, 10000);
      };
    } catch {
      pollInterval = setInterval(() => {
        refreshPantry();
      }, 10000);
    }

    return () => {
      eventSource?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentHousehold, refreshPantry]);

  // Helper to ensure current household is available
  const getHouseholdId = async (): Promise<string | null> => {
    if (currentHousehold?.id) return currentHousehold.id;
    try {
      await refreshAuth();
    } catch {
      // ignore
    }
    return currentHousehold?.id || null;
  };

  // Actions
  const addItem = async (payload: any) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    const key = crypto.randomUUID();

    if (navigator.onLine) {
      const res = await apiFetch(`/api/households/${hhId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add item');
      trackLocalEvent('first_item_added', { name: payload.name, category: payload.category }, hhId);
    } else {
      await queueMutation({
        idempotencyKey: key,
        householdId: hhId,
        endpoint: `/api/households/${hhId}/items`,
        method: 'POST',
        payload,
        description: `Add ${payload.name}`,
      });
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
    await refreshPantry();
  };

  const editItem = async (itemId: string, payload: any) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    const key = crypto.randomUUID();

    if (navigator.onLine) {
      const res = await apiFetch(`/api/households/${hhId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update item');
    } else {
      await queueMutation({
        idempotencyKey: key,
        householdId: hhId,
        endpoint: `/api/households/${hhId}/items/${itemId}`,
        method: 'PATCH',
        payload,
        description: `Update item`,
      });
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
    await refreshPantry();
  };

  const cookItem = async (itemId: string, amount?: number) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    const key = crypto.randomUUID();

    if (navigator.onLine) {
      const res = await apiFetch(`/api/households/${hhId}/items/${itemId}/cook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        trackLocalEvent('first_cook', { itemId, amount }, hhId);
        trackLocalEvent('items_used_per_week', { itemId, amount }, hhId);
        const data = await res.json();
        // Playful celebration confetti if new badge unlocked!
        if (data.newBadges && data.newBadges.length > 0) {
          try {
            confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
          } catch {
            // ignore
          }
        }
      }
    } else {
      await queueMutation({
        idempotencyKey: key,
        householdId: hhId,
        endpoint: `/api/households/${hhId}/items/${itemId}/cook`,
        method: 'POST',
        payload: { amount },
        description: 'Cook item',
      });
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
    await refreshPantry();
  };

  const wasteItem = async (itemId: string, amount?: number) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    const key = crypto.randomUUID();

    if (navigator.onLine) {
      await apiFetch(`/api/households/${hhId}/items/${itemId}/waste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ amount }),
      });
      trackLocalEvent('wasted_items_per_week', { itemId, amount }, hhId);
    } else {
      await queueMutation({
        idempotencyKey: key,
        householdId: hhId,
        endpoint: `/api/households/${hhId}/items/${itemId}/waste`,
        method: 'POST',
        payload: { amount },
        description: 'Mark item as waste',
      });
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
    await refreshPantry();
  };

  const deleteItem = async (itemId: string, markAsConsumed = false) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    const key = crypto.randomUUID();

    if (navigator.onLine) {
      await apiFetch(`/api/households/${hhId}/items/${itemId}?markAsConsumed=${markAsConsumed}`, {
        method: 'DELETE',
      });
    } else {
      await queueMutation({
        idempotencyKey: key,
        householdId: hhId,
        endpoint: `/api/households/${hhId}/items/${itemId}?markAsConsumed=${markAsConsumed}`,
        method: 'DELETE',
        description: 'Delete item',
      });
      const count = await getPendingMutationsCount();
      setPendingSyncCount(count);
    }
    await refreshPantry();
  };

  const claimItem = async (itemId: string, claim = true) => {
    const hhId = await getHouseholdId();
    if (!hhId) return;
    await apiFetch(`/api/households/${hhId}/items/${itemId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim }),
    });
    await refreshPantry();
  };

  return (
    <PantryContext.Provider
      value={{
        items,
        rescueRecipes,
        shoppingHints,
        scoreboard,
        badges,
        mascot,
        isLoading,
        isOnline,
        pendingSyncCount,
        activeFilter,
        setActiveFilter,
        addItem,
        editItem,
        cookItem,
        wasteItem,
        deleteItem,
        claimItem,
        refreshPantry,
        triggerSync,
      }}
    >
      {children}
    </PantryContext.Provider>
  );
};

export const usePantry = () => {
  const ctx = useContext(PantryContext);
  if (!ctx) throw new Error('usePantry must be used within a PantryProvider');
  return ctx;
};
