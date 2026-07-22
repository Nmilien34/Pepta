// Access decisions — the single authority behind POST /me/access/resolve and
// the premium middleware. Converts the persisted, reconciled projection (plus
// live reconciliation when possible) into the shared AccessDecision contract.
//
// Invariant 5 (design doc): a paywall is shown only after a POSITIVE inactive
// resolution. Reconciliation failure with usable cached access returns
// temporarily_unavailable + cachedAccess; without usable cache it returns
// temporarily_unavailable with no cache — never inactive.

import type { AccessDecision, AccessSource } from "@pepta/shared";
import { logger } from "../lib/logger";
import { NotFoundError } from "../lib/errors";
import { UserModel } from "../models/user.model";
import type {
  AccessSourceDocument,
  UserDocument,
  UserEntitlementDocument,
} from "../models/user.model";
import {
  reconcileUserEntitlement,
} from "./entitlement-reconciler.service";
import { isRevenueCatConfigured } from "./revenuecat.client";

const PROVISIONING_RETRY_MS = 2_000;
const UNAVAILABLE_RETRY_MS = 5_000;
// A renewing store subscription may coast this long past its last known
// period end while verification is unreachable. Promotional access gets none.
const PAID_VERIFICATION_GRACE_MS = 24 * 60 * 60 * 1000;

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function serializeSources(sources: AccessSourceDocument[]): AccessSource[] {
  return sources.map((source) => ({
    kind: source.kind,
    expiresAt: toIso(source.expiresAt),
    willRenew: source.willRenew,
    ...(source.productId ? { productId: source.productId } : {}),
    ...(source.environment ? { environment: source.environment } : {}),
  }));
}

interface LiveSourceEvaluation {
  activeSources: AccessSourceDocument[];
  label: "promotional" | "app_store" | "mixed" | null;
  expiresAt: Date | null;
  willRenew: boolean;
}

/**
 * Evaluate the persisted sources AT READ TIME. This is what enforces the
 * exact promotional expiration everywhere (client timers may lag; webhooks
 * may be delayed) without another RevenueCat call.
 */
export function evaluatePersistedSources(
  entitlement: UserEntitlementDocument,
  now: Date = new Date(),
): LiveSourceEvaluation {
  const sources = entitlement.sources ?? [];
  const activeSources = sources.filter(
    (s) => s.active && (s.expiresAt === null || s.expiresAt.getTime() > now.getTime()),
  );
  if (activeSources.length === 0) {
    return { activeSources, label: null, expiresAt: null, willRenew: false };
  }
  const kinds = new Set(activeSources.map((s) => s.kind));
  const label =
    kinds.size > 1 ? "mixed" : kinds.has("promotional") ? "promotional" : "app_store";
  const expiresAt = activeSources.some((s) => s.expiresAt === null)
    ? null
    : new Date(Math.max(...activeSources.map((s) => s.expiresAt!.getTime())));
  return {
    activeSources,
    label,
    expiresAt,
    willRenew: activeSources.some((s) => s.willRenew),
  };
}

/**
 * The bounded time through which UNVERIFIED (offline/unavailable) access may
 * be honored: promotional sources until their exact expiry, renewing store
 * sources until period end + 24h grace. Null = no usable cached access.
 */
export function offlineValidUntil(
  entitlement: UserEntitlementDocument,
  now: Date = new Date(),
): Date | null {
  const sources = entitlement.sources ?? [];
  let latest: number | null = null;
  for (const source of sources) {
    if (!source.active) continue;
    let boundary: number | null = null;
    if (source.kind === "promotional") {
      boundary = source.expiresAt ? source.expiresAt.getTime() : null;
    } else if (source.expiresAt) {
      boundary =
        source.expiresAt.getTime() + (source.willRenew ? PAID_VERIFICATION_GRACE_MS : 0);
    }
    if (boundary !== null && boundary > now.getTime()) {
      latest = latest === null ? boundary : Math.max(latest, boundary);
    }
  }
  return latest === null ? null : new Date(latest);
}

function hasLegacyAccess(entitlement: UserEntitlementDocument, now: Date): boolean {
  const activeStatuses = ["active", "trialing", "active_canceled", "past_due"];
  if (!activeStatuses.includes(entitlement.status)) return false;
  return entitlement.expiresAt === null || entitlement.expiresAt.getTime() > now.getTime();
}

