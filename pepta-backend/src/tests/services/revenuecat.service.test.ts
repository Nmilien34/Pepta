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

// The reconciler is unit-tested in its own file. Left unmocked here it makes
// LIVE RevenueCat API calls whenever .env carries the secret key: getSubscriber
// on a random test id returns an empty subscriber, the projection comes back
// inactive, and it overwrites the exact status these tests assert on — which is
// how the "stale expiration" test failed for weeks while the production guard
// it covers was actually correct. Unit tests must never depend on the network.
vi.mock('../../services/entitlement-reconciler.service', () => ({
  reconcileUserEntitlement: vi.fn(async () => null),
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
          appUserId: 'prior_alias_rc_id',
          originalAppUserId: 'original_rc_user',
        }),
      ),
    ).resolves.toEqual({ received: true });

    expect(mocks.userFindOne).toHaveBeenCalledWith({
      $or: [
        { 'entitlement.revenueCatCustomerId': { $in: ['prior_alias_rc_id', 'original_rc_user'] } },
        { 'entitlement.revenueCatAppUserIds': { $in: ['prior_alias_rc_id', 'original_rc_user'] } },
      ],
    });
    expect(user.entitlement.revenueCatCustomerId).toBe('prior_alias_rc_id');
    expect(user.entitlement.revenueCatAppUserIds).toEqual([
      'original_rc_user',
      'prior_alias_rc_id',
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
          appUserId: 'prior_alias_rc_id',
          originalAppUserId: 'aliased_rc_user',
        }),
      ),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.revenueCatAppUserIds).toEqual([
      'aliased_rc_user',
      'prior_alias_rc_id',
    ]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('handles transfer events by associating old and new RevenueCat ids without downgrading status', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({
      id: userId,
      status: 'active',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      revenueCatCustomerId: 'prior_alias_rc_id',
      revenueCatAppUserIds: ['prior_alias_rc_id'],
    });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
    mocks.userFindById.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook({
        event: {
          id: 'evt_transfer',
          type: 'TRANSFER',
          transferred_from: ['prior_alias_rc_id'],
          transferred_to: [userId],
        },
      }),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.status).toBe('active');
    expect(user.entitlement.revenueCatCustomerId).toBe(userId);
    expect(user.entitlement.revenueCatAppUserIds).toEqual(['prior_alias_rc_id', userId]);
    expect(user.save).toHaveBeenCalledTimes(1);
    // A transfer can carry a live subscription onto this user, and the event
    // itself names no entitlement state — reconciliation is what syncs it.
    // Skipping it left paying users 'free' until a later resolveAccess
    // (2026-08-05 tester bug).
    const { reconcileUserEntitlement } = await import(
      '../../services/entitlement-reconciler.service'
    );
    expect(vi.mocked(reconcileUserEntitlement)).toHaveBeenCalledWith(user);
  });

  it('survives a concurrent delivery losing the receipt race', async () => {
    // The receipt is written LAST now, so both deliveries do the (idempotent)
    // entitlement work and one of them loses the unique-index race. That is
    // not an error: they applied the same state.
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(user);
    mocks.processedCreate.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(applyRevenueCatWebhook(event({ id: 'evt_race', appUserId: userId }))).resolves.toEqual({
      received: true,
    });

    expect(user.save).toHaveBeenCalled();
  });
});

