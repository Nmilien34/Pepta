/**
 * Pep must not assume everyone injects.
 *
 * All three system prompts opened with "the friendly syringe mascot", which
 * primed every answer toward injections — and the chat context carried no route
 * at all, so the model had nothing to correct that assumption with. A user
 * asking about Foundayo (a daily pill) got injection language back.
 */

import { describe, expect, it, vi } from "vitest";
import { PEP_CHAT_SYSTEM_PROMPT } from "../../services/pepChat.service";
import { PEP_MEMORY_SUMMARY_SYSTEM_PROMPT } from "../../services/pepMemory.service";
import { PEP_PUSH_SYSTEM_PROMPT } from "../../services/pepPushCopy.service";

const INJECTION_FRAMING = /syringe|needle|inject/i;

describe("Pep's persona is route-neutral", () => {
  const prompts: [string, string][] = [
    ["chat", PEP_CHAT_SYSTEM_PROMPT],
    ["memory summary", PEP_MEMORY_SUMMARY_SYSTEM_PROMPT],
    ["push copy", PEP_PUSH_SYSTEM_PROMPT],
  ];

  for (const [name, prompt] of prompts) {
    it(`${name}: identifies Pep without a syringe`, () => {
      const persona = prompt.split(".")[0]!;
      expect(persona).not.toMatch(INJECTION_FRAMING);
      expect(persona).toContain("Pep");
    });
  }

  it("chat prompt tells the model to follow the route, not a default", () => {
    // The instruction may legitimately contain the WORD injection — it is
    // telling the model when injection language is allowed.
    expect(PEP_CHAT_SYSTEM_PROMPT).toMatch(/route/i);
    expect(PEP_CHAT_SYSTEM_PROMPT).toMatch(/oral/i);
  });
});

describe("chat context carries the user's medications and routes", () => {
  it("includes route for every active compound", async () => {
    vi.resetModules();
    vi.doMock("../../services/home.service", () => ({
      getHome: async () => ({
        activeCompounds: [
          { id: "c1", name: "Foundayo", route: "oral", doseUnit: "mg", plannedDose: 2.5 },
          { id: "c2", name: "Zepbound", route: "injection", doseUnit: "mg", plannedDose: 5 },
        ],
        medicationLevels: [],
        latestWeight: null,
        profile: null,
        nextDose: null,
        todayProteinGrams: 0,
        todayWaterOz: 0,
        todayFiberGrams: 0,
        todayCalories: 0,
      }),
    }));
    vi.doMock("../../services/pepMemory.service", () => ({
      getPepMemoryForChat: async () => null,
      PEP_MEMORY_SUMMARY_SYSTEM_PROMPT: "",
    }));

    let captured = "";
    const { getPepChatReply } = await import("../../services/pepChat.service");
    await getPepChatReply("user-1", [{ role: "user", text: "Do I take Foundayo with food?" }], {
      generateReply: async (input) => {
        captured = input.payload;
        return JSON.stringify({ reply: "ok", refused: false });
      },
    });

    const payload = JSON.parse(captured);
    expect(payload.context.medications).toEqual([
      { name: "Foundayo", route: "oral", doseUnit: "mg", plannedDose: 2.5 },
      { name: "Zepbound", route: "injection", doseUnit: "mg", plannedDose: 5 },
    ]);
    // The literal string has to reach the model, not just the object shape.
    expect(captured).toContain('"route":"oral"');
  });

  it("survives a user with no active compounds", async () => {
    vi.resetModules();
    vi.doMock("../../services/home.service", () => ({
      getHome: async () => ({ medicationLevels: [], nextDose: null }),
    }));
    vi.doMock("../../services/pepMemory.service", () => ({
      getPepMemoryForChat: async () => null,
      PEP_MEMORY_SUMMARY_SYSTEM_PROMPT: "",
    }));

    let captured = "";
    const { getPepChatReply } = await import("../../services/pepChat.service");
    await getPepChatReply("user-1", [{ role: "user", text: "hi" }], {
      generateReply: async (input) => {
        captured = input.payload;
        return JSON.stringify({ reply: "ok", refused: false });
      },
    });

    expect(JSON.parse(captured).context.medications).toEqual([]);
  });
});
