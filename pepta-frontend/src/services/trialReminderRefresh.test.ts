import { describe, expect, it, vi } from 'vitest';
import { REVENUECAT_ENTITLEMENT_ID } from './revenueCat';
import { isRefreshable, refreshTrialReminders } from './trialReminderRefresh';
import type { TrialCustomerInfo } from './trialReminder.service';

const NOW = new Date('2026-08-13T18:00:00.000Z');
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

const info = (over: Record<string, unknown> = {}): TrialCustomerInfo =>
  ({
    entitlements: {
      active: {
        [REVENUECAT_ENTITLEMENT_ID]: {
          periodType: 'TRIAL',
          expirationDate: inDays(2),
          ...over,
        },
      },
    },
  }) as TrialCustomerInfo;

const run = (
  customerInfo: TrialCustomerInfo | null | (() => Promise<never>),
  schedule = vi.fn().mockResolvedValue({}),
) =>
  refreshTrialReminders({
    getCustomerInfo:
      typeof customerInfo === 'function'
        ? (customerInfo as () => Promise<never>)
        : () => Promise.resolve(customerInfo),
    scheduleTrialEndReminder: schedule,
    now: NOW,
  }).then((outcome) => ({ outcome, schedule }));

describe('it reschedules a live trial', () => {
  it('hands the fresh customerInfo straight to the scheduler', async () => {
    const { outcome, schedule } = await run(info());
    expect(outcome).toBe('rescheduled');
    expect(schedule).toHaveBeenCalledWith(expect.anything(), REVENUECAT_ENTITLEMENT_ID);
  });

  it('accepts lowercase periodType, which the SDK also returns', async () => {
    const { outcome } = await run(info({ periodType: 'trial' }));
    expect(outcome).toBe('rescheduled');
  });
});

describe('it NEVER cancels a reminder it cannot replace', () => {
  // The whole point of the guard. scheduleTrialEndReminder clears the queue
  // before it decides whether it can schedule anything, so calling it with
  // untrustworthy state leaves the user with NO warning — worse than the wrong
  // copy. Every case below must leave the scheduler untouched.
  const mustNotSchedule = async (
    customerInfo: TrialCustomerInfo | null | (() => Promise<never>),
    expected: string,
  ) => {
    const { outcome, schedule } = await run(customerInfo);
    expect(outcome).toBe(expected);
    expect(schedule).not.toHaveBeenCalled();
  };

  it('does nothing when RevenueCat has no answer (offline)', async () => {
    await mustNotSchedule(null, 'no-customer-info');
  });

  it('does nothing when the RevenueCat lookup throws', async () => {
    await mustNotSchedule(() => Promise.reject(new Error('network')), 'no-customer-info');
  });

  it('does nothing for a user with no active entitlement', async () => {
    await mustNotSchedule({ entitlements: { active: {} } } as TrialCustomerInfo, 'not-in-trial');
  });

  it('does nothing for a paying subscriber', async () => {
    await mustNotSchedule(info({ periodType: 'NORMAL' }), 'not-in-trial');
  });

  it('does nothing when the entitlement carries no expiry', async () => {
    await mustNotSchedule(info({ expirationDate: null }), 'not-in-trial');
  });

  it('does nothing once the trial has already expired', async () => {
    await mustNotSchedule(info({ expirationDate: inDays(-1) }), 'already-expired');
  });

  it('does nothing for a garbage expiry rather than trusting it', async () => {
    await mustNotSchedule(info({ expirationDate: 'not-a-date' }), 'no-customer-info');
  });

  it('survives a malformed native object without throwing', async () => {
    await mustNotSchedule({} as TrialCustomerInfo, 'not-in-trial');
    await mustNotSchedule({ entitlements: {} } as TrialCustomerInfo, 'not-in-trial');
  });
});

describe('scheduling failure is reported, not swallowed as success', () => {
  it('returns failed when the scheduler throws', async () => {
    const { outcome } = await run(info(), vi.fn().mockRejectedValue(new Error('nope')));
    expect(outcome).toBe('failed');
  });
});

describe('isRefreshable', () => {
  it('is the single decision the gate depends on', () => {
    expect(isRefreshable(info(), REVENUECAT_ENTITLEMENT_ID, NOW)).toEqual({ ok: true });
    expect(isRefreshable(null, REVENUECAT_ENTITLEMENT_ID, NOW)).toEqual({
      ok: false,
      outcome: 'no-customer-info',
    });
  });

  it('treats an expiry exactly at now as expired', () => {
    const atNow = info({ expirationDate: NOW.toISOString() });
    expect(isRefreshable(atNow, REVENUECAT_ENTITLEMENT_ID, NOW)).toEqual({
      ok: false,
      outcome: 'already-expired',
    });
  });

  it('ignores an entitlement under a different id', () => {
    expect(isRefreshable(info(), 'some-other-entitlement', NOW)).toEqual({
      ok: false,
      outcome: 'not-in-trial',
    });
  });
});
