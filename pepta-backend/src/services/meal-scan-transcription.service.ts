import OpenAI, { toFile } from "openai";
import {
  mealTranscriptResponseSchema,
  type MealTranscriptResponse,
  type MealTranscriptionInput,
} from "@pepta/shared";
import { env } from "../config/env";
import { AppError } from "../lib/errors";

const MEAL_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MEAL_TRANSCRIPTION_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

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

    return mealTranscriptResponseSchema.parse({ transcript });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw transcriptionFailed("Meal audio transcription failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
