# Apple Complimentary Access Design

**Date:** 2026-07-22

**Status:** Approved for full implementation on 2026-07-23.

**Goal:** Extend Pepta's existing complimentary-access system so an exact Apple-verified email can claim an invitation automatically, while an operator can securely link a Sign in with Apple private-relay account to a pre-approved real-email invitation. The change must work with the already-uploaded iOS build 18 and preserve the existing three-month, RevenueCat, audit, retry, and paid-subscription invariants.

## Relationship to the Existing Design

This document amends `docs/superpowers/specs/2026-07-21-complimentary-access-design.md`. It supersedes that document's Google-only identity-binding and Google-only claim requirements. All other complimentary-access invariants remain in force, including exact normalization, one grant per email and user, delayed expiration calculation, RevenueCat authority, idempotent provisioning, tombstones, audit events, and independent paid access.

No frontend or shared-contract change is included. Build 18 already sends Apple identity tokens to the backend, waits for `/me/access/resolve`, understands every access-decision state this change returns, and bypasses referral/paywall routing when the backend returns `active`.

## Audit-Discovered Prerequisite Repairs

Repository inspection found three existing integration gaps that would violate the inherited complimentary-access invariants if left in place. They are included in this backend release rather than hidden behind the Apple-specific scope:

1. `resolveAccess` currently catches a complimentary resolver exception and falls through to ordinary subscription resolution. It must instead return `temporarily_unavailable`, as specified under Resolver Precedence, so a transient complimentary database failure cannot produce a paywall.
2. `/diagnostics`, `/measurements`, and `/research-library` are authenticated product routes but are mounted without `requireActiveAccess`. They must use the same premium middleware chain as the other product routes. Route-matrix tests must enumerate every premium and recovery route so a future mount cannot silently bypass the gate.
3. `deleteCurrentUser` currently deletes the user without invoking complimentary revocation or cleanup. A focused account-deletion integration must inspect the user's grant before deleting the user. A pending grant with no possible remote effect is removed directly. A grant that may have reached RevenueCat first creates a durable cleanup task containing the old RevenueCat App User ID and entitlement ID but no email; deletion then attempts promotional-only revocation. Success completes and removes the task, while failure retains it for bounded-backoff worker and admin retries without retaining the user or plaintext invitation. The redemption tombstone remains. This keeps account deletion available during a RevenueCat outage without leaking promotional access forever or allowing a second introductory grant.

The cleanup model, worker hook, and admin retry command remain separate from auth and invitation orchestration. Cleanup never revokes or alters an independent paid App Store subscription.

## Provider-Verified Email Binding

Move verified-email persistence out of the already-large complimentary-access service into a focused provider-identity binding module. Replace the Google-specific helper with one provider-aware, subject-bound operation:

```ts
bindVerifiedProviderEmail({
  userId: Types.ObjectId,
  provider: "google" | "apple",
  providerUserId: string,
  email: string,
  verifiedAt: Date,
}): Promise<void>
```

The helper performs one conditional database update that matches the Pepta user ID, provider name, and authenticated provider subject, then updates only that exact array entry. Authentication calls it only when the freshly verified Google or Apple identity token contains an email and asserts that the email is verified. It stores the normalized address in that provider entry's existing `verifiedEmailNormalized` field and refreshes `emailVerifiedAt` on every verified authentication, including when the address is unchanged. A request body, top-level profile email, unverified token email, or provider entry belonging to another provider or subject never writes or clears this proof.

Google authentication continues to bind its verified email. Apple authentication adds the same call after Apple JWT issuer, audience, signature, subject, email, and `email_verified` validation succeeds. A conditional-update miss or persistence error is an authentication service failure and is logged with the Pepta user ID and provider only; it is not swallowed, because returning a successful session without the proof can incorrectly route an approved user. Existing success-response contracts remain unchanged.

## Automatic Invitation Claim

Access resolution collects every provider-specific verified email stored on the authenticated user. An unlinked pending invitation is automatically eligible when its normalized email exactly equals one of those addresses, regardless of whether the proving provider is Google or Apple. A pending invitation already linked to a different `userId` is never eligible through email matching. The resolver loads all eligible pending invitations rather than accepting an arbitrary `findOne` result. Exactly one match may proceed; multiple matches return `temporarily_unavailable`, write a safe operator-visible conflict audit, and require an operator to revoke the duplicate invitation. This preserves the one-grant-per-user invariant deterministically.

