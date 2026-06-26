import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

const FOOD_SEARCH_MODEL = "gpt-4o-mini";
const FOOD_SEARCH_TIMEOUT_MS = 7_000;
const MAX_SEARCH_RESULTS = 6;
const FOOD_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const FOOD_SEARCH_CACHE_MAX_ENTRIES = 200;
const LOCAL_FAST_MATCH_SCORE = 100;
const LOCAL_SHORT_TYPO_FAST_MATCH_SCORE = 68;

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

interface LocalFoodSearchResult extends FoodSearchResult {
  aliases?: string[];
}

interface ScoredLocalFoodSearchResult {
  result: FoodSearchResult;
  score: number;
}

interface CachedFoodSearchResults {
  expiresAt: number;
  results: FoodSearchResult[];
}

const aiFoodSearchCache = new Map<string, CachedFoodSearchResults>();

const LOCAL_FOOD_SEARCH_RESULTS: LocalFoodSearchResult[] = [
  {
    foodName: "Pizza",
    servingSize: "2 slices",
    protein: 22,
    calories: 560,
    carbs: 62,
    fat: 22,
    fiber: 3,
    aliases: ["pepperoni pizza", "cheese pizza", "slice pizza"],
  },
  {
    foodName: "Grilled chicken breast",
    servingSize: "6 oz",
    protein: 52,
    calories: 280,
    carbs: 0,
    fat: 6,
    fiber: 0,
    aliases: ["chicken", "chicken breast"],
  },
  {
    foodName: "Chicken Caesar salad",
    servingSize: "1 bowl",
    protein: 35,
    calories: 470,
    carbs: 18,
    fat: 28,
    fiber: 4,
    aliases: ["caesar salad", "chicken salad"],
  },
  {
    foodName: "Chicken and rice bowl",
    servingSize: "1 bowl",
    protein: 45,
    calories: 550,
    carbs: 64,
    fat: 12,
    fiber: 3,
    aliases: ["chicken rice", "rice bowl"],
  },
  {
    foodName: "Greek yogurt",
    servingSize: "1 cup",
    protein: 20,
    calories: 130,
    carbs: 9,
    fat: 0,
    fiber: 0,
    aliases: ["yogurt", "yoghurt"],
  },
  {
    foodName: "Scrambled eggs",
    servingSize: "2 large",
    protein: 12,
    calories: 180,
    carbs: 2,
    fat: 14,
    fiber: 0,
    aliases: ["eggs", "egg"],
  },
  {
    foodName: "Protein shake",
    servingSize: "1 scoop + water",
    protein: 25,
    calories: 150,
    carbs: 4,
    fat: 2,
    fiber: 0,
    aliases: ["protein smoothie", "whey shake"],
  },
  {
    foodName: "Burger",
    servingSize: "1 burger",
    protein: 28,
    calories: 540,
    carbs: 40,
    fat: 28,
    fiber: 2,
    aliases: ["hamburger", "cheeseburger"],
  },
  {
    foodName: "Turkey sandwich",
    servingSize: "1 sandwich",
    protein: 25,
    calories: 350,
    carbs: 38,
    fat: 9,
    fiber: 3,
    aliases: ["turkey sub", "turkey wrap"],
  },
  {
    foodName: "Salmon with vegetables",
    servingSize: "6 oz fillet",
    protein: 38,
    calories: 450,
    carbs: 18,
    fat: 25,
    fiber: 4,
    aliases: ["salmon", "fish"],
  },
  {
    foodName: "Steak",
    servingSize: "8 oz",
    protein: 56,
    calories: 480,
    carbs: 0,
    fat: 28,
    fiber: 0,
    aliases: ["sirloin", "ribeye"],
  },
  {
    foodName: "Oatmeal",
    servingSize: "1 bowl",
    protein: 6,
    calories: 160,
    carbs: 28,
    fat: 3,
    fiber: 4,
    aliases: ["oats", "porridge"],
  },
  {
    foodName: "Avocado toast",
    servingSize: "1 slice",
    protein: 8,
    calories: 290,
    carbs: 30,
    fat: 16,
    fiber: 7,
  },
  {
    foodName: "Tacos",
    servingSize: "2 tacos",
    protein: 24,
    calories: 420,
    carbs: 38,
    fat: 18,
    fiber: 4,
  },
  {
    foodName: "Burrito bowl",
    servingSize: "1 bowl",
    protein: 32,
    calories: 650,
    carbs: 72,
    fat: 24,
    fiber: 10,
    aliases: ["chipotle bowl"],
  },
  {
    foodName: "Spaghetti and meatballs",
    servingSize: "1 plate",
    protein: 28,
    calories: 620,
    carbs: 78,
    fat: 22,
    fiber: 5,
    aliases: ["pasta", "meatball pasta"],
  },
  {
    foodName: "Sushi roll",
    servingSize: "8 pieces",
    protein: 18,
    calories: 350,
    carbs: 54,
    fat: 8,
    fiber: 2,
    aliases: ["sushi"],
  },
  {
    foodName: "Chicken noodle soup",
    servingSize: "1 bowl",
    protein: 12,
    calories: 220,
    carbs: 26,
    fat: 7,
    fiber: 2,
    aliases: ["soup"],
  },
  {
    foodName: "Protein bar",
    servingSize: "1 bar",
    protein: 20,
    calories: 200,
    carbs: 22,
    fat: 7,
    fiber: 3,
  },
  {
    foodName: "Banana",
    servingSize: "1 medium",
    protein: 1,
    calories: 105,
    carbs: 27,
    fat: 0,
    fiber: 3,
  },
];

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

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      const deletion = (current[j - 1] ?? 0) + 1;
      const insertion = (previous[j] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + substitutionCost;

      current[j] = Math.min(
        deletion,
        insertion,
        substitution,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

function typoThreshold(query: string): number {
  if (query.length < 4) {
    return 0;
  }

  if (query.length <= 5) {
    return 1;
  }

  return 2;
}

function scoreCandidate(query: string, candidate: string): number {
  if (!query || !candidate) {
    return 0;
  }

  const words = candidate.split(" ");

  if (candidate === query) {
    return 120;
  }

  if (candidate.startsWith(query)) {
    return 110;
  }

  if (words.some((word) => word.startsWith(query))) {
    return 100;
  }

  if (candidate.includes(query)) {
    return 85;
  }

  const threshold = typoThreshold(query);
  if (threshold === 0) {
    return 0;
  }

  const queryParts = query.split(" ");
  const candidateParts = candidate.split(" ");

  const fullDistance = levenshteinDistance(query, candidate);
  if (fullDistance <= threshold) {
    return 75 - fullDistance;
  }

  if (queryParts.length === 1) {
    const bestWordDistance = Math.min(
      ...candidateParts.map((word) => levenshteinDistance(query, word)),
    );

    if (bestWordDistance <= threshold) {
      return 70 - bestWordDistance;
    }
  }

  return 0;
}

function toFoodSearchResult(food: LocalFoodSearchResult): FoodSearchResult {
  return {
    foodName: food.foodName,
    servingSize: food.servingSize,
    protein: food.protein,
    calories: food.calories,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
  };
}

function scoredLocalFoodSearch(query: string): ScoredLocalFoodSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  return LOCAL_FOOD_SEARCH_RESULTS.map((food) => {
    const candidates = [food.foodName, ...(food.aliases ?? [])].map(
      normalizeSearchText,
    );
    const score = Math.max(
      ...candidates.map((candidate) => scoreCandidate(normalizedQuery, candidate)),
    );

    return { result: toFoodSearchResult(food), score };
  })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.result.foodName.localeCompare(b.result.foodName),
    )
    .slice(0, MAX_SEARCH_RESULTS);
}

