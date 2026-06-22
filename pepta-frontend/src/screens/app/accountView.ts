// Pure derivations for the Account tab. No RN imports → testable. Reads the auth
// User (display name, entitlement) + the profile/home (units, dose unit, journey
// day, current compound). Entitlement copy is driven by subscription status.

import type { HomeResponse, User, UserProfileResponse } from '@pepta/shared';
import { MONTHS_SHORT } from '../../utils/dateParts';

// Format using UTC components so a date renders the same regardless of the
// device timezone (a midnight-UTC `expiresAt`/date-only stays on its calendar day).
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS_SHORT[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

export function displayName(user: User | null): string {
  if (user?.displayName) return user.displayName;
  const email = user?.email;
  if (email) return email.split('@')[0] ?? 'You';
  return 'You';
}

export interface EntitlementView {
  title: string;
  detail: string;
  cta: string;
  premium: boolean;
}

const PREMIUM_STATUSES = new Set(['trialing', 'active', 'active_canceled', 'past_due']);

export function entitlementView(user: User | null): EntitlementView {
  const ent = user?.entitlement;
  const when = fmtDate(ent?.expiresAt);
  switch (ent?.status) {
    case 'trialing':
      return { title: 'Pepta Plus', detail: when ? `Free trial · ends ${when}` : 'Free trial', cta: 'Manage', premium: true };
    case 'active':
      return {
        title: 'Pepta Plus',
        detail: ent.willRenew && when ? `Active · renews ${when}` : when ? `Active · until ${when}` : 'Active',
        cta: 'Manage',
        premium: true,
      };
    case 'active_canceled':
      return { title: 'Pepta Plus', detail: when ? `Ends ${when}` : 'Canceling', cta: 'Manage', premium: true };
    case 'past_due':
      return { title: 'Pepta Plus', detail: 'Payment past due', cta: 'Fix', premium: true };
    case 'canceled':
      return { title: 'Pepta', detail: 'Plan canceled', cta: 'Resubscribe', premium: false };
    case 'refunded':
      return { title: 'Pepta', detail: 'Refunded', cta: 'Resubscribe', premium: false };
    case 'free':
    default:
      return { title: 'Pepta Plus', detail: 'Unlock your full plan', cta: 'Upgrade', premium: false };
  }
}

export function isPremium(user: User | null): boolean {
  return user?.entitlement ? PREMIUM_STATUSES.has(user.entitlement.status) : false;
}

export function unitsLabel(profile: UserProfileResponse | null): string {
  const unit = profile?.weightUnit ?? (profile?.heightUnit === 'cm' ? 'kg' : 'lb');
  return unit === 'kg' ? 'Metric' : 'Imperial';
}

export function doseUnitLabel(profile: UserProfileResponse | null): string {
  return profile?.doseUnitPreference ?? 'mg';
}

// Day N of the journey (1-based) from journeyStartDate, falling back to signup.
export function journeyDay(profile: UserProfileResponse | null, user: User | null, now: Date): number {
  const startIso = profile?.journeyStartDate ?? user?.createdAt ?? null;
  if (!startIso) return 1;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 1;
  // Compare calendar days: the start as its UTC date, today as the device's date.
  const startMid = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowMid = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((nowMid - startMid) / 86_400_000) + 1);
}

export function profileSubtitle(
  profile: UserProfileResponse | null,
  user: User | null,
  home: HomeResponse | null,
  now: Date,
): string {
  const day = journeyDay(profile, user, now);
  const compound = home?.activeCompounds[0]?.name ?? home?.medicationLevels[0]?.compoundName ?? null;
  return compound ? `Day ${day} · ${compound}` : `Day ${day}`;
}