The resolver records which provider proved the match for audit context but otherwise reuses the existing claim and provisioning saga. The redemption tombstone is generated from the invitation's original normalized email. `requestedAt` and the three-calendar-month `expiresAt` are created only when the claim wins its atomic transition to provisioning.

The final pending-to-provisioning update rechecks identity ownership atomically. An exact-email claim requires `userId` to remain absent and the invitation email to remain one of the current provider proofs; an operator-linked claim requires `userId` to equal the current user and every required Apple link field to remain present. Neither path can overwrite a `userId` written by the other path or by another user.

Creating a new invitation performs the inverse uniqueness check before immediate provisioning: zero existing users leaves it pending, one provider-verified user may resolve immediately, and multiple matching users leave it pending with a conflict audit. The system never chooses an arbitrary user.

Apple private-relay addresses are ordinary exact addresses. A real iCloud invitation never automatically matches a different relay assertion. Pepta does not attempt to infer, derive, or obtain the hidden real Apple ID email, and it does not classify identity trust by domain suffix. Existing relay domains and Apple's new `private.icloud.com` domain are accepted by the same normal email validation.

## Operator-Authorized Apple Link

Add an `access:link-apple` admin command with this interface:

```text
npm run access:link-apple -- \
  --invite-email creator@icloud.com \
  --account-email relay@privaterelay.appleid.com \
  --reason "Creator confirmed private relay"
```

The command also supports `--dry-run`, which performs validation and reports the intended masked link without mutating either collection or contacting RevenueCat. Production mutations continue to require `CONFIRM_PRODUCTION=yes`. Routine output masks both addresses and never prints Apple subjects, tokens, secrets, or full user records. The operator and reason are required non-empty audit inputs.

The service operation behind the CLI performs these checks before writing:

1. The invitation exists and is still `pending`.
2. The normalized target account email resolves to exactly one Pepta user through trusted identity evidence, not a general profile-email search.
3. That user has an Apple auth-provider entry.
4. The account email is either that Apple entry's stored verified email or a legacy, verified top-level email on an Apple-only account. The legacy fallback requires `emailVerified: true` and is not allowed when a Google provider is also linked.
5. The invitation is not already attached to another user.
6. The target user is not already attached to another complimentary grant.

The atomic link update keeps the invitation `pending`, sets its existing `userId` to the selected Pepta user, and adds these optional audit fields:

```text
identityLinkProvider: apple
identityLinkedAt
identityLinkedBy
identityLinkReason
```

The partial unique `userId` index remains the cross-grant exclusivity guard. The operation also appends an `AccessAuditEvent` with actor `admin`, masked subject data, and the supplied reason. `claimedAt`, `requestedAt`, `operationId`, `grantedAt`, and `expiresAt` remain absent until provisioning actually begins.

After linking, the service invokes the same resolver used by the post-authentication `/me/access/resolve` call. A pending grant attached through a valid Apple admin link may enter the existing provisioning saga even though the user's private-relay email differs from the invitation email. If RevenueCat is not configured in the CLI environment, the durable link remains pending and the next production `/me/access/resolve` starts provisioning without another admin mutation. If RevenueCat is configured and an outbound attempt begins, the existing saga sets one fixed clock first and preserves `provisioning`, `retryable_failure`, or `terminal_failure` after any ambiguous, network, or authentication failure; it never rewinds the invitation to pending because a remote grant may have occurred. The creator reopens or refreshes Pepta and build 18 receives an existing non-paywall state or `active`, never a client-manufactured entitlement.

Idempotency is evaluated before the pending-status requirement. Re-running the command for the same invitation and the same already-linked Apple user returns the current status without mutating, extending, or duplicating anything, including after the grant becomes provisioning, retryable, active, expired, or revoked. A request that would change the linked user is always a conflict.

## Resolver Precedence

For an authenticated user, complimentary resolution checks in this order:

1. A non-pending grant already claimed by `userId`, so the existing saga or terminal state resumes.
2. A pending grant deliberately linked to that `userId` by the Apple admin-link operation.
3. Exactly one pending invitation whose email exactly matches a provider-specific verified email.
4. No complimentary grant; continue through standard RevenueCat subscription resolution.