function shouldUseLocalFastPath(
  normalizedSearchQuery: string,
  localResults: ScoredLocalFoodSearchResult[],
): boolean {
  const bestScore = localResults[0]?.score ?? 0;

  return (
    bestScore >= LOCAL_FAST_MATCH_SCORE ||
    (normalizedSearchQuery.length <= 6 &&
      bestScore >= LOCAL_SHORT_TYPO_FAST_MATCH_SCORE)
  );
}

function getCachedAiFoodSearchResults(
  cacheKey: string,
): FoodSearchResult[] | null {
  const cached = aiFoodSearchCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    aiFoodSearchCache.delete(cacheKey);
    return null;
  }

  return cached.results;
}

function cacheAiFoodSearchResults(
  cacheKey: string,
  results: FoodSearchResult[],
): void {
  aiFoodSearchCache.delete(cacheKey);
  aiFoodSearchCache.set(cacheKey, {
    expiresAt: Date.now() + FOOD_SEARCH_CACHE_TTL_MS,
    results,
  });

  while (aiFoodSearchCache.size > FOOD_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = aiFoodSearchCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    aiFoodSearchCache.delete(oldestKey);
  }
}

export function clearFoodSearchCacheForTests(): void {
  aiFoodSearchCache.clear();
}

function mergeSearchResults(
  primary: FoodSearchResult[],
  secondary: FoodSearchResult[],
): FoodSearchResult[] {
  const seen = new Set<string>();
  const merged: FoodSearchResult[] = [];

  for (const result of [...primary, ...secondary]) {
    const key = `${result.foodName.toLowerCase()}|${result.servingSize.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(result);

    if (merged.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return merged;
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
  const normalizedSearchQuery = normalizeSearchText(normalizedQuery);

  if (normalizedSearchQuery.length < 2) {
    return { results: [] };
  }

  const scoredLocalResults = scoredLocalFoodSearch(normalizedQuery);
  const localResults = scoredLocalResults.map(({ result }) => result);

  if (shouldUseLocalFastPath(normalizedSearchQuery, scoredLocalResults)) {
    return { results: localResults };
  }

  if (!env.openai.apiKey) {
    if (localResults.length > 0) {
      return { results: localResults };
    }

    throw searchUnavailable("OPENAI_API_KEY is not configured");
  }

  const cachedAiResults = getCachedAiFoodSearchResults(normalizedSearchQuery);
  if (cachedAiResults) {
    return { results: mergeSearchResults(localResults, cachedAiResults) };
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

    const aiResults = parseFoodSearchJson(content).results;
    cacheAiFoodSearchResults(normalizedSearchQuery, aiResults);
    return { results: mergeSearchResults(localResults, aiResults) };
  } catch (error) {
    if (error instanceof AppError) {
      if (localResults.length > 0) {
        return { results: localResults };
      }

      throw error;
    }

    if (localResults.length > 0) {
      return { results: localResults };
    }

    throw searchUnavailable("Food search is temporarily unavailable", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
