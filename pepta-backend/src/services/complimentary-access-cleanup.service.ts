// Deletion-time promotional cleanup (audit H1 / design "Revocation,
// Expiration, and Re-registration"). Account deletion must complete even
// during a RevenueCat outage, yet a possibly-granted promotion must not leak
// forever. The queue records the old RevenueCat App User ID durably BEFORE
// the user document is removed; a minute-level runner (and the admin CLI)
// drains it with leased, bounded-backoff revocation attempts. Cleanup only
// ever revokes PROMOTIONAL entitlements — a paid subscription on the same
// old customer is untouched by RevenueCat's revoke_promotionals semantics.

import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import {
  ComplimentaryAccessCleanupModel,
  type ComplimentaryAccessCleanupDocument,
  type ComplimentaryCleanupStatus,
} from "../models/complimentary-access-cleanup.model";
import {
  AccessAuditEventModel,
  ComplimentaryAccessGrantModel,
} from "../models/complimentary-access.model";
import type { UserDocument } from "../models/user.model";
import {
  isRevenueCatConfigured,
  revokePromotionalEntitlement,
  RevenueCatClientError,
} from "./revenuecat.client";

const LEASE_MS = 30_000;
const BACKOFF_BASE_MS = 60_000; // deletion cleanup is not latency-sensitive
const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 12;
const LEASABLE_STATUSES: ComplimentaryCleanupStatus[] = [
  "pending",
  "retryable_failure",
  "processing",
];

// Grant states that can never have produced a remote RevenueCat grant.
const NO_REMOTE_EFFECT_STATUSES = ["pending"] as const;

function backoffMs(attempt: number): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}

async function auditCleanup(entry: {
  previousStatus?: string;
  nextStatus?: string;
  actor: "system" | "worker" | "admin";
  reason: string;
  errorCode?: string;
  subject?: string;
}): Promise<void> {
  await AccessAuditEventModel.create({
    previousStatus: entry.previousStatus,
    nextStatus: entry.nextStatus,
    actor: entry.actor,
    reason: entry.reason,
    errorCode: entry.errorCode,
    subject: entry.subject,
    at: new Date(),
  }).catch(() => undefined);
}

/**
 * Called by account deletion BEFORE the user document is removed. Handles the
 * user's complimentary grant (when one exists):
 * - no possible remote effect → grant removed directly, audited;
 * - possibly-remote grant → durable cleanup task created, grant removed, and
 *   one immediate best-effort revocation attempted (failure just leaves the
 *   task queued — deletion proceeds regardless).
 * The redemption tombstone is intentionally untouched: deleting and
 * recreating the account can never earn a second introductory grant.
 */
