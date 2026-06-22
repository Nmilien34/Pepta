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

function event(overrides: Partial<{ id: string; type: string; appUserId: string; expiresAt: number }> = {}) {
  return {
    event: {
      id: overrides.id ?? 'evt_1',
      type: overrides.type ?? 'RENEWAL',
      app_user_id: overrides.appUserId ?? new Types.ObjectId().toString(),
      entitlement_id: 'pepta_plus',
      expiration_at_ms: overrides.expiresAt ?? Date.parse('2026-08-01T00:00:00.000Z'),
    },
  };
}

function userDocument(params: { id?: string; status?: string; expiresAt?: Date | null } = {}) {
  return {
    _id: params.id ?? new Types.ObjectId().toString(),
    entitlement: {
      status: params.status ?? 'free',
      expiresAt: params.expiresAt ?? null,
      willRenew: false,
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
      'entitlement.revenueCatCustomerId': 'customer-not-objectid',
    });
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.processedCreate).not.toHaveBeenCalled();
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
});
