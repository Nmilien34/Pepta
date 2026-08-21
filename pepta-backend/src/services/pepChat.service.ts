// Pep chat — the mascot's back-and-forth conversation, grounded in the user's
// own tracking data. Mirrors Leanient's constrained coach-chat guardrails: Pep
// answers from the provided context only, and refuses anything clinical
// (dosing decisions, side-effect treatment, drug safety) with a redirect to
// the prescriber. OpenAI stays server-side; without OPENAI_API_KEY the
// endpoint reports 503 so the app can say "Pep is unavailable".

import OpenAI from "openai";
import type { PepChatMessage, PepChatResponse } from "@pepta/shared";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { UserProfileModel } from "../models";
import { getHome } from "./home.service";
import { getPepMemoryForChat } from "./pepMemory.service";

export const PEP_CHAT_SYSTEM_PROMPT = [
  // ROUTE-NEUTRAL PERSONA (2026-08-11). Pep used to introduce itself as "the
  // friendly syringe mascot", which primed every answer toward injections —
  // including answers to users whose medication is a daily pill. Pep is a
  // guide to the user's tracking, not to one delivery method.
  "You are Pep, the friendly guide in Pepta, a GLP-1 tracking app.",
  "Answer ONLY from the provided user data context (medications, medication level, doses, meals, weight, targets, and Pep memory).",
  "Each medication in the context carries a route. Match the user's own words to it: say \"dose\" or \"pill\" for an oral medication and never \"shot\", \"injection\", or \"injection site\". Only use injection language for a medication whose route is injection.",
  "Keep replies warm, plain-English, and under 3 sentences. Never invent numbers that are not in the context.",
  "You are not a medical professional. For ANY question about dosing decisions, changing medications, treating side effects, or drug safety: refuse briefly, suggest the user talk to their prescriber, and set refused to true.",
  'Return STRICT JSON only: {"reply": string, "refused": boolean}.',
].join(" ");

export interface PepChatDeps {
  loadContext(userId: string): Promise<unknown>;
  generateReply(input: { system: string; payload: string }): Promise<string | null>;
}

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!env.openai.apiKey) {
    return null;
  }
  openAIClient ??= new OpenAI({ apiKey: env.openai.apiKey, timeout: 8000 });
  return openAIClient;
}

// A trimmed snapshot of /home — enough grounding to answer the "most asked"
// questions (current level, next dose, today's totals, latest weight) without
// shipping the entire payload to the model.
async function defaultLoadContext(userId: string): Promise<unknown> {
  // THE USER'S DAY, NOT THE SERVER'S. Without a tz, getHome falls back to
  // server-local day boundaries, so "today's protein" was computed over a
  // different 24 hours than the Home screen shows — Pep would tell a user in
  // California at 6pm that they had logged nothing today, because UTC had
  // already rolled over. The profile carries an IANA zone; use it.
  const profile = await UserProfileModel.findOne({ userId }).select({ timezone: 1 });
  const [home, pepMemory] = await Promise.all([
    getHome(userId, new Date(), "today", { tz: profile?.timezone }),
    getPepMemoryForChat(userId),
  ]);
  const snapshot = home as Partial<Record<string, unknown>>;
  const activeCompounds = Array.isArray(snapshot["activeCompounds"])
    ? (snapshot["activeCompounds"] as Record<string, unknown>[])
    : [];
  return {
    // ROUTE MATTERS. Without this Pep only ever saw level curves and a next
    // dose — no indication of HOW the user takes their medication — so a
    // Foundayo question got answered in injection language by default.
    medications: activeCompounds.map((compound) => ({
      name: compound["name"] ?? null,
      route: compound["route"] ?? null,
      doseUnit: compound["doseUnit"] ?? null,
      plannedDose: compound["plannedDose"] ?? null,
    })),
    medicationLevels: snapshot["medicationLevels"] ?? null,
    latestWeight: snapshot["latestWeight"] ?? null,
    profile: snapshot["profile"] ?? null,
    today: {
      proteinGrams: snapshot["todayProteinGrams"] ?? null,
      waterOz: snapshot["todayWaterOz"] ?? null,
      fiberGrams: snapshot["todayFiberGrams"] ?? null,
      calories: snapshot["todayCalories"] ?? null,
    },
    nextDose: snapshot["nextDose"] ?? null,
    pepMemory,
  };
}

async function defaultGenerateReply(input: {
  system: string;
  payload: string;
}): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions: input.system,
    input: input.payload,
    max_output_tokens: 260,
    store: false,
  });
  return response.output_text ?? null;
}

function parseReply(raw: string | null): PepChatResponse | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const json: unknown = JSON.parse(cleaned);
    if (
      typeof json === "object" &&
      json !== null &&
      typeof (json as { reply?: unknown }).reply === "string" &&
      (json as { reply: string }).reply.trim().length > 0 &&
      typeof (json as { refused?: unknown }).refused === "boolean"
    ) {
      return {
        reply: (json as { reply: string }).reply.trim().slice(0, 900),
        refused: (json as { refused: boolean }).refused,
      };
    }
  } catch {
    // fall through to null — caller substitutes the safe fallback
  }
  return null;
}

export async function getPepChatReply(
  userId: string,
  messages: PepChatMessage[],
  deps: Partial<PepChatDeps> = {},
): Promise<PepChatResponse> {
  if (!deps.generateReply && !env.openai.apiKey) {
    throw new AppError({
      code: "SERVICE_UNAVAILABLE",
      message: "Pep chat is unavailable right now",
      statusCode: 503,
    });
  }

  const loadContext = deps.loadContext ?? defaultLoadContext;
  const generateReply = deps.generateReply ?? defaultGenerateReply;

  // A context hiccup must not kill the chat — Pep just answers less grounded.
  let context: unknown = null;
  try {
    context = await loadContext(userId);
  } catch (error) {
    logger.warn({ error }, "[pep-chat] context load failed");
  }

  const raw = await generateReply({
    system: PEP_CHAT_SYSTEM_PROMPT,
    payload: JSON.stringify({ context, messages }),
  });

  const parsed = parseReply(raw);
  if (!parsed) {
    logger.warn({ userId }, "[pep-chat] unparseable model reply");
    return {
      reply: "I hit a snag answering that — give it another try in a moment.",
      refused: false,
    };
  }
  return parsed;
}
