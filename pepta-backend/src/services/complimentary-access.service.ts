// Complimentary access — invitation, atomic claim, provisioning saga, retry,
// expiration, and revocation. RevenueCat remains the entitlement authority;
// this service only orchestrates granting the promotional `pro` entitlement
// for pre-approved emails and keeping the invitation state machine honest.
//
// Design-doc deviations (deliberate, documented):
// - RevenueCat v1 subscribers API (GET auto-creates the customer; the
//   promotional grant/revoke endpoints are the long-stable surface).
// - The tombstone insert happens immediately BEFORE the atomic claim rather
//   than inside a multi-document transaction (standalone MongoDB has no
//   transactions). The tombstone is keyed on the email fingerprint and the
//   claim is keyed on the same email's unique grant, so a tombstone without a
//   claimed grant can only exist transiently for the same email — it can
//   never block a different invitee.
// - Retries are driven by /me/access/resolve calls (client setup-screen
//   polling) instead of a standing 5-second worker; the lease/backoff fields
//   make a future worker a drop-in addition.

import { createHmac, randomUUID } from "node:crypto";
import type { AccessDecision } from "@pepta/shared";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { ValidationError } from "../lib/errors";
import {
  AccessAuditEventModel,
  ComplimentaryAccessGrantModel,
  ComplimentaryAccessRedemptionModel,
  type ComplimentaryAccessGrantDocument,
  type ComplimentaryGrantStatus,
} from "../models/complimentary-access.model";
import { UserModel, type UserDocument } from "../models/user.model";
import {
  ACCESS_PROVISIONING_RETRY_MS,
  decisionFromPersistedState,
  registerComplimentaryResolver,
} from "./access-decision.service";
import { reconcileUserEntitlement } from "./entitlement-reconciler.service";
import {
  getSubscriber,
  grantPromotionalEntitlement,
  isRevenueCatConfigured,
  revokePromotionalEntitlement,
  RevenueCatClientError,
} from "./revenuecat.client";

const HMAC_DOMAIN_PREFIX = "pepta.complimentary-access.v1:";
const LEASE_MS = 30_000;
const MAX_AUTO_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 15 * 60 * 1000;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Three calendar months in UTC, clamped to the final valid day. */
export function addUtcCalendarMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(year, month + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return target;
}

interface HmacKeyring {
  activeKeyId: string;
  keys: Record<string, string>;
}

export function loadKeyring(): HmacKeyring | null {
  const { hmacActiveKeyId, hmacKeysJson } = env.complimentaryAccess;
  if (!hmacActiveKeyId || !hmacKeysJson) return null;
  let keys: Record<string, string>;
  try {
    keys = JSON.parse(hmacKeysJson) as Record<string, string>;
  } catch {
    throw new ValidationError("COMPLIMENTARY_ACCESS_HMAC_KEYS_JSON is not valid JSON");
  }
  const active = keys[hmacActiveKeyId];
  if (!active || Buffer.from(active, "utf8").length < 32) {
    throw new ValidationError(
      "Complimentary-access HMAC active key is missing or shorter than 32 bytes",
    );
  }
  return { activeKeyId: hmacActiveKeyId, keys };
}

export function fingerprintEmail(email: string, key: string): string {
  return createHmac("sha256", key)
    .update(HMAC_DOMAIN_PREFIX + normalizeEmail(email))
    .digest("hex");
}

async function findRedemption(email: string): Promise<boolean> {
  const keyring = loadKeyring();
  if (!keyring) return false;
  const candidates = Object.entries(keyring.keys).map(([keyId, key]) => ({
    keyId,
    fingerprint: fingerprintEmail(email, key),
  }));
  const existing = await ComplimentaryAccessRedemptionModel.findOne({
    $or: candidates,
  }).lean();
  return existing != null;
}

