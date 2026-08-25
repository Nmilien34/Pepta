// The acquisition channel list exists TWICE — once as a zod enum in
// @pepta/shared (which guards the request body) and once as a Mongoose `enum`
// on this model (which guards the write). Nothing links them.
//
// Drift between the two fails in the worst possible order: the request passes
// validation, the user sees the sent-bubble beat and the turn advances, and
// only then does Mongoose reject the save. The answer is gone and the user was
// told it landed. Adding "reddit" on 2026-08-24 is exactly the change that
// would have caused it, so the invariant is pinned here rather than trusted.

import { describe, expect, it } from "vitest";
import { discoverySourceSchema } from "@pepta/shared";
import { DiscoverySourceModel } from "../models/discovery-source.model";

/** The values Mongoose will actually accept on a save. */
function modelEnum(): string[] {
  const path = DiscoverySourceModel.schema.path("source") as unknown as {
    enumValues?: string[];
  };
  return [...(path.enumValues ?? [])];
}

describe("the two source lists cannot drift", () => {
  it("the model accepts exactly what the shared schema accepts", () => {
    expect([...modelEnum()].sort()).toEqual([...discoverySourceSchema.options].sort());
  });

  it("reddit is on both sides", () => {
    // The row that prompted this file. Without the model half, every Reddit
    // answer would validate and then fail to save.
    expect(discoverySourceSchema.safeParse("reddit").success).toBe(true);
    expect(modelEnum()).toContain("reddit");
  });

  it("a value on neither list is still refused", () => {
    expect(modelEnum()).not.toContain("myspace");
    expect(discoverySourceSchema.safeParse("myspace").success).toBe(false);
  });
});
