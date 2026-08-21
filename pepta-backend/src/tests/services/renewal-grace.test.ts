// The renewal boundary.
//
// A subscription's stored period end passes BEFORE the RENEWAL webhook lands —
// always, by definition, since RevenueCat only knows the renewal happened once
// Apple tells it. decisionFromPersistedState is the only authority the premium
// middleware consults (it makes no network call), so if it drops a renewing
// source the moment expiresAt passes, a paying subscriber is 403'd off every
// premium route at every renewal boundary until the webhook catches up.
//
// PAID_VERIFICATION_GRACE_MS exists for exactly this and was never consulted on
// that path.

import { describe, expect, it } from "vitest";
import {
  decisionFromPersistedState,
  offlineValidUntil,
} from "../../services/access-decision.service";
import type { UserEntitlementDocument } from "../../models/user.model";

const NOW = new Date("2026-08-21T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

function entitlement(
  overrides: Partial<UserEntitlementDocument> = {},
): UserEntitlementDocument {
  return {
    status: "active",
    expiresAt: null,
    willRenew: true,
    sources: [],
    verificationState: "verified",
    lastVerifiedAt: hoursAgo(2),
    ...overrides,
  } as UserEntitlementDocument;
}

function storeSource(over: Record<string, unknown> = {}) {
  return {
    kind: "app_store" as const,
    active: true,
    expiresAt: hoursAgo(1),
    willRenew: true,
    ...over,
  };
}

describe("a renewing subscriber at the renewal boundary", () => {
  it("keeps access an hour past the stored period end", () => {
    const decision = decisionFromPersistedState(
      entitlement({ sources: [storeSource()] as never }),
      NOW,
    );

    expect(decision.state).toBe("active");
  });

  it("still has access at 23 hours past", () => {
    const decision = decisionFromPersistedState(
      entitlement({ sources: [storeSource({ expiresAt: hoursAgo(23) })] as never }),
      NOW,
    );

    expect(decision.state).toBe("active");
  });

  it("loses access once the grace itself has run out", () => {
    const decision = decisionFromPersistedState(
      entitlement({ sources: [storeSource({ expiresAt: hoursAgo(25) })] as never }),
      NOW,
    );

    expect(decision.state).toBe("inactive");
  });

  it("gets NO grace when the subscription is not renewing", () => {
    // A cancelled subscription's period end is the real end — there is no
    // pending renewal to wait for, so grace would be giving away access.
    const decision = decisionFromPersistedState(
      entitlement({
        sources: [storeSource({ willRenew: false })] as never,
      }),
      NOW,
    );

    expect(decision.state).toBe("inactive");
  });

  it("gets NO grace on promotional access, which ends exactly when it says", () => {
    const decision = decisionFromPersistedState(
      entitlement({
        sources: [
          { kind: "promotional", active: true, expiresAt: hoursAgo(1), willRenew: false },
        ] as never,
      }),
      NOW,
    );

    expect(decision.state).toBe("inactive");
  });

  it("reports the source as app_store while inside the grace", () => {
    const decision = decisionFromPersistedState(
      entitlement({ sources: [storeSource()] as never }),
      NOW,
    );

    expect(decision).toMatchObject({ state: "active", source: "app_store" });
  });
});

describe("the offline grace during a verification outage", () => {
  it("is reachable after the period end has lapsed", () => {
    // This is the outage the grace was written for: RevenueCat is unreachable
    // AND the period end passed while it was down. offlineValidUntil already
    // extends a renewing source; the decision path has to honour it too.
    const spent = entitlement({
      verificationState: "unavailable",
      sources: [storeSource({ expiresAt: hoursAgo(1) })] as never,
    });

    expect(offlineValidUntil(spent, NOW)).not.toBeNull();

    const decision = decisionFromPersistedState(spent, NOW);
    expect(["active", "temporarily_unavailable"]).toContain(decision.state);
    if (decision.state === "temporarily_unavailable") {
      expect(decision.cachedAccess).toBeDefined();
    }
  });

  it("is not reachable once the grace has run out", () => {
    const spent = entitlement({
      verificationState: "unavailable",
      sources: [storeSource({ expiresAt: hoursAgo(30) })] as never,
    });

    expect(offlineValidUntil(spent, NOW)).toBeNull();
    expect(decisionFromPersistedState(spent, NOW).state).not.toBe("active");
  });
});
