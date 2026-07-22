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
  invited user without verified Google binding -> verify invited Google account
  unresolved state -> setup/retry screen
```

The returning-user route is:

```text
Restore session -> Access Gate
  active -> Main app
  inactive/expired -> Subscription Gate
  invited user without verified Google binding -> verify invited Google account
  provisioning/unavailable without usable cache -> setup/retry screen
  unavailable with usable cache -> Main app in bounded offline mode
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
- `complimentary-access-redemption.model.ts`: non-reversible, privacy-preserving one-grant tombstones.
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
- `AccessIdentityVerificationScreen.tsx`: reauthentication UX for a matching invitation that lacks Google-specific email proof.
- `SubscriptionGate.tsx`: returning-user paywall with restore, sign-out, account/support, legal, and deletion paths.
- `revenueCat.ts`: SDK identity, `getCustomerInfo`, purchase, and restore only.
- `api.ts`: typed access-resolution calls using shared contracts.

Existing files should receive only small integration changes. New logic belongs in focused modules with direct unit tests.

## Shared Contracts

The shared package owns all access request and response schemas. Add normalized source facts and a discriminated access-decision contract:

```ts
type AccessSource = {
  kind: "promotional" | "app_store";
  expiresAt: string | null;
  willRenew: boolean;
  productId?: string;
  environment?: "sandbox" | "production";
};

type AccessDecision =
  | {
      state: "active";
      source: "promotional" | "app_store" | "mixed";
      sources: AccessSource[];
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
      state: "identity_verification_required";
      provider: "google";
      reason: "invited_email_requires_verified_google";
    }
  | {
      state: "temporarily_unavailable";
      retryAfterMs: number;
      cachedAccess?: {
        source: "promotional" | "app_store" | "mixed";
        sources: AccessSource[];
        validUntil: string;
        willRenew: boolean;
        lastVerifiedAt: string;
      };
};
```

For active access, `sources` contains every currently active source. Top-level `expiresAt` is the latest currently known end among those sources, or `null` when any source has no known end; top-level `willRenew` is true when any active source renews. The top-level fields drive gating, while `sources` drives accurate Account UI. Cached access preserves the same last-verified sources, and `validUntil` is the exact bounded time through which the client may continue offline. Shared Zod refinements require at least one source for active/cached access, require `mixed` to contain both source kinds, require single-source labels to match their source array, and reject a cached `validUntil` beyond the applicable promotional expiration or paid-verification grace.

The existing authentication and user response shapes remain unchanged for backward compatibility with already-shipped clients whose Zod schemas are strict. The new frontend receives `AccessDecision` only from authenticated `POST /me/access/resolve`, which is idempotent and may resume a pending provisioning saga and reconcile stale RevenueCat state. `AuthContext` continues to own authentication only; `AccessContext` observes the authenticated session and immediately resolves access before any referral, paywall, welcome, or main-app route renders. Persisted legacy auth blobs therefore remain readable and do not sign users out during rollout.

Protected API failures use existing Pepta error envelopes with these stable codes:

- `ENTITLEMENT_REQUIRED` with HTTP 403 for confirmed inactive access.
- `ACCESS_PROVISIONING` with HTTP 409 while an approved grant is in progress.
- `ACCESS_IDENTITY_VERIFICATION_REQUIRED` with HTTP 409 when a matching invitation still needs verified Google authentication.
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

Pending invitations remain claimable until an operator explicitly revokes them; they do not silently disappear through a TTL. Monitoring reports pending invitations older than 30 days so operators can inspect or revoke stale entries.

Create a separate `complimentary_access_redemptions` collection when an invitation is claimed. It contains only a domain-separated keyed HMAC-SHA256 fingerprint of the normalized email, its `keyId`, `redeemedAt`, and `category`, with a unique `keyId + fingerprint` index. It exists specifically to prevent a deleted account or removed grant document from receiving a second introductory grant; it never contains the plaintext email or user ID. The grant claim and unique redemption insert occur in one MongoDB transaction, so neither can commit without the other and concurrent claimers cannot create a consumed-but-unclaimed gap.