export async function prepareComplimentaryCleanupForDeletion(
  user: UserDocument,
): Promise<void> {
  const grant = await ComplimentaryAccessGrantModel.findOne({ userId: user._id });
  if (!grant) return;

  const previous = grant.status;
  const appUserId =
    user._id instanceof Types.ObjectId ? user._id.toHexString() : String(user._id);

  const remoteImpossible =
    (NO_REMOTE_EFFECT_STATUSES as readonly string[]).includes(grant.status) &&
    grant.operationId == null;

  if (remoteImpossible) {
    await grant.deleteOne();
    await auditCleanup({
      previousStatus: previous,
      nextStatus: "deleted_with_account",
      actor: "system",
      reason: "account deletion — grant had no possible remote effect",
    });
    return;
  }

  const entitlementId = env.revenueCat.proEntitlementId;
  const task = await ComplimentaryAccessCleanupModel.findOneAndUpdate(
    { revenueCatAppUserId: appUserId, entitlementId },
    {
      $setOnInsert: {
        revenueCatAppUserId: appUserId,
        entitlementId,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  if (!task) {
    throw new Error("Complimentary cleanup task could not be recorded");
  }
  await grant.deleteOne();
  await auditCleanup({
    previousStatus: previous,
    nextStatus: "cleanup_queued",
    actor: "system",
    reason: "account deletion — durable promotional cleanup recorded",
  });

  // Best-effort immediate pass; deletion never depends on the outcome.
  await runCleanupTask(task, "system").catch(() => undefined);
}

async function runCleanupTask(
  task: ComplimentaryAccessCleanupDocument,
  actor: "system" | "worker" | "admin",
): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;

  const now = new Date();
  const leaseId = randomUUID();
  const leased = await ComplimentaryAccessCleanupModel.findOneAndUpdate(
    {
      _id: task._id,
      status: { $in: LEASABLE_STATUSES },
      $and: [
        {
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        status: "processing",
        leaseId,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
      $unset: { nextAttemptAt: "", lastErrorCode: "" },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  );
  if (!leased) return false;

  try {
    await revokePromotionalEntitlement(leased.revenueCatAppUserId, leased.entitlementId);
    await ComplimentaryAccessCleanupModel.deleteOne({
      _id: leased._id,
      leaseId,
    });
    await auditCleanup({
      previousStatus: "processing",
      nextStatus: "deleted",
      actor,
      reason: "post-deletion promotional revocation confirmed",
    });
    return true;
  } catch (error) {
    const kind = error instanceof RevenueCatClientError ? error.kind : "retryable";
    // A 404 means the customer/grant no longer exists remotely — done.
    if (kind === "not_found") {
      await ComplimentaryAccessCleanupModel.deleteOne({
        _id: leased._id,
        leaseId,
      });
      await auditCleanup({
        previousStatus: "processing",
        nextStatus: "deleted",
        actor,
        reason: "post-deletion cleanup — no remote customer/grant found",
      });
      return true;
    }
    const retryable = kind === "retryable" || kind === "conflict";
    const exhausted = retryable && leased.attemptCount >= MAX_AUTO_ATTEMPTS;
    leased.status =
      retryable && !exhausted ? "retryable_failure" : "terminal_failure";
    leased.lastErrorCode = exhausted
      ? "RETRYABLE_EXHAUSTED"
      : kind.toUpperCase();
    leased.leaseId = undefined;
    leased.leaseExpiresAt = undefined;
    leased.nextAttemptAt =
      leased.status === "terminal_failure"
        ? undefined
        : new Date(Date.now() + backoffMs(leased.attemptCount));
    await leased.save();
    await auditCleanup({
      previousStatus: "processing",
      nextStatus: leased.status,
      actor,
      reason: "post-deletion promotional revocation failed",
      errorCode: leased.lastErrorCode,
    });
    if (exhausted) {
      logger.error(
        { cleanupId: String(leased._id), attempts: leased.attemptCount },
        "[complimentary-cleanup] automatic retries exhausted — operator action required",
      );
    }
    return false;
  }
}

/** Drain due cleanup tasks (scheduler + CLI entry point). */
export async function runDueCleanups(
  actor: "worker" | "admin" = "worker",
): Promise<{ attempted: number; succeeded: number }> {
  if (!isRevenueCatConfigured()) return { attempted: 0, succeeded: 0 };
  const now = new Date();
  const due = await ComplimentaryAccessCleanupModel.find({
    status: { $in: LEASABLE_STATUSES },
    $and: [
      {
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: { $lte: now } },
        ],
      },
      {
        $or: [
          { leaseExpiresAt: { $exists: false } },
          { leaseExpiresAt: { $lte: now } },
        ],
      },
    ],
  }).limit(20);

  let succeeded = 0;
  for (const task of due) {
    if (await runCleanupTask(task, actor)) succeeded += 1;
  }
  return { attempted: due.length, succeeded };
}

export async function listCleanups(): Promise<
  Array<{ id: string; status: string; attempts: number; lastErrorCode?: string; nextAttemptAt?: Date }>
> {
  const tasks = await ComplimentaryAccessCleanupModel.find({
    status: {
      $in: [
        "pending",
        "processing",
        "retryable_failure",
        "terminal_failure",
      ],
    },
  })
    .sort({ createdAt: 1 })
    .lean();
  return tasks.map((t) => ({
    id: String(t._id),
    status: t.status,
    attempts: t.attemptCount,
    ...(t.lastErrorCode ? { lastErrorCode: t.lastErrorCode } : {}),
    ...(t.nextAttemptAt ? { nextAttemptAt: t.nextAttemptAt } : {}),
  }));
}

/** Operator retry: re-arm a parked task and run it immediately. */
export async function retryCleanup(id: string): Promise<boolean> {
  const task = await ComplimentaryAccessCleanupModel.findById(id);
  if (!task) return false;
  task.status = "retryable_failure";
  task.nextAttemptAt = new Date();
  task.lastErrorCode = undefined;
  task.leaseId = undefined;
  task.leaseExpiresAt = undefined;
  await task.save();
  return runCleanupTask(task, "admin");
}
