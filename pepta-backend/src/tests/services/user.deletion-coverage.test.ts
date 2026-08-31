// Account deletion has to be complete, and the way it stopped being complete
// was silent: DiscoverySourceModel was imported into user.service.ts for its
// upsert but never added to the delete fan-out, so a deleted user's "how did
// you hear about us" answer stayed behind, still keyed to their user id.
// Nothing threw and nothing logged. It surfaced only because a RevenueCat
// purchase transfer sent us looking for an account that no longer existed and
// we found one orphaned row pointing at it.
//
// So this test does not check a list against another list. It walks the REAL
// model registry, finds every model that stores a userId, and demands each one
// be either purged on deletion or explicitly named as retained. Adding a new
// user-owned collection and forgetting the fan-out now fails here.
//
// The models module is deliberately NOT mocked — mocking it is what let the
// existing user.service test spot-check a handful of models and miss this one.

import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import * as models from "../../models";
import { deletionCoverage } from "../../services/user.service";

/**
 * The two fields this test needs. Mongoose's Model generic differs per
 * document type, so the concrete union is not assignable to any one Model<T> —
 * structural typing is what lets the registry be walked at all.
 */
interface RegisteredModel {
  modelName: string;
  schema: mongoose.Schema;
}

/** Models are values on the module; this narrows to the mongoose ones. */
function isModel(value: unknown): value is RegisteredModel {
  return typeof (value as { schema?: unknown })?.schema === "object"
    && typeof (value as { modelName?: unknown })?.modelName === "string";
}

/** Every model whose documents are owned by a single user. */
function userScopedModels(): RegisteredModel[] {
  // `as unknown[]` first: Array.filter's guard overload needs S to extend the
  // element type, and RegisteredModel is a structural shape rather than a
  // subtype of mongoose's per-document Model union — without this the guard
  // silently does not narrow, and the module also exports non-models.
  return (Object.values(models) as unknown[])
    .filter(isModel)
    .filter((model) => model.schema.path("userId") != null);
}

describe("account deletion covers every collection that stores a userId", () => {
  it("finds the user-scoped models at all (guards the guard)", () => {
    // If this ever returns nothing, the assertions below pass vacuously and
    // the whole test is decorative.
    expect(userScopedModels().length).toBeGreaterThan(10);
  });

  it("purges or explicitly retains each one", () => {
    const coverage = deletionCoverage();
    const accounted = new Set([
      ...coverage.purged,
      ...coverage.elsewhere,
      ...coverage.retained,
    ]);
    const unaccounted = userScopedModels()
      .map((model) => model.modelName)
      .filter((name) => !accounted.has(name));

    expect(
      unaccounted,
      `These models store a userId but account deletion neither purges nor `
        + `retains them. Add each to userOwnedModels() in user.service.ts, or `
        + `to PURGED_ELSEWHERE / RETAINED_WITH_USER_ID with the reason: `
        + unaccounted.join(", "),
    ).toEqual([]);
  });

  it("does not name a model it cannot purge", () => {
    // A typo'd or removed model in the list would delete nothing, quietly.
    const real = new Set(userScopedModels().map((model) => model.modelName));
    for (const name of [...deletionCoverage().purged, ...deletionCoverage().elsewhere]) {
      expect(real.has(name), `${name} is listed for deletion but stores no userId`).toBe(true);
    }
  });

  it("keeps payment receipts, which outlive the account on purpose", () => {
    // Apple disputes arrive after deletion and defending one needs the
    // transaction. The row is stripped of its user reference, not deleted.
    expect(deletionCoverage().retained).toContain("ProcessedWebhookEvent");
    expect(deletionCoverage().purged).not.toContain("ProcessedWebhookEvent");
  });
});
