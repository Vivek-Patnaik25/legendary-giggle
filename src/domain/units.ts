/**
 * Unit Normalisation and Conversion Engine for Pantry Rescue
 * Handles conversions across mass, volume, and discrete counts.
 * Rejects nonsense conversions with helpful, human-readable guidance.
 */

export type UnitCategory = 'mass' | 'volume' | 'count';

export interface UnitDefinition {
  canonical: string;
  category: UnitCategory;
  displayName: string;
  factorToBase: number; // Factor to convert to base unit (grams for mass, ml for volume, piece for count)
  aliases: string[];
}

export const UNIT_DEFINITIONS: Record<string, UnitDefinition> = {
  // Mass (Base: g)
  g: { canonical: 'g', category: 'mass', displayName: 'grams', factorToBase: 1, aliases: ['g', 'gram', 'grams', 'gm'] },
  kg: { canonical: 'kg', category: 'mass', displayName: 'kilograms', factorToBase: 1000, aliases: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  oz: { canonical: 'oz', category: 'mass', displayName: 'ounces', factorToBase: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  lb: { canonical: 'lb', category: 'mass', displayName: 'pounds', factorToBase: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },

  // Volume (Base: ml)
  ml: { canonical: 'ml', category: 'volume', displayName: 'millilitres', factorToBase: 1, aliases: ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'] },
  l: { canonical: 'l', category: 'volume', displayName: 'litres', factorToBase: 1000, aliases: ['l', 'ltr', 'litre', 'litres', 'liter', 'liters'] },
  cup: { canonical: 'cup', category: 'volume', displayName: 'cups', factorToBase: 240, aliases: ['cup', 'cups', 'c'] },
  tbsp: { canonical: 'tbsp', category: 'volume', displayName: 'tablespoons', factorToBase: 15, aliases: ['tbsp', 'tablespoon', 'tablespoons', 'tbs'] },
  tsp: { canonical: 'tsp', category: 'volume', displayName: 'teaspoons', factorToBase: 5, aliases: ['tsp', 'teaspoon', 'teaspoons'] },
  fl_oz: { canonical: 'fl_oz', category: 'volume', displayName: 'fluid ounces', factorToBase: 29.5735, aliases: ['fl_oz', 'floz', 'fl oz', 'fluid ounce', 'fluid ounces'] },

  // Discrete Counts (Base: piece)
  piece: { canonical: 'piece', category: 'count', displayName: 'pieces', factorToBase: 1, aliases: ['piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'item', 'items', 'count', 'whole'] },
  tin: { canonical: 'tin', category: 'count', displayName: 'tins / cans', factorToBase: 1, aliases: ['tin', 'tins', 'can', 'cans'] },
  bunch: { canonical: 'bunch', category: 'count', displayName: 'bunches', factorToBase: 1, aliases: ['bunch', 'bunches'] },
  slice: { canonical: 'slice', category: 'count', displayName: 'slices', factorToBase: 1, aliases: ['slice', 'slices'] },
  clove: { canonical: 'clove', category: 'count', displayName: 'cloves', factorToBase: 1, aliases: ['clove', 'cloves'] },
  portion: { canonical: 'portion', category: 'count', displayName: 'portions', factorToBase: 1, aliases: ['portion', 'portions', 'serving', 'servings'] },
  pack: { canonical: 'pack', category: 'count', displayName: 'packs', factorToBase: 1, aliases: ['pack', 'packs', 'packet', 'packets', 'pkg', 'pkgs'] },
};

// Build fast lookup map from alias to canonical unit
const ALIAS_LOOKUP: Map<string, UnitDefinition> = new Map();
for (const unitDef of Object.values(UNIT_DEFINITIONS)) {
  for (const alias of unitDef.aliases) {
    ALIAS_LOOKUP.set(alias.toLowerCase().trim(), unitDef);
  }
}

/**
 * Normalise any user-supplied unit string into a standard canonical unit
 * Returns null if unrecognized
 */
export function normaliseUnit(rawUnit: string | null | undefined): string {
  if (!rawUnit) return 'piece';
  const cleaned = rawUnit.toLowerCase().trim();
  const def = ALIAS_LOOKUP.get(cleaned);
  return def ? def.canonical : 'piece';
}

/**
 * Get definition for a canonical unit
 */
export function getUnitDefinition(unit: string): UnitDefinition {
  const canonical = normaliseUnit(unit);
  return UNIT_DEFINITIONS[canonical] || UNIT_DEFINITIONS.piece;
}

export interface ConversionResult {
  success: boolean;
  convertedQuantity: number;
  targetUnit: string;
  error?: string;
}

/**
 * Convert quantity from source unit to target unit.
 * Safely handles decimals, rejects nonsense conversions between incompatible categories.
 */
export function convertQuantity(
  quantity: number,
  fromUnitRaw: string,
  toUnitRaw: string
): ConversionResult {
  const fromCanonical = normaliseUnit(fromUnitRaw);
  const toCanonical = normaliseUnit(toUnitRaw);

  // Round input quantity to 2 decimals
  const cleanQty = Math.round(quantity * 100) / 100;

  if (fromCanonical === toCanonical) {
    return {
      success: true,
      convertedQuantity: cleanQty,
      targetUnit: toCanonical,
    };
  }

  const fromDef = getUnitDefinition(fromCanonical);
  const toDef = getUnitDefinition(toCanonical);

  if (fromDef.category !== toDef.category) {
    return {
      success: false,
      convertedQuantity: cleanQty,
      targetUnit: toCanonical,
      error: `Cannot convert between ${fromDef.category} ('${fromDef.displayName}') and ${toDef.category} ('${toDef.displayName}'). Please specify quantity in ${toDef.displayName} directly.`,
    };
  }

  // Same category: convert through base unit
  const inBase = cleanQty * fromDef.factorToBase;
  const inTarget = inBase / toDef.factorToBase;
  const roundedTarget = Math.round(inTarget * 100) / 100;

  return {
    success: true,
    convertedQuantity: roundedTarget,
    targetUnit: toCanonical,
  };
}

export interface ApplyDeltaResult {
  previousQuantity: number;
  delta: number;
  newQuantity: number;
  isDepleted: boolean;
  overusedAmount: number;
}

/**
 * Predictably applies a quantity delta (e.g. cooking consumption)
 * Handles "used more than I had" without crashing or silently producing negative stock.
 */
export function applyQuantityDelta(currentQty: number, delta: number): ApplyDeltaResult {
  const prev = Math.round(currentQty * 100) / 100;
  const d = Math.round(delta * 100) / 100;
  const rawSum = prev + d;

  let newQty = Math.round(rawSum * 100) / 100;
  let overusedAmount = 0;

  if (newQty < 0) {
    overusedAmount = Math.abs(newQty);
    newQty = 0; // Clamped to zero for physical inventory
  }

  return {
    previousQuantity: prev,
    delta: d,
    newQuantity: newQty,
    isDepleted: newQty <= 0,
    overusedAmount,
  };
}