A pending grant with `userId` is claimable only when it contains the complete Apple identity-link metadata (`identityLinkProvider`, `identityLinkedAt`, `identityLinkedBy`, and `identityLinkReason`) or when a current provider-specific verified email exactly matches the invitation. Merely setting a user ID in MongoDB without the complete link metadata cannot bypass identity validation.

The access-decision boundary distinguishes an explicit `null` (the user has no complimentary state) from an uncaught resolver or dependency failure. Such a failure returns `temporarily_unavailable`; it must never be caught and converted into standard inactive access, because that could expose an approved user to the paywall during an outage.

## Failure and Concurrency Behavior

- Missing invitations are rejected without mutation. Non-pending invitations are rejected unless the request is the idempotent same-user replay described above.
- Zero or multiple matching users are rejected without mutation.
- A Google-only user cannot be linked by `access:link-apple`.
- Concurrent links use a conditional `pending` update plus the existing unique `userId` index; only one can win.
- Duplicate execution for the same invitation and same user is idempotent at every lifecycle status and returns the current status.
- A duplicate execution targeting a different user is a conflict.
- RevenueCat failure follows the existing retryable/terminal classification and never deletes the durable identity link.
- Revocation, expiration, and paid-subscription coexistence continue through the existing complimentary-access and reconciliation services; account deletion uses the repaired durable cleanup path above.

## Build 18 Compatibility and UX

Successful exact-email and manually linked users require no mobile release. Build 18 already routes `active` users past the referral screen and paywall and shows the setup screen for `provisioning` or temporary unavailability.

Before an operator links a private-relay account, the backend cannot know that it belongs to the real-email invitation. That user can therefore reach the normal paywall after the first Apple login. The creator must be told not to purchase; the operator links the now-existing Pepta account, and the creator then reopens or refreshes the app. Relay detection never depends on `@privaterelay.appleid.com`, because Apple relay addresses may also use legacy `@icloud.com` forms or the new `@private.icloud.com` domain. Provider-neutral identity-verification copy is intentionally deferred to a later mobile build because changing it is not required for functional Apple access.

## Testing

Tests must be written and observed failing before production changes.

Authentication tests cover:

- a verified Apple token email is stored on the matching Apple provider entry;
- an unverified or missing Apple email is never stored as provider proof;
- a verified token cannot update a different provider subject, and a binding persistence failure is not swallowed;
- repeated verified authentication refreshes `emailVerifiedAt` without duplicating provider entries;
- Google verified-email binding remains unchanged.

Complimentary-service tests cover:

- an exact Apple-verified email automatically claims and provisions a pending invitation;
- creating an invitation immediately resolves exactly one existing Apple-verified user;
- an Apple relay email does not automatically claim a different real-email invitation;
- a valid operator-linked Apple user can claim despite the email mismatch;
- a pending invitation linked to another user cannot be stolen by an exact email match;
- a pending `userId` without Apple link metadata cannot bypass proof;
- multiple exact invite matches or multiple target-user matches fail closed instead of selecting `findOne` arbitrarily;
- duplicate same-user linking is idempotent before and after provisioning;
- different-user, non-Apple, ambiguous-user, invalid non-pending, and target-user-already-attached-to-another-grant link attempts fail without mutation;
- requested and expiration timestamps remain absent at link time and are calculated only when provisioning begins;
- an unconfigured RevenueCat client leaves a manual link pending, while a configured-but-failed outbound attempt preserves the fixed generation;
- complimentary resolver exceptions produce `temporarily_unavailable`, never inactive/paywall routing;
- account deletion removes an untouched pending link, durably records cleanup before deleting a possibly remote grant, retries failed promotional revocation, retains the redemption tombstone, and never changes paid access;
- Google claim, retry, revocation, tombstone, paid-subscription, and access-gate regressions remain green.

CLI tests or service-level command tests verify argument validation, dry-run behavior, production confirmation, masked output, new/legacy Apple relay-domain acceptance, and delegation to the shared service rather than duplicating domain logic.

Backend route-matrix tests verify the premium guard on diagnostics, measurements, research library, and every previously protected product route while preserving access to authentication, access resolution, referral attribution, onboarding, legal, support/account deletion, webhooks, and health endpoints.

Release verification consists of backend typecheck, lint, the full shared/backend/frontend test suites, backend build, a clean diff check, and an inspection of the pending creator invitation after deployment. No iOS archive is required for this backend-only change.
