# Pepta Complimentary Access Design

**Date:** 2026-07-21

**Status:** Approved architecture; awaiting written-spec review before implementation planning.

**Goal:** Give pre-approved friends and creators three calendar months of production Pepta Plus access after they authenticate with an exact, provider-verified Google email. Approved users must never see or briefly flash the referral screen or paywall. RevenueCat remains the subscription source of truth, access expires automatically, paid subscriptions remain independent, and Pepta enforces access on both the client and backend.

## Approved Product Behavior

An operator adds a normalized email to Pepta's complimentary-access allowlist before the invitee signs in. Google verifies the email during authentication. Pepta creates or finds its MongoDB user, atomically claims the matching invitation, provisions a RevenueCat promotional `pro` entitlement using the Pepta MongoDB user ID, reconciles the full RevenueCat customer state, and returns an access decision.

The new-user route is:

```text
Auth -> Access Gate
  approved creator -> provision -> welcomeIn
  existing subscriber -> welcomeIn
  standard user -> referral -> paywall -> welcomeIn
  unresolved state -> setup/retry screen
```

The returning-user route is:

```text
Restore session -> Access Gate
  active -> Main app
  inactive/expired -> Subscription Gate
  provisioning/unavailable -> setup/retry screen
```

The existing referral-code feature remains attribution-only. It must not read or mutate complimentary-access or subscription state.

## Architectural Invariants

1. RevenueCat is the subscription source of truth. Pepta stores a synchronized access projection for routing, UI, and backend authorization.
2. Only an email verified in a Google identity token can claim an email invitation. The mobile client cannot supply the email used for matching.
3. The Pepta MongoDB `_id`, serialized as a string, is the RevenueCat App User ID. Email and Google provider IDs are never RevenueCat customer IDs.
4. RevenueCat secret keys remain server-only and use the narrowest API v2 permissions required for customer and entitlement management.
5. A paywall is shown only after Pepta has positively resolved the user as inactive. A timeout, stale state, or provisioning state never falls through to the paywall.
6. Complimentary grants use one fixed expiration per confirmed outbound grant attempt. Concurrent logins and retries cannot stack or silently extend access.
7. Webhooks are durable reconciliation signals, not direct last-event-wins mutations. Effective access is derived from the customer's complete current RevenueCat state.
8. Paid and promotional access may coexist. The user has access while any trusted source grants the `pro` entitlement.
9. The client gate controls UX; backend middleware independently protects premium operations.
10. Complimentary access ends at its known expiration without an offline grace period. A renewing store subscription receives at most the separately defined 24-hour verification grace when both RevenueCat and Pepta are unreachable.

## Module Boundaries

Implementation must remain modular and follow Pepta's existing route/service/model/shared-contract structure. No feature orchestration belongs in `App.tsx`, `OnboardingNavigator.tsx`, route handlers, or the current RevenueCat webhook file.

Backend responsibilities are separated as follows:

- `complimentary-access.model.ts`: invitation/grant state and indexes.
- `access-audit-event.model.ts`: append-only access audit events.
- `revenuecat-webhook-inbox.model.ts`: durable, idempotent webhook intake and retry state.
- `revenuecat.client.ts`: typed RevenueCat API v2 HTTP boundary; no product decisions.
- `complimentary-access.service.ts`: invitation creation, atomic claim, provisioning saga, retry, expiration, and revocation.
- `entitlement-reconciler.service.ts`: converts complete RevenueCat customer state into Pepta's effective entitlement projection.
- `access-decision.service.ts`: returns the shared access-decision contract from invitation, entitlement, expiry, and verification state.
- `access.routes.ts`: thin authenticated endpoints that validate shared Zod contracts and call services.
- `require-active-access.ts`: backend authorization middleware with structured access errors.
- `access-admin.ts`: CLI adapter that calls the same service layer used by authentication and workers.

Frontend responsibilities are separated as follows:

- `AccessContext.tsx`: access-decision state, refresh lifecycle, persistence, and foreground timers.
- `AccessGate.tsx`: pure routing switch for active, inactive, provisioning, and unavailable states.
- `AccessSetupScreen.tsx`: provisioning/retry UI.
- `SubscriptionGate.tsx`: returning-user paywall with restore, sign-out, account/support, legal, and deletion paths.
- `revenueCat.ts`: SDK identity, `getCustomerInfo`, purchase, and restore only.
- `api.ts`: typed access-resolution calls using shared contracts.

