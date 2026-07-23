# Apple Complimentary Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an exact Apple-verified email redeem a complimentary-access invitation automatically, support secure operator linking for Apple private-relay accounts, and close the access-control and account-deletion gaps identified by the approved design.

**Architecture:** Authentication persists subject-bound verified-email proof through a focused provider-identity service. Complimentary access resolves deterministic provider proofs or a complete operator-authorized Apple link through the existing RevenueCat saga. A separate cleanup model/service durably revokes promotional access after account deletion without retaining plaintext invitation data, while route-matrix tests keep every product endpoint behind the persisted entitlement guard.

**Tech Stack:** TypeScript, Express 5, Mongoose 8, RevenueCat REST API v1, Vitest, Supertest, node-cron.

---

## File Map

- Create `pepta-backend/src/services/provider-identity-binding.service.ts`: subject-bound Google/Apple verified-email persistence.
- Create `pepta-backend/src/tests/services/provider-identity-binding.service.test.ts`: conditional-update unit coverage.
- Modify `pepta-backend/src/services/auth.service.ts`: bind verified Google and Apple token emails and fail authentication when proof persistence fails.
- Modify `pepta-backend/src/tests/services/auth.service.test.ts`: provider binding integration coverage.
- Modify `pepta-backend/src/models/complimentary-access.model.ts`: Apple operator-link audit metadata.
- Modify `pepta-backend/src/models/index.ts`: export complimentary models so production index synchronization includes them.
- Modify `pepta-backend/src/services/complimentary-access.service.ts`: deterministic provider-neutral claims, manual Apple linking, atomic ownership checks, and immediate-invite matching.
- Modify `pepta-backend/src/tests/complimentary-access.service.test.ts`: Apple exact-match, relay, conflict, linking, timing, retry, and Google regression tests.
- Modify `pepta-backend/src/scripts/access-admin.ts`: `link-apple`, cleanup listing, and cleanup retry adapters.
- Modify `pepta-backend/package.json`: admin script aliases.
- Modify `pepta-backend/src/services/access-decision.service.ts`: fail closed when complimentary resolution throws.
- Modify `pepta-backend/src/tests/entitlement-reconciler.service.test.ts` or create `pepta-backend/src/tests/access-decision.service.test.ts`: resolver failure coverage.
- Create `pepta-backend/src/models/complimentary-access-cleanup.model.ts`: email-free durable cleanup queue.
- Create `pepta-backend/src/services/complimentary-access-cleanup.service.ts`: cleanup creation, leasing, promotional-only revocation, and bounded retry.
- Create `pepta-backend/src/services/complimentary-access-cleanup.scheduler.ts`: minute-level due-cleanup runner.
- Create `pepta-backend/src/tests/services/complimentary-access-cleanup.service.test.ts`: deletion cleanup and retry tests.
- Modify `pepta-backend/src/services/user.service.ts`: prepare cleanup immediately before deleting the user.
- Modify `pepta-backend/src/tests/services/user.service.test.ts`: pending deletion and durable remote-cleanup integration coverage.
- Modify `pepta-backend/src/index.ts`: start and stop the cleanup scheduler with the API lifecycle.
- Modify `pepta-backend/src/app.ts`: apply the premium chain to diagnostics, measurements, and research library.
- Modify `pepta-backend/src/tests/app.test.ts`: explicit premium/recovery route matrix.

### Task 1: Persist subject-bound Apple and Google proof

- [ ] **Step 1: Write failing provider-binding tests**

Create `pepta-backend/src/tests/services/provider-identity-binding.service.test.ts` with mocked `UserModel.updateOne` coverage for:

```ts
await bindVerifiedProviderEmail({
  userId,
  provider: "apple",
  providerUserId: "apple-sub-1",
  email: "Creator@iCloud.com",
  verifiedAt,
});

expect(updateOne).toHaveBeenCalledWith(
  {
    _id: userId,
    authProviders: {
      $elemMatch: { provider: "apple", providerUserId: "apple-sub-1" },
    },
  },
  {
    $set: {
      "authProviders.$.verifiedEmailNormalized": "creator@icloud.com",
      "authProviders.$.emailVerifiedAt": verifiedAt,
    },
  },
);
```

Also assert that `matchedCount: 0` and an update rejection both reject the operation.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
npm --workspace @pepta/backend test -- src/tests/services/provider-identity-binding.service.test.ts
```

Expected: FAIL because `provider-identity-binding.service.ts` does not exist.

- [ ] **Step 3: Implement the focused binding service**

Create `pepta-backend/src/services/provider-identity-binding.service.ts`:

```ts
import type { AuthProvider } from "@pepta/shared";
import type { Types } from "mongoose";
import { ERROR_CODES } from "@pepta/shared";
import { AppError } from "../lib/errors";
import { UserModel } from "../models/user.model";

