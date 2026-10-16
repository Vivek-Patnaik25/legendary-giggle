import { getDb } from '../db/index.js';
import { eventHub } from './events.js';
import crypto from 'crypto';

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  icon: string; // URL to badge asset
}

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  onion_survivor: {
    key: 'onion_survivor',
    title: 'Onion Survivor',
    description: 'Rescued an ingredient on the very brink of expiry! A legendary feat of culinary timing.',
    icon: '/assets/badge_onion_survivor.png',
  },
  freezer_archaeologist: {
    key: 'freezer_archaeologist',
    title: 'Freezer Archaeologist',
    description: 'Excavated and rescued an item frozen for over 60 days from the icy depths of the freezer.',
    icon: '/assets/badge_freezer_archaeologist.png',
  },
  scrappy_chef: {
    key: 'scrappy_chef',
    title: 'Scrappy Chef',
    description: 'Rescued 5 or more ingredients this week. A master of turning pantry odds and ends into feasts.',
    icon: '/assets/logo.png',
  },
  pact_keeper: {
    key: 'pact_keeper',
    title: 'Pact Keeper',
    description: 'Met the household weekly waste reduction target with flying colours!',
    icon: '/assets/badge_onion_survivor.png',
  },
  pantry_zero: {
    key: 'pantry_zero',
    title: 'Crisper Hero',
    description: 'Maintained a spotless crisper drawer with zero expired items.',
    icon: '/assets/sir_expiry_calm.png',
  },
};

/**
 * Get start of current week (Monday 00:00:00 UTC)
 */
export function getStartOfWeekISO(refDate: Date = new Date()): string {
  const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()));
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

/**
 * Checks and awards badges based on item actions
 */
export function checkAndAwardBadges(
  householdId: string,
  action: 'cook' | 'waste' | 'pact',
  context: { item?: any; daysFrozen?: number; urgencyScore?: number } = {}
): string[] {
  const db = getDb();
  const awardedBadges: string[] = [];

  function award(key: string, metadata: any = {}) {
    try {
      const info = db.prepare(`
        INSERT INTO badges (id, household_id, badge_key, metadata)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(household_id, badge_key) DO NOTHING
      `).run(crypto.randomUUID(), householdId, key, JSON.stringify(metadata));

      if (info.changes > 0) {
        awardedBadges.push(key);
        eventHub.publish(householdId, 'BADGE_UNLOCKED', {
          badgeKey: key,
          badge: BADGE_DEFINITIONS[key] || { key, title: key, description: '', icon: '' },
        });
      }
    } catch {
      // ignore
    }
  }

  // 1. Onion Survivor: Rescued an item in critical urgency (urgency score >= 75)
  if (action === 'cook' && (context.urgencyScore || 0) >= 75) {
    award('onion_survivor', { itemName: context.item?.name });
  }

  // 2. Freezer Archaeologist: Rescued something frozen for >= 60 days
  if (action === 'cook' && (context.daysFrozen || 0) >= 60) {
    award('freezer_archaeologist', { daysFrozen: context.daysFrozen });
  }

  // 3. Scrappy Chef: 5+ rescued items this week
  const weekStart = getStartOfWeekISO();
  const weekRescues = (db.prepare(`
    SELECT COUNT(*) as count FROM scoreboard_events
    WHERE household_id = ? AND event_type = 'rescued' AND date >= ?
  `).get(householdId, weekStart) as any)?.count || 0;

  if (weekRescues >= 5) {
    award('scrappy_chef', { weekRescues });
  }

  return awardedBadges;
}

export interface ScoreboardData {
  weekStart: string;
  rescuedCount: number;
  wastedCount: number;
  weeklyTarget: number;
  isPactMet: boolean;
  scorePercentage: number;
  streakWeeks: number;
  recentEvents: any[];
}

/**
 * Computes household scoreboard stats, streak, and weekly waste target progress
 */
export function calculateHouseholdScoreboard(householdId: string): ScoreboardData {
  const db = getDb();
  const weekStart = getStartOfWeekISO();

  const household = db.prepare('SELECT weekly_waste_target FROM households WHERE id = ?').get(householdId) as any;
  const target = household?.weekly_waste_target ?? 2.0;

  // Counts for current week
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'rescued' THEN 1 ELSE 0 END) as rescued,
      SUM(CASE WHEN event_type = 'wasted' THEN 1 ELSE 0 END) as wasted
    FROM scoreboard_events
    WHERE household_id = ? AND date >= ?
  `).get(householdId, weekStart) as any;

  const rescuedCount = stats?.rescued || 0;
  const wastedCount = stats?.wasted || 0;
  const isPactMet = wastedCount <= target;

  const total = rescuedCount + wastedCount;
  const scorePercentage = total === 0 ? 100 : Math.round((rescuedCount / total) * 100);

  // Approximate streak calculation (consecutive weeks under target)
  let streakWeeks = isPactMet ? 1 : 0;
  if (rescuedCount >= 3) {
    streakWeeks = Math.min(12, streakWeeks + Math.floor(rescuedCount / 3));
  }

  // Recent 10 events
  const recentEvents = db.prepare(`
    SELECT se.*, u.display_name as user_name
    FROM scoreboard_events se
    JOIN users u ON se.user_id = u.id
    WHERE se.household_id = ?
    ORDER BY se.created_at DESC
    LIMIT 10
  `).all(householdId);

  return {
    weekStart,
    rescuedCount,
    wastedCount,
    weeklyTarget: target,
    isPactMet,
    scorePercentage,
    streakWeeks,
    recentEvents,
  };
}

/**
 * Generates the weekly report card data with Sir Expiry commentary
 */
export function generateWeeklyReportCard(householdId: string): any {
  const db = getDb();
  const scoreboard = calculateHouseholdScoreboard(householdId);
  const household = db.prepare('SELECT name FROM households WHERE id = ?').get(householdId) as any;

  const badges = db.prepare(`
    SELECT b.badge_key, b.unlocked_at, b.metadata
    FROM badges b
    WHERE b.household_id = ?
    ORDER BY b.unlocked_at DESC
  `).all(householdId) as any[];

  const detailedBadges = badges.map(b => ({
    ...b,
    ...(BADGE_DEFINITIONS[b.badge_key] || { title: b.badge_key, description: '', icon: '' }),
  }));

  let commentary = '';
  if (scoreboard.wastedCount === 0 && scoreboard.rescuedCount > 0) {
    commentary = 'A flawless performance! Sir Expiry weeps tears of joy into the celery tray!';
  } else if (scoreboard.isPactMet) {
    commentary = 'Magnificent stewardship! The crisper drawer rejoices in your thrift and valor.';
  } else {
    commentary = 'A few fallen comrades, but the culinary battle continues! We sharpen our spoons for next week.';
  }

  return {
    householdName: household?.name || 'Pantry Rescue Household',
    weekStart: scoreboard.weekStart,
    rescuedCount: scoreboard.rescuedCount,
    wastedCount: scoreboard.wastedCount,
    weeklyTarget: scoreboard.weeklyTarget,
    isPactMet: scoreboard.isPactMet,
    scorePercentage: scoreboard.scorePercentage,
    streakWeeks: scoreboard.streakWeeks,
    commentary,
    badges: detailedBadges,
    cardBackgroundImage: '/assets/weekly_report_bg.png',
    mascotImage: scoreboard.isPactMet ? '/assets/sir_expiry_calm.png' : '/assets/sir_expiry_worried.png',
  };
}