Existing files should receive only small integration changes. New logic belongs in focused modules with direct unit tests.

## Shared Contracts

The shared package owns all access request and response schemas. Add a discriminated access-decision contract:

```ts
type AccessDecision =
  | {
      state: "active";
      source: "promotional" | "app_store" | "mixed";
      expiresAt: string | null;
      willRenew: boolean;
      lastVerifiedAt: string;
    }
  | {
      state: "inactive";
      reason: "never_entitled" | "expired" | "revoked";
      lastVerifiedAt: string;
    }
  | {
      state: "provisioning";
      retryAfterMs: number;
    }
  | {
      state: "temporarily_unavailable";
      retryAfterMs: number;
      cachedActiveUntil?: string;
    };
```

The authentication response includes `accessDecision`. `POST /me/access/resolve` returns the same contract and is authenticated and idempotent. The endpoint may resume a pending provisioning saga and reconcile stale RevenueCat state.

Protected API failures use existing Pepta error envelopes with these stable codes:

- `ENTITLEMENT_REQUIRED` with HTTP 403 for confirmed inactive access.
- `ACCESS_PROVISIONING` with HTTP 409 while an approved grant is in progress.
- `ACCESS_VERIFICATION_UNAVAILABLE` with HTTP 503 when Pepta cannot safely decide.

Only `ENTITLEMENT_REQUIRED` routes the client to a paywall.

## Complimentary Access Data Model

Create `complimentary_access_grants` with these always-present fields:

```text
emailNormalized
category: creator | friend
reason
status
durationMonths: 3
attemptCount: 0+
createdBy
createdAt
updatedAt
```

Lifecycle fields are optional and absent until the associated event occurs. They are not stored as placeholder `null` values.

```text
userId
claimedAt
requestedAt
grantedAt
expiresAt
expiredAt
revokedAt
operationId
nextAttemptAt
lastErrorCode
leaseId
leaseExpiresAt
```

Valid statuses are:

```text
pending
provisioning
retryable_failure
active
revoking
revoked
expired
terminal_failure
```

Required indexes:

- unique `emailNormalized`;
- unique partial `userId` when it exists;
- unique partial `operationId` when it exists;
- compound `status + nextAttemptAt` for retries;
- `leaseExpiresAt` for crash recovery.

Email normalization is trim plus lowercase only. Pepta does not infer Gmail dots, plus aliases, or domain equivalence.

## Effective Entitlement Projection

Extend the existing user entitlement subdocument without breaking current consumers. Keep the current `status`, `expiresAt`, `willRenew`, and RevenueCat identifiers, and add:

```text
effectiveAccess: active | inactive
source: promotional | app_store | mixed | none
sources[]: current normalized access sources
lastVerifiedAt
verificationState: verified | stale | unavailable
```

Each source records only current access facts, not transaction history:

```text
kind
active
expiresAt
willRenew
productId, when available
environment, when available
```

The reconciler computes effective access from all active sources. A promotional expiration or revocation cannot cancel an active paid subscription. A paid cancellation cannot cancel an independent active promotion. RevenueCat remains the history system; Pepta stores only the current projection and audit events.

## Atomic Claim and Provisioning Saga

After Google token verification and user upsert:

1. Require a verified normalized email.
2. Atomically transition the matching invitation from `pending`, or from `retryable_failure` when `nextAttemptAt <= now` and no valid lease exists, to `provisioning`.
3. In the winning update, attach `userId`, set `claimedAt` and `requestedAt`, generate `operationId`, calculate the intended expiration, increment `attemptCount`, and acquire a processing lease.
4. Ensure a RevenueCat customer exists for the Pepta user ID. Customer creation conflicts are reconciled rather than treated as fatal.
5. Read current active entitlements before granting.
6. If the intended promotion already exists, reconcile and finish.
7. Otherwise grant the configured RevenueCat `pro` entitlement through API v2.
8. Read current RevenueCat state again and update the user's effective entitlement projection.
9. Transition the grant to `active`, set `grantedAt`, and remove lease, retry, and error fields.

