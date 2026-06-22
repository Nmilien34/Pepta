import OpenAI from "openai";
import type { MealScanAnalysis, MealScanMode } from "@pepta/shared";
import { env } from "../config/env";

export const MEAL_SCAN_NOTE_COPY_VERSION = "meal-scan-note-v1";
const MEAL_SCAN_NOTE_MODEL = "gpt-4o-mini";
const MEAL_SCAN_NOTE_TIMEOUT_MS = 5_000;

export interface MealScanProteinSnapshot {
  todayProteinLogged: number;
  todayProteinTarget: number;
  todayPercent: number;
  projectedProtein: number;
  projectedPercent: number;
  weekAdherence: number;
  calorieTarget: number;
  mode: MealScanMode;
}

export interface MealScanNoteContext {
  biggestWorry?: string;
}

function parseNote(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
    return note.length > 0 ? note : null;
  } catch {
    return null;
  }
}

export async function generateMealScanNote(
  analysis: MealScanAnalysis,
  snapshot: MealScanProteinSnapshot,
  context: MealScanNoteContext,
): Promise<string | null> {
  if (!env.openai.apiKey) {
    return null;
  }

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: MEAL_SCAN_NOTE_TIMEOUT_MS,
  });

  const completion = await openai.chat.completions.create({
    model: MEAL_SCAN_NOTE_MODEL,
    messages: [
      {
        role: "system",
        content:
          'Write one neutral tracker observation for a GLP-1 nutrition app. Return JSON only: {"note":"..."}. Mention only provided numbers. No medical advice, diagnoses, hype, shame, or coaching persona.',
      },
      {
        role: "user",
        content: JSON.stringify({
          foodName: analysis.foodName,
          protein: analysis.protein,
          calories: analysis.calories,
          snapshot,
          biggestWorry: context.biggestWorry,
        }),
      },
    ],
    max_tokens: 120,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content?.trim();
  return content ? parseNote(content) : null;
}
