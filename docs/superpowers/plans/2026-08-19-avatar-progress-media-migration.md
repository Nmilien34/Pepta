# Avatar and Progress Media Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move custom avatars, trusted Google avatars, and progress photos onto the verified `MediaAsset` lifecycle without changing the existing screens' visual design.

**Architecture:** Users store an active opaque `avatarMediaId`; progress-photo metadata stores an opaque `mediaId`. Direct images use the existing presigned POST, verification, normalization, attachment, expiry, and durable cleanup path. Google picture claims enter through a separate trusted HTTPS importer that revalidates redirects and persists canonical provider media without allowing a client-selected URL.

**Tech Stack:** TypeScript, Express, Mongoose, AWS SDK v3, Sharp, Expo/React Native, Zod, Vitest.

---

## File structure

- `shared/src/schemas/index.ts`: remove avatar raw-key/arbitrary-URL inputs and replace progress `s3Key` with `mediaId` plus POST fields.
- `shared/src/schemas/index.test.ts`: prove the public contracts accept only opaque media IDs.
- `pepta-backend/src/models/user.model.ts`: add active avatar media reference and private provider fingerprint.
- `pepta-backend/src/models/cache.model.ts`: replace progress-photo `s3Key` with `mediaId` and add pending expiry.
- `pepta-backend/src/services/media.service.ts`: add trusted server-import persistence and measured media metadata reads.
- `pepta-backend/src/services/provider-avatar.service.ts`: validate/fetch trusted Google image URLs and replace provider avatars without blocking authentication.
- `pepta-backend/src/services/avatar.service.ts`: attach an already-confirmed avatar media ID and detach the previous avatar safely.
- `pepta-backend/src/services/progress-photo.service.ts`: create, confirm, list, view, expire, and delete progress photos through `MediaAsset`.
- `pepta-backend/src/services/progress.service.ts`: reuse the uploaded-only signed progress-photo reader.
- `pepta-backend/src/services/media-cleanup.scheduler.ts`: retire expired pending progress rows during media cleanup runs.
- `pepta-backend/src/services/user.service.ts`: remove arbitrary avatar URL writes, resolve signed active avatars, and invoke trusted provider refresh.
- `pepta-backend/src/services/auth.service.ts`: await asynchronous user serialization.
- `pepta-backend/src/routes/me.routes.ts`: accept `{ mediaId }` for active-avatar replacement.
- `pepta-frontend/src/services/api.ts`: use common media POSTs for avatars and progress photos.
- `pepta-frontend/src/services/avatar.service.ts`: upload and activate avatars by opaque media ID.
- `pepta-frontend/src/components/ProgressPhotoCapture.tsx`: upload progress images with exact byte size and POST fields while preserving the current UI.

### Task 1: Lock the opaque shared contracts and Mongo references

**Files:**
- Modify: `shared/src/schemas/index.test.ts`
- Modify: `shared/src/schemas/index.ts`
- Modify: `pepta-backend/src/tests/models/media-asset.model.test.ts`
- Create: `pepta-backend/src/tests/models/avatar-progress-media.model.test.ts`
- Modify: `pepta-backend/src/models/user.model.ts`
- Modify: `pepta-backend/src/models/cache.model.ts`

- [ ] **Step 1: Write failing shared-schema tests**

Add assertions equivalent to:

```ts
expect(avatarConfirmRequestSchema.parse({ mediaId: MEDIA })).toEqual({ mediaId: MEDIA });
expect(() => avatarConfirmRequestSchema.parse({ key: "pepta/avatars/u/a.jpg" })).toThrow();
expect(() => userAccountPatchSchema.parse({ avatarUrl: "https://tracker.example/a" })).toThrow();

const progress = progressPhotoSchema.parse({
  id: PHOTO,
  userId: USER,
  mediaId: MEDIA,
  captureDate: "2026-08-19",
  contentType: "image/jpeg",
  kind: "body",
  status: "uploaded",
  createdAt: NOW,
  updatedAt: NOW,
});
expect(progress.mediaId).toBe(MEDIA);
expect(progress).not.toHaveProperty("s3Key");
expect(() => progressPhotoSchema.parse({ ...progress, s3Key: "raw/key" })).toThrow();
```

