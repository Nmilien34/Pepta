// Audit C1 regression: a complimentary resolver FAILURE must fail closed to
// temporarily_unavailable — never fall through to standard resolution, which
// could positively resolve an approved creator as inactive → paywall.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerComplimentaryResolver,
  resolveAccess,
} from "../services/access-decision.service";
import { UserModel } from "../models/user.model";
import { isRevenueCatConfigured } from "../services/revenuecat.client";

vi.mock("../models/user.model", () => ({
  UserModel: { findById: vi.fn() },
}));

vi.mock("../services/revenuecat.client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/revenuecat.client")>();
  return { ...original, isRevenueCatConfigured: vi.fn(() => false), getSubscriber: vi.fn() };
});

vi.mock("../services/entitlement-reconciler.service", () => ({
  reconcileUserEntitlement: vi.fn(() => Promise.resolve(null)),
}));

function makeUser(entitlement: Record<string, unknown> = {}) {
  return {
    _id: "64b000000000000000000001",
    entitlement: {
      status: "free",
      expiresAt: null,
      willRenew: false,
      sources: [],
      ...entitlement,
    },
    save: vi.fn(() => Promise.resolve()),
  };
}

describe("resolveAccess resolver failure handling", () => {
  beforeEach(() => {
    vi.mocked(UserModel.findById).mockReset();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(false);
  });

  it("fails closed to temporarily_unavailable when the complimentary resolver throws", async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(makeUser() as never);
    registerComplimentaryResolver(() => Promise.reject(new Error("grants collection down")));

    const decision = await resolveAccess("64b000000000000000000001");
    expect(decision).toMatchObject({ state: "temporarily_unavailable" });
    expect(decision.state).not.toBe("inactive");
  });

  it("a resolver returning null still falls through to standard resolution", async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(makeUser() as never);
    registerComplimentaryResolver(() => Promise.resolve(null));

    const decision = await resolveAccess("64b000000000000000000001");
    expect(decision).toMatchObject({ state: "inactive", reason: "never_entitled" });
  });

  it("a resolver decision short-circuits standard resolution", async () => {
    vi.mocked(UserModel.findById).mockResolvedValue(makeUser() as never);
    registerComplimentaryResolver(() =>
      Promise.resolve({ state: "provisioning", retryAfterMs: 2000 }),
    );

    const decision = await resolveAccess("64b000000000000000000001");
    expect(decision).toMatchObject({ state: "provisioning" });
  });
});
