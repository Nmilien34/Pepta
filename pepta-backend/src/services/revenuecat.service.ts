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

function statusForEvent(type: string): SubscriptionStatus {
  // NON_RENEWING_PURCHASE covers RevenueCat promotional grants (store
  // PROMOTIONAL) and one-off purchases — both mean access is active now.
  if (
    ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE'].includes(
      type,
    )
  ) {
    return 'active';
  }

  if (type === 'CANCELLATION') {
    return 'active_canceled';
  }

  if (type === 'EXPIRATION') {
    return 'canceled';
  }

  if (type === 'BILLING_ISSUE') {
    return 'past_due';
  }

  if (type === 'REFUND') {
    return 'refunded';
  }

  return 'free';
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

async function reserveProcessedEvent(
  eventId: string | undefined,
  appUserId: string,
): Promise<boolean> {
  if (!eventId) {
    return false;
  }

  try {
    await ProcessedWebhookEventModel.create({
      provider: 'revenuecat',
      eventId,
      appUserId,
      processedAt: new Date(),
    });
    return false;
  } catch (error) {
    if (isDuplicateKey(error)) {
      logger.info({ eventId, appUserId }, '[revenuecat] duplicate webhook ignored');
      return true;
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

  if (eventId) {
    const processed = await ProcessedWebhookEventModel.findOne({
      provider: 'revenuecat',
      eventId,
    });

    if (processed) {
      return { received: true };
    }
  }

  const alreadyProcessed = await reserveProcessedEvent(eventId, customerId);
  if (alreadyProcessed) {
    return { received: true };
  }

  const user = await findRevenueCatUser(candidates);

  if (!user) {
    logger.warn(
      { candidateRevenueCatIds: candidates, eventId },
      '[revenuecat] unknown user; acknowledged without retry',
    );
    return { received: true };
  }

  const expiresAt =
    typeof event.expiration_at_ms === 'number'
      ? new Date(event.expiration_at_ms)
      : null;
  const nextStatus = statusForEvent(event.type);
  const currentExpiresAt = user.entitlement.expiresAt;
  const isStaleDowngrade =
    expiresAt !== null &&
    currentExpiresAt !== null &&
    expiresAt.getTime() < currentExpiresAt.getTime() &&
    DOWNGRADE_STATUSES.includes(nextStatus);

  if (event.type === 'TRANSFER') {
    applyRevenueCatIdsToUser(user, event);
    await user.save();
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

    user.entitlement.status = nextStatus;
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
