# Media Asset Pipeline Remediation Design

**Date:** 2026-08-19

**Status:** Approved for implementation on 2026-08-19.

**Goal:** Make every user-owned image in Pepta private, attributable to one account, verified before use, durable while attached to product data, and reliably removed after abandonment, explicit deletion, or account deletion. Meal photos attached to a recipe must also appear on that recipe's detail page in a framed hero that preserves the existing visual system.

## Audit Findings Addressed

The audit found that the live database references currently resolve to private S3 objects, but the application does not have one authoritative lifecycle for those objects. The implementation must close these specific gaps:

1. Favourite creation accepts a caller-supplied S3 key, so one authenticated user can attempt to reference another object's key.
2. Presigned avatar, progress-photo, and favourite uploads are accepted without an S3 existence, byte-size, or decoded-image check.
3. Meal and product scan bytes are uploaded before analysis and database persistence complete, leaving files behind on downstream failure; successful scans that are never logged also have no expiration.
4. Cleanup after replacement or deletion is best-effort in several paths, with no durable retry queue.
5. Pending progress photos never expire, can be confirmed from an invalid state, and are inconsistently filtered.
6. Account deletion does not cover favourites and recipes and reconstructs object ownership from scattered document fields.
7. Provider avatar URLs remain external instead of becoming Pepta-controlled objects.
8. Recipes have no image association or detail screen, even when they originate from a photographed meal.
9. Existing object fields expose raw S3 keys in mobile contracts, and there is no safe reconciliation path for historical unreferenced objects.

The current bucket is private and the sampled referenced objects exist. Those are preserved as invariants; no live object is deleted as part of building or testing this change.

## Delivery Slices

The work is split into four sequential subprojects. Each slice must be testable and releasable on its own branch history, while the final mobile/backend release uses the complete contract.

1. **Media authority and urgent authorization repairs:** create the media registry, verified upload boundary, durable cleanup worker, migrate favourites away from raw keys, and make account deletion enumerate the registry plus all user collections.
2. **Avatar and progress-photo migration:** move custom avatars and progress photos to the registry, import trusted provider avatars, and enforce progress state transitions.
3. **Meal and recipe retention:** make scan persistence failure-safe, attach images to meal logs and recipes, add seven-day abandonment, and add the framed recipe hero.
4. **Migration and operations:** add dry-run-first legacy reconciliation/backfill tooling, bucket-policy guidance and checks, release ordering, and full regression verification.

No compatibility shim will continue accepting arbitrary S3 keys from mobile callers. The updated iOS/Android client is required, and Pepta's existing forced-update gate must be enabled during rollout before the incompatible backend contract is made generally available.

## Central Media Authority

Add a `MediaAsset` collection as the sole application authority for user image ownership and S3 lifecycle. Product documents reference an opaque media asset ID; mobile requests and responses never contain a raw S3 key.

Each asset stores:

- `userId`: required owner and account-deletion partition key.
- `source`: `direct_upload`, `meal_scan`, or `provider_import`.
- `intent`: `avatar`, `progress_photo`, `favourite_photo`, or `meal_photo`; this limits where an asset may be attached.
- `status`: `pending_upload`, `processing`, `ready`, `deletion_pending`, or `deleted`.
- `stagingKey`: private, short-lived original upload location while processing.
- `storageKey`: private canonical object location after processing.
- `contentType`, `byteSize`, `width`, and `height`: values measured by the server, never copied from the confirmation request.
- `links`: bounded embedded references containing `kind`, `resourceId`, and `attachedAt`. Kinds are `avatar`, `progress_photo`, `favourite`, `meal_log`, and `recipe`. One photographed meal may therefore remain attached to both a meal log and a recipe.
- `expiresAt`: present only for pending or unattached assets. A ready meal image that has no product link expires seven days after creation. Attaching its first durable link clears the expiration.
- cleanup state: `deleteAttemptCount`, `nextDeleteAttemptAt`, `deleteLeaseUntil`, `lastDeleteErrorCode`, and `deletedAt`.
- timestamps and an optimistic/concurrency guard where needed.

