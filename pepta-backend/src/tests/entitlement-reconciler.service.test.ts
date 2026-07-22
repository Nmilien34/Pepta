import { describe, expect, it } from "vitest";
import {
  computeProjection,
  sourcesFromSubscriber,
} from "../services/entitlement-reconciler.service";
import type { RevenueCatSubscriber } from "../services/revenuecat.client";

const NOW = new Date("2026-07-22T00:00:00.000Z");
const FUTURE = "2026-10-21T00:00:00.000Z";
const NEARER_FUTURE = "2026-08-01T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";

function promoSubscriber(expires: string | null): RevenueCatSubscriber {
  return {
    entitlements: {
      pro: { expires_date: expires, product_identifier: "rc_promo_pro_three_month" },
    },
    subscriptions: {},
  };
}

function paidSubscriber(expires: string, unsubscribed = false): RevenueCatSubscriber {
  return {
    entitlements: {
      pro: { expires_date: expires, product_identifier: "ai.boltzman.pepta.monthly" },
    },
    subscriptions: {
      "ai.boltzman.pepta.monthly": {
        expires_date: expires,
        store: "app_store",
        unsubscribe_detected_at: unsubscribed ? "2026-07-01T00:00:00.000Z" : null,
        is_sandbox: false,
      },
    },
  };
}

describe("sourcesFromSubscriber", () => {
  it("detects a promotional grant by rc_promo product id, never renewing", () => {
    const sources = sourcesFromSubscriber(promoSubscriber(FUTURE), "pro", NOW);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "promotional",
      active: true,
      willRenew: false,
    });
    expect(sources[0]!.expiresAt?.toISOString()).toBe(FUTURE);
  });

  it("detects promotional via the subscription store when the product id is custom", () => {
    const subscriber: RevenueCatSubscriber = {
      entitlements: { pro: { expires_date: FUTURE, product_identifier: "creator_pass" } },
      subscriptions: { creator_pass: { store: "promotional", expires_date: FUTURE } },
    };
    expect(sourcesFromSubscriber(subscriber, "pro", NOW)[0]!.kind).toBe("promotional");
  });

  it("treats a store subscription as renewing app_store access", () => {
    const sources = sourcesFromSubscriber(paidSubscriber(FUTURE), "pro", NOW);
    expect(sources[0]).toMatchObject({
      kind: "app_store",
      active: true,
      willRenew: true,
      environment: "production",
    });
  });

  it("marks unsubscribed store access as non-renewing but still active", () => {
    const sources = sourcesFromSubscriber(paidSubscriber(FUTURE, true), "pro", NOW);
    expect(sources[0]).toMatchObject({ active: true, willRenew: false });
  });

  it("returns no sources without the pro entitlement", () => {
    expect(sourcesFromSubscriber({ entitlements: {} }, "pro", NOW)).toEqual([]);
  });

  it("marks an expired entitlement inactive", () => {
    const sources = sourcesFromSubscriber(promoSubscriber(PAST), "pro", NOW);
    expect(sources[0]!.active).toBe(false);
  });
});

describe("computeProjection", () => {
  it("inactive with no sources", () => {
    expect(computeProjection([], NOW)).toMatchObject({
      effectiveAccess: "inactive",
      source: "none",
      willRenew: false,
    });
  });

  it("active promotional-only projection", () => {
    const sources = sourcesFromSubscriber(promoSubscriber(FUTURE), "pro", NOW);
    const projection = computeProjection(sources, NOW);
    expect(projection).toMatchObject({
      effectiveAccess: "active",
      source: "promotional",
      willRenew: false,
    });
    expect(projection.expiresAt?.toISOString()).toBe(FUTURE);
  });

  it("mixed sources stay active with the latest expiry and store renewal", () => {
    const promo = sourcesFromSubscriber(promoSubscriber(NEARER_FUTURE), "pro", NOW);
    const paid = sourcesFromSubscriber(paidSubscriber(FUTURE), "pro", NOW);
    const projection = computeProjection([...promo, ...paid], NOW);
    expect(projection).toMatchObject({
      effectiveAccess: "active",
      source: "mixed",
      willRenew: true,
    });
    expect(projection.expiresAt?.toISOString()).toBe(FUTURE);
  });

  it("an expired promotional source cannot cancel live paid access", () => {
    const promo = sourcesFromSubscriber(promoSubscriber(PAST), "pro", NOW);
    const paid = sourcesFromSubscriber(paidSubscriber(FUTURE), "pro", NOW);
    const projection = computeProjection([...promo, ...paid], NOW);
    expect(projection.effectiveAccess).toBe("active");
    expect(projection.source).toBe("app_store");
  });

  it("promotional-only access goes inactive at its exact expiration", () => {
    const promo = sourcesFromSubscriber(promoSubscriber(NEARER_FUTURE), "pro", NOW);
    const later = new Date("2026-08-01T00:00:00.001Z");
    expect(computeProjection(promo, later).effectiveAccess).toBe("inactive");
  });
});