## Provider-Specific Identity Binding

The existing top-level `emailVerified` field is not sufficient proof because it can originate from Apple. Extend the internal linked-auth-provider subdocument with optional `verifiedEmailNormalized` and `emailVerifiedAt` fields. These fields are written only from a currently verified provider token; a Google entry receives them only when Google's token says the email is verified. They remain server-only and are omitted by `serializeUser`, so the existing strict linked-provider and user response schemas do not change.

An invitation can be claimed only when its email exactly matches a Google provider entry's `verifiedEmailNormalized`. An Apple assertion, the general user `email`, the top-level `emailVerified` flag, request body data, and a legacy provider link with no Google-specific email assertion cannot authorize a claim. A successful new Google sign-in refreshes the binding. If a matching invitation exists but the authenticated user lacks this proof, access resolution returns `identity_verification_required` rather than inactive, ensuring the user sees Google reauthentication guidance instead of a paywall.

## Effective Entitlement Projection

Extend the persisted user entitlement subdocument while keeping `serializeUser` and the existing strict `userResponseSchema` on their legacy public shape. The new source and verification fields are exposed only through `AccessDecision`. Keep the current persisted `status`, `expiresAt`, `willRenew`, and RevenueCat identifiers, and add:

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

The reconciler computes effective access from all active sources. A promotional expiration or revocation cannot cancel an active paid subscription. A paid cancellation cannot cancel an independent active promotion. RevenueCat remains the history system; Pepta stores only the current projection and audit events. New account UI reads source details from `AccessContext`, not from the legacy serialized user entitlement.

## Atomic Claim and Provisioning Saga

The first authenticated access-resolution call runs immediately after authentication and user upsert. Authentication keeps its existing response contract; the access service uses the server-stored provider-specific assertion and then performs this saga:

1. Require an exact Google-specific verified email binding; return `identity_verification_required` for a matching pending invitation without one.
2. For a `pending` invitation, use one MongoDB transaction to insert the unique redemption tombstone and transition the grant to `provisioning`. The winning update attaches `userId`, sets `claimedAt` and `requestedAt`, generates `operationId`, calculates the intended expiration, sets `attemptCount` to one, and acquires a processing lease.
3. For an already claimed `retryable_failure`, atomically transition it to `provisioning` only when `nextAttemptAt <= now` and no valid lease exists. Increment `attemptCount` and acquire a new lease, but preserve `userId`, `claimedAt`, `requestedAt`, `operationId`, and `expiresAt` for that outbound grant generation; verify its redemption tombstone still exists and alert instead of granting if the invariant is broken.
4. Ensure a RevenueCat customer exists for the Pepta user ID. Customer creation conflicts are reconciled rather than treated as fatal.
5. Read current active entitlements before granting.
6. If the intended promotion already exists, reconcile and finish.
7. Otherwise grant the configured RevenueCat `pro` entitlement through API v2.
8. Read current RevenueCat state again and update the user's effective entitlement projection.
9. Transition the grant to `active`, set `grantedAt`, and remove lease, retry, and error fields.

For a non-invited user with no local RevenueCat identity or purchase history, a confirmed RevenueCat customer 404 resolves to `inactive/never_entitled`; Pepta does not create promotional access. If local history claims prior paid access but the custom customer cannot be found, Pepta returns `temporarily_unavailable` and investigates aliases instead of downgrading the user.

Only one concurrent request can win the atomic transition. All other callers read the existing state and either return active access or provisioning.

Three months means `addUtcCalendarMonths(requestedAt, 3)`, clamping to the final valid day when the target month is shorter. Every retry within one outbound grant generation reuses the same `operationId`, `requestedAt`, and `expiresAt`. A timeout never causes Pepta to calculate a new expiration blindly. If a fresh RevenueCat read positively proves that no remote promotional grant exists, the next leased worker creates a new audited operation generation with a new `operationId`, `requestedAt`, and three-month expiration before sending another grant. That is a new attempt after confirmed absence, not an extension of existing access. If a grant exists, Pepta adopts the existing RevenueCat expiration and never starts another generation.