Only one concurrent request can win the atomic transition. All other callers read the existing state and either return active access or provisioning.

Three months means `addUtcCalendarMonths(requestedAt, 3)`, clamping to the final valid day when the target month is shorter. A timeout never causes Pepta to calculate a new expiration blindly. If a fresh RevenueCat read positively proves that no remote promotional grant exists, the next leased attempt replaces `requestedAt` and calculates a new three-month expiration before sending another grant. If a grant exists, Pepta adopts the existing RevenueCat expiration.

## Failure Recovery

MongoDB is the durable work queue; Redis is not required for this feature. Provisioning records carry `nextAttemptAt` and a 30-second lease. A lightweight backend worker checks for due records every five seconds and claims them atomically. Client polling may also request the same idempotent service. Expired leases make work recoverable after crashes or deployments. Retryable failures use exponential backoff starting at five seconds, capped at 15 minutes, with jitter. After eight automatic attempts, Pepta stops automatic retries, alerts an operator, and requires `access:retry` while continuing to show approved users setup/support UX.

Failure behavior is deterministic:

| Failure | Recovery |
| --- | --- |
| Timeout, HTTP 423, 429, or 5xx | Mark retryable; exponential backoff with jitter; reconcile before another grant |
| Customer 404 | Create customer, then resume |
| Grant 409 | Treat as a possible concurrent/duplicate grant and reconcile |
| HTTP 400, 401, 403, or 422 | Mark terminal configuration failure and alert |
| Process crash | Lease expires and another worker resumes |
| Ambiguous grant response | Read current RevenueCat state before deciding whether to retry |
| Duplicate webhook | Unique inbox event ID returns the existing result |
| Out-of-order webhook | Full-state reconciliation determines effective access |
| Unknown customer during webhook processing | Retain inbox item for retry instead of acknowledging and discarding it |

Approved users in retryable or terminal provisioning failures see setup/support UX, not a paywall.

## RevenueCat Webhook Inbox and Reconciliation

Replace direct last-event-wins mutation with an inbox pattern:

1. Verify the webhook bearer secret with the existing timing-safe check.
2. Validate the shared webhook schema.
3. Insert the event into a unique durable inbox keyed by RevenueCat event ID.
4. Return success promptly for new and duplicate valid events.
5. A worker processes pending inbox entries and reconciles the full customer state.
6. Mark the inbox entry succeeded only after reconciliation; otherwise schedule a retry.

`NON_RENEWING_PURCHASE` from store `PROMOTIONAL` is recognized as active, non-renewing promotional access. Promotional `CANCELLATION` or `EXPIRATION` removes only that source. `willRenew` is false for promotional access.

## RevenueCat Configuration

Add and validate these production-only secrets/configuration values:

```text
REVENUECAT_SECRET_API_KEY
REVENUECAT_PROJECT_ID
REVENUECAT_PRO_ENTITLEMENT_ID
COMPLIMENTARY_ACCESS_HASH_SECRET
```

The existing `REVENUECAT_WEBHOOK_SECRET` remains separate. API secrets are never returned, logged, bundled into the frontend, or accepted from request bodies.

The API client uses a five-second request timeout, typed response validation, safe error classification, masked structured logs, and the current RevenueCat API v2 endpoints for customer creation/read, active entitlements, grant, revoke, and subscription/source inspection.

## Revocation, Expiration, and Re-registration

Revocation transitions `active -> revoking -> revoked`. Pepta calls RevenueCat's revoke-granted-entitlement action, reconciles the full customer, then updates the local record. Deleting or editing MongoDB alone never revokes remote access. If a paid source remains active, effective access remains active.

At the known promotional expiration, client timers and backend authorization treat the promotional source as inactive even before a delayed webhook arrives. Reconciliation records `expiredAt` and transitions the grant to `expired`.

The admin command handles users who already exist by attaching their verified user and provisioning immediately. If the account does not exist, the invitation remains pending. A claimed invitation cannot be claimed again. Account deletion removes the normalized email and user reference but retains a keyed HMAC-SHA256 redemption fingerprint derived from the normalized email with the dedicated `COMPLIMENTARY_ACCESS_HASH_SECRET`. The fingerprint, redemption timestamp, and grant category are the only retained tombstone fields used to prevent deleting and recreating an account from resetting the benefit.

