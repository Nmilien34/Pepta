import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addUtcCalendarMonths,
  fingerprintEmail,
  maskEmail,
  normalizeEmail,
  resolveComplimentaryAccessForUser,
} from "../services/complimentary-access.service";
import {
  ComplimentaryAccessGrantModel,
  ComplimentaryAccessRedemptionModel,
} from "../models/complimentary-access.model";
import {
  getSubscriber,
  grantPromotionalEntitlement,
  isRevenueCatConfigured,
} from "../services/revenuecat.client";
import { reconcileUserEntitlement } from "../services/entitlement-reconciler.service";
import type { UserDocument } from "../models/user.model";

vi.mock("../models/complimentary-access.model", () => ({
  ComplimentaryAccessGrantModel: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
  },
  ComplimentaryAccessRedemptionModel: {
    findOne: vi.fn(() => ({ lean: () => Promise.resolve(null) })),
    create: vi.fn(),
  },
  AccessAuditEventModel: { create: vi.fn(() => Promise.resolve({})) },
}));

vi.mock("../services/revenuecat.client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/revenuecat.client")>();
  return {
    ...original,
    isRevenueCatConfigured: vi.fn(() => true),
    getSubscriber: vi.fn(),
    grantPromotionalEntitlement: vi.fn(),
    revokePromotionalEntitlement: vi.fn(),
  };
});

vi.mock("../services/entitlement-reconciler.service", () => ({
  reconcileUserEntitlement: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../models/user.model", () => ({
  UserModel: { findOne: vi.fn(), findById: vi.fn() },
}));

function makeUser(overrides: Partial<{ googleEmail: string | undefined; email: string }> = {}): UserDocument {
  return {
    _id: "64b000000000000000000001",
    email: overrides.email ?? "creator@example.com",
    authProviders:
      overrides.googleEmail === undefined && !("googleEmail" in overrides)
        ? [{ provider: "google", providerUserId: "g1", linkedAt: new Date(), verifiedEmailNormalized: "creator@example.com" }]
        : overrides.googleEmail
          ? [{ provider: "google", providerUserId: "g1", linkedAt: new Date(), verifiedEmailNormalized: overrides.googleEmail }]
          : [{ provider: "apple", providerUserId: "a1", linkedAt: new Date() }],
    entitlement: {
      status: "free",
      expiresAt: null,
      willRenew: false,
      sources: [],
    },
    save: vi.fn(() => Promise.resolve()),
  } as unknown as UserDocument;
}