Update the upload-intent expectation to require `fields: Record<string, string>` and an exact positive `sizeBytes` input.

- [ ] **Step 2: Run shared tests and verify RED**

Run: `npm test -w @pepta/shared -- --run src/schemas/index.test.ts`

Expected: FAIL because avatar confirmation still requires `key`, account patch accepts `avatarUrl`, and progress photos expose `s3Key`.

- [ ] **Step 3: Write failing model-shape tests**

Assert that `User.avatarMediaId` and `ProgressPhoto.mediaId` are ObjectId refs to `MediaAsset`, legacy paths are absent from the active schemas, and `ProgressPhoto.expiresAt` is indexed.

- [ ] **Step 4: Run model tests and verify RED**

Run: `npx vitest run src/tests/models/avatar-progress-media.model.test.ts` from `pepta-backend/`.

Expected: FAIL because the model paths do not exist yet.

- [ ] **Step 5: Implement the minimal schemas and models**

Use these public shapes:

```ts
export const avatarConfirmRequestSchema = z.object({ mediaId: idSchema }).strict();

export const userAccountPatchSchema = z
  .object({ displayName: z.string().trim().min(1).max(120).optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one account field is required",
  });

export const progressPhotoInputSchema = z.object({
  captureDate: dateOnlySchema,
  contentType: mediaContentTypeSchema,
  sizeBytes: z.number().int().positive(),
  kind: progressPhotoKindSchema.default("body"),
  faceFullness: z.number().int().min(1).max(5).optional(),
}).strict();
```

Store `avatarMediaId?: Types.ObjectId`, a private `providerAvatarFingerprint?: string`, `ProgressPhoto.mediaId: Types.ObjectId`, and `ProgressPhoto.expiresAt?: Date`. Remove active `avatarKey`/progress `s3Key` paths; historical fields remain a reconciliation concern handled by the next delivery slice.

- [ ] **Step 6: Run shared/model tests and verify GREEN**

Run the two commands from Steps 2 and 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas/index.ts shared/src/schemas/index.test.ts pepta-backend/src/models/user.model.ts pepta-backend/src/models/cache.model.ts pepta-backend/src/tests/models/avatar-progress-media.model.test.ts pepta-backend/src/tests/models/media-asset.model.test.ts
git commit -m "refactor: make avatar and progress media opaque"
```

### Task 2: Add trusted provider-media persistence

**Files:**
- Modify: `pepta-backend/src/tests/services/media.service.test.ts`
- Modify: `pepta-backend/src/services/media.service.ts`
- Modify: `pepta-backend/src/models/media-asset.model.ts`

- [ ] **Step 1: Write failing media-service tests**

Add tests for a wished-for function:

```ts
const imported = await persistImportedAvatarMedia(USER, {
  bytes: JPEG_BYTES,
  contentType: "image/jpeg",
});
expect(imported).toMatchObject({ mediaId: MEDIA, status: "ready" });
expect(createPresignedPostUpload).not.toHaveBeenCalled();
expect(putS3Object).toHaveBeenCalledWith(expect.objectContaining({
  key: `pepta/media/${USER}/${MEDIA}.jpg`,
  contentType: "image/jpeg",
}));
```

Also prove normalization failure leaves a `provider_import`/`avatar` asset in `deletion_pending`, and identical normalized content reuses an owned ready provider-import asset by `contentHash`.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/tests/services/media.service.test.ts` from `pepta-backend/`.

Expected: FAIL because provider-import persistence and `contentHash` do not exist.

- [ ] **Step 3: Implement minimal provider import**

Add an indexed optional SHA-256 `contentHash` to `MediaAsset`. Implement `persistImportedAvatarMedia` using the same avatar limits and `normalizeImage`, creating cleanup authority before `putS3Object`. Hash canonical bytes, reuse only an owned ready `provider_import` avatar with the same hash, and otherwise write the canonical encrypted JPEG and return its opaque ID.

