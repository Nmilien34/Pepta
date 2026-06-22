import { timingSafeEqual } from 'node:crypto';
import { type RevenueCatWebhook, type SubscriptionStatus } from '@pepta/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { ProcessedWebhookEventModel, UserModel, type UserDocument } from '../models';

const DOWNGRADE_STATUSES: SubscriptionStatus[] = [
  'active_canceled',
  'past_due',
  'canceled',
  'refunded',
];

interface DuplicateKeyError extends Error {
  code?: number;
}

function statusForEvent(type: string): SubscriptionStatus {
  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(type)) {
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

async function findRevenueCatUser(appUserId: string): Promise<UserDocument | null> {
  if (Types.ObjectId.isValid(appUserId)) {
    const byId = await UserModel.findById(appUserId);

    if (byId) {
      return byId;
    }
  }

  return UserModel.findOne({
    'entitlement.revenueCatCustomerId': appUserId,
  });
}

async function markProcessed(eventId: string | undefined, appUserId: string): Promise<void> {
  if (!eventId) {
    return;
  }

  try {
    await ProcessedWebhookEventModel.create({
      provider: 'revenuecat',
      eventId,
      appUserId,
      processedAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error;
    }
  }
}

export async function applyRevenueCatWebhook(input: RevenueCatWebhook): Promise<{ received: true }> {
  const userId = input.event.app_user_id;

  if (!userId) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: 'RevenueCat webhook is missing app_user_id',
      statusCode: 400,
    });
  }

  if (input.event.id) {
    const processed = await ProcessedWebhookEventModel.findOne({
      provider: 'revenuecat',
      eventId: input.event.id,
    });

    if (processed) {
      return { received: true };
    }
  }

  const user = await findRevenueCatUser(userId);

  if (!user) {
    logger.warn({ appUserId: userId, eventId: input.event.id }, '[revenuecat] unknown user');
    return { received: true };
  }

  const expiresAt =
    typeof input.event.expiration_at_ms === 'number'
      ? new Date(input.event.expiration_at_ms)
      : null;
  const nextStatus = statusForEvent(input.event.type);
  const currentExpiresAt = user.entitlement.expiresAt;
  const isStaleDowngrade =
    expiresAt !== null &&
    currentExpiresAt !== null &&
    expiresAt.getTime() < currentExpiresAt.getTime() &&
    DOWNGRADE_STATUSES.includes(nextStatus);

  if (!isStaleDowngrade) {
    user.entitlement = {
      status: nextStatus,
      expiresAt,
      willRenew: !['CANCELLATION', 'EXPIRATION', 'REFUND'].includes(input.event.type),
      revenueCatCustomerId: userId,
      revenueCatEntitlement: input.event.entitlement_id,
    };
    await user.save();
  }

  await markProcessed(input.event.id, userId);

  return { received: true };
}
