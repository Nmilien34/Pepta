import OpenAI from "openai";
import type { MealScanAnalysis } from "@pepta/shared";
import { env } from "../config/env";

export const MEAL_SCAN_TEXT_ENGINE_VERSION = "meal-scan-text-v1";
const MEAL_SCAN_TEXT_MODEL = "gpt-4o-mini";
const MEAL_SCAN_TEXT_TIMEOUT_MS = 7_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    throw new Error("Meal text JSON did not include expected nutrition fields");
  }

  return {
    foodName: foodName.slice(0, 120),
    servingSize: servingSize.slice(0, 80),
    protein: clamp(protein, 0, 300),
    calories: clamp(calories, 0, 3000),
    carbs: clamp(carbs, 0, 500),
    fat: clamp(fat, 0, 250),
    fiber: clamp(fiber, 0, 100),
    confidence: clamp(confidence, 0, 1),
  };
}

export async function generateMealTextAnalysis(
  text: string,
): Promise<MealScanAnalysis> {
  if (!env.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: MEAL_SCAN_TEXT_TIMEOUT_MS,
  });

  const completion = await openai.chat.completions.create({
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

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty meal text response");
  }

  return parseMealTextJson(content);
}
