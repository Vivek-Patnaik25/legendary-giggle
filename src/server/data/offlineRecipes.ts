export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  category: string;
  prepTimeMinutes: number;
  servings: number;
  instructions: string[];
  ingredients: RecipeIngredient[];
  source: 'bundled_offline' | 'themealdb';
  imageUrl?: string;
  tags?: string[];
}

export const OFFLINE_RECIPES: Recipe[] = [
  {
    id: 'off-001',
    title: 'Emergency Fridge-Clearing Frittata',
    category: 'Vegetarian',
    prepTimeMinutes: 20,
    servings: 4,
    instructions: [
      'Beat eggs in a large bowl with salt, pepper, and a splash of milk.',
      'Sauté chopped bell pepper and onion in an oven-safe skillet until tender.',
      'Pour egg mixture over the vegetables, scatter cheese on top.',
      'Cook over medium-low heat for 5 minutes, then transfer to a hot grill/broiler until golden and set.',
    ],
    ingredients: [
      { name: 'eggs', quantity: 6, unit: 'piece' },
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'bell pepper', quantity: 1, unit: 'piece' },
      { name: 'cheese', quantity: 50, unit: 'g' },
      { name: 'milk', quantity: 50, unit: 'ml', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Quick', 'High Protein', 'Breakfast For Dinner'],
  },
  {
    id: 'off-002',
    title: 'Crispy Leftover Rice Stir-Fry',
    category: 'Asian',
    prepTimeMinutes: 15,
    servings: 2,
    instructions: [
      'Heat oil in a wok or large pan over high heat.',
      'Sauté minced garlic and sliced scallions for 30 seconds.',
      'Add cold leftover cooked rice, breaking up clumps with a spatula.',
      'Drizzle with soy sauce; toss vigorously until fragrant and steaming.',
      'Whisk in eggs if desired and scramble through the rice before serving.',
    ],
    ingredients: [
      { name: 'rice', quantity: 300, unit: 'g' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
      { name: 'scallion', quantity: 2, unit: 'piece' },
      { name: 'soy sauce', quantity: 30, unit: 'ml' },
      { name: 'eggs', quantity: 2, unit: 'piece', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Quick', 'Pantry Staple', '15-min'],
  },
  {
    id: 'off-003',
    title: 'Rustic Garden Minestrone',
    category: 'Soup',
    prepTimeMinutes: 30,
    servings: 4,
    instructions: [
      'In a heavy pot, sweat chopped onion and carrots in olive oil until soft.',
      'Add minced garlic, canned tomatoes, and water to bring to a simmer.',
      'Add chickpeas and diced zucchini.',
      'Simmer for 15 minutes until tender, season with salt and pepper, and serve warm.',
    ],
    ingredients: [
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'carrots', quantity: 2, unit: 'piece' },
      { name: 'canned tomatoes', quantity: 400, unit: 'g' },
      { name: 'chickpeas', quantity: 200, unit: 'g' },
      { name: 'zucchini', quantity: 1, unit: 'piece' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
    ],
    source: 'bundled_offline',
    tags: ['Comfort', 'Healthy', 'One-Pot'],
  },
  {
    id: 'off-004',
    title: 'Creamy Tomato & Basil Pasta Bake',
    category: 'Italian',
    prepTimeMinutes: 25,
    servings: 4,
    instructions: [
      'Boil pasta in salted water until al dente.',
      'In a saucepan, warm tomato puree with olive oil, minced garlic, and heavy cream.',
      'Toss drained pasta in the sauce, season with salt and fresh torn basil.',
      'Transfer to a baking dish, top with grated cheese, and bake at 200°C for 15 mins until bubbling.',
    ],
    ingredients: [
      { name: 'pasta', quantity: 300, unit: 'g' },
      { name: 'tomato puree', quantity: 300, unit: 'g' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
      { name: 'heavy cream', quantity: 100, unit: 'ml' },
      { name: 'cheese', quantity: 80, unit: 'g' },
      { name: 'basil', quantity: 1, unit: 'bunch', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Kid-Friendly', 'Comfort', 'Vegetarian'],
  },
  {
    id: 'off-005',
    title: 'Crispy Sheet-Pan Chicken & Roasted Veggies',
    category: 'Poultry',
    prepTimeMinutes: 35,
    servings: 4,
    instructions: [
      'Preheat oven to 210°C.',
      'Cut chicken breast, bell pepper, onion, and potatoes into bite-sized chunks.',
      'Toss everything on a baking sheet with olive oil, salt, and pepper.',
      'Roast for 25-30 minutes until chicken is cooked through and vegetables are caramelized.',
    ],
    ingredients: [
      { name: 'chicken breast', quantity: 500, unit: 'g' },
      { name: 'bell pepper', quantity: 2, unit: 'piece' },
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'potatoes', quantity: 3, unit: 'piece' },
    ],
    source: 'bundled_offline',
    tags: ['Easy Clean Up', 'High Protein', 'Gluten-Free'],
  },
  {
    id: 'off-006',
    title: 'Speedy Coconut Chickpea Curry',
    category: 'Curry',
    prepTimeMinutes: 20,
    servings: 3,
    instructions: [
      'Heat oil in a pan, cook chopped onion, garlic, and ginger until soft.',
      'Stir in curry powder for 1 minute until fragrant.',
      'Add canned coconut milk and drained chickpeas.',
      'Simmer for 10 minutes until thick and aromatic.',
      'Stir in fresh spinach and cilantro just before serving.',
    ],
    ingredients: [
      { name: 'chickpeas', quantity: 400, unit: 'g' },
      { name: 'coconut milk', quantity: 400, unit: 'ml' },
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'garlic', quantity: 3, unit: 'clove' },
      { name: 'ginger', quantity: 1, unit: 'piece' },
      { name: 'spinach', quantity: 100, unit: 'g', optional: true },
      { name: 'cilantro', quantity: 1, unit: 'bunch', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Vegan', 'Gluten-Free', 'Quick'],
  },
  {
    id: 'off-007',
    title: 'Smoky Shakshuka',
    category: 'Vegetarian',
    prepTimeMinutes: 20,
    servings: 2,
    instructions: [
      'Sauté diced onion and bell pepper in olive oil until soft.',
      'Add minced garlic and canned tomatoes. Simmer for 10 minutes.',
      'Make wells in the sauce and gently crack eggs into the indentations.',
      'Cover with a lid and cook gently for 5-8 minutes until egg whites are set and yolks are runny.',
      'Garnish with fresh cilantro and serve with warm bread.',
    ],
    ingredients: [
      { name: 'eggs', quantity: 4, unit: 'piece' },
      { name: 'canned tomatoes', quantity: 400, unit: 'g' },
      { name: 'bell pepper', quantity: 1, unit: 'piece' },
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
      { name: 'bread', quantity: 2, unit: 'slice', optional: true },
      { name: 'cilantro', quantity: 1, unit: 'bunch', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Brunch', 'One-Pan', 'Vegetarian'],
  },
  {
    id: 'off-008',
    title: 'Hearty Ground Beef & Veggie Chili',
    category: 'Beef',
    prepTimeMinutes: 35,
    servings: 4,
    instructions: [
      'Brown ground beef in a pot with diced onion and garlic; drain excess fat.',
      'Add diced bell pepper and canned tomatoes.',
      'Simmer on low for 25 minutes to develop rich flavours.',
      'Serve warm topped with yogurt.',
    ],
    ingredients: [
      { name: 'ground beef', quantity: 400, unit: 'g' },
      { name: 'canned tomatoes', quantity: 400, unit: 'g' },
      { name: 'onion', quantity: 1, unit: 'piece' },
      { name: 'bell pepper', quantity: 1, unit: 'piece' },
      { name: 'garlic', quantity: 2, unit: 'clove' },
      { name: 'yogurt', quantity: 50, unit: 'g', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['High Protein', 'Batch Cook', 'Freezer Friendly'],
  },
  {
    id: 'off-009',
    title: 'Crispy Sautéed Aubergine & Garlic Yogurt',
    category: 'Vegetarian',
    prepTimeMinutes: 18,
    servings: 2,
    instructions: [
      'Slice eggplant into 1cm rounds, sprinkle with salt and let rest 5 mins.',
      'Sear eggplant slices in hot olive oil until golden brown on both sides and silky in the middle.',
      'In a bowl, mix Greek yogurt with minced garlic and a pinch of salt.',
      'Spread the garlic yogurt on a platter, layer warm eggplant slices on top, and scatter cilantro.',
    ],
    ingredients: [
      { name: 'eggplant', quantity: 1, unit: 'piece' },
      { name: 'yogurt', quantity: 200, unit: 'g' },
      { name: 'garlic', quantity: 1, unit: 'clove' },
      { name: 'cilantro', quantity: 1, unit: 'bunch', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Mediterranean', 'Side Dish', 'Quick'],
  },
  {
    id: 'off-010',
    title: 'Banana & Oatmeal Rescue Pancakes',
    category: 'Breakfast',
    prepTimeMinutes: 15,
    servings: 2,
    instructions: [
      'Mash overripe bananas in a bowl with eggs and a splash of milk.',
      'Stir in flour and oats.',
      'Cook ladlefuls on a lightly buttered skillet over medium heat for 2-3 minutes per side.',
      'Serve warm.',
    ],
    ingredients: [
      { name: 'banana', quantity: 2, unit: 'piece' },
      { name: 'eggs', quantity: 2, unit: 'piece' },
      { name: 'flour', quantity: 100, unit: 'g' },
      { name: 'oats', quantity: 80, unit: 'g', optional: true },
      { name: 'milk', quantity: 50, unit: 'ml', optional: true },
    ],
    source: 'bundled_offline',
    tags: ['Sweet', 'Waste Rescue', 'Breakfast'],
  },
];