- [ ] **Step 4: Run test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/models/media-asset.model.ts pepta-backend/src/services/media.service.ts pepta-backend/src/tests/services/media.service.test.ts
git commit -m "feat: persist trusted provider avatars"
```

### Task 3: Migrate custom-avatar activation and signed reads

**Files:**
- Modify: `pepta-backend/src/tests/services/avatar.service.test.ts`
- Modify: `pepta-backend/src/tests/services/user.service.test.ts`
- Modify: `pepta-backend/src/tests/services/auth.service.test.ts`
- Modify: `pepta-backend/src/services/avatar.service.ts`
- Modify: `pepta-backend/src/services/user.service.ts`
- Modify: `pepta-backend/src/services/auth.service.ts`
- Modify: `pepta-backend/src/routes/me.routes.ts`

- [ ] **Step 1: Write failing avatar activation tests**

Prove that activation validates an owned ready `avatar` asset, attaches `{ kind: "avatar", resourceId: userId }`, conditionally updates `avatarMediaId`, detaches the previous media only after the new link is established, and rolls the new link back if the user update fails. Prove raw keys are never accepted.

- [ ] **Step 2: Write failing signed-user tests**

Assert that `serializeUser` resolves `avatarUrl` with `getMediaViewUrl(userId, avatarMediaId)`, returns no raw provider URL, and degrades to no image when signing fails without hiding the user record. Update auth tests to await serialization.

- [ ] **Step 3: Run tests and verify RED**

Run: `npx vitest run src/tests/services/avatar.service.test.ts src/tests/services/user.service.test.ts src/tests/services/auth.service.test.ts` from `pepta-backend/`.

Expected: FAIL on the legacy raw-key contract and synchronous serializer.

- [ ] **Step 4: Implement avatar activation**

Replace upload-intent logic in `avatar.service.ts` with:

```ts
export async function setAvatarMedia(userId: string, mediaId: string): Promise<UserDocument>
```

It must call `validateAttachableMedia(userId, mediaId, "avatar")`, attach the new link, conditionally replace the user's old `avatarMediaId`, detach the old asset, and compensate by detaching the new link if the user update does not commit.

- [ ] **Step 5: Make user serialization asynchronous**

Resolve the signed avatar through the media authority and update every production caller to `await serializeUser(user)`. Remove `avatarUrl` handling from account patch updates. Keep signing failures non-fatal.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pepta-backend/src/services/avatar.service.ts pepta-backend/src/services/user.service.ts pepta-backend/src/services/auth.service.ts pepta-backend/src/routes/me.routes.ts pepta-backend/src/tests/services/avatar.service.test.ts pepta-backend/src/tests/services/user.service.test.ts pepta-backend/src/tests/services/auth.service.test.ts
git commit -m "feat: activate avatars through media ids"
```

### Task 4: Import Google avatars through a trusted fetch boundary

**Files:**
- Create: `pepta-backend/src/services/provider-avatar.service.ts`
- Create: `pepta-backend/src/tests/services/provider-avatar.service.test.ts`
- Modify: `pepta-backend/src/services/user.service.ts`
- Modify: `pepta-backend/src/tests/services/user.service.test.ts`

- [ ] **Step 1: Write failing trust-boundary tests**

