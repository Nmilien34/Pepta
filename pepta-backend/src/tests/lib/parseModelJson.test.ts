// Every caller treats a parse failure as "no answer" — the product lookup
// tells the user it couldn't find nutrition facts, the insight degrades to
// canned copy — so a fence the model added is indistinguishable from a real
// miss, in the product's case with nothing in the logs to say otherwise.

import { describe, expect, it } from "vitest";
import { parseModelJson, stripJsonFence } from "../../lib/parseModelJson";

const payload = { brand: "Chobani", protein: 20 };

describe("parseModelJson", () => {
  it("parses a plain JSON object", () => {
    expect(parseModelJson(JSON.stringify(payload))).toEqual(payload);
  });

  it("parses a ```json fenced object", () => {
    expect(
      parseModelJson("```json\n" + JSON.stringify(payload) + "\n```"),
    ).toEqual(payload);
  });

  it("parses a bare ``` fenced object", () => {
    expect(parseModelJson("```\n" + JSON.stringify(payload) + "\n```")).toEqual(
      payload,
    );
  });

  it("salvages an object behind a sentence of preamble", () => {
    expect(
      parseModelJson(`Here are the nutrition facts:\n${JSON.stringify(payload)}`),
    ).toEqual(payload);
  });

  it("returns null rather than throwing on unparseable text", () => {
    expect(parseModelJson("I could not find that product.")).toBeNull();
    expect(parseModelJson("{ not json")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseModelJson("")).toBeNull();
    expect(parseModelJson(null)).toBeNull();
    expect(parseModelJson(undefined)).toBeNull();
  });

  it("refuses a bare scalar that happens to be valid JSON", () => {
    // "20" parses, but a caller expecting an object would then read
    // properties off a number.
    expect(parseModelJson("20")).toBeNull();
    expect(parseModelJson('"text"')).toBeNull();
    expect(parseModelJson("null")).toBeNull();
  });

  it("keeps nested braces intact when salvaging", () => {
    const nested = { a: { b: 1 }, c: [{ d: 2 }] };
    expect(parseModelJson(`prose ${JSON.stringify(nested)} trailing`)).toEqual(
      nested,
    );
  });
});

describe("stripJsonFence", () => {
  it("removes the fence and surrounding whitespace", () => {
    expect(stripJsonFence("```json\n{}\n```")).toBe("{}");
  });

  it("leaves unfenced text alone", () => {
    expect(stripJsonFence("  {}  ")).toBe("{}");
  });
});