## Failure Recovery

MongoDB is the durable work queue; Redis is not required for this feature. Provisioning records carry `nextAttemptAt` and a 30-second lease. A lightweight backend worker checks for due records every five seconds and claims them atomically. Client polling may also request the same idempotent service. Expired leases make work recoverable after crashes or deployments. Retryable failures use exponential backoff starting at five seconds, capped at 15 minutes, with jitter. After eight automatic attempts, Pepta stops automatic retries, alerts an operator, and requires `access:retry` while continuing to show approved users setup/support UX.

Failure behavior is deterministic:

| Failure | Recovery |
| --- | --- |
| Timeout, HTTP 423, 429, or 5xx | Mark retryable; exponential backoff with jitter; reconcile before another grant |
| Invited provisioning customer 404 | Create customer, then resume |
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
2. Extend and validate the shared webhook schema with typed `store`, `environment`, `event_timestamp_ms`, `period_type`, product, entitlement, alias, and expiration fields required by reconciliation. Unknown RevenueCat fields remain tolerated.
3. Insert the event into a unique durable inbox keyed by RevenueCat event ID. If an ID is absent, use a SHA-256 hash of the canonical validated payload as the deduplication key.
4. Return success promptly only after durable insertion, or when the deduplication key already exists. Return a retryable server error if MongoDB cannot durably accept a new event.
5. A worker processes pending inbox entries and reconciles the full customer state.
6. Mark the inbox entry succeeded only after reconciliation; otherwise schedule a retry.

`NON_RENEWING_PURCHASE` from store `PROMOTIONAL` is recognized as active, non-renewing promotional access. Promotional `CANCELLATION` or `EXPIRATION` triggers full-state reconciliation; the promotional source is removed only when the current customer state confirms it is inactive. `willRenew` is false for promotional access.

## RevenueCat Configuration

Add and validate these production-only secrets/configuration values:

```text
REVENUECAT_SECRET_API_KEY
REVENUECAT_PROJECT_ID
REVENUECAT_PRO_ENTITLEMENT_ID
COMPLIMENTARY_ACCESS_HMAC_ACTIVE_KEY_ID
COMPLIMENTARY_ACCESS_HMAC_KEYS_JSON
```

The HMAC keyring maps versioned key IDs to independent secrets of at least 32 random bytes. New tombstones use the active key and a fixed Pepta complimentary-access domain prefix; invite and claim checks compute candidate fingerprints with every retained key so an old tombstone remains enforceable after rotation. Old keys cannot be discarded while their tombstones must remain checkable because the plaintext email is intentionally unavailable for rehashing. Startup fails when the active key is missing, duplicated, malformed, or absent from the keyring. The existing `REVENUECAT_WEBHOOK_SECRET` remains separate. API and HMAC secrets are never returned, logged, bundled into the frontend, or accepted from request bodies.

The API client uses a five-second request timeout, typed response validation, safe error classification, masked structured logs, and the current RevenueCat API v2 endpoints for customer creation/read, active entitlements, grant, revoke, and subscription/source inspection. List helpers follow RevenueCat pagination until `next_page` is absent and enforce a defensive page cap so malformed responses cannot loop indefinitely.

## Revocation, Expiration, and Re-registration

Revocation behavior depends on whether a remote grant may exist. `pending`, `retryable_failure`, and `terminal_failure` records with no ambiguous outbound request transition directly to `revoked` without a RevenueCat call. `provisioning` records first reconcile any ambiguous request, then revoke if a remote promotion exists. Active access transitions `active -> revoking -> revoked`: Pepta calls RevenueCat's revoke-granted-entitlement action, reconciles the full customer, then updates the local record. Deleting or editing MongoDB alone never revokes remote access. If a paid source remains active, effective access remains active.

At the known promotional expiration, client timers and backend authorization treat the promotional source as inactive even before a delayed webhook arrives. Reconciliation records `expiredAt` and transitions the grant to `expired`.