The collection has indexes for owner/status, owner/intent, due expiration, and due deletion work. It intentionally does not use a Mongo TTL index: removing the database row before S3 deletion would erase the retry authority. A scheduler first removes staging and canonical objects, then marks the row deleted and may compact old tombstones later.

Every attach operation checks owner, allowed intent-to-link mapping, and `ready` status. It is idempotent on `(kind, resourceId)`. Detach is also idempotent. When explicit product deletion removes the final link, the asset enters `deletion_pending` immediately. An asset abandoned by normal navigation remains recoverable until its seven-day expiration instead.

## Verified Upload and Image Processing Boundary

Direct mobile uploads use a media intent rather than a feature-specific raw key endpoint:

1. The authenticated client sends intent, MIME type, and exact byte size.
2. The backend applies per-intent limits, authenticated rate limits, and account-level pending-byte quotas; it creates a `pending_upload` asset.
3. The backend returns `mediaId`, a presigned S3 POST target, required form fields, and expiration. The POST policy enforces the staging key, allowed content type, and a `content-length-range` ceiling before S3 accepts bytes.
4. The client uploads and confirms only the opaque `mediaId`.
5. Confirmation conditionally moves `pending_upload` to `processing`, performs `HeadObject`, verifies recorded type and size, downloads the private staging object, decodes it with `sharp`, enforces dimensions/pixel count, auto-rotates it, strips metadata, and writes a canonical JPEG under `pepta/media/<userId>/<mediaId>.jpg` with private server-side encryption settings.
6. Only after the canonical PUT succeeds does the asset become `ready`; staging deletion is queued durably if it cannot complete immediately.

Confirmation from any state except `pending_upload` is rejected, except that repeating confirmation for an already `ready` asset returns the same asset idempotently. A missing or invalid object never becomes attachable. Processing failure moves the asset to `deletion_pending` without exposing either object.

Limits are purpose-specific, with a 24-megapixel decoded limit in addition to encoded bytes. Initial encoded limits are 5 MiB for avatars and favourites and 10 MiB for progress and meal images. Canonical output is auto-oriented JPEG at quality 86, with the longest edge capped at 1,024 pixels for avatars, 1,600 for favourites, and 2,048 for progress and meal photos. Presigned targets expire after ten minutes. Pending direct uploads and failed staging objects become cleanup-eligible after one hour; unattached successfully processed direct-upload images use a 24-hour grace, while unattached meal photos use the agreed seven-day retention. An account may hold at most 20 non-expired pending uploads and 100 MiB of declared pending bytes.

Read APIs resolve short-lived signed GET URLs from `MediaAsset.storageKey`. A missing object is logged against the media ID, not returned as a raw storage error. S3 keys, provider URLs, image bytes, and signed URLs are excluded from request logs and durable audit payloads.

## Durable Deletion and Scheduler

S3 deletion is never a fire-and-forget promise. Services change the asset to `deletion_pending` in the same logical operation that removes its final reference. A media cleanup scheduler follows the repository's existing leased, bounded-backoff cleanup pattern:

- lease due rows atomically so multiple app instances cannot delete the same work concurrently;
- delete both staging and canonical keys idempotently;
- mark the asset `deleted` only after S3 confirms deletion semantics;
- retry transient errors with bounded exponential backoff;
- retain exhausted work for operator inspection instead of forgetting it;
- log only media ID, intent, attempt count, and safe AWS error code.

The scheduler also converts expired `pending_upload` and expired unattached `ready` assets to `deletion_pending`. It starts and stops with the backend process. A CLI can list and retry exhausted items without accepting a caller-provided S3 key.

## Feature Integrations

### Favourites

Favourite photo intent returns a `mediaId`. Saving a favourite may include only that ID. The server verifies that the asset is owned by the caller, is `ready`, and has `favourite_photo` intent before linking it to the saved favourite.

Replacing a favourite photo attaches the new asset and detaches the old one; the old asset is queued for deletion if it has no other link. Re-saving a favourite without a photo field preserves the existing photo. Removing a favourite deletes the row and detaches its media. Abandoning the edit sheet leaves the unattached upload to the common expiration path; an explicit discard endpoint may accelerate cleanup by media ID.

### Custom and Provider Avatars

