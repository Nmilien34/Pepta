import { timingSafeEqual } from 'node:crypto';
import { type RevenueCatWebhook, type SubscriptionStatus } from '@pepta/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { ProcessedWebhookEventModel, UserModel, type UserDocument } from '../models';
import { reconcileUserEntitlement } from './entitlement-reconciler.service';

const DOWNGRADE_STATUSES: SubscriptionStatus[] = [
  'active_canceled',
  'past_due',
  'canceled',
  'refunded',
];

interface DuplicateKeyError extends Error {
  code?: number;
}

type RevenueCatEvent = RevenueCatWebhook['event'];

/**
 * The ONLY event types allowed to change a user's entitlement.
 *
 * This is a whitelist because the previous shape — a chain of ifs ending in
 * `return 'free'` — turned every event RevenueCat invents, or that we simply
 * never handled, into a DOWNGRADE. SUBSCRIPTION_PAUSED, SUBSCRIPTION_EXTENDED,
 * TEMPORARY_ENTITLEMENT_GRANT, INVOICE_ISSUANCE and the dashboard's own TEST
 * event all landed as "this user is now free". The shared schema does not
 * constrain `type` (z.string()), so there was nothing upstream to stop them
 * either.
 *
 * Adding a type here is a deliberate act. Anything absent is acknowledged and
 * logged, and changes nothing — an unrecognized event is news we do not
 * understand, not evidence that access ended.
 */
const ENTITLEMENT_EVENT_STATUS: Record<string, SubscriptionStatus> = {
  // NON_RENEWING_PURCHASE covers RevenueCat promotional grants (store
  // PROMOTIONAL) and one-off purchases — both mean access is active now.
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  PRODUCT_CHANGE: 'active',
  NON_RENEWING_PURCHASE: 'active',
  CANCELLATION: 'active_canceled',
  EXPIRATION: 'canceled',
  BILLING_ISSUE: 'past_due',
  REFUND: 'refunded',
};

/**
 * RevenueCat reports which phase of the subscription an event belongs to.
 * TRIAL and INTRO are the free/discounted opening period; NORMAL is a paying
 * one. period_type was parsed by the schema and read by nothing, so a trial
 * purchase was stored as 'active' and 'trialing' — a status both the Mongo
 * enum and the shared enum define — was unreachable. The backend could not
 * tell a trialist from a payer, so nothing server-side could act on the
 * trial-to-paid boundary or count how many trials are running.
 */
function isTrialPeriod(periodType: string | null | undefined): boolean {
  return typeof periodType === 'string' && periodType.toUpperCase() === 'TRIAL';
}

function statusForEvent(
  type: string,
  periodType?: string | null,
): SubscriptionStatus | null {
  const mapped = ENTITLEMENT_EVENT_STATUS[type];
  if (mapped === undefined) return null;
  // A purchase or renewal inside the trial period is access, but it is not a
  // payment yet. Conversion — the first NORMAL-period renewal — flips it to
  // 'active' through this same path.
  if (mapped === 'active' && isTrialPeriod(periodType)) return 'trialing';
  return mapped;
}

function isDuplicateKey(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as DuplicateKeyError).code === 11000
  );
}

export function verifyRevenueCatSecret(headerValue: string | undefined): void {
  const expected = env.revenueCat.webhookSecret;

  if (!expected) {
    throw new AppError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'RevenueCat webhook secret is not configured',
      statusCode: 503,
    });
  }

  const token = headerValue?.startsWith('Bearer ')
    ? headerValue.slice('Bearer '.length)
    : headerValue;

  const tokenBuffer = Buffer.from(token ?? '');
  const expectedBuffer = Buffer.from(expected);

  if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Invalid RevenueCat webhook secret',
      statusCode: 403,
    });
  }
}

function uniqueNonEmptyStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function revenueCatEventKey(event: RevenueCatEvent): string | undefined {
  return event.id ?? (event.transaction_id ? `${event.transaction_id}:${event.type}` : undefined);
}

function revenueCatLookupCandidates(event: RevenueCatEvent): string[] {
  if (event.type === 'TRANSFER') {
    return uniqueNonEmptyStrings([
      ...(event.transferred_to ?? []),
      ...(event.transferred_from ?? []),
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
    ]);
  }

  return uniqueNonEmptyStrings([
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ]);
}

function revenueCatIdsToAssociate(event: RevenueCatEvent): string[] {
  return uniqueNonEmptyStrings([
    event.app_user_id,
    event.original_app_user_id,
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
    ...(event.aliases ?? []),
  ]);
}

