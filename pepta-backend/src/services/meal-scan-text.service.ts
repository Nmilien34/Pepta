import OpenAI from "openai";
import { clampNutrition } from "../lib/nutritionBounds";
import type { MealScanAnalysis } from "@pepta/shared";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

export const MEAL_SCAN_TEXT_ENGINE_VERSION = "meal-scan-text-v1";
const MEAL_SCAN_TEXT_MODEL = "gpt-4o-mini";
const MEAL_SCAN_TEXT_TIMEOUT_MS = 7_000;

/**
 * Same shape the vision path uses: a 503 the client can act on, not a bare
 * Error that reaches the user as an unexposed 500 "Internal server error"
 * indistinguishable from an app bug.
 */
function mealScanTextFailed(message: string, details?: unknown): AppError {
  return new AppError({
    code: "MEAL_SCAN_TEXT_FAILED",
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseMealTextJson(content: string): MealScanAnalysis {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const foodName =
    typeof parsed.foodName === "string" ? parsed.foodName.trim() : "";
  const servingSize =
    typeof parsed.servingSize === "string" ? parsed.servingSize.trim() : "";
  const protein = optionalNumber(parsed.protein);
  const calories = optionalNumber(parsed.calories);
  const carbs = optionalNumber(parsed.carbs);
  const fat = optionalNumber(parsed.fat);
  const fiber = optionalNumber(parsed.fiber) ?? 0;
  const confidence = optionalNumber(parsed.confidence);

  if (
    !foodName ||
    !servingSize ||
    protein === null ||
    calories === null ||
    carbs === null ||
    fat === null ||
    confidence === null
  ) {
    throw mealScanTextFailed(
      "Meal text JSON did not include expected nutrition fields",
    );
  }

  return {
    foodName: foodName.slice(0, 120),
    servingSize: servingSize.slice(0, 80),
    protein: clampNutrition("protein", protein),
    calories: clampNutrition("calories", calories),
    carbs: clampNutrition("carbs", carbs),
    fat: clampNutrition("fat", fat),
    fiber: clampNutrition("fiber", fiber),
    confidence: clampNutrition("confidence", confidence),
  };
}

export async function generateMealTextAnalysis(
  text: string,
): Promise<MealScanAnalysis> {
  if (!env.openai.apiKey) {
    throw mealScanTextFailed("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: MEAL_SCAN_TEXT_TIMEOUT_MS,
  });

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: MEAL_SCAN_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Parse a spoken or typed meal into conservative nutrition estimates. Return JSON only with foodName, servingSize, protein, calories, carbs, fat, fiber, confidence. Never include medical advice.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 320,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mealScanTextFailed("OpenAI meal text request failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw mealScanTextFailed("OpenAI returned an empty meal text response");
  }

  try {
    return parseMealTextJson(content);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mealScanTextFailed("OpenAI returned malformed meal text JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