Custom avatars use the common upload and confirmation path. Setting a new avatar links the new asset and detaches the old one only after the new canonical object is ready.

Google avatar import occurs from the freshly verified identity-token picture claim, not from a client body or profile patch. The fetch uses HTTPS, a strict Google image-host allowlist, redirect revalidation, timeout and byte ceilings, image decoding, and the same canonical image processor. A custom direct-upload avatar always wins and is never overwritten at sign-in. A provider-import avatar is refreshed only when the trusted provider picture value changes, and content hashing prevents duplicate canonical objects. Import failure does not fail authentication and does not replace a working avatar. Apple currently supplies no provider picture, so Apple sign-in performs no import. Arbitrary `avatarUrl` writes are removed from the account patch contract, and user responses resolve the active Pepta S3 avatar to a signed URL.

### Progress Photos

Progress-photo metadata remains in `ProgressPhoto`, but storage ownership moves to `mediaId`. Intent creates the media asset and a progress row in `pending_upload`; confirm verifies and processes the media first, then conditionally changes only that same pending row to `uploaded` and attaches the asset. Deleted or already invalid rows cannot be resurrected. Lists and view endpoints include only uploaded rows and signed media URLs.

Deleting a progress photo marks the row deleted and detaches the asset. Pending rows that expire are marked failed/deleted by cleanup so they do not accumulate indefinitely.

### Meal and Product Scans

Meal and product scans already receive validated base64 bytes on the backend. They do not use a presigned upload. Processing order becomes:

1. validate encoded size, decoded magic bytes, type, and pixel limits;
2. run AI analysis and deterministic nutrition processing;
3. create a `processing` `MediaAsset` before any S3 write so cleanup authority already exists;
4. canonicalize and upload the stripped image, then mark the asset ready and unattached with `expiresAt = createdAt + 7 days`;
5. persist the scan result and, if that write fails, conditionally move the already-durable asset to `deletion_pending`.

No object is uploaded when AI analysis fails. The meal-scan response carries `mediaId`, not `photoS3Key`. Voice and barcode-only scans have no media ID.

Creating a meal log with a meal-photo media ID verifies ownership/readiness and adds a `meal_log` link. Deleting that log detaches the link. A view request resolves through the media registry rather than looking up a scan by storage key.

### Recipes and Framed Hero

Recipe input accepts an optional meal-photo media ID. Saving the composed recipe verifies and attaches it as a `recipe` link, clearing the seven-day expiration even if no meal log was created. Recipe deletion detaches the media. Recipe responses include `photoUrl: string | null` and `mediaId` only when needed for subsequent trusted client operations; they never expose an S3 key.

Add a recipe detail route and screen. The existing recipe list, typography, palette, spacing language, cards, and surrounding navigation remain visually unchanged. Tapping a recipe row opens the detail screen. When a photo exists, the screen places it near the top inside a rounded, framed card with the existing border/radius/shadow language, a restrained aspect ratio, and `cover` cropping. Recipe name and totals remain readable around the frame; ingredients and logging actions retain their current styling. Recipes without a photo use the same detail layout without an empty placeholder or redesigned header. Starter recipes remain photo-optional.

The screen refreshes an expired signed URL through the recipe read endpoint and handles image failure without hiding recipe data.

## Account Deletion

Account deletion first establishes durable cleanup authority, then removes user data. It must:

1. mark every non-deleted `MediaAsset` owned by the user as `deletion_pending` in bulk;
2. retain those minimal cleanup rows until their S3 objects are gone;
3. delete all user-owned product records, explicitly including favourites and recipes in addition to the existing collections;
4. delete the user record without waiting for every S3 call to finish;
5. let the worker finish object deletion with no email, token, provider subject, or other user PII retained in media rows.

The endpoint stays idempotent and available during an AWS outage. Legacy raw-key fields found during the rollout are backfilled before release and are also collected by the migration command so no historical object loses cleanup authority.

## Migration and Reconciliation

Add a dry-run-first `media:reconcile` CLI. It scans known legacy fields, checks ownership prefixes and object metadata, proposes a `MediaAsset` backfill plus product-document updates, and reports unreferenced objects separately. It must not delete or mutate without an explicit `--execute` flag and production confirmation. Output uses counts, sizes, media IDs, and masked user IDs; raw provider data and signed URLs are never printed.

