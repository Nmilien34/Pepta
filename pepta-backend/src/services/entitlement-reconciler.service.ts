// Entitlement reconciler — converts a complete RevenueCat subscriber into
// Pepta's effective-access projection. This is what kills "last webhook
// wins": access is computed from every currently-active source, so an
// expired promotional grant can never cancel a live paid subscription and a
// paid cancellation can never cancel an independent promotion.

import type { SubscriptionStatus } from "@pepta/shared";
import { Types } from "mongoose";
import { logger } from "../lib/logger";
import type {
  AccessSourceDocument,
  UserDocument,
  UserEntitlementDocument,
} from "../models/user.model";
import { env } from "../config/env";
import {
  getSubscriber,
  isRevenueCatConfigured,
  RevenueCatClientError,
  type RevenueCatSubscriber,
} from "./revenuecat.client";

export interface EntitlementProjection {
  effectiveAccess: "active" | "inactive";
  source: "promotional" | "app_store" | "mixed" | "none";
  sources: AccessSourceDocument[];
  expiresAt: Date | null;
  willRenew: boolean;
}

const PROMO_PRODUCT_PREFIX = "rc_promo";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalize the subscriber's pro entitlement + subscriptions into current
 * access-source facts. Promotional detection: the entitlement's product is an
 * `rc_promo*` identifier, or its backing subscription reports the
 * promotional store.
 */
export function sourcesFromSubscriber(
  subscriber: RevenueCatSubscriber,
  proEntitlementId: string,
  now: Date = new Date(),
): AccessSourceDocument[] {
  const entitlement = subscriber.entitlements?.[proEntitlementId];
  if (!entitlement) return [];

  const productId = entitlement.product_identifier;
  const subscription = productId
    ? subscriber.subscriptions?.[productId]
    : undefined;

  const isPromotional =
    (productId?.startsWith(PROMO_PRODUCT_PREFIX) ?? false) ||
    subscription?.store?.toLowerCase() === "promotional";

  const expiresAt = parseDate(entitlement.expires_date);
  const active = expiresAt === null || expiresAt.getTime() > now.getTime();

  const source: AccessSourceDocument = {
    kind: isPromotional ? "promotional" : "app_store",
    active,
    expiresAt,
    // Promotional access never renews. Store access renews unless RevenueCat
    // has detected an unsubscribe or the period already ended.
    willRenew: isPromotional
      ? false
      : active && subscription?.unsubscribe_detected_at == null,
    ...(productId ? { productId } : {}),
    ...(subscription?.is_sandbox != null
      ? { environment: subscription.is_sandbox ? ("sandbox" as const) : ("production" as const) }
      : {}),
  };

  return [source];
}

/** Fold current sources into the gate-facing projection. */
export function computeProjection(
  sources: AccessSourceDocument[],
  now: Date = new Date(),
): EntitlementProjection {
  const activeSources = sources.filter(
    (s) => s.active && (s.expiresAt === null || s.expiresAt.getTime() > now.getTime()),
  );

  if (activeSources.length === 0) {
    return {
      effectiveAccess: "inactive",
      source: "none",
      sources,
      expiresAt: null,
      willRenew: false,
    };
  }

  const kinds = new Set(activeSources.map((s) => s.kind));
  const source =
    kinds.size > 1 ? "mixed" : kinds.has("promotional") ? "promotional" : "app_store";

  // Latest known end among active sources; null when any source is open-ended.
  const expiresAt = activeSources.some((s) => s.expiresAt === null)
    ? null
    : new Date(Math.max(...activeSources.map((s) => s.expiresAt!.getTime())));

  return {
    effectiveAccess: "active",
    source,
    sources,
    expiresAt,
    willRenew: activeSources.some((s) => s.willRenew),
  };
}

function legacyStatusFor(
  projection: EntitlementProjection,
  previous: SubscriptionStatus,
): SubscriptionStatus {
  if (projection.effectiveAccess === "active") return "active";
  // Keep terminal legacy states meaningful for existing consumers.
  if (previous === "refunded") return "refunded";
  if (previous === "free") return "free";
  return "canceled";
}

/** Apply a computed projection onto the user's entitlement subdocument. */
export function applyProjectionToEntitlement(
  entitlement: UserEntitlementDocument,
  projection: EntitlementProjection,
  verifiedAt: Date,
): void {
  entitlement.status = legacyStatusFor(projection, entitlement.status);
  entitlement.expiresAt = projection.expiresAt;
  entitlement.willRenew = projection.willRenew;
  entitlement.effectiveAccess = projection.effectiveAccess;
  entitlement.source = projection.source;
  entitlement.sources = projection.sources;
  entitlement.lastVerifiedAt = verifiedAt;
  entitlement.verificationState = "verified";
}

/**
 * Fetch the user's complete RevenueCat state and persist the reconciled
 * projection. Returns the projection, or null when RevenueCat is not
 * configured (callers fall back to event-level behavior). On RevenueCat
 * failure the existing projection is kept and marked `unavailable`.
 */
export async function reconcileUserEntitlement(
  user: UserDocument,
): Promise<EntitlementProjection | null> {
  if (!isRevenueCatConfigured()) return null;

  const appUserId =
    user.entitlement.revenueCatCustomerId ??
    (user._id instanceof Types.ObjectId ? user._id.toHexString() : String(user._id));

  try {
    const subscriber = await getSubscriber(appUserId);
    const sources = sourcesFromSubscriber(
      subscriber,
      env.revenueCat.proEntitlementId,
    );
    const projection = computeProjection(sources);
    applyProjectionToEntitlement(user.entitlement, projection, new Date());
    await user.save();
    return projection;
  } catch (error) {
    const kind =
      error instanceof RevenueCatClientError ? error.kind : "retryable";
    logger.warn(
      { userId: String(user._id), kind },
      "[entitlement-reconciler] reconciliation unavailable",
    );
    user.entitlement.verificationState = "unavailable";
    await user.save().catch(() => undefined);
    throw error;
  }
}