The admin command handles users who already exist by attaching and provisioning immediately only when they already have the exact Google-specific verified email binding. Otherwise the invitation remains pending and access resolution requests Google verification rather than showing a paywall. A claimed invitation cannot be claimed again.

Account deletion uses the same revocation saga before removing an active promotional grant. If RevenueCat is unavailable, deletion records durable cleanup work and proceeds without making account deletion depend indefinitely on a vendor; the old RevenueCat App User ID is retained only in that cleanup record until revocation succeeds or an operator resolves it. After cleanup, the plaintext grant is removed while the separate redemption tombstone remains. Both `access:invite` and claim processing check that email against every retained HMAC key, so deleting and recreating an account cannot reset the benefit. Key rotation changes the active key ID while retaining older verification keys for existing tombstones.

## Client Access Gate and UX

The client access state is owned by `AccessContext`, not `App.tsx` or onboarding screens. It resolves access after authentication, during persisted-session boot, after purchase or restore, on foreground when the last online verification is at least five minutes old, and at known expiration.

`AccessGate` renders:

- active: `welcomeIn` for incomplete onboarding or `MainTabs` for completed onboarding;
- inactive: the normal referral/paywall path for new users or `SubscriptionGate` for returning users;
- provisioning: `AccessSetupScreen` with automatic retry;
- identity verification required: `AccessIdentityVerificationScreen` with Google reauthentication, account switching, and sign-out;
- temporarily unavailable with unexpired `cachedAccess`: the appropriate welcome/main shell in offline mode until `validUntil`;
- temporarily unavailable without usable cached access: retry/support UX, with no paywall fallback.

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

Home, tracking, progress, scans, coaching, AI, insights, and every authenticated product route outside the explicit allowlist require active effective access. Middleware reads the current projection and evaluates source expiration; it does not call RevenueCat on every request. A verified promotional projection remains usable until its exact `expiresAt`. A verified renewing store projection remains usable through its current period and defined 24-hour verification grace. Missing, expired, or internally contradictory projections use the shared access errors and trigger reconciliation. A modified mobile client cannot bypass the middleware.

## Offline and Foreground Policy

Promotional access is honored offline only until its known `expiresAt`. It receives no post-expiration grace because it cannot renew. A paid source with `willRenew: true` receives at most a 24-hour verification grace after its last known period end when RevenueCat and Pepta are unreachable. That grace never extends a promotional-only account and ends immediately when a fresh inactive result is received. A cached decision is checked against `validUntil` before the first routed render and whenever the app foregrounds; an expired cache can never open the app shell.

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
npm run access:invite -- --email <email> --category <creator|friend> --months 3 --reason <reason>
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

Shared-contract tests cover every discriminated access state and reject contradictory source, expiry, and cache shapes. Compatibility tests prove legacy strict auth/user responses remain unchanged and persisted legacy auth blobs still hydrate.

Model/service tests cover email normalization, provider-specific identity binding, Apple-versus-Google proof isolation, valid state transitions, optional lifecycle fields, partial unique indexes, transactional claim/tombstone creation, HMAC key rotation and old-key lookup, atomic claims, expired leases, fixed expiration reuse, terminal versus retryable errors, and audit events.

RevenueCat client contract tests mock HTTP at the boundary and cover create/read/grant/revoke, response validation, timeouts, 409 reconciliation, 429 backoff, and secret redaction.

Reconciler tests cover promotional grants, paid subscriptions, mixed sources, cancellation, expiration, revocation, duplicates, out-of-order webhooks, stale events, durable-inbox insertion failure, missing webhook IDs, and paid access surviving promotional removal.

Concurrency tests run multiple simultaneous auth/resolve requests and assert one outbound grant and one claimed invitation.

Frontend tests cover no paywall flash, creator routing, standard referral/paywall routing, Google identity-verification routing, setup retries, returning-user subscription gate, unexpired cached offline access, rejection of expired cached access, foreground refresh, expiration timer, purchase/restore resolution, and complimentary account copy.

