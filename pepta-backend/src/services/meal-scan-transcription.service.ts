import OpenAI, { toFile } from "openai";
import {
  mealTranscriptResponseSchema,
  type MealTranscriptResponse,
  type MealTranscriptionInput,
} from "@pepta/shared";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

const MEAL_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MEAL_TRANSCRIPT_CLEANUP_MODEL = "gpt-4o-mini";
const MEAL_TRANSCRIPTION_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const MEAL_TRANSCRIPT_CLEANUP_SYSTEM_PROMPT = `
You clean spoken meal logs for Pepta.

Extract only the foods, drinks, portions, amounts, brands, and meal descriptors that are relevant to what the user ate or drank.
Remove conversational filler, intros, outros, laughter, hesitation words, and non-food phrases like "I ate", "that's it", "thank you", "haha", or "for dinner".

Be permissive with unusual dish names, restaurant items, cultural foods, brand names, slang, and misspellings. If a phrase might be a food, keep it.
Do not invent foods or nutrition facts. Do not rewrite into a sentence. Return a short comma-separated meal phrase.

Return JSON only:
{ "transcript": string }
`.trim();

const AUDIO_EXTENSIONS: Record<MealTranscriptionInput["audioMimeType"], string> =
  {
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
  };

function invalidAudio(message: string): AppError {
  return new AppError({
    code: "INVALID_AUDIO",
    message,
    statusCode: 400,
    details: { retryable: false },
  });
}

function transcriptionFailed(message: string, details?: unknown): AppError {
  return new AppError({
    code: "MEAL_TRANSCRIPTION_FAILED",
    message,
    statusCode: 503,
    details,
    expose: true,
  });
}

function normalizeAudioData(audioData: string): string {
  const trimmed = audioData.trim();
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  return (dataUrlMatch?.[1] ?? trimmed).replace(/\s/g, "");
}

export function decodeAndValidateAudio(audioData: string): Buffer {
  const normalized = normalizeAudioData(audioData);

  if (
    !normalized ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw invalidAudio("audioData must be valid base64");
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw invalidAudio("audioData must not be empty");
  }

  if (bytes.length > MAX_AUDIO_BYTES) {
    throw invalidAudio("audioData is too large");
  }

  return bytes;
}

function parseCleanTranscriptJson(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const transcript =
      typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    return transcript || null;
  } catch {
    return null;
  }
}

async function cleanMealTranscript(
  openai: OpenAI,
  rawTranscript: string,
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: MEAL_TRANSCRIPT_CLEANUP_MODEL,
      messages: [
        {
          role: "system",
          content: MEAL_TRANSCRIPT_CLEANUP_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: rawTranscript,
        },
      ],
      max_tokens: 120,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    const cleaned = content ? parseCleanTranscriptJson(content) : null;
    return cleaned ?? rawTranscript;
  } catch {
    return rawTranscript;
  }
}

export async function transcribeMealAudio(
  input: MealTranscriptionInput,
): Promise<MealTranscriptResponse> {
  if (!env.openai.apiKey) {
    throw transcriptionFailed("OPENAI_API_KEY is not configured");
  }

  const audioBytes = decodeAndValidateAudio(input.audioData);
  const file = await toFile(
    audioBytes,
    `meal.${AUDIO_EXTENSIONS[input.audioMimeType]}`,
    { type: input.audioMimeType },
  );

  const openai = new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: MEAL_TRANSCRIPTION_TIMEOUT_MS,
  });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      language: "en",
      model: MEAL_TRANSCRIPTION_MODEL,
      prompt:
        "Meal logging for Pepta. The speaker may name foods, portions, grams, ounces, calories, protein, carbs, fat, fiber, and common GLP-1 nutrition terms.",
      response_format: "json",
    });

    const transcript = transcription.text?.trim();
    if (!transcript) {
      throw transcriptionFailed("OpenAI returned an empty transcript");
    }

    const cleanedTranscript = await cleanMealTranscript(openai, transcript);

    return mealTranscriptResponseSchema.parse({ transcript: cleanedTranscript });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw transcriptionFailed("Meal audio transcription failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