function makeGrant(overrides: Record<string, unknown> = {}) {
  return {
    _id: "grant-1",
    emailNormalized: "creator@example.com",
    category: "creator",
    status: "pending",
    durationMonths: 3,
    attemptCount: 0,
    save: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("pure helpers", () => {
  it("normalizes email by trim+lowercase only (no gmail dot/plus games)", () => {
    expect(normalizeEmail("  Creator+Tag@Example.COM ")).toBe("creator+tag@example.com");
    expect(normalizeEmail("dot.ted@gmail.com")).toBe("dot.ted@gmail.com");
  });

  it("masks emails for output", () => {
    expect(maskEmail("creator@example.com")).toBe("cr*****@example.com");
  });

  it("adds UTC calendar months with end-of-month clamping", () => {
    expect(addUtcCalendarMonths(new Date("2026-07-21T10:00:00.000Z"), 3).toISOString()).toBe(
      "2026-10-21T10:00:00.000Z",
    );
    // Nov 30 + 3 → Feb 28 (clamped)
    expect(addUtcCalendarMonths(new Date("2026-11-30T00:00:00.000Z"), 3).toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("fingerprints are keyed and domain-separated", () => {
    const a = fingerprintEmail("creator@example.com", "k".repeat(32));
    const b = fingerprintEmail("creator@example.com", "x".repeat(32));
    expect(a).not.toBe(b);
    expect(a).toBe(fingerprintEmail(" CREATOR@example.com ", "k".repeat(32)));
  });
});

describe("resolveComplimentaryAccessForUser", () => {
  beforeEach(() => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockReset();
    vi.mocked(ComplimentaryAccessRedemptionModel.create).mockReset();
    vi.mocked(getSubscriber).mockReset();
    vi.mocked(grantPromotionalEntitlement).mockReset();
    vi.mocked(reconcileUserEntitlement).mockClear();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
  });

  it("returns null when no grant exists (standard resolution)", async () => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    await expect(resolveComplimentaryAccessForUser(makeUser())).resolves.toBeNull();
  });

  it("requires Google-specific proof: a pending invite without binding → identity verification", async () => {
    const user = makeUser({ googleEmail: undefined });
    // userId lookup → null; account-email pending lookup → grant
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeGrant() as never);
    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "identity_verification_required" });
  });

  it("claims a pending invite atomically, grants with the FIXED expiry, and returns active", async () => {
    const user = makeUser();
    const pending = makeGrant();
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(pending as never);

    const requested = new Date();
    const fixedExpiry = addUtcCalendarMonths(requested, 3);
    const claimed = makeGrant({
      status: "provisioning",
      attemptCount: 1,
      operationId: "op-1",
      expiresAt: fixedExpiry,
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(claimed as never);
    vi.mocked(getSubscriber).mockResolvedValue({ entitlements: {} });
    vi.mocked(grantPromotionalEntitlement).mockResolvedValue(undefined);

    user.entitlement.sources = [
      { kind: "promotional", active: true, expiresAt: fixedExpiry, willRenew: false },
    ];
    user.entitlement.lastVerifiedAt = new Date();

    const decision = await resolveComplimentaryAccessForUser(user);

    // Tombstone writes are keyring-gated: without HMAC env config (this test
    // env) the insert is skipped — production startup requires the keyring.
    expect(ComplimentaryAccessRedemptionModel.create).not.toHaveBeenCalled();
    expect(grantPromotionalEntitlement).toHaveBeenCalledWith(
      String(user._id),
      "pro",
      fixedExpiry,
    );
    expect(reconcileUserEntitlement).toHaveBeenCalled();
    expect((claimed as { status: string }).status).toBe("active");
    expect(decision).toMatchObject({ state: "active", source: "promotional" });
  });

  it("adopts an existing remote grant after an ambiguous timeout — never a second grant", async () => {
    const user = makeUser();
    const remoteExpiry = "2026-10-21T00:00:00.000Z";
    const retryable = makeGrant({
      status: "retryable_failure",
      attemptCount: 2,
      nextAttemptAt: new Date(Date.now() - 1000),
      operationId: "op-1",
      expiresAt: new Date(remoteExpiry),
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(retryable as never);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(retryable as never);
    vi.mocked(getSubscriber).mockResolvedValue({
      entitlements: { pro: { expires_date: remoteExpiry, product_identifier: "rc_promo_pro" } },
    });

    user.entitlement.sources = [
      { kind: "promotional", active: true, expiresAt: new Date(remoteExpiry), willRenew: false },
    ];
    user.entitlement.lastVerifiedAt = new Date();

    const decision = await resolveComplimentaryAccessForUser(user);

    expect(grantPromotionalEntitlement).not.toHaveBeenCalled();
    expect(decision).toMatchObject({ state: "active" });
  });

  it("concurrent claim losers see provisioning, not an error or paywall", async () => {
    const user = makeUser();
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeGrant() as never);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(null);

    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "provisioning" });
  });

  it("an active grant past its expiration transitions to expired and falls through", async () => {
    const user = makeUser();
    const expired = makeGrant({
      status: "active",
      expiresAt: new Date(Date.now() - 1000),
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(expired as never);

    const decision = await resolveComplimentaryAccessForUser(user);
    expect((expired as { status: string }).status).toBe("expired");
    expect(decision).toBeNull();
  });

  it("terminal failures keep approved users on setup UX, never a paywall", async () => {
    const user = makeUser();
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(
      makeGrant({ status: "terminal_failure" }) as never,
    );
    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "temporarily_unavailable" });
  });
});