Backend route tests assert premium middleware on every protected route and availability of the explicit recovery/account allowlist.

End-to-end release tests cover an exact verified creator email, Apple authentication with the same email, a legacy provider link without provider-specific proof, wrong Google account, existing user, ambiguous timeout, worker crash, grant, pending-invite revocation, active revocation, expiration, paid-plus-promo overlap, reinstall/login, deletion/re-registration tombstone enforcement, and promotional analytics exclusion.

## Rollout

1. Add backward-compatible shared schemas, models, and indexes; validate that the production MongoDB deployment supports transactions before enabling claims.
2. Add RevenueCat API v2 configuration with production startup validation.
3. Deploy backend access services, reconciliation, webhook inbox, worker, and middleware behind a feature flag.
4. Test with Pepta-owned accounts and confirm no paid analytics pollution.
5. Deploy frontend access context/gate, setup UI, returning subscription gate, and account copy.
6. Enable one internal production invitation.
7. Enable one trusted creator and monitor grant latency, routing, webhook reconciliation, and API authorization.
8. Expand to the remaining approved invitees.

Rollback disables new provisioning while leaving existing RevenueCat grants intact. The reconciler and access gate continue honoring valid current entitlements. Existing grants are revoked only through an explicit audited command.

## Approved Architecture Traceability

| Approved section | Required behavior | Specification coverage |
| --- | --- | --- |
| Section 1: source of truth and gate | RevenueCat authority, Google-specific verified email, Pepta user ID, no unknown-to-paywall fallback, mixed-source access, client and backend gates, referral isolation | Architectural Invariants; Shared Contracts; Provider-Specific Identity Binding; Effective Entitlement Projection; Client Access Gate; Global Backend Enforcement |
| Section 1: routing | Creators skip referral/paywall; standard users keep referral/paywall; returning expired users see a subscription gate; unexpired cached access has bounded offline behavior | Approved Product Behavior; Client Access Gate and UX; Offline and Foreground Policy |
| Section 2: durable data | Optional lifecycle fields, partial unique indexes, one-time claim, fixed operation generation, leases, retries, audit, revocation, re-registration protection | Complimentary Access Data Model; Atomic Claim and Provisioning Saga; Failure Recovery; Revocation, Expiration, and Re-registration; Audit and Observability |
| Section 2: RevenueCat correctness | API v2 server boundary, ensure/read/grant/reconcile, ambiguous timeout recovery, webhook dedupe and out-of-order safety, paid-plus-promo coexistence | RevenueCat Configuration; RevenueCat Webhook Inbox and Reconciliation; Effective Entitlement Projection |
| Section 3: cohesive integration | Shared contracts, no paywall flash, foreground and expiration refresh, purchase/restore reconciliation, account copy, premium middleware | Module Boundaries; Shared Contracts; Client Access Gate and UX; Global Backend Enforcement; Account UI |
| Section 3: operations | Secure CLI, analytics exclusions, observability, complete test matrix, staged rollout and rollback | Admin CLI; Analytics Integrity; Audit and Observability; Testing Strategy; Rollout |

## Acceptance Criteria

- An exact pre-approved, Google-verified email receives three months of production `pro` access and never renders the referral screen or paywall.
- A non-approved or mismatched email follows the normal referral and hard-paywall funnel.
- Apple verification, a top-level verified flag, request data, or a legacy Google link without an email assertion cannot claim an invitation; a matching invite routes to Google verification instead of the paywall.
- Repeated and concurrent authentication cannot duplicate or extend the grant.
- A network timeout after a successful remote grant reconciles without a second grant.
- Promotional expiration or revocation removes only promotional access; paid access survives.
- Complimentary-only access is blocked client-side and server-side after expiration.
- Returning expired users reach a subscription gate without repeating onboarding.
- Existing strict auth and user response contracts remain backward compatible; access decisions use only the new endpoint.
- Unexpired cached promotional access works offline only until its exact expiration; expired cache never opens the app.
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
