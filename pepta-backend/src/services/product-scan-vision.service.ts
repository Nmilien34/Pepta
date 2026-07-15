import type { MealProductScanInput } from "@pepta/shared";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

export const PRODUCT_SCAN_VISION_ENGINE_VERSION = "product-scan-v1";

const TOGETHER_CHAT_COMPLETIONS_URL =
  "https://api.together.ai/v1/chat/completions";
const PRODUCT_SCAN_TIMEOUT_MS = 15_000;
const PRODUCT_SCAN_MAX_TOKENS = 450;

export interface ProductScanClues {
  brand?: string;
  productName?: string;
  flavor?: string;
  visibleLabelText?: string;
  servingText?: string;
  nutritionPanelText?: string;
  barcodeText?: string;
  confidence: number;
}

const PRODUCT_SCAN_SYSTEM_PROMPT = `
You read packaged-food photos for Pepta, a GLP-1 tracker.

Extract only visible product clues. Return JSON only:
{
  "brand": string optional,
  "productName": string optional,
  "flavor": string optional,
  "visibleLabelText": string optional,
  "servingText": string optional,
  "nutritionPanelText": string optional,
  "barcodeText": string optional,
  "confidence": number between 0 and 1
}

Do not estimate nutrition from memory here. Do not add health advice.
`.trim();

function productVisionFailed(message: string, details?: unknown): AppError {
  return new AppError({
    code: "PRODUCT_SCAN_VISION_FAILED",
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

function cleanString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanBarcode(value: unknown): string | undefined {
  const cleaned = cleanString(value, 40)?.replace(/\D/g, "");
  return cleaned && cleaned.length >= 6 && cleaned.length <= 20
    ? cleaned
    : undefined;
}

export function parseProductCluesJson(content: string): ProductScanClues {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? clamp(parsed.confidence, 0, 1)
        : 0.45;

    return {
      ...(cleanString(parsed.brand, 120)
        ? { brand: cleanString(parsed.brand, 120) }
        : {}),
      ...(cleanString(parsed.productName, 160)
        ? { productName: cleanString(parsed.productName, 160) }
        : {}),
      ...(cleanString(parsed.flavor, 80)
        ? { flavor: cleanString(parsed.flavor, 80) }
        : {}),
      ...(cleanString(parsed.visibleLabelText, 1000)
        ? { visibleLabelText: cleanString(parsed.visibleLabelText, 1000) }
        : {}),
      ...(cleanString(parsed.servingText, 160)
        ? { servingText: cleanString(parsed.servingText, 160) }
        : {}),
      ...(cleanString(parsed.nutritionPanelText, 1000)
        ? { nutritionPanelText: cleanString(parsed.nutritionPanelText, 1000) }
        : {}),
      ...(cleanBarcode(parsed.barcodeText)
        ? { barcodeText: cleanBarcode(parsed.barcodeText) }
        : {}),
      confidence,
    };
  } catch (error) {
    throw productVisionFailed("Together returned malformed product JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function generateProductCluesFromImage(
  imageData: string,
  imageMimeType: MealProductScanInput["imageMimeType"],
): Promise<ProductScanClues> {
  if (!env.together.apiKey) {
    throw productVisionFailed("TOGETHER_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRODUCT_SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(TOGETHER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.together.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.together.visionModel,
        reasoning: { enabled: false },
        response_format: { type: "json_object" },
        max_tokens: PRODUCT_SCAN_MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: PRODUCT_SCAN_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read this packaged-food label and return product clues as JSON only.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageMimeType};base64,${imageData}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw productVisionFailed(
        `Together product scan returned ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw productVisionFailed("Together returned an empty product response");
    }

    return parseProductCluesJson(content.trim());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw productVisionFailed("Together product scan request failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}