export interface VerifiedProviderEmailInput {
  userId: Types.ObjectId;
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  verifiedAt: Date;
}

export async function bindVerifiedProviderEmail(
  input: VerifiedProviderEmailInput,
): Promise<void> {
  const emailNormalized = input.email.trim().toLowerCase();
  const result = await UserModel.updateOne(
    {
      _id: input.userId,
      authProviders: {
        $elemMatch: {
          provider: input.provider,
          providerUserId: input.providerUserId,
        },
      },
    },
    {
      $set: {
        "authProviders.$.verifiedEmailNormalized": emailNormalized,
        "authProviders.$.emailVerifiedAt": input.verifiedAt,
      },
    },
  );
  if (result.matchedCount !== 1) {
    throw new AppError({
      code: ERROR_CODES.serviceUnavailable,
      message: "Verified sign-in identity could not be persisted.",
      statusCode: 503,
    });
  }
}
```

Export `normalizeEmail` from this focused module, import it into the complimentary service, and remove the old local helper. This prevents the binding module from importing the larger entitlement orchestrator.

- [ ] **Step 4: Run focused tests and observe GREEN**

Run the command from Step 2. Expected: all provider-binding tests PASS.

- [ ] **Step 5: Write failing auth integration tests**

Extend `pepta-backend/src/tests/services/auth.service.test.ts` to mock `bindVerifiedProviderEmail`, then assert:

```ts
expect(bindVerifiedProviderEmail).toHaveBeenCalledWith({
  userId: existing._id,
  provider: "apple",
  providerUserId: "apple-sub-1",
  email: "USER@example.com",
  verifiedAt: expect.any(Date),
});
```

Add separate tests proving missing/unverified Apple email does not bind, binding failures reject sign-in, repeated verified sign-in calls bind again, and Google still binds.

- [ ] **Step 6: Run auth tests and observe RED**

Run:

```bash
npm --workspace @pepta/backend test -- src/tests/services/auth.service.test.ts
```

Expected: FAIL because Apple does not call the provider-aware binding service and Google still uses the swallowed Google-only helper.

- [ ] **Step 7: Integrate provider-aware binding**

In `auth.service.ts`, replace the Google-only call with:

```ts
async function persistVerifiedIdentity(
  user: UserDocument,
  identity: ProviderIdentity,
): Promise<void> {
  if (!identity.emailVerified || !identity.email) return;
  await bindVerifiedProviderEmail({
    userId: user._id,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
    verifiedAt: new Date(),
  });
}
```

Call it after both Google and Apple upserts without `.catch(...)`. Log only `userId` and `provider` before rethrowing a persistence failure.

- [ ] **Step 8: Run provider and auth tests**

Expected: both focused suites PASS.

### Task 2: Resolve exact Apple proof deterministically

- [ ] **Step 1: Add failing complimentary resolver tests**

In `complimentary-access.service.test.ts`, add tests for:

```ts
makeUser({
  providers: [{
    provider: "apple",
    providerUserId: "apple-sub-1",
    verifiedEmailNormalized: "creator@icloud.com",
  }],
});
```

Cover exact Apple claim, relay mismatch, pending grant owned by another user, incomplete manual-link metadata, multiple exact pending invitations, exactly one matching existing Apple user during invite creation, and multiple matching users during invite creation.

- [ ] **Step 2: Run the service test and observe RED**

Run:

```bash
npm --workspace @pepta/backend test -- src/tests/complimentary-access.service.test.ts
```

Expected: Apple exact-match and deterministic conflict tests FAIL under the Google-only `findOne` implementation.

- [ ] **Step 3: Add link metadata to the grant model**

Add optional fields:

```ts
identityLinkProvider?: "apple";
identityLinkedAt?: Date;
identityLinkedBy?: string;
identityLinkReason?: string;
```

and matching schema properties. Export `complimentary-access.model.ts` from `models/index.ts` so its indexes are included in `connect()` synchronization.

- [ ] **Step 4: Implement provider proof collection and precedence**

Use a provider-proof helper:

```ts
interface VerifiedProviderProof {
  provider: "google" | "apple";
  email: string;
}

