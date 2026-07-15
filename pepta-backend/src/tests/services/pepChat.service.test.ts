import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PepChatMessage } from "@pepta/shared";
import { AppError } from "../../lib/errors";

const mocks = vi.hoisted(() => ({
  getHome: vi.fn(),
  getPepMemoryForChat: vi.fn(),
}));

vi.mock("../../services/home.service", () => ({
  getHome: mocks.getHome,
}));

vi.mock("../../services/pepMemory.service", () => ({
  getPepMemoryForChat: mocks.getPepMemoryForChat,
}));

import {
  getPepChatReply,
  PEP_CHAT_SYSTEM_PROMPT,
} from "../../services/pepChat.service";

vi.mock("../../config/env", () => ({
  env: {
    isProduction: false,
    isTest: true,
    openai: { apiKey: undefined },
  },
}));

const messages: PepChatMessage[] = [
  { role: "user", text: "What's my level right now?" },
];

describe("getPepChatReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the model's grounded reply and forwards the context", async () => {
    let seenPayload = "";
    const result = await getPepChatReply("user-1", messages, {
      loadContext: async () => ({ medicationLevels: [{ currentEstimate: 1.42 }] }),
      generateReply: async ({ system, payload }) => {
        seenPayload = payload;
        expect(system).toBe(PEP_CHAT_SYSTEM_PROMPT);
        return JSON.stringify({ reply: "You have about 1.42 mg active.", refused: false });
      },
    });

    expect(result).toEqual({ reply: "You have about 1.42 mg active.", refused: false });
    const payload = JSON.parse(seenPayload) as { context: unknown; messages: unknown };
    expect(payload.context).toEqual({ medicationLevels: [{ currentEstimate: 1.42 }] });
    expect(payload.messages).toEqual(messages);
  });

  it("includes persistent Pep memory in the default chat context", async () => {
    mocks.getHome.mockResolvedValue({
      medicationLevels: [{ currentEstimate: 1.42 }],
      latestWeight: { value: 187.4, unit: "lb" },
      profile: { dailyProteinTargetGrams: 130 },
      nextDose: { compoundName: "Semaglutide" },
      todayProteinGrams: 42,
      todayWaterOz: 32,
    });
    mocks.getPepMemoryForChat.mockResolvedValue({
      recentSideEffects: [
        {
          label: "nausea",
          severity: 2,
          supportTip: "Pep noticed nausea. Smaller meals today can help me track the pattern.",
        },
      ],
      aiSummary: {
        text: "Pep sees mild nausea after the last dose.",
      },
    });

    const result = await getPepChatReply("user-1", messages, {
      generateReply: async ({ payload }) => {
        const parsed = JSON.parse(payload) as {
          context: { pepMemory?: unknown };
        };
        expect(parsed.context.pepMemory).toEqual(
          expect.objectContaining({
            aiSummary: { text: "Pep sees mild nausea after the last dose." },
          }),
        );
        return JSON.stringify({
          reply: "I remember the nausea pattern and will keep tracking it.",
          refused: false,
        });
      },
    });

    expect(result.reply).toContain("nausea pattern");
    expect(mocks.getPepMemoryForChat).toHaveBeenCalledWith("user-1");
  });

  it("passes refusals through untouched", async () => {
    const result = await getPepChatReply("user-1", messages, {
      loadContext: async () => null,
      generateReply: async () =>
        JSON.stringify({
          reply: "That's one for your prescriber — I can't advise on dosing.",
          refused: true,
        }),
    });
    expect(result.refused).toBe(true);
  });

  it("unwraps fenced JSON replies", async () => {
    const result = await getPepChatReply("user-1", messages, {
      loadContext: async () => null,
      generateReply: async () =>
        '```json\n{"reply": "Next shot is Sunday.", "refused": false}\n```',
    });
    expect(result.reply).toBe("Next shot is Sunday.");
  });

  it("falls back to a safe reply when the model output is unparseable", async () => {
    const result = await getPepChatReply("user-1", messages, {
      loadContext: async () => null,
      generateReply: async () => "sorry, plain text",
    });
    expect(result.refused).toBe(false);
    expect(result.reply).toContain("try");
  });

  it("still answers when the context load fails", async () => {
    const result = await getPepChatReply("user-1", messages, {
      loadContext: async () => {
        throw new Error("home exploded");
      },
      generateReply: async ({ payload }) => {
        expect((JSON.parse(payload) as { context: unknown }).context).toBeNull();
        return JSON.stringify({ reply: "Here's what I know so far.", refused: false });
      },
    });
    expect(result.reply).toBe("Here's what I know so far.");
  });

  it("reports 503 when OpenAI is not configured and no generator is injected", async () => {
    await expect(getPepChatReply("user-1", messages)).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(getPepChatReply("user-1", messages)).rejects.toBeInstanceOf(AppError);
  });
});
