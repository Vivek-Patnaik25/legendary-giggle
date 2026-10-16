/**
 * Expiry Estimation and Freezer Rules Engine for Pantry Rescue
 * Handles category defaults, freezer extensions, leftovers, and rediscovered item logic.
 */

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface CategoryExpiryRule {
  category: string;
  defaultLocation: StorageLocation;
  fridgeDays: number;
  freezerDays: number;
  pantryDays: number;
}

export const CATEGORY_EXPIRY_RULES: Record<string, CategoryExpiryRule> = {
  dairy: {
    category: 'dairy',
    defaultLocation: 'fridge',
    fridgeDays: 7,
    freezerDays: 90,
    pantryDays: 1,
  },
  meat: {
    category: 'meat',
    defaultLocation: 'fridge',
    fridgeDays: 3,
    freezerDays: 180,
    pantryDays: 0,
  },
  seafood: {
    category: 'seafood',
    defaultLocation: 'fridge',
    fridgeDays: 2,
    freezerDays: 90,
    pantryDays: 0,
  },
  produce: {
    category: 'produce',
    defaultLocation: 'fridge',
    fridgeDays: 6,
    freezerDays: 90,
    pantryDays: 3,
  },
  bakery: {
    category: 'bakery',
    defaultLocation: 'pantry',
    fridgeDays: 7,
    freezerDays: 90,
    pantryDays: 5,
  },
  leftovers: {
    category: 'leftovers',
    defaultLocation: 'fridge',
    fridgeDays: 3,
    freezerDays: 60,
    pantryDays: 0,
  },
  pantry_staple: {
    category: 'pantry_staple',
    defaultLocation: 'pantry',
    fridgeDays: 180,
    freezerDays: 365,
    pantryDays: 365,
  },
  condiments: {
    category: 'condiments',
    defaultLocation: 'fridge',
    fridgeDays: 60,
    freezerDays: 180,
    pantryDays: 90,
  },
  general: {
    category: 'general',
    defaultLocation: 'fridge',
    fridgeDays: 7,
    freezerDays: 90,
    pantryDays: 14,
  },
};

/**
 * Format a Date to standard ISO date YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Estimate expiry date based on item category and storage location
 */
export function estimateExpiryDate(
  categoryRaw: string | null | undefined,
  location: StorageLocation = 'fridge',
  referenceDateInput?: string | Date
): string {
  const catKey = (categoryRaw || 'general').toLowerCase().trim();
  const rule = CATEGORY_EXPIRY_RULES[catKey] || CATEGORY_EXPIRY_RULES.general;

  const baseDate = referenceDateInput ? new Date(referenceDateInput) : new Date();
  let daysToAdd = rule.fridgeDays;

  if (location === 'freezer') {
    daysToAdd = rule.freezerDays;
  } else if (location === 'pantry') {
    daysToAdd = rule.pantryDays;
  }

  const expiry = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return formatDateISO(expiry);
}

/**
 * Applies freezer extension to an existing item when moved to the freezer.
 * Extends the expiry date by the category's freezer allowance.
 */
export function applyFreezerExtension(
  currentExpiryStr: string | null,
  categoryRaw: string | null | undefined,
  frozenAtInput?: string | Date
): { newExpiryDate: string; daysAdded: number } {
  const catKey = (categoryRaw || 'general').toLowerCase().trim();
  const rule = CATEGORY_EXPIRY_RULES[catKey] || CATEGORY_EXPIRY_RULES.general;

  const daysAdded = rule.freezerDays;
  const baseDate = currentExpiryStr ? new Date(currentExpiryStr) : (frozenAtInput ? new Date(frozenAtInput) : new Date());

  const newDate = new Date(baseDate.getTime() + daysAdded * 24 * 60 * 60 * 1000);
  return {
    newExpiryDate: formatDateISO(newDate),
    daysAdded,
  };
}

/**
 * Checks whether a frozen item qualifies as a "rediscovered" nudge.
 * Standard threshold is 60+ days in freezer.
 */
export function checkFreezerRediscovery(
  frozenAtStr: string | null | undefined,
  currentDateInput?: string | Date,
  thresholdDays: number = 60
): { isRediscovered: boolean; daysFrozen: number } {
  if (!frozenAtStr) return { isRediscovered: false, daysFrozen: 0 };

  const frozenDate = new Date(frozenAtStr);
  const now = currentDateInput ? new Date(currentDateInput) : new Date();

  const msDiff = now.getTime() - frozenDate.getTime();
  const daysFrozen = Math.floor(msDiff / (1000 * 60 * 60 * 24));

  return {
    isRediscovered: daysFrozen >= thresholdDays,
    daysFrozen: Math.max(0, daysFrozen),
  };
}