// The webhook is the only writer of paid entitlement, so what it does with
// input it does not understand, and with its own failures, is money-critical.
describe('the webhook refuses to act on what it does not understand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
  });

  it('leaves an active subscriber untouched on a TEST event from the dashboard', async () => {
    // The "Send test webhook" button in RevenueCat's dashboard sends this.
    // It used to fall through statusForEvent's chain to 'free'.
    const userId = new Types.ObjectId().toString();
    const user = userDocument({
      id: userId,
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    mocks.userFindById.mockResolvedValue(user);

    await expect(
      applyRevenueCatWebhook(event({ id: 'evt_test', type: 'TEST', appUserId: userId })),
    ).resolves.toEqual({ received: true });

    expect(user.entitlement.status).toBe('active');
    expect(user.entitlement.expiresAt).toEqual(new Date('2027-01-01T00:00:00.000Z'));
    expect(user.save).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it.each([
    'SUBSCRIPTION_PAUSED',
    'SUBSCRIPTION_EXTENDED',
    'TEMPORARY_ENTITLEMENT_GRANT',
    'INVOICE_ISSUANCE',
    'SOME_TYPE_REVENUECAT_ADDS_NEXT_YEAR',
  ])('leaves an active subscriber untouched on %s', async (type) => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'active' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(event({ id: `evt_${type}`, type, appUserId: userId }));

    expect(user.entitlement.status).toBe('active');
    expect(user.save).not.toHaveBeenCalled();
  });

  it('still records a receipt for an unhandled event, so the arrival is traceable', async () => {
    const userId = new Types.ObjectId().toString();
    mocks.userFindById.mockResolvedValue(userDocument({ id: userId, status: 'active' }));

    await applyRevenueCatWebhook(event({ id: 'evt_untyped', type: 'TEST', appUserId: userId }));

    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_untyped', eventType: 'TEST' }),
    );
  });

  it('still applies the event types it DOES understand', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'free' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(event({ id: 'evt_renew', type: 'RENEWAL', appUserId: userId }));

    expect(user.entitlement.status).toBe('active');
    expect(user.save).toHaveBeenCalled();
  });
});

describe('a purchase survives a failure mid-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processedCreate.mockResolvedValue(undefined);
  });

  it('leaves no receipt when the entitlement write throws, so the retry applies it', async () => {
    const userId = new Types.ObjectId().toString();
    const failing = userDocument({ id: userId, status: 'free' });
    failing.save.mockRejectedValueOnce(new Error('write conflict'));
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(failing);

    // First delivery dies. RevenueCat sees a 5xx and will retry.
    await expect(
      applyRevenueCatWebhook(event({ id: 'evt_first_purchase', type: 'INITIAL_PURCHASE', appUserId: userId })),
    ).rejects.toThrow('write conflict');

    // The critical part: nothing was written that would make the retry look
    // like a duplicate.
    expect(mocks.processedCreate).not.toHaveBeenCalled();

    // The retry succeeds and the user ends up entitled.
    const retried = userDocument({ id: userId, status: 'free' });
    mocks.userFindById.mockResolvedValue(retried);

    await expect(
      applyRevenueCatWebhook(event({ id: 'evt_first_purchase', type: 'INITIAL_PURCHASE', appUserId: userId })),
    ).resolves.toEqual({ received: true });

    expect(retried.entitlement.status).toBe('active');
    expect(retried.save).toHaveBeenCalled();
    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_first_purchase' }),
    );
  });

  it('processes a genuine duplicate exactly once', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'free' });
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(event({ id: 'evt_once', type: 'INITIAL_PURCHASE', appUserId: userId }));
    expect(user.save).toHaveBeenCalledTimes(1);

    // Redelivery: the receipt now exists, so it short-circuits.
    mocks.processedFindOne.mockResolvedValue({ eventId: 'evt_once' });
    const second = userDocument({ id: userId, status: 'active' });
    mocks.userFindById.mockResolvedValue(second);

    await applyRevenueCatWebhook(event({ id: 'evt_once', type: 'INITIAL_PURCHASE', appUserId: userId }));

    expect(second.save).not.toHaveBeenCalled();
    expect(mocks.processedCreate).toHaveBeenCalledTimes(1);
  });

  it('records the money on the receipt so a charge can be traced', async () => {
    const userId = new Types.ObjectId().toString();
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.userFindById.mockResolvedValue(userDocument({ id: userId }));

    await applyRevenueCatWebhook({
      event: {
        id: 'evt_paid',
        type: 'INITIAL_PURCHASE',
        app_user_id: userId,
        entitlement_id: 'pepta_plus',
        expiration_at_ms: Date.parse('2027-01-01T00:00:00.000Z'),
        product_id: 'pepta_plus_annual',
        transaction_id: '2000000900000001',
        price_in_purchased_currency: 79.99,
        currency: 'USD',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
        period_type: 'NORMAL',
      },
    } as never);

    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'INITIAL_PURCHASE',
        productId: 'pepta_plus_annual',
        transactionId: '2000000900000001',
        price: 79.99,
        currency: 'USD',
        userId: expect.anything(),
      }),
    );
  });
});

