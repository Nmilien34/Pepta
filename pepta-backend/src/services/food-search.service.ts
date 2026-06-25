import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

const FOOD_SEARCH_MODEL = "gpt-4o-mini";
const FOOD_SEARCH_TIMEOUT_MS = 7_000;
const MAX_SEARCH_RESULTS = 6;

export interface FoodSearchResult {
  foodName: string;
  servingSize: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
}

const rawFoodSearchResultSchema = z
  .object({
    foodName: z.string(),
    servingSize: z.string(),
    protein: z.coerce.number(),
    calories: z.coerce.number(),
    carbs: z.coerce.number().optional(),
    fat: z.coerce.number().optional(),
    fiber: z.coerce.number().optional(),
  })
  .passthrough();

const rawFoodSearchResponseSchema = z
  .object({
    results: z.array(rawFoodSearchResultSchema),
  })
  .passthrough();

const FOOD_SEARCH_SYSTEM_PROMPT = `
You are Pepta's food search nutrition helper for a GLP-1 tracker.

Given a user's short food search query, return common matching foods with conservative nutrition estimates for one normal serving.
Prioritize foods that someone would naturally mean by the query, including restaurant-style dishes, cultural foods, brand names, slang, and misspellings.
Protein accuracy matters most. Calories and macros should be plausible rounded estimates, not medical advice.

Return 3 to 6 useful matches when possible. Do not include non-food items. Do not invent exact brand database claims.

Return JSON only:
{
  "results": [
    {
      "foodName": string,
      "servingSize": string,
      "protein": number,
      "calories": number,
      "carbs": number,
      "fat": number,
      "fiber": number
    }
  ]
}
`.trim();

function searchUnavailable(message: string, details?: unknown): AppError {
  return new AppError({
    code: "MEAL_FOOD_SEARCH_FAILED",
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOrZero(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

function sanitizeResult(
  raw: z.infer<typeof rawFoodSearchResultSchema>,
): FoodSearchResult | null {
  const foodName = raw.foodName.trim().slice(0, 120);
  const servingSize = raw.servingSize.trim().slice(0, 80);

  if (!foodName || !servingSize) {
    return null;
  }

  if (!isFiniteNumber(raw.protein) || !isFiniteNumber(raw.calories)) {
    return null;
  }

  const carbs = finiteOrZero(raw.carbs);
  const fat = finiteOrZero(raw.fat);
  const fiber = finiteOrZero(raw.fiber);

  return {
    foodName,
    servingSize,
    protein: roundOne(clamp(raw.protein, 0, 300)),
    calories: roundOne(clamp(raw.calories, 0, 3000)),
    carbs: roundOne(clamp(carbs, 0, 500)),
    fat: roundOne(clamp(fat, 0, 250)),
    fiber: roundOne(clamp(fiber, 0, 100)),
  };
}

function parseFoodSearchJson(content: string): FoodSearchResponse {
  const parsed = rawFoodSearchResponseSchema.parse(JSON.parse(content));
  const seen = new Set<string>();
  const results: FoodSearchResult[] = [];

  for (const rawResult of parsed.results) {
    const result = sanitizeResult(rawResult);
    if (!result) {
      continue;
    }

    const key = `${result.foodName.toLowerCase()}|${result.servingSize.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(result);

    if (results.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return { results };
}

export async function searchFoods(query: string): Promise<FoodSearchResponse> {
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length < 2) {
    return { results: [] };
  }

  if (!env.openai.apiKey) {
    throw searchUnavailable("OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: FOOD_SEARCH_TIMEOUT_MS,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: FOOD_SEARCH_MODEL,
      messages: [
        {
          role: "system",
          content: FOOD_SEARCH_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: normalizedQuery,
        },
      ],
      max_tokens: 650,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw searchUnavailable("OpenAI returned an empty food search response");
    }

    return parseFoodSearchJson(content);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw searchUnavailable("Food search is temporarily unavailable", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