The command is resumable and idempotent. Referenced objects are registered before product fields are updated. Unreferenced legacy objects are not automatically assumed safe to delete; an operator must run a second explicit orphan-deletion mode after reviewing the dry-run report and an age threshold. Existing audit probes and live objects remain untouched during local development.

Add an operations document with the required private bucket policy, account-level public access block, default encryption, CORS limited to Pepta mobile upload requirements, and a defense-in-depth lifecycle rule for the staging prefix. The application worker remains authoritative because bucket configuration was not readable through the current application IAM credentials. A read-only check command should report missing access/configuration without attempting broad IAM changes.

## API and Release Contract

The new shared contract uses opaque IDs throughout:

- upload intent: `{ mediaId, uploadUrl, fields, expiresAt }`;
- upload confirm/discard: `{ mediaId }`;
- favourite input: optional `photoMediaId`;
- progress photo: `mediaId` plus signed `viewUrl`, no `s3Key`;
- meal scan and meal log: optional `photoMediaId`, no `photoS3Key`;
- recipe input/response: optional `photoMediaId` and nullable signed `photoUrl`;
- user response: signed Pepta `avatarUrl`, never a caller-set external URL.

Release order is: publish the updated mobile build, enable Pepta's existing forced-update gate from the currently deployed backend, run the new reconciliation CLI in dry-run and then reviewed execute mode, deploy the opaque-ID backend, and keep the update gate active until the incompatible old clients have been excluded. The new backend never needs to accept caller-supplied legacy keys. Because this repository change is not itself a production deployment, live migration and bucket-policy mutation require a separate explicit operator action.

## Error and Concurrency Behavior

- Cross-owner, wrong-intent, missing, non-ready, and already-deleting media references return the same not-found-style response so callers cannot enumerate another user's assets.
- Conditional state transitions prevent double confirms and resurrection.
- Attachment operations are idempotent and tolerate client retries.
- Replacing media never detaches a working object until the replacement is ready and linked.
- Database failure after an S3 write always leaves a durable deletion record or performs an immediate compensating delete whose failure is recorded.
- Signing failure may omit an image URL but never corrupt or hide the underlying product record.
- Scheduler work is safe under multiple backend instances.
- Account deletion succeeds after durable queuing even when S3 is unavailable.

## Testing and Verification

All behavior changes follow red-green-refactor: each production function is preceded by a focused failing test observed to fail for the intended reason.

Backend tests cover media model indexes and validation, intent limits, POST policy constraints, S3 head/decode/canonicalization, metadata stripping, ownership and intent rejection, idempotent attach/detach, durable replacement/deletion retries, scheduler leasing/backoff, seven-day expiration, account deletion coverage, provider URL trust boundaries, progress state transitions, meal failure compensation, and recipe/meal multi-link retention.

Shared-schema tests prove raw S3 keys are rejected and the opaque-ID contracts parse. Frontend tests cover direct-upload form construction, confirmation ordering, favourite replacement, progress failure behavior, scan-to-recipe media propagation, recipe navigation, framed-hero rendering, no-photo rendering, expired URL refresh, and preservation of the existing recipe list semantics.

Migration tests use fake database and S3 adapters to prove dry-run immutability, ownership conflict reporting, resumability, backfill ordering, and the separate explicit orphan-deletion guard.

Final verification includes shared/backend/frontend typechecks, lint, full tests, backend build, Expo export or targeted navigation render verification, a clean secret scan, and a review of the exact release/migration commands. Any backend tests using Supertest run with local-port permission; this is an execution-environment requirement already present in the clean baseline.

## Non-Goals

- No public bucket or permanent image URL.
- No client-selected S3 key, provider URL, or storage prefix.
- No full redesign of Recipes or adjacent screens.
- No live database mutation, live orphan deletion, bucket-policy mutation, deployment, or forced-update activation without a separate explicit operator action.
- No receipt-specific extraction feature in this change; future receipt images must use the same media authority rather than introduce another storage path.