async function insertRedemption(
  email: string,
  category: "creator" | "friend",
): Promise<void> {
  const keyring = loadKeyring();
  if (!keyring) return; // keyring optional in dev; prod validates at startup
  try {
    await ComplimentaryAccessRedemptionModel.create({
      keyId: keyring.activeKeyId,
      fingerprint: fingerprintEmail(email, keyring.keys[keyring.activeKeyId]!),
      category,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

async function audit(entry: {
  grant?: ComplimentaryAccessGrantDocument;
  previousStatus?: ComplimentaryGrantStatus | string;
  nextStatus?: ComplimentaryGrantStatus | string;
  actor: "admin" | "authentication" | "worker" | "webhook" | "system";
  reason?: string;
  errorCode?: string;
  subject?: string;
}): Promise<void> {
  await AccessAuditEventModel.create({
    grantId: entry.grant?._id,
    previousStatus: entry.previousStatus,
    nextStatus: entry.nextStatus,
    actor: entry.actor,
    operationId: entry.grant?.operationId,
    subject: entry.subject ?? (entry.grant ? maskEmail(entry.grant.emailNormalized) : undefined),
    reason: entry.reason,
    errorCode: entry.errorCode,
    at: new Date(),
  }).catch((error) => {
    logger.warn({ error: (error as Error).message }, "[complimentary] audit write failed");
  });
}

function backoffMs(attempt: number): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}

function verifiedGoogleEmail(user: UserDocument): string | undefined {
  return user.authProviders.find(
    (p) => p.provider === "google" && p.verifiedEmailNormalized,
  )?.verifiedEmailNormalized;
}

/** Written only from a live, verified Google token (auth service calls this). */
export async function bindVerifiedGoogleEmail(
  user: UserDocument,
  email: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const entry = user.authProviders.find((p) => p.provider === "google");
  if (!entry) return;
  if (entry.verifiedEmailNormalized === normalized) return;
  entry.verifiedEmailNormalized = normalized;
  entry.emailVerifiedAt = new Date();
  await user.save();
}

function provisioningDecision(): AccessDecision {
  return { state: "provisioning", retryAfterMs: ACCESS_PROVISIONING_RETRY_MS };
}

function unavailableDecisionForApproved(): AccessDecision {
  return { state: "temporarily_unavailable", retryAfterMs: 15_000 };
}

/**
 * Run one leased provisioning attempt against RevenueCat. The grant is in
 * `provisioning` with a fixed operationId/expiresAt generation.
 */
async function provision(
  grant: ComplimentaryAccessGrantDocument,
  user: UserDocument,
  actor: "authentication" | "worker",
): Promise<AccessDecision> {
  const appUserId = String(user._id);
  const entitlementId = env.revenueCat.proEntitlementId;

  try {
    // Read-before-grant: an ambiguous earlier timeout may already have
    // granted. Adopt the remote grant instead of issuing another.
    const subscriber = await getSubscriber(appUserId);
    const existing = subscriber.entitlements?.[entitlementId];
    const existingExpiry = existing?.expires_date ? new Date(existing.expires_date) : null;
    const alreadyGranted =
      existingExpiry != null && existingExpiry.getTime() > Date.now();

    if (!alreadyGranted) {
      await grantPromotionalEntitlement(appUserId, entitlementId, grant.expiresAt!);
    } else if (existingExpiry) {
      // Adopt RevenueCat's expiration — never start another generation.
      grant.expiresAt = existingExpiry;
    }

    await reconcileUserEntitlement(user);

    const previous = grant.status;
    grant.status = "active";
    grant.grantedAt = new Date();
    grant.nextAttemptAt = undefined;
    grant.lastErrorCode = undefined;
    grant.leaseId = undefined;
    grant.leaseExpiresAt = undefined;
    await grant.save();
    await audit({ grant, previousStatus: previous, nextStatus: "active", actor });

    return decisionFromPersistedState(user.entitlement);
  } catch (error) {
    const kind = error instanceof RevenueCatClientError ? error.kind : "retryable";
    const previous = grant.status;

    if (kind === "terminal") {
      grant.status = "terminal_failure";
      grant.lastErrorCode = "RC_CONFIGURATION";
      grant.leaseId = undefined;
      grant.leaseExpiresAt = undefined;
      await grant.save();
      await audit({
        grant,
        previousStatus: previous,
        nextStatus: "terminal_failure",
        actor,
        errorCode: "RC_CONFIGURATION",
      });
      logger.error(
        { grantId: String(grant._id) },
        "[complimentary] terminal RevenueCat configuration failure — operator action required",
      );
      return unavailableDecisionForApproved();
    }

    grant.status = "retryable_failure";
    grant.lastErrorCode = kind.toUpperCase();
    grant.leaseId = undefined;
    grant.leaseExpiresAt = undefined;
    grant.nextAttemptAt =
      grant.attemptCount >= MAX_AUTO_ATTEMPTS
        ? undefined // auto-retries exhausted: operator `access:retry` required
        : new Date(Date.now() + backoffMs(grant.attemptCount));
    await grant.save();
    await audit({
      grant,
      previousStatus: previous,
      nextStatus: "retryable_failure",
      actor,
      errorCode: grant.lastErrorCode,
    });
    if (grant.attemptCount >= MAX_AUTO_ATTEMPTS) {
      logger.error(
        { grantId: String(grant._id), attempts: grant.attemptCount },
        "[complimentary] automatic retries exhausted — operator action required",
      );
    }
    return provisioningDecision();
  }
}

/**
 * Atomically move a due provisioning/retryable grant into a leased attempt.
 * Only one concurrent caller wins; everyone else sees `provisioning`.
 */
async function acquireAttempt(
  grantId: unknown,
  fromStatus: "pending" | "retryable_failure" | "provisioning",
  patch: Record<string, unknown>,
): Promise<ComplimentaryAccessGrantDocument | null> {
  const now = new Date();
  return ComplimentaryAccessGrantModel.findOneAndUpdate(
    {
      _id: grantId,
      status: fromStatus,
      $and: [
        {
          $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
        },
        {
          $or: [{ leaseExpiresAt: { $exists: false } }, { leaseExpiresAt: { $lte: now } }],
        },
      ],
    },
    {
      $set: {
        status: "provisioning",
        leaseId: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        ...patch,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  );
}

/**
 * The resolver plugged into access-decision. Returns a decision when the
 * complimentary system owns this user's state, or null to fall through to
 * standard subscription resolution.
 */
export async function resolveComplimentaryAccessForUser(
  user: UserDocument,
): Promise<AccessDecision | null> {
  const googleEmail = verifiedGoogleEmail(user);
  const grant =
    (await ComplimentaryAccessGrantModel.findOne({ userId: user._id })) ??
    (googleEmail
      ? await ComplimentaryAccessGrantModel.findOne({
          emailNormalized: googleEmail,
          status: "pending",
        })
      : null);

  // A matching PENDING invite exists for the account email, but the session
  // lacks Google-specific proof → guide to Google verification, never paywall.
  if (!grant && user.email) {
    const byAccountEmail = await ComplimentaryAccessGrantModel.findOne({
      emailNormalized: normalizeEmail(user.email),
      status: "pending",
    });
    if (byAccountEmail && !googleEmail) {
      return {
        state: "identity_verification_required",
        provider: "google",
        reason: "invited_email_requires_verified_google",
      };
    }
  }

  if (!grant) return null;

  switch (grant.status) {
    case "pending": {
      if (!googleEmail || googleEmail !== grant.emailNormalized) {
        return {
          state: "identity_verification_required",
          provider: "google",
          reason: "invited_email_requires_verified_google",
        };
      }
      if (!isRevenueCatConfigured()) return unavailableDecisionForApproved();

      // Consume-then-claim (see file header): tombstone first, then the
      // single-winner transition pending → provisioning.
      await insertRedemption(grant.emailNormalized, grant.category);
      const requestedAt = new Date();
      const claimed = await acquireAttempt(grant._id, "pending", {
        userId: user._id,
        claimedAt: requestedAt,
        requestedAt,
        operationId: randomUUID(),
        expiresAt: addUtcCalendarMonths(requestedAt, grant.durationMonths),
      });
      if (!claimed) return provisioningDecision(); // another caller won
      await audit({
        grant: claimed,
        previousStatus: "pending",
        nextStatus: "provisioning",
        actor: "authentication",
      });
      return provision(claimed, user, "authentication");
    }
    case "retryable_failure": {
      if (!isRevenueCatConfigured()) return unavailableDecisionForApproved();
      if (grant.nextAttemptAt == null) return unavailableDecisionForApproved();
      // Preserve the generation: operationId/requestedAt/expiresAt reused.
      const attempt = await acquireAttempt(grant._id, "retryable_failure", {});
      if (!attempt) return provisioningDecision();
      return provision(attempt, user, "worker");
    }
    case "provisioning": {
      // A crashed attempt is resumable once its lease expires.
      const resumed = await acquireAttempt(grant._id, "provisioning", {});
      if (resumed) return provision(resumed, user, "worker");
      return provisioningDecision();
    }
    case "active": {
      if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) {
        grant.status = "expired";
        grant.expiredAt = new Date();
        await grant.save();
        await audit({
          grant,
          previousStatus: "active",
          nextStatus: "expired",
          actor: "system",
          reason: "known expiration reached",
        });
      }
      return null; // standard resolution reflects RevenueCat state (incl. paid)
    }
    case "terminal_failure":
      return unavailableDecisionForApproved();
    case "revoking":
    case "revoked":
    case "expired":
      return null;
    default:
      return null;
  }
}

// ── Admin operations (CLI adapter calls these) ───────────────────────────────

export interface InviteInput {
  email: string;
  category: "creator" | "friend";
  reason: string;
  createdBy: string;
  months?: number;
}

export async function createInvite(input: InviteInput): Promise<{
  status: string;
  alreadyExisted: boolean;
  provisionedImmediately: boolean;
}> {
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized.includes("@")) {
    throw new ValidationError("A valid email is required");
  }

  const existing = await ComplimentaryAccessGrantModel.findOne({ emailNormalized });
  if (existing) {
    return { status: existing.status, alreadyExisted: true, provisionedImmediately: false };
  }
  if (await findRedemption(emailNormalized)) {
    throw new ValidationError(
      "This email already redeemed a complimentary grant (tombstone present)",
    );
  }

  const grant = await ComplimentaryAccessGrantModel.create({
    emailNormalized,
    category: input.category,
    reason: input.reason,
    createdBy: input.createdBy,
    durationMonths: input.months ?? 3,
    status: "pending",
  });
  await audit({ grant, nextStatus: "pending", actor: "admin", reason: input.reason });

  // Existing user with the exact verified Google binding → provision now.
  const user = await UserModel.findOne({
    authProviders: {
      $elemMatch: { provider: "google", verifiedEmailNormalized: emailNormalized },
    },
  });
  if (user) {
    const decision = await resolveComplimentaryAccessForUser(user);
    return {
      status: (await ComplimentaryAccessGrantModel.findById(grant._id))?.status ?? "pending",
      alreadyExisted: false,
      provisionedImmediately: decision?.state === "active",
    };
  }

  return { status: "pending", alreadyExisted: false, provisionedImmediately: false };
}

export async function revokeInvite(email: string, actorLabel: string): Promise<string> {
  const emailNormalized = normalizeEmail(email);
  const grant = await ComplimentaryAccessGrantModel.findOne({ emailNormalized });
  if (!grant) throw new ValidationError("No grant exists for that email");

  const previous = grant.status;

  // States with no possible remote grant transition directly.
  if (["pending", "terminal_failure"].includes(grant.status)) {
    grant.status = "revoked";
    grant.revokedAt = new Date();
    await grant.save();
    await audit({ grant, previousStatus: previous, nextStatus: "revoked", actor: "admin", subject: actorLabel });
    return "revoked";
  }

  // Anything that may have touched RevenueCat: revoke remotely first.
  grant.status = "revoking";
  await grant.save();
  await audit({ grant, previousStatus: previous, nextStatus: "revoking", actor: "admin", subject: actorLabel });

  if (grant.userId && isRevenueCatConfigured()) {
    await revokePromotionalEntitlement(
      String(grant.userId),
      env.revenueCat.proEntitlementId,
    );
    const user = await UserModel.findById(grant.userId);
    if (user) {
      await reconcileUserEntitlement(user).catch(() => undefined);
    }
  }

  grant.status = "revoked";
  grant.revokedAt = new Date();
  await grant.save();
  await audit({ grant, previousStatus: "revoking", nextStatus: "revoked", actor: "admin", subject: actorLabel });
  return "revoked";
}

export async function retryInvite(email: string): Promise<string> {
  const emailNormalized = normalizeEmail(email);
  const grant = await ComplimentaryAccessGrantModel.findOne({ emailNormalized });
  if (!grant) throw new ValidationError("No grant exists for that email");
  if (!["retryable_failure", "terminal_failure"].includes(grant.status)) {
    return grant.status;
  }
  grant.status = "retryable_failure";
  grant.nextAttemptAt = new Date();
  grant.lastErrorCode = undefined;
  await grant.save();
  await audit({
    grant,
    previousStatus: "terminal_failure",
    nextStatus: "retryable_failure",
    actor: "admin",
    reason: "manual retry",
  });
  return grant.status;
}

export async function listInvites(): Promise<
  Array<{ email: string; status: string; category: string; expiresAt?: Date; attempts: number }>
> {
  const grants = await ComplimentaryAccessGrantModel.find().sort({ createdAt: -1 }).lean();
  return grants.map((g) => ({
    email: maskEmail(g.emailNormalized),
    status: g.status,
    category: g.category,
    ...(g.expiresAt ? { expiresAt: g.expiresAt } : {}),
    attempts: g.attemptCount,
  }));
}

export async function inspectInvite(email: string): Promise<Record<string, unknown> | null> {
  const grant = await ComplimentaryAccessGrantModel.findOne({
    emailNormalized: normalizeEmail(email),
  }).lean();
  if (!grant) return null;
  return {
    email: maskEmail(grant.emailNormalized),
    status: grant.status,
    category: grant.category,
    reason: grant.reason,
    createdBy: grant.createdBy,
    attemptCount: grant.attemptCount,
    operationId: grant.operationId,
    claimedAt: grant.claimedAt,
    grantedAt: grant.grantedAt,
    expiresAt: grant.expiresAt,
    revokedAt: grant.revokedAt,
    lastErrorCode: grant.lastErrorCode,
    nextAttemptAt: grant.nextAttemptAt,
  };
}

// Register into the access decision pipeline (side-effect on import).
registerComplimentaryResolver(resolveComplimentaryAccessForUser);
