import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addUtcCalendarMonths,
  createInvite,
  fingerprintEmail,
  maskEmail,
  normalizeEmail,
  linkAppleInvite,
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
  RevenueCatClientError,
} from "../services/revenuecat.client";
import { reconcileUserEntitlement } from "../services/entitlement-reconciler.service";
import { UserModel } from "../models/user.model";
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
  UserModel: { findOne: vi.fn(), findById: vi.fn(), find: vi.fn() },
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

interface MockGrant {
  [key: string]: unknown;
  _id: string;
  emailNormalized: string;
  category: "creator" | "friend";
  status: string;
  durationMonths: number;
  attemptCount: number;
  userId?: unknown;
  requestedAt?: Date;
  expiresAt?: Date;
  operationId?: string;
  identityLinkProvider?: "apple";
  identityLinkedAt?: Date;
  identityLinkedBy?: string;
  identityLinkReason?: string;
  save: ReturnType<typeof vi.fn>;
}

function makeGrant(overrides: Partial<MockGrant> = {}): MockGrant {
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

function mockPendingMatches(grants: unknown[]): void {
  vi.mocked(ComplimentaryAccessGrantModel.find).mockReturnValue({
    limit: () => Promise.resolve(grants),
  } as never);
}

describe("resolveComplimentaryAccessForUser", () => {
  beforeEach(() => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.find).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.find).mockReturnValue({ limit: () => Promise.resolve([]) } as never);
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
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    mockPendingMatches([pending]);

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
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    mockPendingMatches([makeGrant()]);
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

describe("Apple provider-neutral resolution", () => {
  beforeEach(() => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.find).mockReset();
    mockPendingMatches([]);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockReset();
    vi.mocked(getSubscriber).mockReset();
    vi.mocked(grantPromotionalEntitlement).mockReset();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
  });

  function makeAppleUser(proof?: string, email = "relay@privaterelay.appleid.com"): UserDocument {
    return {
      _id: "64b000000000000000000002",
      email,
      authProviders: [
        {
          provider: "apple",
          providerUserId: "apple-sub-1",
          linkedAt: new Date(),
          ...(proof ? { verifiedEmailNormalized: proof } : {}),
        },
      ],
      entitlement: { status: "free", expiresAt: null, willRenew: false, sources: [] },
      save: vi.fn(() => Promise.resolve()),
    } as unknown as UserDocument;
  }

  it("an exact Apple-verified email claims a pending invitation automatically", async () => {
    const user = makeAppleUser("destiny@icloud.com", "destiny@icloud.com");
    const pending = makeGrant({ emailNormalized: "destiny@icloud.com" });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    mockPendingMatches([pending]);
    const fixed = addUtcCalendarMonths(new Date(), 3);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(
      makeGrant({ status: "provisioning", attemptCount: 1, expiresAt: fixed }) as never,
    );
    vi.mocked(getSubscriber).mockResolvedValue({ entitlements: {} });
    vi.mocked(grantPromotionalEntitlement).mockResolvedValue(undefined);
    user.entitlement.sources = [
      { kind: "promotional", active: true, expiresAt: fixed, willRenew: false },
    ] as never;
    user.entitlement.lastVerifiedAt = new Date();

    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "active" });
    expect(grantPromotionalEntitlement).toHaveBeenCalled();
    expect(
      vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mock.calls[0]?.[0],
    ).toEqual(
      expect.objectContaining({
        emailNormalized: "destiny@icloud.com",
        userId: { $exists: false },
      }),
    );
  });

  it("an Apple relay proof never claims a different real-email invitation", async () => {
    const user = makeAppleUser("relay@privaterelay.appleid.com");
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    mockPendingMatches([]); // no invite matches the relay address

    await expect(resolveComplimentaryAccessForUser(user)).resolves.toBeNull();
  });

  it("multiple matching pending invitations fail closed with setup UX", async () => {
    const user = makeAppleUser("destiny@icloud.com");
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    mockPendingMatches([makeGrant(), makeGrant({ _id: "grant-2" })]);

    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "temporarily_unavailable" });
    expect(ComplimentaryAccessGrantModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("a pending grant with a bare userId and NO link metadata cannot bypass proof", async () => {
    const user = makeAppleUser(undefined);
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(
      makeGrant({ userId: user._id }) as never,
    );
    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "identity_verification_required" });
    expect(ComplimentaryAccessGrantModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("a complete operator link claims despite the email mismatch", async () => {
    const user = makeAppleUser(undefined);
    const linked = makeGrant({
      userId: user._id,
      identityLinkProvider: "apple",
      identityLinkedAt: new Date(),
      identityLinkedBy: "operator",
      identityLinkReason: "Creator confirmed private relay",
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(linked as never);
    const fixed = addUtcCalendarMonths(new Date(), 3);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(
      makeGrant({ ...linked, status: "provisioning", attemptCount: 1, expiresAt: fixed }) as never,
    );
    vi.mocked(getSubscriber).mockResolvedValue({ entitlements: {} });
    vi.mocked(grantPromotionalEntitlement).mockResolvedValue(undefined);
    user.entitlement.sources = [
      { kind: "promotional", active: true, expiresAt: fixed, willRenew: false },
    ] as never;
    user.entitlement.lastVerifiedAt = new Date();

    const decision = await resolveComplimentaryAccessForUser(user);
    expect(decision).toMatchObject({ state: "active" });
    expect(
      vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mock.calls[0]?.[0],
    ).toEqual(
      expect.objectContaining({
        userId: user._id,
        identityLinkProvider: "apple",
        identityLinkedAt: linked.identityLinkedAt,
        identityLinkedBy: "operator",
        identityLinkReason: "Creator confirmed private relay",
      }),
    );
  });
});

describe("createInvite provider matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
    vi.mocked(ComplimentaryAccessRedemptionModel.findOne).mockReturnValue({
      lean: () => Promise.resolve(null),
    } as never);
  });

  it("immediately resolves exactly one existing Apple-verified user", async () => {
    const appleUser = {
      _id: "64b000000000000000000004",
      email: "creator@icloud.com",
      authProviders: [
        {
          provider: "apple",
          providerUserId: "apple-sub-4",
          linkedAt: new Date(),
          verifiedEmailNormalized: "creator@icloud.com",
        },
      ],
      entitlement: {
        status: "free",
        expiresAt: null,
        willRenew: false,
        sources: [],
      },
      save: vi.fn(() => Promise.resolve()),
    } as unknown as UserDocument;
    const pending = makeGrant({ emailNormalized: "creator@icloud.com" });
    const expiresAt = addUtcCalendarMonths(new Date(), 3);
    const claimed = makeGrant({
      ...pending,
      status: "provisioning",
      attemptCount: 1,
      operationId: "op-apple",
      expiresAt,
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(ComplimentaryAccessGrantModel.create).mockResolvedValue(
      pending as never,
    );
    vi.mocked(UserModel.find).mockReturnValue({
      limit: () => Promise.resolve([appleUser]),
    } as never);
    mockPendingMatches([pending]);
    vi.mocked(
      ComplimentaryAccessGrantModel.findOneAndUpdate,
    ).mockResolvedValue(claimed as never);
    vi.mocked(getSubscriber).mockResolvedValue({ entitlements: {} });
    vi.mocked(grantPromotionalEntitlement).mockResolvedValue(undefined);
    appleUser.entitlement.sources = [
      {
        kind: "promotional",
        active: true,
        expiresAt,
        willRenew: false,
      },
    ] as never;
    appleUser.entitlement.lastVerifiedAt = new Date();
    vi.mocked(ComplimentaryAccessGrantModel.findById).mockResolvedValue(
      claimed as never,
    );

    const result = await createInvite({
      email: "Creator@iCloud.com",
      category: "creator",
      reason: "creator campaign",
      createdBy: "operator",
    });

    expect(result.provisionedImmediately).toBe(true);
    expect(UserModel.find).toHaveBeenCalledWith({
      authProviders: {
        $elemMatch: {
          verifiedEmailNormalized: "creator@icloud.com",
        },
      },
    });
  });

  it("leaves the invitation pending when multiple verified users match", async () => {
    const pending = makeGrant({ emailNormalized: "creator@icloud.com" });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValue(null);
    vi.mocked(ComplimentaryAccessGrantModel.create).mockResolvedValue(
      pending as never,
    );
    vi.mocked(UserModel.find).mockReturnValue({
      limit: () =>
        Promise.resolve([
          { _id: "64b000000000000000000005" },
          { _id: "64b000000000000000000006" },
        ]),
    } as never);

    const result = await createInvite({
      email: "creator@icloud.com",
      category: "creator",
      reason: "creator campaign",
      createdBy: "operator",
    });

    expect(result).toEqual({
      status: "pending",
      alreadyExisted: false,
      provisionedImmediately: false,
    });
    expect(
      ComplimentaryAccessGrantModel.findOneAndUpdate,
    ).not.toHaveBeenCalled();
  });
});

describe("linkAppleInvite", () => {
  beforeEach(() => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.findById).mockReset();
    vi.mocked(UserModel.find).mockReset();
    vi.mocked(ComplimentaryAccessGrantModel.find).mockReset();
    mockPendingMatches([]);
    // Linking environment without RevenueCat: the durable link stays pending.
    vi.mocked(isRevenueCatConfigured).mockReturnValue(false);
  });

  function mockUserFind(appleProofMatches: unknown[], legacyMatches: unknown[] = []): void {
    vi.mocked(UserModel.find)
      .mockReturnValueOnce({ limit: () => Promise.resolve(appleProofMatches) } as never)
      .mockReturnValueOnce({ limit: () => Promise.resolve(legacyMatches) } as never);
  }

  const appleUser = {
    _id: "64b000000000000000000003",
    authProviders: [
      {
        provider: "apple",
        providerUserId: "apple-sub-9",
        linkedAt: new Date(),
        verifiedEmailNormalized: "relay@privaterelay.appleid.com",
      },
    ],
    entitlement: { status: "free", expiresAt: null, willRenew: false, sources: [] },
    save: vi.fn(() => Promise.resolve()),
  };

  it("links a pending invite to one trusted Apple account without starting the clock", async () => {
    const pending = makeGrant({ emailNormalized: "creator@icloud.com" });
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(pending as never) // invite lookup
      .mockResolvedValueOnce(null) // one-grant-per-user check
      .mockResolvedValue(null); // resolver's owned lookup after link
    mockUserFind([appleUser]);
    const linked = makeGrant({
      ...pending,
      userId: appleUser._id,
      identityLinkProvider: "apple",
      identityLinkedAt: new Date(),
      identityLinkedBy: "op",
      identityLinkReason: "confirmed",
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mockResolvedValue(linked as never);
    vi.mocked(ComplimentaryAccessGrantModel.findById).mockResolvedValue(linked as never);

    const result = await linkAppleInvite({
      inviteEmail: "creator@icloud.com",
      accountEmail: "relay@privaterelay.appleid.com",
      operator: "op",
      reason: "confirmed",
    });

    expect(result).toMatchObject({ linked: true, alreadyLinked: false, status: "pending" });
    const update = vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate).mock.calls[0]!;
    expect(update[0]).toMatchObject({ status: "pending", userId: { $exists: false } });
    // Linking must not start the three-month clock.
    expect(JSON.stringify(update[1])).not.toContain("expiresAt");
    expect(JSON.stringify(update[1])).not.toContain("requestedAt");
  });

  it("dry-run performs trusted-account validation without mutation or RevenueCat", async () => {
    const pending = makeGrant({ emailNormalized: "creator@icloud.com" });
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(null);
    mockUserFind([appleUser]);

    const result = await linkAppleInvite({
      inviteEmail: "creator@icloud.com",
      accountEmail: "relay@privaterelay.appleid.com",
      operator: "op",
      reason: "confirmed",
      dryRun: true,
    });

    expect(result).toMatchObject({
      status: "pending",
      linked: false,
      alreadyLinked: false,
    });
    expect(
      ComplimentaryAccessGrantModel.findOneAndUpdate,
    ).not.toHaveBeenCalled();
    expect(grantPromotionalEntitlement).not.toHaveBeenCalled();
  });

  it("preserves one fixed provisioning generation when RevenueCat fails after linking", async () => {
    vi.mocked(isRevenueCatConfigured).mockReturnValue(true);
    const pending = makeGrant({ emailNormalized: "creator@icloud.com" });
    const linked = makeGrant({
      ...pending,
      userId: appleUser._id,
      identityLinkProvider: "apple",
      identityLinkedAt: new Date(),
      identityLinkedBy: "op",
      identityLinkReason: "confirmed",
    });
    const expiresAt = addUtcCalendarMonths(new Date(), 3);
    const claimed = makeGrant({
      ...linked,
      status: "provisioning",
      attemptCount: 1,
      requestedAt: new Date(),
      operationId: "fixed-op",
      expiresAt,
    });
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linked as never);
    mockUserFind([appleUser]);
    vi.mocked(ComplimentaryAccessGrantModel.findOneAndUpdate)
      .mockResolvedValueOnce(linked as never)
      .mockResolvedValueOnce(claimed as never);
    vi.mocked(getSubscriber).mockRejectedValue(
      new RevenueCatClientError("retryable", 503, "down"),
    );
    vi.mocked(ComplimentaryAccessGrantModel.findById).mockResolvedValue(
      claimed as never,
    );

    const result = await linkAppleInvite({
      inviteEmail: "creator@icloud.com",
      accountEmail: "relay@privaterelay.appleid.com",
      operator: "op",
      reason: "confirmed",
    });

    expect(result.status).toBe("retryable_failure");
    expect(claimed.operationId).toBe("fixed-op");
    expect(claimed.expiresAt).toBe(expiresAt);
  });

  it("same-user replay is idempotent at any status", async () => {
    const alreadyLinked = makeGrant({ status: "active", userId: appleUser._id });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(alreadyLinked as never);
    mockUserFind([appleUser]);

    const result = await linkAppleInvite({
      inviteEmail: "creator@icloud.com",
      accountEmail: "relay@privaterelay.appleid.com",
      operator: "op",
      reason: "again",
    });
    expect(result).toMatchObject({ alreadyLinked: true, status: "active" });
    expect(ComplimentaryAccessGrantModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("a different linked user is a conflict", async () => {
    const foreign = makeGrant({ userId: "64b00000000000000000ffff" });
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(foreign as never);
    mockUserFind([appleUser]);

    await expect(
      linkAppleInvite({
        inviteEmail: "creator@icloud.com",
        accountEmail: "relay@privaterelay.appleid.com",
        operator: "op",
        reason: "x",
      }),
    ).rejects.toThrow(/different user/);
  });

  it("zero or multiple trusted account matches fail closed", async () => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(makeGrant() as never);
    mockUserFind([]);
    await expect(
      linkAppleInvite({
        inviteEmail: "creator@icloud.com",
        accountEmail: "relay@privaterelay.appleid.com",
        operator: "op",
        reason: "x",
      }),
    ).rejects.toThrow(/No Apple-authenticated account/);

    vi.mocked(ComplimentaryAccessGrantModel.findOne).mockResolvedValueOnce(makeGrant() as never);
    mockUserFind([appleUser, { ...appleUser, _id: "other" }]);
    await expect(
      linkAppleInvite({
        inviteEmail: "creator@icloud.com",
        accountEmail: "relay@privaterelay.appleid.com",
        operator: "op",
        reason: "x",
      }),
    ).rejects.toThrow(/Multiple accounts/);
  });

  it("a target user already attached to another grant is refused", async () => {
    vi.mocked(ComplimentaryAccessGrantModel.findOne)
      .mockResolvedValueOnce(makeGrant() as never) // invite
      .mockResolvedValueOnce(makeGrant({ _id: "grant-other", userId: appleUser._id }) as never);
    mockUserFind([appleUser]);

    await expect(
      linkAppleInvite({
        inviteEmail: "creator@icloud.com",
        accountEmail: "relay@privaterelay.appleid.com",
        operator: "op",
        reason: "x",
      }),
    ).rejects.toThrow(/another complimentary grant/);
  });
});
