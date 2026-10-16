/**
 * Urgency Score Calculator for Pantry Rescue
 * Calculates an item's urgency based on:
 * 1. Days remaining until expiry (earlier = higher urgency)
 * 2. Quantity (larger quantities expiring create more waste)
 * 3. Candidate recipes depending on this item (actionable dinner potential)
 */

export type UrgencyTier = 'critical' | 'high' | 'medium' | 'low';

export interface UrgencyInput {
  /** Expiry date in ISO string format (YYYY-MM-DD or full ISO), or null if unknown */
  expiryDate: string | null;
  /** Current quantity on hand */
  quantity: number;
  /** Number of candidate recipes that use this item (defaults to 0) */
  candidateRecipeCount?: number;
  /** Whether the item is currently frozen */
  isFrozen?: boolean;
  /** Reference date for calculation (defaults to today) */
  referenceDate?: string | Date;
}

export interface UrgencyResult {
  score: number; // 0 to 100
  tier: UrgencyTier;
  daysRemaining: number | null;
  explanation: string;
}

/**
 * Calculates days difference between reference date and expiry date
 * Uses UTC date calculations to avoid timezone / DST skew
 */
export function calculateDaysRemaining(
  expiryDateStr: string | null,
  referenceDateInput?: string | Date
): number | null {
  if (!expiryDateStr) return null;

  const ref = referenceDateInput ? new Date(referenceDateInput) : new Date();
  const refUTC = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());

  const exp = new Date(expiryDateStr);
  if (isNaN(exp.getTime())) return null;

  const expUTC = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.round((expUTC - refUTC) / msPerDay);
}

/**
 * Compute the composite urgency score
 */
export function calculateUrgency(input: UrgencyInput): UrgencyResult {
  const days = calculateDaysRemaining(input.expiryDate, input.referenceDate);
  const qty = Math.max(0, input.quantity);
  const recipes = Math.max(0, input.candidateRecipeCount ?? 0);

  // If no expiry date is specified, assign a moderate default baseline
  if (days === null) {
    return {
      score: 30,
      tier: 'low',
      daysRemaining: null,
      explanation: 'No expiry date recorded; assigned default baseline urgency.',
    };
  }

  let expiryComponent = 0;
  if (days < 0) {
    // Expired already
    expiryComponent = 100;
  } else if (days === 0) {
    // Expires today
    expiryComponent = 95;
  } else if (days === 1) {
    // Expires tomorrow
    expiryComponent = 85;
  } else if (days === 2) {
    expiryComponent = 75;
  } else if (days <= 4) {
    expiryComponent = 60 - (days - 2) * 8; // 60, 52
  } else if (days <= 7) {
    expiryComponent = 40 - (days - 4) * 5; // 35, 30, 25
  } else if (days <= 14) {
    expiryComponent = 20 - (days - 7) * 1.5; // ~20 to ~10
  } else {
    // Far future
    expiryComponent = Math.max(5, 10 - Math.min(5, (days - 14) * 0.1));
  }

  // Frozen items have reduced time urgency while frozen
  if (input.isFrozen) {
    expiryComponent = Math.max(10, expiryComponent * 0.4);
  }

  // Quantity factor: up to 10 points bonus for large quantities at risk
  const quantityBonus = Math.min(10, Math.log10(qty + 1) * 7);

  // Recipe factor: up to 10 points bonus if this item can unlock meals
  const recipeBonus = Math.min(10, recipes * 2.5);

  const rawScore = expiryComponent * 0.8 + quantityBonus + recipeBonus;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  let tier: UrgencyTier;
  if (score >= 80 || days <= 1) {
    tier = 'critical';
  } else if (score >= 60 || days <= 3) {
    tier = 'high';
  } else if (score >= 35 || days <= 7) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  let explanation = '';
  if (days < 0) {
    explanation = `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago! High rescue priority.`;
  } else if (days === 0) {
    explanation = 'Expires today! Rescue today for dinner.';
  } else if (days === 1) {
    explanation = 'Expires tomorrow! Prime candidate for tonight or tomorrow.';
  } else {
    explanation = `${days} days left. Urgency score: ${score}/100.`;
  }

  return {
    score,
    tier,
    daysRemaining: days,
    explanation,
  };
}
