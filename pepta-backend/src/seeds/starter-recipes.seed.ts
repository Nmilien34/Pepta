// The starters. High-protein and quick, per the design.
//
// EVERY INGREDIENT CARRIES ITS OWN NUMBERS and the totals the screen shows are
// the sum. That is what makes adjusting a portion change the figure the user
// acts on, and it is why nothing here stores a total.
//
// Figures are per the stated amount, rounded the way a label rounds. They are
// reference values for a familiar combination, not a nutrition database — the
// screen tells the user to open one and adjust it.
//
// Upserted on starterKey, so re-running corrects a starter rather than
// duplicating it, and a user who saved a copy keeps their copy untouched.

import { RecipeModel } from "../models/recipe.model";

export interface StarterRecipeSeed {
  starterKey: string;
  name: string;
  ingredients: {
    name: string;
    amount: string;
    protein: number;
    calories: number;
    fiber?: number;
  }[];
}

export const STARTER_RECIPES: readonly StarterRecipeSeed[] = [
  {
    starterKey: "three-egg-omelette",
    name: "Three-egg omelette",
    ingredients: [
      { name: "Eggs", amount: "3 large", protein: 18, calories: 216 },
      { name: "Cheddar", amount: "1 oz", protein: 7, calories: 104 },
    ],
  },
  {
    starterKey: "overnight-oats-whey",
    name: "Overnight oats + whey",
    ingredients: [
      { name: "Rolled oats", amount: "1/2 cup dry", protein: 5, calories: 150, fiber: 4 },
      { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
      { name: "Whey protein", amount: "1 scoop", protein: 24, calories: 120 },
      { name: "Chia seeds", amount: "1 tbsp", protein: 3, calories: 67, fiber: 5 },
    ],
  },
  {
    starterKey: "tuna-salad",
    name: "Tuna salad",
    ingredients: [
      { name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 },
      { name: "Light mayo", amount: "1 tbsp", protein: 0, calories: 45 },
      { name: "Celery", amount: "1/2 cup", protein: 0, calories: 10, fiber: 1 },
    ],
  },
  {
    starterKey: "cottage-cheese-bowl",
    name: "Cottage cheese bowl",
    ingredients: [
      { name: "Cottage cheese", amount: "1 cup, low-fat", protein: 28, calories: 163 },
      { name: "Pineapple", amount: "1/2 cup", protein: 0, calories: 40, fiber: 1 },
      { name: "Almonds", amount: "10", protein: 2, calories: 47, fiber: 1 },
    ],
  },
  {
    starterKey: "salmon-greens",
    name: "Salmon & greens",
    ingredients: [
      { name: "Salmon", amount: "6 oz fillet", protein: 40, calories: 350 },
      { name: "Spinach", amount: "2 cups", protein: 0, calories: 20, fiber: 1 },
      { name: "Olive oil", amount: "1 tsp", protein: 0, calories: 40 },
    ],
  },
  {
    starterKey: "turkey-roll-ups",
    name: "Turkey roll-ups",
    ingredients: [
      { name: "Deli turkey", amount: "4 oz", protein: 24, calories: 120 },
      { name: "Cheese", amount: "2 slices", protein: 12, calories: 200 },
    ],
  },
];

export async function seedStarterRecipes(): Promise<void> {
  await Promise.all(
    STARTER_RECIPES.map((recipe) =>
      RecipeModel.updateOne(
        { starterKey: recipe.starterKey },
        { $set: { ...recipe, userId: null } },
        { upsert: true },
      ),
    ),
  );
}
