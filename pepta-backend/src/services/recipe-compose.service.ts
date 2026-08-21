// The intelligence layer behind New recipe.
//
// A meal log asks "what is this, in total". A recipe asks "what is this MADE
// OF", because its totals are summed from the parts and the design invites the
// user to adjust the portions. One line saying "Breakfast, 40 g protein" is a
// recipe you cannot edit.
//
// So this takes what the user said — or what the scan identified — and returns
// the PARTS. "two eggs, oats and a scoop of whey" becomes three ingredients
// with their own numbers, which is what makes the saved recipe useful.
//
// EVERYTHING IS CLAMPED AND THE PROPOSAL IS NEVER SAVED HERE. The model is
// guessing at portions from a sentence; the user reviews it on screen before
// anything is written. Confidence rides along so the screen can say "check
// these" rather than implying precision the model does not have.

import OpenAI from "openai";
import { AppError } from "../lib/errors";
import { NUTRITION_BOUNDS, clampNumber, clampNutrition } from "../lib/nutritionBounds";
import type { RecipeComposeResponse } from "@pepta/shared";
import { env } from "../config/env";

export const RECIPE_COMPOSE_ENGINE_VERSION = "recipe-compose-v1";
const RECIPE_COMPOSE_MODEL = "gpt-4o-mini";
const RECIPE_COMPOSE_TIMEOUT_MS = 9_000;
const MAX_INGREDIENTS = 20;

/**
 * An actionable 503, like the sibling estimators. Raw Errors reach the user as
 * an unexposed 500 "Internal server error" — indistinguishable from an app
 * bug, with nothing telling them to just try again.
 */
function recipeComposeFailed(message: string, details?: unknown): AppError {
  return new AppError({
    code: "RECIPE_COMPOSE_FAILED",
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

// Confidence keeps a local clamp; the macro bounds are shared.
const clamp = clampNumber;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parses defensively: a model that returns one bad row must not cost the user
 * the whole recipe, so unusable ingredients are dropped and the rest kept.
 * Only an empty result is an error.
 */
export function parseRecipeComposeJson(
  content: string,
  fallbackName: string,
): RecipeComposeResponse {
  const parsed = JSON.parse(content) as Record<string, unknown>;

  const rawName = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];

  const ingredients = rawIngredients
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const protein = num(r.protein);
      const calories = num(r.calories);
      if (!name || protein === null || calories === null) return null;
      const amount = typeof r.amount === "string" ? r.amount.trim() : "";
      const fiber = num(r.fiber);
      return {
        name: name.slice(0, 120),
        amount: amount.slice(0, 60),
        protein: clampNutrition("protein", protein),
        calories: clampNutrition("calories", calories),
        ...(fiber !== null ? { fiber: clampNutrition("fiber", fiber) } : {}),
      };
    })
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .slice(0, MAX_INGREDIENTS);

  if (ingredients.length === 0) {
    throw recipeComposeFailed("Recipe compose JSON contained no usable ingredients");
  }

  // Each ingredient is bounded, but a recipe is the SUM of up to 20 of them —
  // so per-ingredient clamping alone allowed a proposal totalling thousands of
  // grams of protein. The user reviews this on screen and can save it as a
  // recipe they log repeatedly, so a proposal whose totals are not a plausible
  // meal is refused outright rather than shown as a credible suggestion.
  const totals = ingredients.reduce(
    (sum, item) => ({
      protein: sum.protein + item.protein,
      calories: sum.calories + item.calories,
    }),
    { protein: 0, calories: 0 },
  );
  if (
    totals.protein > NUTRITION_BOUNDS.protein.max ||
    totals.calories > NUTRITION_BOUNDS.calories.max
  ) {
    throw recipeComposeFailed(
      "Recipe compose returned implausible totals for a single meal",
    );
  }

  const confidence = num(parsed.confidence);

  return {
    name: (rawName || fallbackName || "New recipe").slice(0, 120),
    ingredients,
    // No stated confidence is not high confidence.
    confidence: confidence === null ? 0.5 : clamp(confidence, 0, 1),
  };
}

export async function composeRecipe(
  text: string,
  name?: string,
): Promise<RecipeComposeResponse> {
  if (!env.openai.apiKey) {
    throw recipeComposeFailed("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: RECIPE_COMPOSE_TIMEOUT_MS,
  });

  const completion = await openai.chat.completions.create({
    model: RECIPE_COMPOSE_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Break a described meal into its component ingredients so it can be saved as a reusable recipe. " +
          "Return JSON only: { name, ingredients: [{ name, amount, protein, calories, fiber }], confidence }. " +
          "Split the meal into the separate foods a person would shop for or measure — never return the whole meal as one ingredient unless it genuinely is one. " +
          "amount is the portion in ordinary words, e.g. '2 large', '1 scoop', '1/2 cup dry'. " +
          "Estimate conservatively per that amount. name is a short dish name a person would recognise. " +
          "confidence is 0 to 1 for how sure you are about the portions. Never include medical advice.",
      },
      {
        role: "user",
        content: name ? `${name}: ${text}` : text,
      },
    ],
    max_tokens: 700,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw recipeComposeFailed("OpenAI returned an empty recipe compose response");
  }

  return parseRecipeComposeJson(content, name ?? "");
}
