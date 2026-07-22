# Apple Complimentary Access Design

**Date:** 2026-07-22

**Status:** Approved design; awaiting written-spec review before implementation planning.

**Goal:** Extend Pepta's existing complimentary-access system so an exact Apple-verified email can claim an invitation automatically, while an operator can securely link a Sign in with Apple private-relay account to a pre-approved real-email invitation. The change must work with the already-uploaded iOS build 18 and preserve the existing three-month, RevenueCat, audit, retry, and paid-subscription invariants.

## Relationship to the Existing Design

This document amends `docs/superpowers/specs/2026-07-21-complimentary-access-design.md`. It supersedes that document's Google-only identity-binding and Google-only claim requirements. All other complimentary-access invariants remain in force, including exact normalization, one grant per email and user, delayed expiration calculation, RevenueCat authority, idempotent provisioning, tombstones, audit events, and independent paid access.

No frontend or shared-contract change is included. Build 18 already sends Apple identity tokens to the backend, waits for `/me/access/resolve`, understands every access-decision state this change returns, and bypasses referral/paywall routing when the backend returns `active`.

## Provider-Verified Email Binding

Replace the Google-specific binding helper with one provider-aware service operation:

```ts
bindVerifiedProviderEmail(
  user: UserDocument,
  provider: "google" | "apple",
  email: string,
): Promise<void>
```

The helper may update only the linked provider entry that already matches the authenticated provider and provider subject on the user. Authentication calls it only when the freshly verified Google or Apple identity token contains an email and asserts that the email is verified. It stores the normalized address in that provider entry's existing `verifiedEmailNormalized` field and records `emailVerifiedAt`. A request body, top-level profile email, unverified token email, or provider entry belonging to another provider never writes this proof.

Google authentication continues to bind its verified email. Apple authentication adds the same call after Apple JWT issuer, audience, signature, subject, email, and `email_verified` validation succeeds. Existing response contracts remain unchanged.

## Automatic Invitation Claim

Access resolution collects every provider-specific verified email stored on the authenticated user. A pending invitation is automatically eligible when its normalized email exactly equals one of those addresses, regardless of whether the proving provider is Google or Apple.

The resolver records which provider proved the match for audit context but otherwise reuses the existing claim and provisioning saga. The redemption tombstone is generated from the invitation's original normalized email. `requestedAt` and the three-calendar-month `expiresAt` are created only when the claim wins its atomic transition to provisioning.

Apple private-relay addresses are ordinary exact addresses. A real iCloud invitation never automatically matches a different `@privaterelay.appleid.com` assertion. Pepta does not attempt to infer, derive, or obtain the hidden real Apple ID email.

## Operator-Authorized Apple Link

Add an `access:link-apple` admin command with this interface:

```text
npm run access:link-apple -- \
  --invite-email creator@icloud.com \
  --account-email relay@privaterelay.appleid.com \
  --reason "Creator confirmed private relay"
```

Production mutations continue to require `CONFIRM_PRODUCTION=yes`. Routine output masks both addresses and never prints Apple subjects, tokens, secrets, or full user records.

The service operation behind the CLI performs these checks before writing:

1. The invitation exists and is still `pending`.
2. The target account email resolves to exactly one Pepta user.
3. That user has an Apple auth-provider entry.
4. The account email is either the Apple provider's stored verified email or a legacy, verified top-level email on an Apple-only account. The legacy fallback is not allowed when a Google provider is also linked.
5. The invitation is not already attached to another user.
6. The target user is not already attached to another complimentary grant.

The atomic link update keeps the invitation `pending`, sets its existing `userId` to the selected Pepta user, and adds these optional audit fields:

```text
identityLinkProvider: apple
identityLinkedAt
identityLinkedBy
identityLinkReason
```

The partial unique `userId` index remains the cross-grant exclusivity guard. `claimedAt`, `requestedAt`, `operationId`, `grantedAt`, and `expiresAt` remain absent until provisioning actually begins.

After linking, the service invokes the same access resolver used by authentication. A pending grant attached through a valid Apple admin link may enter the existing provisioning saga even though the user's private-relay email differs from the invitation email. If the CLI environment cannot reach or authenticate to RevenueCat, the durable link remains pending; the next production `/me/access/resolve` resumes provisioning without needing another admin mutation. The creator reopens or refreshes Pepta and build 18 receives `provisioning` or `active`, never a client-manufactured entitlement.

## Resolver Precedence

For an authenticated user, complimentary resolution checks in this order:

1. A grant already claimed by `userId`.
2. A pending grant deliberately linked to that `userId` by the Apple admin-link operation.
3. A pending invitation whose email exactly matches any provider-specific verified email.
4. No complimentary grant; continue through standard RevenueCat subscription resolution.

A pending grant with `userId` is claimable only when it contains a valid Apple identity-link audit record or when a current provider-specific verified email exactly matches the invitation. Merely setting a user ID in MongoDB without the link metadata cannot bypass identity validation.

## Failure and Concurrency Behavior

- Missing, revoked, expired, active, or already-claimed invitations are rejected without mutation.
- Zero or multiple matching users are rejected without mutation.
- A Google-only user cannot be linked by `access:link-apple`.
- Concurrent links use a conditional `pending` update plus the existing unique `userId` index; only one can win.
- Duplicate execution for the same invitation and same user is idempotent and returns the current status.
- A duplicate execution targeting a different user is a conflict.
- RevenueCat failure follows the existing retryable/terminal classification and never deletes the durable identity link.
- Revocation, expiration, account deletion, and paid-subscription coexistence continue through the existing complimentary-access and reconciliation services.

## Build 18 Compatibility and UX

Successful exact-email and manually linked users require no mobile release. Build 18 already routes `active` users past the referral screen and paywall and shows the setup screen for `provisioning` or temporary unavailability.

Before an operator links a private-relay account, the backend cannot know that it belongs to the real-email invitation. That user can therefore reach the normal paywall after the first Apple login. The creator must be told not to purchase; the operator links the now-existing Pepta account, and the creator then reopens or refreshes the app. Provider-neutral identity-verification copy is intentionally deferred to a later mobile build because changing it is not required for functional Apple access.

## Testing

Tests must be written and observed failing before production changes.

Authentication tests cover:

- a verified Apple token email is stored on the matching Apple provider entry;
- an unverified or missing Apple email is never stored as provider proof;
- Google verified-email binding remains unchanged.

Complimentary-service tests cover:

- an exact Apple-verified email automatically claims and provisions a pending invitation;
- an Apple relay email does not automatically claim a different real-email invitation;
- a valid operator-linked Apple user can claim despite the email mismatch;
- a pending `userId` without Apple link metadata cannot bypass proof;
- duplicate same-user linking is idempotent;
- different-user, non-Apple, ambiguous-user, non-pending, and already-granted link attempts fail without mutation;
- requested and expiration timestamps remain absent at link time and are calculated only when provisioning begins;
- Google claim, retry, revocation, tombstone, paid-subscription, and access-gate regressions remain green.

CLI tests or service-level command tests verify argument validation, production confirmation, masked output, and delegation to the shared service rather than duplicating domain logic.

Release verification consists of backend typecheck, lint, the full shared/backend/frontend test suites, backend build, a clean diff check, and an inspection of the pending creator invitation after deployment. No iOS archive is required for this backend-only change.