function inactiveReason(
  entitlement: UserEntitlementDocument,
): "never_entitled" | "expired" | "revoked" {
  if ((entitlement.sources?.length ?? 0) > 0) return "expired";
  if (["canceled", "refunded", "active_canceled"].includes(entitlement.status)) {
    return "expired";
  }
  return "never_entitled";
}

function activeDecision(
  entitlement: UserEntitlementDocument,
  evaluation: LiveSourceEvaluation,
  now: Date,
): AccessDecision {
  return {
    state: "active",
    source: evaluation.label!,
    sources: serializeSources(evaluation.activeSources),
    expiresAt: toIso(evaluation.expiresAt),
    willRenew: evaluation.willRenew,
    lastVerifiedAt: (entitlement.lastVerifiedAt ?? now).toISOString(),
  };
}

function unavailableDecision(
  entitlement: UserEntitlementDocument,
  now: Date,
): AccessDecision {
  const validUntil = offlineValidUntil(entitlement, now);
  const evaluation = evaluatePersistedSources(entitlement, now);
  if (validUntil && evaluation.label) {
    return {
      state: "temporarily_unavailable",
      retryAfterMs: UNAVAILABLE_RETRY_MS,
      cachedAccess: {
        source: evaluation.label,
        sources: serializeSources(evaluation.activeSources),
        validUntil: validUntil.toISOString(),
        willRenew: evaluation.willRenew,
        lastVerifiedAt: (entitlement.lastVerifiedAt ?? now).toISOString(),
      },
    };
  }
  return { state: "temporarily_unavailable", retryAfterMs: UNAVAILABLE_RETRY_MS };
}

/** Decision from persisted state only — used by middleware (no network). */
export function decisionFromPersistedState(
  entitlement: UserEntitlementDocument,
  now: Date = new Date(),
): AccessDecision {
  const evaluation = evaluatePersistedSources(entitlement, now);
  if (evaluation.label) {
    return activeDecision(entitlement, evaluation, now);
  }

  // No reconciled projection yet (pre-rollout data): trust the legacy
  // event-mapped entitlement so existing customers are not locked out.
  if ((entitlement.sources?.length ?? 0) === 0 && hasLegacyAccess(entitlement, now)) {
    return {
      state: "active",
      source: "app_store",
      sources: [
        {
          kind: "app_store",
          expiresAt: toIso(entitlement.expiresAt),
          willRenew: entitlement.willRenew,
        },
      ],
      expiresAt: toIso(entitlement.expiresAt),
      willRenew: entitlement.willRenew,
      lastVerifiedAt: (entitlement.lastVerifiedAt ?? now).toISOString(),
    };
  }

  if (entitlement.verificationState === "unavailable") {
    return unavailableDecision(entitlement, now);
  }

  return {
    state: "inactive",
    reason: inactiveReason(entitlement),
    lastVerifiedAt: (entitlement.lastVerifiedAt ?? now).toISOString(),
  };
}

// Phase-3 hook: the complimentary-access service registers itself here so
// resolveAccess can claim/provision invites without a circular import.
type ComplimentaryResolver = (
  user: UserDocument,
) => Promise<AccessDecision | null>;
let complimentaryResolver: ComplimentaryResolver | null = null;
export function registerComplimentaryResolver(resolver: ComplimentaryResolver): void {
  complimentaryResolver = resolver;
}

/**
 * Full resolution: reconcile against RevenueCat when possible, fold in the
 * complimentary-access saga, and return the contract decision.
 */
export async function resolveAccess(userId: string): Promise<AccessDecision> {
  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  const now = new Date();

  // Complimentary invitations first: an approved creator must resolve to
  // provisioning/active — never fall through to a paywall-bound inactive.
  if (complimentaryResolver) {
    const complimentary = await complimentaryResolver(user).catch((error) => {
      logger.warn(
        { userId, error: (error as Error).message },
        "[access-decision] complimentary resolution failed",
      );
      return null;
    });
    if (complimentary) return complimentary;
  }

  if (isRevenueCatConfigured()) {
    try {
      await reconcileUserEntitlement(user);
    } catch {
      return unavailableDecision(user.entitlement, now);
    }
  }

  return decisionFromPersistedState(user.entitlement, now);
}

export const ACCESS_PROVISIONING_RETRY_MS = PROVISIONING_RETRY_MS;