function primaryRevenueCatId(event: RevenueCatEvent): string | undefined {
  if (event.type === 'TRANSFER') {
    return uniqueNonEmptyStrings([
      ...(event.transferred_to ?? []),
      event.app_user_id,
      event.original_app_user_id,
    ])[0];
  }

  return uniqueNonEmptyStrings([event.app_user_id, event.original_app_user_id])[0];
}

async function findRevenueCatUser(candidates: string[]): Promise<UserDocument | null> {
  for (const candidate of candidates) {
    if (!Types.ObjectId.isValid(candidate)) continue;
    const byId = await UserModel.findById(candidate);

    if (byId) {
      return byId;
    }
  }

  return UserModel.findOne({
    $or: [
      { 'entitlement.revenueCatCustomerId': { $in: candidates } },
      { 'entitlement.revenueCatAppUserIds': { $in: candidates } },
    ],
  });
}

/**
 * Writes the RECEIPT for an event we have finished processing.
 *
 * This used to be a RESERVATION taken before any work: the row was created,
 * then the user lookup and entitlement write ran, and anything that threw in
 * between left a row saying "handled" for a purchase that never was. The
 * retry RevenueCat sent next was short-circuited by that row and returned 200
 * — silently, because the only log lived on the duplicate branch the retry
 * never reached. A first purchase could be charged and never applied.
 *
 * Now it commits LAST. A failure before this point writes nothing, so the
 * retry does the work again; the effects are idempotent (the same event sets
 * the same fields), so a genuine duplicate is harmless even in the narrow
 * window where two deliveries race. The unique index on eventId settles that
 * race, and a duplicate-key error here means the other delivery already
 * finished — not an error.
 */