function verifiedProviderProofs(user: UserDocument): VerifiedProviderProof[] {
  return user.authProviders.flatMap((entry) =>
    entry.verifiedEmailNormalized
      ? [{ provider: entry.provider, email: entry.verifiedEmailNormalized }]
      : [],
  );
}
```

Resolve in order:

1. Any grant already attached to `user._id`.
2. A pending attached grant with complete Apple link metadata.
3. All unowned pending invitations whose email is in the current proof set.
4. Standard access when no complimentary state exists.

Multiple exact matches must audit a masked `IDENTITY_CONFLICT` and return `temporarily_unavailable`. Never choose one arbitrarily.

- [ ] **Step 5: Strengthen the atomic claim**

Change `acquireAttempt` to accept an ownership predicate. Exact claims require `userId: { $exists: false }` and the selected email; linked claims require the same `userId` and complete immutable Apple-link fields. Preserve the fixed `requestedAt`, `operationId`, and calendar-month `expiresAt`.

- [ ] **Step 6: Make invite creation deterministic**

Replace `UserModel.findOne` with a bounded query for provider-specific proofs. Zero users leaves the invitation pending, exactly one calls the resolver, and more than one writes a conflict audit and remains pending.

- [ ] **Step 7: Run the complimentary service suite**

Expected: all new Apple tests and all existing Google/retry/revocation tests PASS.

### Task 3: Add secure operator linking for Apple relay accounts

- [ ] **Step 1: Write failing link-service tests**

Add tests for:

```ts
await linkAppleInvite({
  inviteEmail: "creator@icloud.com",
  accountEmail: "relay@privaterelay.appleid.com",
  reason: "Creator confirmed private relay",
  linkedBy: "operator@example.com",
  dryRun: false,
});
```

Assert exact trusted Apple proof matching, Apple-only verified legacy fallback, complete metadata, no lifecycle timestamps, same-user idempotency at every status, different-user conflict, ambiguous users, Google-only rejection, already-attached user rejection, and unconfigured RevenueCat leaving the durable link pending.

- [ ] **Step 2: Run the focused suite and observe RED**

Expected: FAIL because `linkAppleInvite` does not exist.

- [ ] **Step 3: Implement `linkAppleInvite` in the domain service**

The operation must:

```ts
const accountCandidates = await UserModel.find({
  $or: [
    {
      authProviders: {
        $elemMatch: {
          provider: "apple",
          verifiedEmailNormalized: accountEmailNormalized,
        },
      },
    },
    {
      email: accountEmailNormalized,
      emailVerified: true,
      "authProviders.provider": "apple",
      "authProviders.1": { $exists: false },
    },
  ],
}).limit(2);
```

Validate exactly one candidate, no other grant for the candidate, then atomically update only the pending invitation while preserving all provisioning fields as absent. Audit the masked link and invoke the shared resolver only when RevenueCat is configured.

- [ ] **Step 4: Add CLI tests or a testable argument parser**

Cover required arguments, `--dry-run`, production confirmation, masked output, and delegation to `linkAppleInvite`.

- [ ] **Step 5: Extend `access-admin.ts` and package scripts**

Add:

```text
access:link-apple -- --invite-email ... --account-email ... --reason ...
```

Require `CONFIRM_PRODUCTION=yes` for mutation, use `ACCESS_ADMIN_OPERATOR`, and never print subjects, tokens, secrets, or unmasked addresses.

- [ ] **Step 6: Run domain and CLI tests**

Expected: all link behaviors PASS and existing admin commands remain unchanged.

### Task 4: Fail closed and repair premium route coverage

- [ ] **Step 1: Write a failing resolver exception test**

Register a resolver that rejects and assert:

```ts
await expect(resolveAccess(userId)).resolves.toEqual({
  state: "temporarily_unavailable",
  retryAfterMs: 5000,
});
```

It must not call ordinary RevenueCat reconciliation after the resolver throws.

- [ ] **Step 2: Observe RED, then implement the minimal fail-closed change**

Replace the current catch-to-`null` behavior with an explicit unavailable decision while logging only `userId` and the error message.

- [ ] **Step 3: Add a failing route-matrix test**

Mock persisted access inactive and enumerate:

```ts
const premiumRequests = [
  "/home",
  "/track",
  "/progress",
  "/medication-level",
  "/coach",
  "/insights",
  "/weekly-retention",
  "/diagnostics",
  "/meal-scans",
  "/compounds",
  "/cycles",
  "/schedules",
  "/dose-logs",
  "/weight-logs",
  "/meal-logs",
  "/water-logs",
  "/protein-logs",
  "/fiber-logs",
  "/activity-logs",
  "/side-effect-logs",
  "/measurements",
  "/progress-photos",
  "/research-library",
];
```

Assert every premium request reaches `ENTITLEMENT_REQUIRED`, while health, legal, auth, `/me/access/resolve`, onboarding, referrals, webhooks, and account deletion remain outside the premium guard.

- [ ] **Step 4: Observe RED, then repair app mounts**

Mount diagnostics, measurements, and research library through `...premium`; remove the nested diagnostics `requireAuth` so authentication is owned by the common chain.

- [ ] **Step 5: Run access-decision and app suites**

Expected: resolver and route-matrix tests PASS.

### Task 5: Add durable promotional cleanup for account deletion

- [ ] **Step 1: Write failing cleanup tests**

Create cleanup tests that prove:

- untouched pending grants are deleted without RevenueCat;
- any grant that may have reached RevenueCat creates an email-free durable task before grant deletion;
- successful revocation removes the task;
- retryable failure retains it with bounded backoff;
- terminal failure remains operator-visible;
- cleanup revokes only the promotional entitlement endpoint;
- tombstones are never deleted.

- [ ] **Step 2: Observe RED**

Run:

```bash
npm --workspace @pepta/backend test -- src/tests/services/complimentary-access-cleanup.service.test.ts
```

Expected: FAIL because the cleanup model/service do not exist.

- [ ] **Step 3: Create the cleanup model**

Use:

```ts
interface ComplimentaryAccessCleanupDocument {
  appUserId: string;
  entitlementId: string;
  status: "pending" | "processing" | "retryable_failure" | "terminal_failure";
  attemptCount: number;
  nextAttemptAt?: Date;
  lastErrorCode?: string;
  leaseId?: string;
  leaseExpiresAt?: Date;
}
```

Add a unique `{ appUserId, entitlementId }` index and due-work/lease indexes. Export the model from `models/index.ts`. Store no email, provider subject, display name, or user document.

- [ ] **Step 4: Implement cleanup preparation and leased execution**

`prepareComplimentaryAccessDeletion(userId)` must remove a never-attempted pending grant directly. Otherwise it must upsert the cleanup task, delete the plaintext grant, and call `runComplimentaryCleanupTask` without failing account deletion when RevenueCat is unavailable.

`runDueComplimentaryCleanup` atomically leases due records, increments attempts, calls `revokePromotionalEntitlement(appUserId, entitlementId)`, deletes successful tasks, and persists retry or terminal classification.

- [ ] **Step 5: Integrate account deletion test-first**

Update `user.service.test.ts` to assert the cleanup preparation call occurs immediately before `UserModel.deleteOne`, then integrate:

```ts
await prepareComplimentaryAccessDeletion(userId);
await UserModel.deleteOne({ _id: userId });
```

Do not delete `ComplimentaryAccessRedemptionModel` records.

- [ ] **Step 6: Add scheduler and admin recovery**

Add a singleton scheduler that runs due cleanup once per minute in the configured timezone. Start/stop it beside `PepPushScheduler`. Add masked `access:cleanup-list` and `access:cleanup-retry -- --task-id ...` commands.

- [ ] **Step 7: Run cleanup and user suites**

Expected: cleanup and account-deletion tests PASS, including outage behavior.

### Task 6: Full verification and release readiness

- [ ] **Step 1: Run focused regression suites**

```bash
npm --workspace @pepta/backend test -- \
  src/tests/services/provider-identity-binding.service.test.ts \
  src/tests/services/auth.service.test.ts \
  src/tests/complimentary-access.service.test.ts \
  src/tests/services/complimentary-access-cleanup.service.test.ts \
  src/tests/services/user.service.test.ts \
  src/tests/app.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run all static and unit verification**

```bash
npm --workspace @pepta/shared test
npm --workspace @pepta/backend typecheck
npm --workspace @pepta/backend lint
npm --workspace @pepta/backend test
npm --workspace @pepta/frontend test
npm --workspace @pepta/backend build
```

Expected: every command exits 0 with no new warnings or failures.

- [ ] **Step 3: Review the complete diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff
```

Confirm no secrets, raw invite emails, generated build output, unrelated changes, placeholder comments, or contract drift.

- [ ] **Step 4: Production handoff checks**

After merge/deployment, verify:

1. Render has `REVENUECAT_SECRET_API_KEY`, Apple server credentials, and complimentary HMAC configuration.
2. Destiny remains `pending` before first sign-in and has no started expiration.
3. Exact Apple email sign-in changes the grant to `active` with one attempt and a fixed three-calendar-month expiration.
4. A relay mismatch remains unclaimed until the operator runs `access:link-apple`.
5. No iOS archive is required because build 18 already consumes the existing access-decision states.