Cover HTTPS-only URLs, `googleusercontent.com` and subdomains only, redirect revalidation, three-redirect ceiling, five-second abort, declared and streamed 5 MiB ceilings, image content-type checks, and rejection of credentials/fragments. Prove an arbitrary client/profile URL never reaches the importer.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/tests/services/provider-avatar.service.test.ts` from `pepta-backend/`.

Expected: FAIL because the importer does not exist.

- [ ] **Step 3: Implement the trusted downloader**

Expose:

```ts
export async function refreshGoogleAvatar(
  user: UserDocument,
  pictureUrl: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<void>
```

Hash the verified picture claim to a private fingerprint. Skip unchanged claims and users whose current avatar is custom. Fetch with `redirect: "manual"`, revalidate every `Location`, read the response body with a byte ceiling, persist through `persistImportedAvatarMedia`, attach the new provider asset, update the user fingerprint/media reference, then detach the previous provider asset.

- [ ] **Step 4: Integrate non-blocking refresh after verified identity persistence**

Only Google identities with a fresh verified `identity.picture` call the importer. Catch and log safe metadata (`userId`, provider, error name) so an import failure never fails sign-in.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx vitest run src/tests/services/provider-avatar.service.test.ts src/tests/services/user.service.test.ts` from `pepta-backend/`.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pepta-backend/src/services/provider-avatar.service.ts pepta-backend/src/tests/services/provider-avatar.service.test.ts pepta-backend/src/services/user.service.ts pepta-backend/src/tests/services/user.service.test.ts
git commit -m "feat: import trusted Google avatars"
```

### Task 5: Migrate the progress-photo backend lifecycle

**Files:**
- Modify: `pepta-backend/src/tests/services/progress-photo.service.test.ts`
- Modify: `pepta-backend/src/tests/services/progress.service.test.ts`
- Modify: `pepta-backend/src/tests/services/media-cleanup.scheduler.test.ts`
- Modify: `pepta-backend/src/services/progress-photo.service.ts`
- Modify: `pepta-backend/src/services/progress.service.ts`
- Modify: `pepta-backend/src/services/media-cleanup.scheduler.ts`

- [ ] **Step 1: Write failing upload-intent tests**

Assert that creating a progress-photo intent calls `createMediaUploadIntent` with `intent: "progress_photo"`, stores only `mediaId`, creates a matching row expiry, returns POST `fields`, and discards the media if row creation fails.

- [ ] **Step 2: Write failing confirmation/state tests**

Prove confirmation processes the row's owned media ID, attaches it, and conditionally changes only `pending_upload` to `uploaded`. Repeating an uploaded confirmation is idempotent. Deleted, expired, cross-owner, and mismatched media rows cannot be resurrected.

- [ ] **Step 3: Write failing read/delete/expiry tests**

Prove lists and the aggregate Progress response contain uploaded rows only, include fresh signed URLs and measured media metadata, and never expose `s3Key`. Deletion rolls the row status back if detachment fails. Expiry marks pending progress rows deleted without synchronous S3 calls.

- [ ] **Step 4: Run tests and verify RED**

Run: `npx vitest run src/tests/services/progress-photo.service.test.ts src/tests/services/progress.service.test.ts src/tests/services/media-cleanup.scheduler.test.ts` from `pepta-backend/`.

Expected: FAIL on raw keys, invalid transitions, unsigned aggregate reads, and absent row expiry.

- [ ] **Step 5: Implement the progress lifecycle**

Create intents through `createMediaUploadIntent`; store `mediaId` and `expiresAt`. Confirm the media, attach `{ kind: "progress_photo", resourceId: photoId }`, then conditionally mark the row uploaded and clear its expiry. Use one uploaded-only signing serializer for list, view, and `/progress`. Delete via row transition plus `detachMedia`, with compensation on failure. Add `expirePendingProgressPhotos(now)` and invoke it beside `queueExpiredMedia()` in the scheduler.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 4. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pepta-backend/src/services/progress-photo.service.ts pepta-backend/src/services/progress.service.ts pepta-backend/src/services/media-cleanup.scheduler.ts pepta-backend/src/tests/services/progress-photo.service.test.ts pepta-backend/src/tests/services/progress.service.test.ts pepta-backend/src/tests/services/media-cleanup.scheduler.test.ts
git commit -m "feat: secure progress photos with media authority"
```

### Task 6: Migrate the avatar and progress mobile clients

**Files:**
- Modify: `pepta-frontend/src/services/api.test.ts`
- Modify: `pepta-frontend/src/services/avatar.service.test.ts`
- Modify: `pepta-frontend/src/components/cameraPermissionCopy.test.tsx`
- Modify: `pepta-frontend/src/services/api.ts`
- Modify: `pepta-frontend/src/services/avatar.service.ts`
- Modify: `pepta-frontend/src/components/ProgressPhotoCapture.tsx`
- Modify: `pepta-frontend/src/components/UserAvatar.tsx`

- [ ] **Step 1: Write failing avatar client tests**

Assert that `uploadAvatar` uses `uploadMediaPhoto({ intent: "avatar", ... })`, then activates `{ mediaId }`, never reads or submits a raw key, and preserves existing camera/library behavior.

- [ ] **Step 2: Write failing progress client tests**

Assert that capture reads the blob before intent creation, sends exact `sizeBytes`, uploads a multipart POST containing every returned field plus the file, then confirms only the progress `photoId`. Failure leaves the existing error UI unchanged.

- [ ] **Step 3: Run tests and verify RED**

Run: `npx vitest run src/services/api.test.ts src/services/avatar.service.test.ts src/components/cameraPermissionCopy.test.tsx` from `pepta-frontend/`.

Expected: FAIL because both clients still use legacy PUT contracts.

- [ ] **Step 4: Implement the opaque client flows**

Reuse the common multipart form construction for avatars. Add a progress helper that constructs the intent from the measured blob and POSTs its fields. Keep `ProgressPhotoCapture`'s camera, overlays, saved card, loading veil, error card, spacing, and theme untouched.

- [ ] **Step 5: Refresh signed avatars on expiry**

Use the returned `expiresAt` to schedule one refresh while mounted and clear that timer on unmount. Continue falling back to initials when signing or image loading fails; do not fall back to an external provider URL.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pepta-frontend/src/services/api.ts pepta-frontend/src/services/api.test.ts pepta-frontend/src/services/avatar.service.ts pepta-frontend/src/services/avatar.service.test.ts pepta-frontend/src/components/ProgressPhotoCapture.tsx pepta-frontend/src/components/cameraPermissionCopy.test.tsx pepta-frontend/src/components/UserAvatar.tsx
git commit -m "feat: upload avatars and progress photos by media id"
```

### Task 7: Remove legacy runtime deletion and verify the slice

**Files:**
- Modify: `pepta-backend/src/tests/services/user.service.test.ts`
- Modify: `pepta-backend/src/services/user.service.ts`
- Modify: `pepta-frontend/src/screens/app/reportExport.test.ts`
- Modify: `pepta-frontend/src/screens/app/reportExport.ts`

- [ ] **Step 1: Write failing account-deletion test**

Prove account deletion queues all owned `MediaAsset` rows before product/user removal and never invokes S3 synchronously. Historical raw objects are explicitly left for the required reconciliation command and deployment gate; the branch remains non-deployable until that next slice is complete.

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run src/tests/services/user.service.test.ts` from `pepta-backend/`.

Expected: FAIL because legacy avatar/progress keys are synchronously deleted.

- [ ] **Step 3: Remove legacy runtime key deletion**

Delete `collectAccountS3Keys`, `optionalS3Key`, and the direct `deleteS3Object` call. Preserve the existing `queueAllUserMediaForDeletion(userId)` ordering and complete database collection coverage.

- [ ] **Step 4: Prove exports contain no storage authority**

Update progress export fixtures to use `mediaId`, while ensuring report export omits media IDs, signed URLs, and raw keys.

- [ ] **Step 5: Run focused tests**

Run the shared, backend, and frontend tests modified by this plan. Expected: PASS with no warnings.

- [ ] **Step 6: Run full verification**

Run from the repository root:

```bash
npm run typecheck
npm run lint
npm run build
npm test
rg -n "avatarKey|photo\.s3Key|progressPhoto.*s3Key|avatarUrl: z\.string\(\)\.url|createPresignedPutUrl" shared/src pepta-backend/src pepta-frontend/src
git status --short
```

Expected: typecheck/build/tests pass; lint has no errors; the production-code search has no avatar/progress raw-key contract or legacy PUT flow; worktree contains only intended changes.

- [ ] **Step 7: Commit**

```bash
git add pepta-backend/src/services/user.service.ts pepta-backend/src/tests/services/user.service.test.ts pepta-frontend/src/screens/app/reportExport.ts pepta-frontend/src/screens/app/reportExport.test.ts
git commit -m "chore: finish avatar and progress media migration"
```

## Plan self-review

- Every approved avatar/progress requirement maps to a task: opaque contracts, custom replacement, provider import, strict state transitions, uploaded-only signed reads, expiry, durable deletion, account deletion, frontend migration, and signed-URL refresh.
- Historical live-object reconciliation, bucket mutation, deployment, and forced-update activation remain explicitly outside this plan and are the next required slice.
- No placeholder steps or inconsistent public field names remain: active avatars use `avatarMediaId`, progress rows/responses use `mediaId`, and mobile confirmation carries opaque IDs only.