async function recordProcessedEvent(
  event: RevenueCatEvent,
  eventId: string | undefined,
  appUserId: string,
  user: UserDocument | null,
): Promise<void> {
  if (!eventId) {
    // No id and no transaction id: nothing stable to dedupe on. Recorded
    // nowhere, so a redelivery would be re-applied — see the warn below.
    return;
  }

  const raw = event as Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  try {
    await ProcessedWebhookEventModel.create({
      provider: 'revenuecat',
      eventId,
      appUserId,
      userId: user?._id ?? null,
      eventType: event.type,
      ...(str(raw.product_id) ? { productId: str(raw.product_id) } : {}),
      ...(str(raw.transaction_id) ? { transactionId: str(raw.transaction_id) } : {}),
      price:
        numberOrNull(raw.price_in_purchased_currency) ?? numberOrNull(raw.price),
      ...(str(raw.currency) ? { currency: str(raw.currency) } : {}),
      ...(str(raw.environment) ? { environment: str(raw.environment) } : {}),
      ...(str(raw.store) ? { store: str(raw.store) } : {}),
      ...(str(raw.period_type) ? { periodType: str(raw.period_type) } : {}),
      processedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      // A concurrent delivery of the same event finished first. Both applied
      // the same state, so there is nothing to repair.
      logger.info({ eventId, appUserId }, '[revenuecat] duplicate webhook receipt ignored');
      return;
    }
    throw error;
  }
}

function applyRevenueCatIdsToUser(user: UserDocument, event: RevenueCatEvent): void {
  const primaryId = primaryRevenueCatId(event);
  const revenueCatAppUserIds = uniqueNonEmptyStrings([
    ...(user.entitlement.revenueCatAppUserIds ?? []),
    ...revenueCatIdsToAssociate(event),
  ]);

  if (primaryId) {
    user.entitlement.revenueCatCustomerId = primaryId;
  }
  user.entitlement.revenueCatAppUserIds = revenueCatAppUserIds;
}

export async function applyRevenueCatWebhook(input: RevenueCatWebhook): Promise<{ received: true }> {
  const event = input.event;
  const candidates = revenueCatLookupCandidates(event);
  const customerId = primaryRevenueCatId(event) ?? candidates[0];
  const eventId = revenueCatEventKey(event);

  if (!customerId || candidates.length === 0) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: 'RevenueCat webhook is missing a resolvable app user id',
      statusCode: 400,
    });
  }

  // Dedupe CHECKS first (a receipt means this event is already applied) but
  // COMMITS last — see recordProcessedEvent.
  if (eventId) {
    const processed = await ProcessedWebhookEventModel.findOne({
      provider: 'revenuecat',
      eventId,
    });

    if (processed) {
      logger.info(
        { eventId, eventType: event.type },
        '[revenuecat] event already applied; acknowledged',
      );
      return { received: true };
    }
  } else {
    // Nothing stable to dedupe on, so a redelivery WILL be applied again.
    // Worth knowing about rather than silently re-running.
    logger.warn(
      { eventType: event.type, appUserId: customerId },
      '[revenuecat] event has no id or transaction_id; cannot be deduplicated',
    );
  }

  const user = await findRevenueCatUser(candidates);

  if (!user) {
    // No account to apply this to — a retry would resolve the same way, so
    // this is acknowledged rather than retried. The receipt is still written:
    // it is the only evidence the money event reached us at all.
    logger.warn(
      { candidateRevenueCatIds: candidates, eventId, eventType: event.type },
      '[revenuecat] unknown user; acknowledged without retry',
    );
    await recordProcessedEvent(event, eventId, customerId, null);
    return { received: true };
  }

  const expiresAt =
    typeof event.expiration_at_ms === 'number'
      ? new Date(event.expiration_at_ms)
      : null;
  const nextStatus = statusForEvent(event.type, event.period_type);

  if (event.type !== 'TRANSFER' && nextStatus === null) {
    // Acknowledged, recorded, and NOT acted on. RevenueCat keeps inventing
    // event types and the schema does not constrain them; treating an
    // unrecognized one as a downgrade is how a TEST event from the dashboard
    // could flip a subscriber to 'free'.
    logger.warn(
      { eventType: event.type, eventId, userId: String(user._id) },
      '[revenuecat] unhandled event type; acknowledged without changing entitlement',
    );
    await recordProcessedEvent(event, eventId, customerId, user);
    return { received: true };
  }

  const currentExpiresAt = user.entitlement.expiresAt;
  const isStaleDowngrade =
    nextStatus !== null &&
    expiresAt !== null &&
    currentExpiresAt !== null &&
    expiresAt.getTime() < currentExpiresAt.getTime() &&
    DOWNGRADE_STATUSES.includes(nextStatus);

  if (event.type === 'TRANSFER') {
    applyRevenueCatIdsToUser(user, event);
    // A transfer often CARRIES a live subscription onto this user — repeat
    // sign-ins alias one store customer across accounts — but the event
    // names no entitlement state, so without reconciling here the user
    // keeps a stale 'free' until some later resolveAccess happens to run
    // (2026-08-05: a paying tester read as free while RevenueCat showed
    // pro active). The ids were just recorded from RevenueCat's own event,
    // so the customer definitionally exists — the reconciler's
    // create-on-read hazard does not apply.
    user.entitlement.verificationState = 'stale';
    await user.save();
    // Receipt AFTER the save — a throw above must leave nothing behind, so
    // RevenueCat's retry does the work again.
    await recordProcessedEvent(event, eventId, customerId, user);
    try {
      await reconcileUserEntitlement(user);
    } catch {
      logger.warn(
        { eventId, type: event.type },
        '[revenuecat] transfer ids recorded; reconciliation deferred',
      );
    }
    return { received: true };
  }

  if (!isStaleDowngrade) {
    const revenueCatCustomerId = primaryRevenueCatId(event) ?? customerId;
    const revenueCatAppUserIds = uniqueNonEmptyStrings([
      ...(user.entitlement.revenueCatAppUserIds ?? []),
      ...revenueCatIdsToAssociate(event),
    ]);

    const isPromotionalEvent =
      typeof (event as { store?: unknown }).store === 'string' &&
      ((event as { store?: string }).store ?? '').toUpperCase() === 'PROMOTIONAL';

    user.entitlement.status = nextStatus!;
    user.entitlement.expiresAt = expiresAt;
    // Promotional grants never renew; store lifecycles keep the old rule.
    user.entitlement.willRenew = isPromotionalEvent
      ? false
      : !['CANCELLATION', 'EXPIRATION', 'REFUND'].includes(event.type);
    user.entitlement.revenueCatCustomerId = revenueCatCustomerId;
    user.entitlement.revenueCatAppUserIds = revenueCatAppUserIds;
    user.entitlement.revenueCatEntitlement = event.entitlement_id ?? undefined;
    // The event alone is a hint until reconciliation confirms it.
    user.entitlement.verificationState = 'stale';
    await user.save();
  }

  // The entitlement write has succeeded (or was deliberately skipped as a
  // stale downgrade), so the event is now genuinely handled and earns its
  // receipt. Reconciliation below is best-effort refinement, not the work.
  await recordProcessedEvent(event, eventId, customerId, user);

  // Webhooks are signals, not the whole truth: when the server API key is
  // configured, derive access from the customer's COMPLETE current state so
  // an expired promo can't cancel a live paid sub (and vice versa). Failure
  // keeps the event-level write and leaves the projection marked stale.
  try {
    await reconcileUserEntitlement(user);
  } catch {
    logger.warn(
      { eventId, type: event.type },
      '[revenuecat] webhook applied from event only; reconciliation deferred',
    );
  }

  return { received: true };
}