## Client Access Gate and UX

The client access state is owned by `AccessContext`, not `App.tsx` or onboarding screens. It resolves access after authentication, during persisted-session boot, after purchase or restore, on foreground when the last online verification is at least five minutes old, and at known expiration.

`AccessGate` renders:

- active: `welcomeIn` for incomplete onboarding or `MainTabs` for completed onboarding;
- inactive: the normal referral/paywall path for new users or `SubscriptionGate` for returning users;
- provisioning: `AccessSetupScreen` with automatic retry;
- temporarily unavailable: retry/support UX, with no paywall fallback.

The first render is held on Pepta's branded background until a decision exists. Approved creators skip the referral screen and paywall. A returned inactive user does not repeat onboarding.

`AccessSetupScreen` uses calm neutral copy, automatic client retries after 1, 2, 4, 8, and then every 15 seconds, a manual retry action, and sign-out. A support action appears after 30 seconds. It never exposes internal error codes or promises access before confirmation.

The RevenueCat frontend service adds `getCustomerInfo()` after identifying the Pepta user. The SDK result improves immediate UI responsiveness, but backend resolution remains authoritative for protected APIs.

After purchase or restore, the client may optimistically display active state only while it immediately calls `/me/access/resolve`. Main product APIs are not considered unlocked until the backend independently confirms RevenueCat state.

## Global Backend Enforcement

Apply `requireActiveAccess` to authenticated product routes by default. Keep a small explicit allowlist available without premium:

- authentication;
- access resolution;
- referral attribution;
- RevenueCat webhooks;
- onboarding persistence needed to reach purchase;
- account support, sign-out, legal access, and deletion;
- health/status endpoints.

Home, tracking, progress, scans, coaching, AI, insights, and other product data require active effective access. Middleware reads the current projection, checks expiration, and refuses stale or unsafe decisions with the shared structured errors. A modified mobile client cannot bypass it.

## Offline and Foreground Policy

Promotional access is honored offline only until its known `expiresAt`. It receives no post-expiration grace because it cannot renew. A paid source with `willRenew: true` receives at most a 24-hour verification grace after its last known period end when RevenueCat and Pepta are unreachable. That grace never extends a promotional-only account and ends immediately when a fresh inactive result is received.

The client schedules an expiration timer while open and refreshes on foreground when the last online verification is at least five minutes old. It does not rely solely on app relaunch or webhooks.

## Account UI

Account presentation derives from normalized sources:

| Source | Label | Action |
| --- | --- | --- |
| Promotional | `Complimentary access - ends <date>` | Support only |
| App Store | `Renews/ends <date>` | Manage subscription |
| Mixed | Show store status plus complimentary date | Manage subscription |
| Expired/inactive | `Access ended` | Resubscribe |

A promotional-only user is never sent to Apple's subscription-management screen.

## Admin CLI

Provide focused commands that all call the same domain service:

```text
npm run access:invite -- --email <email> --months 3 --reason <reason>
npm run access:list
npm run access:inspect -- --email <email>
npm run access:retry -- --email <email>
npm run access:revoke -- --email <email>
```

Mutation commands support dry-run, require explicit production confirmation, record the operator, mask emails in routine output, and fail safely when configuration targets do not match the intended environment. No web admin dashboard is included in this version.

## Audit and Observability

Every invitation creation, claim, provision attempt, success, retry, failure, reconciliation, expiration, and revocation appends an audit event with grant ID, previous and next state, actor, correlation/operation ID, timestamp, user ID or masked email, reason, and safe error classification.

Never record OAuth tokens, RevenueCat secrets, authorization headers, or raw sensitive provider payloads.

Emit structured metrics for provisioning success rate and latency, stuck records, retry exhaustion, RevenueCat configuration errors, webhook reconciliation failures, entitlement drift, expiration/revocation outcomes, and promotional events entering paid analytics. Alert on provisioning records stuck beyond five minutes and on terminal configuration failures.

## Analytics Integrity

Track operational events without raw email:

```text
complimentary_access_invited
complimentary_access_provisioning
complimentary_access_granted
complimentary_access_failed
complimentary_access_expired
complimentary_access_revoked
```

RevenueCat promotional events must not count as paid purchases, subscription conversions, revenue, ROAS, or SKAN paid-conversion events. Filters use promotional store/period markers, `rc_promo` product identifiers when present, and zero revenue. Review direct RevenueCat-to-AppsFlyer/Meta/TikTok mappings as well as Pepta-owned event forwarding.

RevenueCat treats granted-entitlement transactions as production events even for sandbox users. Automated, CI, and non-production integration testing use a separate RevenueCat project and credentials. Production smoke tests use dedicated Pepta-owned accounts and explicit operator confirmation.

## Testing Strategy

Write tests at module boundaries rather than one oversized integration fixture.

Shared-contract tests cover every discriminated access state and reject contradictory shapes.

Model/service tests cover email normalization, valid state transitions, optional lifecycle fields, partial unique indexes, atomic claims, expired leases, fixed expiration reuse, terminal versus retryable errors, and audit events.

RevenueCat client contract tests mock HTTP at the boundary and cover create/read/grant/revoke, response validation, timeouts, 409 reconciliation, 429 backoff, and secret redaction.

Reconciler tests cover promotional grants, paid subscriptions, mixed sources, cancellation, expiration, revocation, duplicates, out-of-order webhooks, stale events, and paid access surviving promotional removal.

Concurrency tests run multiple simultaneous auth/resolve requests and assert one outbound grant and one claimed invitation.

Frontend tests cover no paywall flash, creator routing, standard referral/paywall routing, setup retries, returning-user subscription gate, foreground refresh, expiration timer, purchase/restore resolution, and complimentary account copy.

Backend route tests assert premium middleware on every protected route and availability of the explicit recovery/account allowlist.

End-to-end release tests cover an exact verified creator email, wrong Google account, existing user, ambiguous timeout, worker crash, grant, expiration, revocation, paid-plus-promo overlap, reinstall/login, and promotional analytics exclusion.

## Rollout

1. Add backward-compatible shared schemas, models, and indexes.
2. Add RevenueCat API v2 configuration with production startup validation.
3. Deploy backend access services, reconciliation, webhook inbox, worker, and middleware behind a feature flag.
4. Test with Pepta-owned accounts and confirm no paid analytics pollution.
5. Deploy frontend access context/gate, setup UI, returning subscription gate, and account copy.
6. Enable one internal production invitation.
7. Enable one trusted creator and monitor grant latency, routing, webhook reconciliation, and API authorization.
8. Expand to the remaining approved invitees.

Rollback disables new provisioning while leaving existing RevenueCat grants intact. The reconciler and access gate continue honoring valid current entitlements. Existing grants are revoked only through an explicit audited command.

## Acceptance Criteria

- An exact pre-approved, Google-verified email receives three months of production `pro` access and never renders the referral screen or paywall.
- A non-approved or mismatched email follows the normal referral and hard-paywall funnel.
- Repeated and concurrent authentication cannot duplicate or extend the grant.
- A network timeout after a successful remote grant reconciles without a second grant.
- Promotional expiration or revocation removes only promotional access; paid access survives.
- Complimentary-only access is blocked client-side and server-side after expiration.
- Returning expired users reach a subscription gate without repeating onboarding.
- Promotional-only users see accurate account copy and no Apple Manage Subscription action.
- Promotional events are excluded from paid acquisition and revenue reporting.
- Admin mutations are audited, production-confirmed, reversible through explicit revocation, and use the same domain service as authentication.
- New implementation files remain focused; route, navigator, app-shell, and integration files contain only orchestration hooks.
- All shared Zod schemas, TypeScript types, backend responses, frontend parsing, and tests remain contract-aligned.

## Non-Goals

- No public promo-code premium unlock.
- No change to referral attribution semantics.
- No hardcoded email array or deployment per invite.
- No web admin dashboard in this version.
- No automatic Apple Hide My Email matching; invited users must use the approved Google email.
- No future-dated promotional start or paid-subscription deferral.
- No manual entitlement edits that bypass RevenueCat.
