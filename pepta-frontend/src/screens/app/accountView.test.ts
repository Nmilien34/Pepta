import { describe, expect, it } from 'vitest';
import type { HomeResponse, User, UserProfileResponse } from '@pepta/shared';
import { displayName, doseUnitLabel, entitlementView, isPremium, journeyDay, profileSubtitle, unitsLabel } from './accountView';

const now = new Date(2026, 5, 22); // Jun 22 2026

function user(partial: Partial<User> = {}): User {
  return {
    id: 'u',
    emailVerified: false,
    authProviders: [],
    entitlement: { status: 'free', expiresAt: null, willRenew: false },
    onboardingComplete: true,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    ...partial,
  } as User;
}

describe('displayName', () => {
  it('prefers displayName, then email prefix, then You', () => {
    expect(displayName(user({ displayName: 'Nick M.' }))).toBe('Nick M.');
    expect(displayName(user({ email: 'nick@pepta.app' }))).toBe('nick');
    expect(displayName(null)).toBe('You');
  });
});

describe('entitlementView', () => {
  it('drives copy from subscription status', () => {
    expect(entitlementView(user({ entitlement: { status: 'free', expiresAt: null, willRenew: false } }))).toMatchObject({
      cta: 'Upgrade',
      premium: false,
    });
    expect(
      entitlementView(user({ entitlement: { status: 'active', expiresAt: '2026-07-21T00:00:00.000Z', willRenew: true } })),
    ).toMatchObject({ title: 'Pepta Plus', detail: 'Active · renews Jul 21', premium: true });
    expect(
      entitlementView(user({ entitlement: { status: 'active_canceled', expiresAt: '2026-07-21T00:00:00.000Z', willRenew: false } })),
    ).toMatchObject({ detail: 'Ends Jul 21', premium: true });
  });
  it('marks premium statuses', () => {
    expect(isPremium(user({ entitlement: { status: 'trialing', expiresAt: null, willRenew: false } }))).toBe(true);
    expect(isPremium(user({ entitlement: { status: 'canceled', expiresAt: null, willRenew: false } }))).toBe(false);
  });
});

describe('units + dose', () => {
  it('maps weight unit to Imperial/Metric', () => {
    expect(unitsLabel({ weightUnit: 'lb' } as UserProfileResponse)).toBe('Imperial');
    expect(unitsLabel({ weightUnit: 'kg' } as UserProfileResponse)).toBe('Metric');
    expect(unitsLabel(null)).toBe('Imperial');
  });
  it('reads dose unit preference', () => {
    expect(doseUnitLabel({ doseUnitPreference: 'units' } as unknown as UserProfileResponse)).toBe('units');
    expect(doseUnitLabel(null)).toBe('mg');
  });
});

describe('journeyDay + subtitle', () => {
  it('counts days from journeyStartDate (1-based)', () => {
    expect(journeyDay({ journeyStartDate: '2026-06-20' } as unknown as UserProfileResponse, null, now)).toBe(3);
    expect(journeyDay(null, user(), now)).toBe(24); // May 30 → Jun 22
  });
  it('appends the active compound when present', () => {
    const home = { activeCompounds: [{ name: 'Tirzepatide' }], medicationLevels: [] } as unknown as HomeResponse;
    expect(profileSubtitle({ journeyStartDate: '2026-06-20' } as unknown as UserProfileResponse, null, home, now)).toBe(
      'Day 3 · Tirzepatide',
    );
  });
});
