import type {
  MealProductCitation,
  MealProductScanMetadata,
  MealScanAnalysis,
} from "@pepta/shared";
import OpenAI from "openai";
import { env } from "../config/env";
import { NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { ProductNutritionCacheModel } from "../models";
import type { ProductScanClues } from "./product-scan-vision.service";

const LOOKUP_TIMEOUT_MS = 7_000;
const OPENAI_PRODUCT_TIMEOUT_MS = 12_000;
const OFF_FIELDS =
  "product_name,brands,nutriments,serving_size,serving_quantity,code,url";

type ProductSource = MealProductScanMetadata["source"];

export interface ProductNutritionResult {
  source: ProductSource;
  barcode?: string;
  brand?: string;
  productName?: string;
  citations: MealProductCitation[];
  analysis: MealScanAnalysis;
}

interface OpenFoodFactsPayload {
  status?: number;
  product?: {
    product_name?: unknown;
    brands?: unknown;
    serving_size?: unknown;
    code?: unknown;
    url?: unknown;
    nutriments?: Record<string, unknown>;
  };
  products?: Array<NonNullable<OpenFoodFactsPayload["product"]>>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function cleanString(value: unknown, maxLength = 180): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function cleanBarcode(value: unknown): string | undefined {
  const cleaned = cleanString(value, 40)?.replace(/\D/g, "");
  return cleaned && cleaned.length >= 6 && cleaned.length <= 20
    ? cleaned
    : undefined;
}

function num(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0
    ? number
    : null;
}

function pickNutriment(
  nutriments: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = num(nutriments[key]);
    if (value !== null) return value;
  }
  return null;
}

function sourceUrlForBarcode(barcode?: string): string {
  return barcode
    ? `https://world.openfoodfacts.org/product/${barcode}`
    : "https://world.openfoodfacts.org/";
}

function productCacheKey(input: {
  barcode?: string;
  brand?: string;
  productName?: string;
}): string | null {
  if (input.barcode) return `barcode:${input.barcode}`;
  const query = [input.brand, input.productName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return query.length >= 3 ? `query:${query}` : null;
}

function productNameWithBrand(brand?: string, productName?: string): string {
  return [brand, productName].filter(Boolean).join(" ").trim();
}

function parseOpenFoodFactsProduct(
  product: OpenFoodFactsPayload["product"],
): ProductNutritionResult | null {
  if (!product) return null;

  const brand = cleanString(product.brands)?.split(",")[0]?.trim();
  const productName = cleanString(product.product_name);
  const name = productNameWithBrand(brand, productName);
  if (!name) return null;

  const nutriments = product.nutriments ?? {};
  const protein = pickNutriment(nutriments, [
    "proteins_serving",
    "proteins_100g",
    "proteins_value",
    "proteins",
  ]);
  const calories = pickNutriment(nutriments, [
    "energy-kcal_serving",
    "energy-kcal_100g",
    "energy-kcal_value",
    "energy-kcal",
  ]);
  const carbs =
    pickNutriment(nutriments, [
      "carbohydrates_serving",
      "carbohydrates_100g",
      "carbohydrates_value",
      "carbohydrates",
    ]) ?? 0;
  const fat =
    pickNutriment(nutriments, [
      "fat_serving",
      "fat_100g",
      "fat_value",
      "fat",
    ]) ?? 0;
  const fiber =
    pickNutriment(nutriments, [
      "fiber_serving",
      "fiber_100g",
      "fiber_value",
      "fiber",
    ]) ?? 0;

  if ((protein ?? 0) <= 0 && (calories ?? 0) <= 0) return null;

  const usedServing =
    num(nutriments.proteins_serving) !== null ||
    num(nutriments["energy-kcal_serving"]) !== null;
  const barcode = cleanBarcode(product.code);
  const sourceUrl = cleanString(product.url, 500) ?? sourceUrlForBarcode(barcode);

  return {
    source: "open_food_facts",
    ...(barcode ? { barcode } : {}),
    ...(brand ? { brand } : {}),
    ...(productName ? { productName } : {}),
    citations: [
      {
        title: `${name} nutrition facts`,
        url: sourceUrl,
      },
    ],
    analysis: {
      foodName: name.slice(0, 120),
      servingSize:
        (usedServing && cleanString(product.serving_size, 80)) || "100 g",
      protein: roundOne(protein ?? 0),
      calories: roundOne(calories ?? 0),
      carbs: roundOne(carbs),
      fat: roundOne(fat),
      fiber: roundOne(fiber),
      confidence: usedServing ? 0.88 : 0.7,
    },
  };
}

function parseOpenFoodFactsPayload(
  payload: OpenFoodFactsPayload | null | undefined,
): ProductNutritionResult | null {
  if (!payload) return null;
  if (payload.product && payload.status === 1) {
    return parseOpenFoodFactsProduct(payload.product);
  }

  for (const product of payload.products ?? []) {
    const parsed = parseOpenFoodFactsProduct(product);
    if (parsed) return parsed;
  }

  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": env.openFoodFacts.userAgent,
      },
    });
    if (!response.ok) {
      if (response.status !== 404) {
        logger.warn({ status: response.status, url }, "[product] lookup failed");
      }
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    logger.warn({ error, url }, "[product] lookup request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function withSource(
  result: ProductNutritionResult,
  source: ProductSource,
): ProductNutritionResult {
  return { ...result, source };
}

async function readCache(
  cacheKey: string | null,
): Promise<ProductNutritionResult | null> {
  if (!cacheKey) return null;
  try {
    const hit = await ProductNutritionCacheModel.findOne({ cacheKey }).lean();
    if (!hit) return null;
    return {
      source: "cache",
      ...(hit.barcode ? { barcode: hit.barcode } : {}),
      ...(hit.brand ? { brand: hit.brand } : {}),
      ...(hit.productName ? { productName: hit.productName } : {}),
      citations: hit.citations ?? [],
      analysis: hit.analysis,
    };
  } catch (error) {
    logger.warn({ error, cacheKey }, "[product] cache read failed");
    return null;
  }
}

async function writeCache(
  cacheKey: string | null,
  result: ProductNutritionResult,
): Promise<ProductNutritionResult> {
  if (!cacheKey) return result;
  try {
    await ProductNutritionCacheModel.updateOne(
      { cacheKey },
      {
        $set: {
          cacheKey,
          source: result.source,
          barcode: result.barcode,
          brand: result.brand,
          productName: result.productName,
          analysis: result.analysis,
          citations: result.citations,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logger.warn({ error, cacheKey }, "[product] cache write failed");
  }
  return result;
}

async function lookupOpenFoodFactsBarcode(
  barcode: string,
): Promise<ProductNutritionResult | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
  const payload = await fetchJson<OpenFoodFactsPayload>(url);
  const result = parseOpenFoodFactsPayload(payload);
  return result ? { ...result, barcode: result.barcode ?? barcode } : null;
}

async function lookupOpenFoodFactsQuery(
  query: string,
): Promise<ProductNutritionResult | null> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=${OFF_FIELDS}`;
  return parseOpenFoodFactsPayload(await fetchJson<OpenFoodFactsPayload>(url));
}

function parseOpenAIProductJson(
  content: string,
): ProductNutritionResult | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const brand = cleanString(parsed.brand);
    const productName = cleanString(parsed.productName);
    const foodName =
      cleanString(parsed.foodName, 120) ??
      productNameWithBrand(brand, productName).slice(0, 120);
    const servingSize = cleanString(parsed.servingSize, 80);
    const protein = num(parsed.protein);
    const calories = num(parsed.calories);
    const carbs = num(parsed.carbs) ?? 0;
    const fat = num(parsed.fat) ?? 0;
    const fiber = num(parsed.fiber) ?? 0;
    const confidence = num(parsed.confidence);
    const citations = Array.isArray(parsed.citations)
      ? parsed.citations
          .map((citation) => {
            if (!citation || typeof citation !== "object") return null;
            const value = citation as Record<string, unknown>;
            const title = cleanString(value.title, 160);
            const url = cleanString(value.url, 500);
            return title && url ? { title, url } : null;
          })
          .filter((citation): citation is MealProductCitation =>
            Boolean(citation),
          )
      : [];

    if (!foodName || !servingSize || protein === null || calories === null) {
      return null;
    }

    return {
      source: "openai_web_search",
      ...(cleanBarcode(parsed.barcode) ? { barcode: cleanBarcode(parsed.barcode) } : {}),
      ...(brand ? { brand } : {}),
      ...(productName ? { productName } : {}),
      citations,
      analysis: {
        foodName,
        servingSize,
        protein: roundOne(protein),
        calories: roundOne(calories),
        carbs: roundOne(carbs),
        fat: roundOne(fat),
        fiber: roundOne(fiber),
        confidence: clamp(confidence ?? 0.62, 0, 1),
      },
    };
  } catch {
    return null;
  }
}

async function searchOpenAIProduct(
  clues: ProductScanClues,
): Promise<ProductNutritionResult | null> {
  if (!env.openai.apiKey) return null;
  const query = [
    clues.brand,
    clues.productName,
    clues.flavor,
    clues.barcodeText ? `UPC ${clues.barcodeText}` : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!query) return null;

  const client = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: OPENAI_PRODUCT_TIMEOUT_MS,
  });

  try {
    const response = await client.responses.create({
      model: env.openai.productSearchModel,
      tools: [{ type: "web_search" }],
      input: [
        "Find nutrition facts for this packaged food.",
        "Return JSON only with brand, productName, barcode, servingSize, protein, calories, carbs, fat, fiber, confidence, citations.",
        "Use cited sources and be conservative. If nutrition facts disagree, prefer the product brand or official nutrition panel.",
        JSON.stringify({
          query,
          visibleLabelText: clues.visibleLabelText,
          servingText: clues.servingText,
          nutritionPanelText: clues.nutritionPanelText,
        }),
      ].join("\n"),
      max_output_tokens: 650,
      store: false,
    });

    return parseOpenAIProductJson(response.output_text ?? "");
  } catch (error) {
    logger.warn({ error, query }, "[product] OpenAI web lookup failed");
    return null;
  }
}

export async function resolveProductNutrition(
  clues: ProductScanClues,
): Promise<ProductNutritionResult> {
  const barcode = cleanBarcode(clues.barcodeText);
  const cacheKey = productCacheKey({
    barcode,
    brand: clues.brand,
    productName: clues.productName,
  });
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  if (barcode) {
    const offBarcode = await lookupOpenFoodFactsBarcode(barcode);
    if (offBarcode) {
      return writeCache(cacheKey, offBarcode);
    }
  }

  const query = productNameWithBrand(clues.brand, clues.productName);
  if (query) {
    const offQuery = await lookupOpenFoodFactsQuery(query);
    if (offQuery) {
      return writeCache(cacheKey, offQuery);
    }
  }

  const openAiResult = await searchOpenAIProduct(clues);
  if (openAiResult) {
    const enriched = {
      ...openAiResult,
      ...(barcode && !openAiResult.barcode ? { barcode } : {}),
      ...(clues.brand && !openAiResult.brand ? { brand: clues.brand } : {}),
      ...(clues.productName && !openAiResult.productName
        ? { productName: clues.productName }
        : {}),
    };
    return writeCache(cacheKey, enriched);
  }

  throw new NotFoundError(
    "We couldn't find reliable nutrition facts for that product. Try the barcode, search, or manual entry.",
  );
}

export async function lookupBarcodeNutrition(
  barcode: string,
): Promise<ProductNutritionResult> {
  return resolveProductNutrition({ barcodeText: barcode, confidence: 1 });
}

export const productNutritionServiceInternals = {
  parseOpenFoodFactsPayload,
  parseOpenAIProductJson,
  withSource,
};
