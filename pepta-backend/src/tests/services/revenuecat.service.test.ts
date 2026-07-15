import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processedCreate: vi.fn(),
  processedFindOne: vi.fn(),
  userFindById: vi.fn(),
  userFindOne: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../models', () => ({
  ProcessedWebhookEventModel: {
    create: mocks.processedCreate,
    findOne: mocks.processedFindOne,
  },
  UserModel: {
    findById: mocks.userFindById,
    findOne: mocks.userFindOne,
    findOneAndUpdate: mocks.userFindOneAndUpdate,
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    warn: mocks.warn,
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { applyRevenueCatWebhook } from '../../services/revenuecat.service';

function event(overrides: Partial<{
  id: string;
  type: string;
  appUserId: string;
  originalAppUserId: string;
  aliases: string[];
  transferredFrom: string[];
  transferredTo: string[];
  expiresAt: number;
}> = {}) {
  return {
    event: {
      id: overrides.id ?? 'evt_1',
      type: overrides.type ?? 'RENEWAL',
      app_user_id: overrides.appUserId ?? new Types.ObjectId().toString(),
      original_app_user_id: overrides.originalAppUserId,
      aliases: overrides.aliases,
      transferred_from: overrides.transferredFrom,
      transferred_to: overrides.transferredTo,
      entitlement_id: 'pepta_plus',
      expiration_at_ms: overrides.expiresAt ?? Date.parse('2026-08-01T00:00:00.000Z'),
    },
  };
}

function userDocument(params: {
  id?: string;
  status?: string;
  expiresAt?: Date | null;
  revenueCatCustomerId?: string;
  revenueCatAppUserIds?: string[];
} = {}) {
  return {
    _id: params.id ?? new Types.ObjectId().toString(),
    entitlement: {
      status: params.status ?? 'free',
      expiresAt: params.expiresAt ?? null,
      willRenew: false,
      revenueCatCustomerId: params.revenueCatCustomerId,
      revenueCatAppUserIds: params.revenueCatAppUserIds ?? [],
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RevenueCat webhook service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acks unknown invalid app_user_id without creating a user', async () => {
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindOne.mockResolvedValue(null);

    await expect(
      applyRevenueCatWebhook(event({ id: 'evt_unknown', appUserId: 'customer-not-objectid' })),
    ).resolves.toEqual({ received: true });

    expect(mocks.userFindById).not.toHaveBeenCalled();
    expect(mocks.userFindOne).toHaveBeenCalledWith({
      $or: [
        { 'entitlement.revenueCatCustomerId': { $in: ['customer-not-objectid'] } },
        { 'entitlement.revenueCatAppUserIds': { $in: ['customer-not-objectid'] } },
      ],
    });
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_unknown', appUserId: 'customer-not-objectid' }),
    );
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('dedupes repeated event ids before mutating entitlement', async () => {
    mocks.processedFindOne.mockResolvedValue({ eventId: 'evt_duplicate' });

    await expect(applyRevenueCatWebhook(event({ id: 'evt_duplicate' }))).resolves.toEqual({
      received: true,
    });

    expect(mocks.userFindById).not.toHaveBeenCalled();
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.processedCreate).not.toHaveBeenCalled();
  });

  it('ignores stale expiration events behind a newer active entitlement', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({
      id: userId,
      status: 'active',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook(
        event({
          id: 'evt_stale',
          type: 'EXPIRATION',
          appUserId: userId,
          expiresAt: Date.parse('2026-07-01T00:00:00.000Z'),
        }),
      ),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.status).toBe('active');
    expect(user.save).not.toHaveBeenCalled();
    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_stale' }),
    );
  });

  it('falls back from app_user_id to original_app_user_id when resolving webhook users', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({
      id: userId,
      revenueCatCustomerId: 'original_rc_user',
      revenueCatAppUserIds: ['original_rc_user'],
    });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
    mocks.userFindOne.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook(
        event({
          id: 'evt_original',
          appUserId: 'anonymous_rc_user',
          originalAppUserId: 'original_rc_user',
        }),
      ),
    ).resolves.toEqual({ received: true });

    expect(mocks.userFindOne).toHaveBeenCalledWith({
      $or: [
        { 'entitlement.revenueCatCustomerId': { $in: ['anonymous_rc_user', 'original_rc_user'] } },
        { 'entitlement.revenueCatAppUserIds': { $in: ['anonymous_rc_user', 'original_rc_user'] } },
      ],
    });
    expect(user.entitlement.revenueCatCustomerId).toBe('anonymous_rc_user');
    expect(user.entitlement.revenueCatAppUserIds).toEqual([
      'original_rc_user',
      'anonymous_rc_user',
    ]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('resolves users from stored RevenueCat aliases', async () => {
    const user = userDocument({
      revenueCatCustomerId: 'known_primary',
      revenueCatAppUserIds: ['aliased_rc_user'],
    });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
    mocks.userFindOne.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook(
        event({
          id: 'evt_alias',
          appUserId: 'anonymous_rc_user',
          originalAppUserId: 'aliased_rc_user',
        }),
      ),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.revenueCatAppUserIds).toEqual([
      'aliased_rc_user',
      'anonymous_rc_user',
    ]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('handles transfer events by associating old and new RevenueCat ids without downgrading status', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({
      id: userId,
      status: 'active',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      revenueCatCustomerId: 'anonymous_rc_user',
      revenueCatAppUserIds: ['anonymous_rc_user'],
    });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
    mocks.userFindById.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook({
        event: {
          id: 'evt_transfer',
          type: 'TRANSFER',
          transferred_from: ['anonymous_rc_user'],
          transferred_to: [userId],
        },
      }),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.status).toBe('active');
    expect(user.entitlement.revenueCatCustomerId).toBe(userId);
    expect(user.entitlement.revenueCatAppUserIds).toEqual(['anonymous_rc_user', userId]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('treats duplicate processed-event inserts as already handled without mutating the user', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(user);
    mocks.processedCreate.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(applyRevenueCatWebhook(event({ id: 'evt_race', appUserId: userId }))).resolves.toEqual({
      received: true,
    });

    expect(user.save).not.toHaveBeenCalled();
  });
});
