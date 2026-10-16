/**
 * Ingredient Synonym Matching Engine for Pantry Rescue
 * Normalises regional, linguistic, and culinary synonyms to ensure seamless
 * recipe matching across different terminology (e.g., coriander vs cilantro).
 */

// Synonym clusters: all variants map to the first element (canonical form)
export const SYNONYM_CLUSTERS: string[][] = [
  ['cilantro', 'coriander', 'fresh coriander', 'coriander leaves', 'cilantro leaves', 'chinese parsley'],
  ['eggplant', 'aubergine', 'brinjal', 'melongene'],
  ['bell pepper', 'capsicum', 'sweet pepper', 'pepper', 'red bell pepper', 'green bell pepper', 'yellow bell pepper'],
  ['zucchini', 'courgette'],
  ['scallion', 'spring onion', 'green onion', 'salad onion', 'shallot'],
  ['arugula', 'rocket', 'roquette'],
  ['beet', 'beetroot'],
  ['chickpeas', 'garbanzo beans', 'garbanzo', 'ceci'],
  ['ground beef', 'minced beef', 'beef mince', 'mince', 'ground meat'],
  ['cornstarch', 'cornflour', 'maize starch'],
  ['powdered sugar', 'icing sugar', 'confectioners sugar'],
  ['baking soda', 'sodium bicarbonate', 'bicarbonate of soda'],
  ['heavy cream', 'double cream', 'heavy whipping cream', 'whipping cream'],
  ['all-purpose flour', 'plain flour', 'white flour', 'flour'],
  ['tomato puree', 'tomato paste', 'passata', 'crushed tomatoes'],
  ['prawn', 'shrimp', 'prawns', 'shrimps'],
  ['yogurt', 'yoghurt', 'plain yogurt', 'greek yogurt', 'curd', 'dahi'],
  ['onion', 'yellow onion', 'brown onion', 'white onion'],
  ['garlic', 'garlic cloves', 'fresh garlic'],
  ['ginger', 'fresh ginger', 'ginger root'],
  ['chicken breast', 'chicken', 'chicken thighs', 'chicken meat'],
];

// Inverted lookup map: alias -> canonical form
const SYNONYM_MAP: Map<string, string> = new Map();

for (const cluster of SYNONYM_CLUSTERS) {
  const canonical = cluster[0];
  for (const alias of cluster) {
    const clean = alias.toLowerCase().trim();
    SYNONYM_MAP.set(clean, canonical);
    SYNONYM_MAP.set(clean + 's', canonical);
    if (!clean.endsWith('e')) {
      SYNONYM_MAP.set(clean + 'es', canonical);
    }
  }
}

// Words to strip when cleaning ingredient names
const NOISE_WORDS = new Set([
  'fresh', 'organic', 'raw', 'cooked', 'chopped', 'diced', 'minced',
  'sliced', 'grated', 'peeled', 'crushed', 'whole', 'frozen', 'dry',
  'dried', 'large', 'small', 'medium', 'can', 'canned', 'tin', 'tinned',
  'bottle', 'jar', 'pack', 'package', 'bunch', 'cup', 'cups', 'gram',
  'grams', 'piece', 'pieces'
]);

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) {
    return word.slice(0, -3) + 'y';
  }
  if (/(?:ch|sh|x|z|ss|o)es$/.test(word) && word.length > 4) {
    // For tomatoes / potatoes, return without 'es'
    if (word.endsWith('oes')) {
      return word.slice(0, -2);
    }
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Normalises an ingredient string to its clean base representation
 */
export function cleanIngredientName(rawName: string): string {
  if (!rawName) return '';

  const lower = rawName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Check direct synonym match first
  if (SYNONYM_MAP.has(lower)) {
    return SYNONYM_MAP.get(lower)!;
  }
  const singularDirect = singularize(lower);
  if (SYNONYM_MAP.has(singularDirect)) {
    return SYNONYM_MAP.get(singularDirect)!;
  }

  // Tokenize and filter noise words
  const tokens = lower.split(' ').filter(token => !NOISE_WORDS.has(token) && token.length > 1);
  const filtered = tokens.join(' ');

  if (SYNONYM_MAP.has(filtered)) {
    return SYNONYM_MAP.get(filtered)!;
  }
  if (SYNONYM_MAP.has(singularize(filtered))) {
    return SYNONYM_MAP.get(singularize(filtered))!;
  }

  // Check individual tokens if multi-word didn't hit
  for (const token of tokens) {
    if (SYNONYM_MAP.has(token)) {
      return SYNONYM_MAP.get(token)!;
    }
    const singToken = singularize(token);
    if (SYNONYM_MAP.has(singToken)) {
      return SYNONYM_MAP.get(singToken)!;
    }
  }

  return singularize(filtered) || singularize(lower);
}

/**
 * Checks if a pantry item satisfies a recipe ingredient requirement
 */
export function areIngredientsMatching(pantryItemName: string, recipeIngredientName: string): boolean {
  if (!pantryItemName || !recipeIngredientName) return false;

  const cleanPantry = cleanIngredientName(pantryItemName);
  const cleanRecipe = cleanIngredientName(recipeIngredientName);

  if (cleanPantry === cleanRecipe) return true;

  // Substring or token containment (e.g. "egg" matches "eggs", "tomato" matches "cherry tomatoes")
  if (cleanPantry.includes(cleanRecipe) || cleanRecipe.includes(cleanPantry)) {
    return true;
  }

  // Pluralization check (basic english)
  if (cleanPantry + 's' === cleanRecipe || cleanRecipe + 's' === cleanPantry) {
    return true;
  }
  if (cleanPantry + 'es' === cleanRecipe || cleanRecipe + 'es' === cleanPantry) {
    return true;
  }

  return false;
}
