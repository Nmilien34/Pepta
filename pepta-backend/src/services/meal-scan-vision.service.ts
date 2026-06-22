import type { MealScanAnalysis, MealScanInput } from '@pepta/shared';
import OpenAI from 'openai';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export const MEAL_SCAN_VISION_ENGINE_VERSION = 'meal-scan-vision-v1';
const MEAL_SCAN_VISION_MODEL = 'gpt-4o-mini';
const MEAL_SCAN_VISION_TIMEOUT_MS = 15_000;
const MEAL_SCAN_VISION_MAX_TOKENS = 450;

const MEAL_SCAN_VISION_SYSTEM_PROMPT = `
You analyze meal photos for Pepta, a GLP-1 nutrition and muscle-retention app.

Return JSON only. Estimate ONE meal from the visible food. Be conservative and honest.
Do not invent brand-specific certainty. If the image is unclear, use lower confidence.

Required JSON shape:
{
  "foodName": string,
  "servingSize": string,
  "protein": number,
  "calories": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "confidence": number between 0 and 1
}
`.trim();

function mealScanVisionFailed(message: string, details?: unknown): AppError {
  return new AppError({
    code: 'MEAL_SCAN_VISION_FAILED',
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function confidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

export function parseMealScanVisionJson(content: string): MealScanAnalysis {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const foodName = typeof parsed.foodName === 'string' ? parsed.foodName.trim() : '';
    const servingSize = typeof parsed.servingSize === 'string' ? parsed.servingSize.trim() : '';
    const protein = nonNegativeNumber(parsed.protein);
    const calories = nonNegativeNumber(parsed.calories);
    const carbs = nonNegativeNumber(parsed.carbs);
    const fat = nonNegativeNumber(parsed.fat);
    const fiber = nonNegativeNumber(parsed.fiber) ?? 0;
    const parsedConfidence = confidence(parsed.confidence);

    if (
      !foodName ||
      !servingSize ||
      protein === null ||
      calories === null ||
      carbs === null ||
      fat === null ||
      parsedConfidence === null
    ) {
      throw new Error('Meal scan JSON did not include the expected nutrition fields');
    }

    return {
      foodName,
      servingSize,
      protein,
      calories,
      carbs,
      fat,
      fiber,
      confidence: parsedConfidence,
    };
  } catch (error) {
    throw mealScanVisionFailed('OpenAI returned malformed meal scan JSON', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function generateMealScanVision(
  imageData: string,
  imageMimeType: MealScanInput['imageMimeType'],
): Promise<MealScanAnalysis> {
  if (!env.openai.apiKey) {
    throw mealScanVisionFailed('OPENAI_API_KEY is not configured');
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: MEAL_SCAN_VISION_TIMEOUT_MS,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: MEAL_SCAN_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: MEAL_SCAN_VISION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this meal photo and return JSON only.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageMimeType};base64,${imageData}`,
              },
            },
          ],
        },
      ],
      max_tokens: MEAL_SCAN_VISION_MAX_TOKENS,
      response_format: { type: 'json_object' },
    });

    const firstChoice = completion.choices[0];
    if (firstChoice?.finish_reason === 'content_filter') {
      throw mealScanVisionFailed('OpenAI filtered the meal scan image');
    }

    const content = firstChoice?.message?.content?.trim();
    if (!content) {
      throw mealScanVisionFailed('OpenAI returned an empty meal scan response');
    }

    return parseMealScanVisionJson(content);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw mealScanVisionFailed('OpenAI meal scan request failed', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