// Trials were invisible: period_type was parsed by the schema and read by
// nothing, so a trial purchase was stored as 'active' and 'trialing' — defined
// in both the Mongo enum and the shared enum — could never be written.
describe('trials are distinguishable from payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
  });

  function trialEvent(type: string, periodType: string, id: string, appUserId: string) {
    return {
      event: {
        id,
        type,
        app_user_id: appUserId,
        entitlement_id: 'pepta_plus',
        period_type: periodType,
        expiration_at_ms: Date.parse('2026-09-01T00:00:00.000Z'),
      },
    } as never;
  }

  it('stores a trial purchase as trialing, not active', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'free' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(trialEvent('INITIAL_PURCHASE', 'TRIAL', 'evt_t1', userId));

    expect(user.entitlement.status).toBe('trialing');
  });

  it('flips to active on the first paying renewal', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'trialing' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(trialEvent('RENEWAL', 'NORMAL', 'evt_t2', userId));

    expect(user.entitlement.status).toBe('active');
  });

  it('treats a paid purchase with no trial period as active', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'free' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(trialEvent('INITIAL_PURCHASE', 'NORMAL', 'evt_t3', userId));

    expect(user.entitlement.status).toBe('active');
  });

  it('cancelling a trial leaves access until it expires, as Apple does', async () => {
    const userId = new Types.ObjectId().toString();
    const user = userDocument({ id: userId, status: 'trialing' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(trialEvent('CANCELLATION', 'TRIAL', 'evt_t4', userId));

    // active_canceled still reads as access until expiresAt passes.
    expect(user.entitlement.status).toBe('active_canceled');
    expect(user.entitlement.expiresAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('records the period on the receipt so the cohort is queryable', async () => {
    const userId = new Types.ObjectId().toString();
    mocks.userFindById.mockResolvedValue(userDocument({ id: userId }));

    await applyRevenueCatWebhook(trialEvent('INITIAL_PURCHASE', 'TRIAL', 'evt_t5', userId));

    expect(mocks.processedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ periodType: 'TRIAL' }),
    );
  });
});

// A TRANSFER moves a subscription between accounts. The winner's alias array
// is a USER-LOOKUP KEY, so putting the loser's identifiers in it made the
// winner reachable by the loser's events — one account's REFUND downgrading
// another's paying subscription.
describe('a transfer does not bind the two accounts together', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processedFindOne.mockResolvedValue(null);
    mocks.processedCreate.mockResolvedValue(undefined);
  });

  it('never stores the losing account id on the winning account', async () => {
    const loser = new Types.ObjectId().toString();
    const winner = new Types.ObjectId().toString();
    const user = userDocument({ id: winner, status: 'active' });
    mocks.userFindById.mockResolvedValue(user);

    await applyRevenueCatWebhook(
      event({
        id: 'evt_transfer',
        type: 'TRANSFER',
        appUserId: winner,
        transferredFrom: [loser],
        transferredTo: [winner],
      }),
    );

    expect(user.entitlement.revenueCatAppUserIds).not.toContain(loser);
    expect(user.entitlement.revenueCatAppUserIds).toContain(winner);
  });

  it('a refund for the losing account cannot reach the winning account', async () => {
    const loser = new Types.ObjectId().toString();
    const winner = new Types.ObjectId().toString();

    // The winner, as they stand AFTER the transfer above.
    const winnerDoc = userDocument({
      id: winner,
      status: 'active',
      revenueCatCustomerId: winner,
      revenueCatAppUserIds: [winner],
    });

    // The loser's account is gone, so findById misses and the alias query is
    // the only way a match could happen.
    mocks.userFindById.mockResolvedValue(null);
    mocks.userFindOne.mockResolvedValue(null);

    await applyRevenueCatWebhook(
      event({ id: 'evt_refund_loser', type: 'REFUND', appUserId: loser }),
    );

    expect(winnerDoc.entitlement.status).toBe('active');
    expect(winnerDoc.save).not.toHaveBeenCalled();
    // And the query that ran did not include the winner's id as a candidate.
    expect(mocks.userFindOne).toHaveBeenCalledWith({
      $or: [
        { 'entitlement.revenueCatCustomerId': { $in: [loser] } },
        { 'entitlement.revenueCatAppUserIds': { $in: [loser] } },
      ],
    });
  });
});
