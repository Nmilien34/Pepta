// The App Store review account must never lose its access.
//
// seedDemoUser grants it by writing entitlement.status "active" with no
// RevenueCat linkage. hasRevenueCatEvidence counts any status other than
// "free" as evidence, so the first resolveAccess — fired on boot right after
// sign-in — reconciled the account against a subscriber RevenueCat has never
// heard of and persisted "canceled". Every premium route 403s from then on,
// and "canceled" is still not "free", so each later resolve re-confirmed it.
//
// The assertion that matters is that reconciliation is never REACHED: if it
// runs at all, the wipe is already in motion.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ACCOUNT } from "../../config/demoAccount";

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  reconcileCalls: 0,
}));

vi.mock("../../models/user.model", () => ({
  UserModel: { findById: () => Promise.resolve(mocks.user) },
}));
vi.mock("../../services/entitlement-reconciler.service", () => ({
  reconcileUserEntitlement: () => {
    mocks.reconcileCalls += 1;
    return Promise.resolve();
  },
}));
vi.mock("../../services/revenuecat.client", () => ({
  isRevenueCatConfigured: () => true,
  getSubscriber: () => Promise.resolve(null),
}));

const YEAR = 365 * 24 * 60 * 60 * 1000;

function userWith(email: string) {
  return {
    _id: { toHexString: () => "a".repeat(24) },
    email,
    // Exactly what seedDemoUser writes: a legacy status and nothing else.
    entitlement: {
      status: "active",
      expiresAt: new Date(Date.now() + YEAR),
      willRenew: true,
      sources: [],
    },
  };
}

beforeEach(() => {
  mocks.reconcileCalls = 0;
  vi.resetModules();
});

describe("the review account's access survives resolve", () => {
  it("never reconciles the demo account", async () => {
    mocks.user = userWith(DEMO_ACCOUNT.email);
    const { resolveAccess } = await import("../../services/access-decision.service");
    const decision = await resolveAccess("a".repeat(24));
    expect(mocks.reconcileCalls).toBe(0);
    expect(decision.state).toBe("active");
  });

  it("still reconciles an ordinary user with the same shape", async () => {
    mocks.user = userWith("someone.else@example.com");
    const { resolveAccess } = await import("../../services/access-decision.service");
    await resolveAccess("a".repeat(24));
    // The guard must be the EMAIL, not a blanket skip that would also stop
    // real subscribers from being verified.
    expect(mocks.reconcileCalls).toBe(1);
  });
});
