# Media Authority and Favourites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the favourite-photo authorization gap by replacing caller-supplied S3 keys with owner-scoped media IDs, verifying and normalizing uploads before attachment, and making deletion durable.

**Architecture:** Add a `MediaAsset` authority with generated private S3 keys, verified presigned POST uploads, canonical image processing, bounded links, and a leased cleanup worker. Favourites reference `photoMediaId`; the backend alone resolves S3 keys and signed URLs. The updated client uploads through the common media contract and never reads or submits a key.

**Tech Stack:** TypeScript, Zod, Express, Mongoose, AWS SDK v3/S3, `@aws-sdk/s3-presigned-post`, Sharp, React Native/Expo, Vitest.

---

## File Map

- `shared/src/schemas/index.ts`: opaque media upload and favourite wire contracts.
- `shared/src/schemas/index.test.ts`: contract regression tests proving raw S3 keys are rejected.
- `pepta-backend/src/models/media-asset.model.ts`: storage authority, lifecycle, link, expiry, and cleanup indexes.
- `pepta-backend/src/models/favourite.model.ts`: replace `photoS3Key` with `photoMediaId`.
- `pepta-backend/src/services/s3.service.ts`: presigned POST, HEAD, byte download, and explicit encrypted PUT helpers.
- `pepta-backend/src/services/image-normalization.service.ts`: decode, rotate, resize, strip metadata, and encode canonical JPEG.
- `pepta-backend/src/services/media.service.ts`: intent, confirm, sign, attach, detach, discard, expiry, and cleanup leasing.
- `pepta-backend/src/services/media-cleanup.scheduler.ts`: invoke due expiry/deletion processing on a cron.
- `pepta-backend/src/routes/media.routes.ts`: authenticated opaque-ID upload endpoints.
- `pepta-backend/src/services/favourite.service.ts`: attach only owned ready favourite media.
- `pepta-backend/src/routes/favourites.routes.ts`: remove raw-key photo endpoints.
- `pepta-backend/src/services/user.service.ts`: queue media deletion and delete favourites/recipes on account deletion.
- `pepta-backend/src/app.ts`, `pepta-backend/src/index.ts`: mount the route and scheduler.
- `pepta-frontend/src/services/api.ts`: presigned POST and media confirmation client.
- `pepta-frontend/src/components/NewItemSheet.tsx`: hold and discard opaque media IDs.
- `pepta-frontend/src/screens/app/favourites.ts`, `useFavourites.ts`: propagate `photoMediaId` only.
- Focused tests live beside the existing schema, backend service, and frontend component/hook tests.

### Task 1: Replace the shared raw-key contract with opaque media IDs

**Files:**
- Modify: `shared/src/schemas/index.test.ts`
- Modify: `shared/src/schemas/index.ts`
- Modify: `shared/src/types/index.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests that define the new API and explicitly reject the old exploit surface:

```ts
it("accepts an opaque media upload intent and confirmation", () => {
  expect(mediaUploadIntentInputSchema.parse({
    intent: "favourite_photo",
    contentType: "image/jpeg",
    sizeBytes: 2048,
  })).toEqual({
    intent: "favourite_photo",
    contentType: "image/jpeg",
    sizeBytes: 2048,
  });
  expect(mediaConfirmInputSchema.parse({ mediaId: "507f1f77bcf86cd799439011" })).toEqual({
    mediaId: "507f1f77bcf86cd799439011",
  });
});

it("never accepts a favourite S3 key from the caller", () => {
  expect(() => favouriteInputSchema.parse({
    key: "food:desk-lunch:1-box",
    kind: "food",
    name: "Desk lunch",
    portion: "1 box",
    photoS3Key: "favourites/someone-else/private.jpg",
  })).toThrow();
});

it("carries a favourite media id and a signed URL without a storage key", () => {
  const parsed = favouriteResponseSchema.parse({
    id: "507f1f77bcf86cd799439012",
    key: "food:desk-lunch:1-box",
    kind: "food",
    name: "Desk lunch",
    portion: "1 box",
    photoMediaId: "507f1f77bcf86cd799439011",
    photoUrl: "https://signed.example/photo",
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
  });
  expect(parsed).not.toHaveProperty("photoS3Key");
});
```

- [ ] **Step 2: Run the schema tests and observe RED**

Run: `npx vitest run src/schemas/index.test.ts` from `shared/`.

Expected: FAIL because `mediaUploadIntentInputSchema` and `mediaConfirmInputSchema` do not exist and favourite schemas still accept `photoS3Key`.

- [ ] **Step 3: Implement the opaque shared contract**

Add these schemas and inferred exports, then replace favourite `photoS3Key` with `photoMediaId`:

```ts
export const mediaIntentSchema = z.enum([
  "avatar",
  "progress_photo",
  "favourite_photo",
  "meal_photo",
]);
export const mediaContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);
export const mediaUploadIntentInputSchema = z.object({
  intent: mediaIntentSchema,
  contentType: mediaContentTypeSchema,
  sizeBytes: z.number().int().positive(),
}).strict();
export const mediaUploadIntentResponseSchema = z.object({
  mediaId: idSchema,
  uploadUrl: z.string().url(),
  fields: z.record(z.string()),
  expiresAt: isoDateTimeSchema,
}).strict();
export const mediaConfirmInputSchema = z.object({ mediaId: idSchema }).strict();
export const mediaReadyResponseSchema = z.object({
  mediaId: idSchema,
  status: z.literal("ready"),
}).strict();
export const mediaDiscardInputSchema = mediaConfirmInputSchema;
```

The favourite input field becomes `photoMediaId: idSchema.optional()`. Its response retains that optional field and `photoUrl: z.string().url().nullable().default(null)`. Remove the old favourite photo intent/discard schemas and raw-key comments/exports.

- [ ] **Step 4: Run the schema tests and observe GREEN**

Run: `npx vitest run src/schemas/index.test.ts` from `shared/`.

Expected: all schema tests pass.

- [ ] **Step 5: Build shared and commit**

Run: `npm run build -w @pepta/shared` from the repository root.

Commit:

```bash
git add shared/src/schemas/index.ts shared/src/schemas/index.test.ts shared/src/types/index.ts
git commit -m "feat: replace favourite photo keys with media ids"
```

### Task 2: Add the MediaAsset model and lifecycle invariants

**Files:**
- Create: `pepta-backend/src/models/media-asset.model.ts`
- Create: `pepta-backend/src/tests/models/media-asset.model.test.ts`
- Modify: `pepta-backend/src/models/index.ts`
- Modify: `pepta-backend/src/models/favourite.model.ts`

- [ ] **Step 1: Write failing model tests**

Test the schema's security/lifecycle shape without a database connection:

```ts
it("requires an owner, generated keys, status, and intent", () => {
  const asset = new MediaAssetModel({ source: "direct_upload" });
  const error = asset.validateSync();
  expect(error?.errors.userId).toBeDefined();
  expect(error?.errors.intent).toBeDefined();
  expect(error?.errors.status).toBeDefined();
  expect(error?.errors.stagingKey).toBeDefined();
});

it("indexes owner lookup, expiry, and deletion leasing", () => {
  const indexes = MediaAssetModel.schema.indexes().map(([keys]) => keys);
  expect(indexes).toContainEqual({ userId: 1, status: 1 });
  expect(indexes).toContainEqual({ expiresAt: 1, status: 1 });
  expect(indexes).toContainEqual({ status: 1, nextDeleteAttemptAt: 1, deleteLeaseUntil: 1 });
});

it("stores only media ids on favourites", () => {
  expect(FavouriteModel.schema.path("photoMediaId")).toBeDefined();
  expect(FavouriteModel.schema.path("photoS3Key")).toBeUndefined();
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/models/media-asset.model.test.ts` from `pepta-backend/`.

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the model**

Create a Mongoose model with these exact unions and core fields:

```ts
export type MediaIntent = "avatar" | "progress_photo" | "favourite_photo" | "meal_photo";
export type MediaStatus = "pending_upload" | "processing" | "ready" | "deletion_pending" | "deleted";
export type MediaLinkKind = "avatar" | "progress_photo" | "favourite" | "meal_log" | "recipe";

export interface MediaLink {
  kind: MediaLinkKind;
  resourceId: string;
  attachedAt: Date;
}

export interface MediaAssetDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  source: "direct_upload" | "meal_scan" | "provider_import";
  intent: MediaIntent;
  status: MediaStatus;
  stagingKey?: string;
  storageKey?: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  contentType?: "image/jpeg";
  byteSize?: number;
  width?: number;
  height?: number;
  links: MediaLink[];
  expiresAt?: Date;
  deleteAttemptCount: number;
  nextDeleteAttemptAt?: Date;
  deleteLeaseUntil?: Date;
  lastDeleteErrorCode?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Use bounded embedded link validation (`max 8`), enum validation, timestamps, and the three indexes asserted above. Export it from `models/index.ts`. Change `FavouriteDocument.photoS3Key?: string` to `photoMediaId?: Types.ObjectId` with `ref: "MediaAsset"`.

- [ ] **Step 4: Run and observe GREEN**

Run: `npx vitest run src/tests/models/media-asset.model.test.ts` from `pepta-backend/`.

Expected: model tests pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/models/media-asset.model.ts pepta-backend/src/models/favourite.model.ts pepta-backend/src/models/index.ts pepta-backend/src/tests/models/media-asset.model.test.ts
git commit -m "feat: add user-owned media asset registry"
```

### Task 3: Enforce S3 upload policy and canonical image processing

**Files:**
- Modify: `pepta-backend/package.json`
- Modify: `package-lock.json`
- Modify: `pepta-backend/src/services/s3.service.ts`
- Create: `pepta-backend/src/services/image-normalization.service.ts`
- Create: `pepta-backend/src/tests/services/s3-media.service.test.ts`
- Create: `pepta-backend/src/tests/services/image-normalization.service.test.ts`

- [ ] **Step 1: Install locked production dependencies**

Run: `npm install -w @pepta/backend @aws-sdk/s3-presigned-post sharp` from the repository root.

- [ ] **Step 2: Write failing S3 policy and image tests**

Mock `createPresignedPost` and assert the exact owner-generated key, 5 MiB limit, MIME field, and AES256 condition. Use a generated PNG to prove normalization measures dimensions, caps the longest side, outputs JPEG, and drops EXIF:

```ts
it("presigns a policy that cannot exceed the declared favourite ceiling", async () => {
  await createPresignedPostUpload({
    key: "pepta/media-staging/user/media.png",
    contentType: "image/png",
    maxBytes: 5 * 1024 * 1024,
  });
  expect(presignMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    Conditions: expect.arrayContaining([
      ["content-length-range", 1, 5 * 1024 * 1024],
      { key: "pepta/media-staging/user/media.png" },
      { "Content-Type": "image/png" },
      { "x-amz-server-side-encryption": "AES256" },
    ]),
  }));
});

it("normalizes a photo to a bounded metadata-free jpeg", async () => {
  const input = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "#c96" },
  }).withMetadata({ exif: { IFD0: { Artist: "private" } } }).png().toBuffer();
  const output = await normalizeImage(input, { maxBytes: 5 * 1024 * 1024, maxEdge: 1600 });
  const metadata = await sharp(output.bytes).metadata();
  expect(output).toMatchObject({ contentType: "image/jpeg", width: 1600, height: 800 });
  expect(metadata.exif).toBeUndefined();
});
```

- [ ] **Step 3: Run and observe RED**

Run: `npx vitest run src/tests/services/s3-media.service.test.ts src/tests/services/image-normalization.service.test.ts` from `pepta-backend/`.

Expected: FAIL because the helpers do not exist.

- [ ] **Step 4: Implement S3 and processor helpers**

Add `HeadObjectCommand` and reusable byte streaming to `s3.service.ts`. Presigned upload uses `createPresignedPost` with exact key/type/encryption fields and `content-length-range`. Canonical PUT always supplies `ServerSideEncryption: "AES256"`. Implement:

```ts
export async function normalizeImage(
  bytes: Uint8Array,
  limits: { maxBytes: number; maxEdge: number; maxPixels?: number },
): Promise<{ bytes: Uint8Array; contentType: "image/jpeg"; width: number; height: number }> {
  if (bytes.byteLength > limits.maxBytes) throw new ValidationError("Image is too large");
  const input = sharp(bytes, { limitInputPixels: limits.maxPixels ?? 24_000_000 });
  const output = await input.rotate().resize({
    width: limits.maxEdge,
    height: limits.maxEdge,
    fit: "inside",
    withoutEnlargement: true,
  }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (!output.info.width || !output.info.height) throw new ValidationError("Invalid image");
  return {
    bytes: output.data,
    contentType: "image/jpeg",
    width: output.info.width,
    height: output.info.height,
  };
}
```

Map Sharp decode/format failures to a safe `ValidationError("Invalid image")` without returning internal decoder details.

- [ ] **Step 5: Run and observe GREEN**

Run the same focused test command; expect all tests pass.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json pepta-backend/package.json pepta-backend/src/services/s3.service.ts pepta-backend/src/services/image-normalization.service.ts pepta-backend/src/tests/services/s3-media.service.test.ts pepta-backend/src/tests/services/image-normalization.service.test.ts
git commit -m "feat: verify and normalize private media uploads"
```

### Task 4: Implement media intents, confirmation, ownership, links, and deletion queue

**Files:**
- Create: `pepta-backend/src/services/media.service.ts`
- Create: `pepta-backend/src/tests/services/media.service.test.ts`

- [ ] **Step 1: Write failing behavior tests**

Mock the model and S3 boundary, then cover these separate behaviors:

```ts
it("creates a favourite upload under an unguessable owner staging key", async () => {
  const out = await createMediaUploadIntent(USER, {
    intent: "favourite_photo", contentType: "image/png", sizeBytes: 2048,
  });
  expect(out.mediaId).toBe(MEDIA);
  expect(presign).toHaveBeenCalledWith(expect.objectContaining({
    key: `pepta/media-staging/${USER}/${MEDIA}.png`,
    maxBytes: 5 * 1024 * 1024,
  }));
  expect(out).not.toHaveProperty("key");
});

it("refuses to confirm another user's media without revealing it", async () => {
  findOneAndUpdate.mockResolvedValue(null);
  await expect(confirmMediaUpload(USER, { mediaId: MEDIA })).rejects.toThrow(/not found/i);
  expect(headObject).not.toHaveBeenCalled();
});

it("measures, normalizes, and marks the canonical object ready", async () => {
  headObject.mockResolvedValue({ contentType: "image/png", contentLength: 2048 });
  getBytes.mockResolvedValue(Uint8Array.of(1, 2, 3));
  normalize.mockResolvedValue({ bytes: Uint8Array.of(4), contentType: "image/jpeg", width: 800, height: 600 });
  const out = await confirmMediaUpload(USER, { mediaId: MEDIA });
  expect(putObject).toHaveBeenCalledWith(expect.objectContaining({
    key: `pepta/media/${USER}/${MEDIA}.jpg`, contentType: "image/jpeg",
  }));
  expect(out).toEqual({ mediaId: MEDIA, status: "ready" });
});

it("never attaches cross-owner or wrong-intent media", async () => {
  findOneAndUpdate.mockResolvedValue(null);
  await expect(attachMedia(USER, MEDIA, { kind: "favourite", resourceId: "fav-1" }))
    .rejects.toThrow(/not found/i);
});

it("queues the last detached link instead of forgetting a failed delete", async () => {
  await detachMedia(USER, MEDIA, { kind: "favourite", resourceId: "fav-1" });
  expect(findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ _id: MEDIA, userId: expect.anything() }),
    expect.objectContaining({ $set: expect.objectContaining({ status: "deletion_pending" }) }),
    expect.anything(),
  );
});
```

Also test 5 MiB enforcement, declared/actual mismatch, invalid state, idempotent ready confirmation, idempotent attachment, 24-hour unattached expiry, discard by owner ID, and signing only a ready owned canonical key.

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/services/media.service.test.ts` from `pepta-backend/`.

Expected: FAIL because `media.service.ts` does not exist.

- [ ] **Step 3: Implement minimal service behavior**

Use conditional Mongoose updates for every transition. The allowed link map is exact:

```ts
const ALLOWED_LINKS: Record<MediaIntent, readonly MediaLinkKind[]> = {
  avatar: ["avatar"],
  progress_photo: ["progress_photo"],
  favourite_photo: ["favourite"],
  meal_photo: ["meal_log", "recipe"],
};
```

Intent creation enforces `{ avatar: 5MiB, favourite_photo: 5MiB, progress_photo: 10MiB, meal_photo: 10MiB }`, pending count `20`, and declared pending bytes `100MiB`. It stores a one-hour pending expiry. Confirmation leases only an owned pending row into `processing`, verifies HEAD size/type, downloads and normalizes, writes `pepta/media/<user>/<media>.jpg`, queues staging cleanup, and updates ready metadata plus a 24-hour unattached expiry. On failure it conditionally records `deletion_pending` and rethrows the safe error.

`attachMedia` first reads an existing exact `(kind, resourceId)` link as an idempotent success; otherwise it conditionally `$push`es only when `links` has no matching `$elemMatch`, so the changing `attachedAt` timestamp can never create a retry duplicate. It clears `expiresAt`. `detachMedia` removes the exact link and then conditionally queues deletion only with a second update guarded by `links: { $size: 0 }`, so a concurrent new attachment wins safely. `discardMedia` rejects linked assets and queues an owned unlinked asset. `getMediaViewUrl` reads only owned ready assets and signs only `storageKey`.

- [ ] **Step 4: Run and observe GREEN**

Run the focused service test; expect all media tests pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/services/media.service.ts pepta-backend/src/tests/services/media.service.test.ts
git commit -m "feat: add owner-scoped media lifecycle service"
```

### Task 5: Add durable expiry and S3 deletion execution

**Files:**
- Create: `pepta-backend/src/services/media-cleanup.service.ts`
- Create: `pepta-backend/src/services/media-cleanup.scheduler.ts`
- Create: `pepta-backend/src/tests/services/media-cleanup.service.test.ts`
- Modify: `pepta-backend/src/config/env.ts`
- Modify: `pepta-backend/src/index.ts`

- [ ] **Step 1: Write failing cleanup tests**

```ts
it("expires abandoned uploads into the durable deletion queue", async () => {
  await queueExpiredMedia(NOW);
  expect(updateMany).toHaveBeenCalledWith(
    { status: { $in: ["pending_upload", "ready"] }, expiresAt: { $lte: NOW }, links: { $size: 0 } },
    { $set: { status: "deletion_pending", nextDeleteAttemptAt: NOW }, $unset: { deleteLeaseUntil: 1 } },
  );
});

it("retries staging cleanup without deleting a ready canonical image", async () => {
  leaseReadyStaging.mockResolvedValue(asset({ status: "ready", stagingKey: "stage", storageKey: "canonical" }));
  await runDueMediaCleanup({ now: NOW, limit: 1 });
  expect(deleteObject).toHaveBeenCalledWith("stage");
  expect(deleteObject).not.toHaveBeenCalledWith("canonical");
  expect(updateOne).toHaveBeenCalledWith(
    { _id: MEDIA, status: "ready" },
    { $unset: { stagingKey: 1, deleteLeaseUntil: 1, nextDeleteAttemptAt: 1, lastDeleteErrorCode: 1 } },
  );
});

it("leases one deletion-pending asset and marks it deleted only after both keys are removed", async () => {
  lease.mockResolvedValue(asset({ stagingKey: "stage", storageKey: "canonical" }));
  await runDueMediaCleanup({ now: NOW, limit: 1 });
  expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["stage", "canonical"]);
  expect(updateOne).toHaveBeenCalledWith(
    { _id: MEDIA, status: "deletion_pending" },
    expect.objectContaining({ $set: expect.objectContaining({ status: "deleted", deletedAt: NOW }) }),
  );
});

it("backs off and retains authority when S3 deletion fails", async () => {
  lease.mockResolvedValue(asset());
  deleteObject.mockRejectedValue(Object.assign(new Error("down"), { name: "SlowDown" }));
  await runDueMediaCleanup({ now: NOW, limit: 1 });
  expect(updateOne).toHaveBeenCalledWith(
    { _id: MEDIA, status: "deletion_pending" },
    expect.objectContaining({ $set: expect.objectContaining({ lastDeleteErrorCode: "SlowDown" }) }),
  );
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/services/media-cleanup.service.test.ts` from `pepta-backend/`.

Expected: FAIL because cleanup service does not exist.

- [ ] **Step 3: Implement cleanup and scheduler**

Lease with `findOneAndUpdate` on either (a) ready rows that still have `stagingKey` after immediate staging deletion failed or (b) due `deletion_pending` rows, always requiring `deleteLeaseUntil` to be absent/expired. Ready-row work deletes only `stagingKey` and unsets it while leaving the canonical image ready. Deletion-pending work deletes both staging and canonical keys idempotently and marks the row deleted. Use a five-minute lease, a batch size of 25, and bounded exponential delay `min(60_000 * 2 ** attempt, 86_400_000)`. Store only a safe error `name/code` on failure.

Add `MEDIA_CLEANUP_CRON` with default `*/15 * * * *` to `env.scheduler`. The scheduler mirrors `ComplimentaryCleanupScheduler`, calls expiry queueing then due cleanup, and starts/stops in `index.ts`.

- [ ] **Step 4: Run and observe GREEN**

Run the focused cleanup test and `npx vitest run src/tests/services/complimentary-access-cleanup.service.test.ts`.

Expected: all cleanup tests pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/config/env.ts pepta-backend/src/index.ts pepta-backend/src/services/media-cleanup.service.ts pepta-backend/src/services/media-cleanup.scheduler.ts pepta-backend/src/tests/services/media-cleanup.service.test.ts
git commit -m "feat: durably clean expired media assets"
```

### Task 6: Expose opaque media endpoints

**Files:**
- Create: `pepta-backend/src/routes/media.routes.ts`
- Modify: `pepta-backend/src/app.ts`
- Modify: `pepta-backend/src/tests/app.test.ts`

- [ ] **Step 1: Write failing route tests**

Extend the authenticated route matrix and add focused requests proving `/media/upload-intent`, `/media/confirm`, and `/media/discard` are premium/authenticated and validate strict bodies. The success test stubs the service and expects:

```ts
expect(response.body.data).toEqual({
  mediaId: "507f1f77bcf86cd799439011",
  uploadUrl: "https://bucket.example",
  fields: { key: "opaque" },
  expiresAt: "2026-08-19T12:10:00.000Z",
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/app.test.ts` from `pepta-backend/` with local-port permission.

Expected: FAIL with `/media` not found.

- [ ] **Step 3: Implement the router and mount**

Create three POST endpoints using shared schemas and `req.user!.id`. Mount at `/media` with `premium` and a user-keyed limiter of 20 intents per minute. Do not return model documents or keys.

- [ ] **Step 4: Run and observe GREEN**

Run the same app test with local-port permission; expect pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/app.ts pepta-backend/src/routes/media.routes.ts pepta-backend/src/tests/app.test.ts
git commit -m "feat: expose authenticated media upload endpoints"
```

### Task 7: Migrate favourite persistence to verified media IDs

**Files:**
- Modify: `pepta-backend/src/tests/services/favourite.service.test.ts`
- Modify: `pepta-backend/src/services/favourite.service.ts`
- Modify: `pepta-backend/src/routes/favourites.routes.ts`

- [ ] **Step 1: Replace raw-key tests with failing ownership/attachment tests**

Mock `attachMedia`, `detachMedia`, and `getMediaViewUrl`. Add:

```ts
it("attaches only the caller's ready favourite media", async () => {
  findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc({
    photoMediaId: MEDIA,
  })) });
  await saveFavourite(USER, input({ photoMediaId: MEDIA }));
  expect(attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
    kind: "favourite", resourceId: "row1",
  });
});

it("does not write the favourite when media ownership validation fails", async () => {
  validateAttachableMedia.mockRejectedValue(new NotFoundError("Media not found"));
  await expect(saveFavourite(USER, input({ photoMediaId: OTHER }))).rejects.toThrow(/not found/i);
  expect(findOneAndUpdate).not.toHaveBeenCalled();
});

it("detaches the replaced media after the new one is linked", async () => {
  // Existing row carries OLD; upsert returns NEW.
  await saveFavourite(USER, input({ photoMediaId: NEW }));
  expect(attachMedia).toHaveBeenCalledWith(USER, NEW, expect.anything());
  expect(detachMedia).toHaveBeenCalledWith(USER, OLD, expect.anything());
  expect(attachMedia.mock.invocationCallOrder[0]).toBeLessThan(detachMedia.mock.invocationCallOrder[0]);
});
```

Retain tests for preserving an existing photo when the field is absent, signed URL failure returning `null`, idempotent removal, and deletion detaching instead of calling S3 directly.

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/services/favourite.service.test.ts` from `pepta-backend/`.

Expected: FAIL because favourites still accept and resolve `photoS3Key`.

- [ ] **Step 3: Implement verified favourite attachment**

Before upsert, call `validateAttachableMedia(userId, photoMediaId, "favourite")`. Load the existing favourite to capture the old media ID. Upsert the new ObjectId, attach the returned row ID, then detach the old ID only when it differs. If attachment fails after upsert, restore the previous media reference or remove the newly inserted row before rethrowing. On list/save, call `getMediaViewUrl(userId, mediaId)` and catch signing failure to `null`. On delete, detach by the removed row's media ID.

Delete `/favourites/photo-intent` and `/favourites/photo-discard`; only generic `/media` owns upload lifecycle.

- [ ] **Step 4: Run and observe GREEN**

Run the focused favourite test; expect all tests pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/routes/favourites.routes.ts pepta-backend/src/services/favourite.service.ts pepta-backend/src/tests/services/favourite.service.test.ts
git commit -m "fix: authorize favourite photos through media ownership"
```

### Task 8: Keep account deletion complete with the new authority

**Files:**
- Modify: `pepta-backend/src/tests/services/user.service.test.ts`
- Modify: `pepta-backend/src/services/user.service.ts`

- [ ] **Step 1: Write failing deletion tests**

Add mocks for `FavouriteModel`, `RecipeModel`, and `queueAllUserMediaForDeletion`. Assert the queue happens before the user disappears, favourite/recipe data is deleted, and no new media key is deleted directly:

```ts
it("durably queues media and deletes favourites and recipes with the account", async () => {
  await deleteCurrentUser(userId);
  expect(queueAllUserMediaForDeletion).toHaveBeenCalledWith(userId);
  expect(favouriteDeleteMany).toHaveBeenCalledWith({ userId });
  expect(recipeDeleteMany).toHaveBeenCalledWith({ userId });
  expect(queueAllUserMediaForDeletion.mock.invocationCallOrder[0])
    .toBeLessThan(userDeleteOne.mock.invocationCallOrder[0]);
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx vitest run src/tests/services/user.service.test.ts` from `pepta-backend/`.

Expected: FAIL because the three cleanup calls are absent.

- [ ] **Step 3: Implement deletion coverage**

Call `queueAllUserMediaForDeletion(userId)` before deleting product rows. Add `FavouriteModel.deleteMany({ userId })` and `RecipeModel.deleteMany({ userId })`. Preserve legacy S3-key collection temporarily for unmigrated avatar/progress/meal documents; it is removed only by the later reconciliation slice. Media queueing must not call S3 synchronously.

- [ ] **Step 4: Run and observe GREEN**

Run the focused user service test; expect pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-backend/src/services/user.service.ts pepta-backend/src/tests/services/user.service.test.ts
git commit -m "fix: include media favourites and recipes in account deletion"
```

### Task 9: Migrate the mobile favourite flow to opaque IDs and presigned POST

**Files:**
- Modify: `pepta-frontend/src/services/api.ts`
- Modify: `pepta-frontend/src/services/api.test.ts`
- Modify: `pepta-frontend/src/components/NewItemSheet.test.tsx`
- Modify: `pepta-frontend/src/components/NewItemSheet.tsx`
- Modify: `pepta-frontend/src/screens/app/favourites.test.ts`
- Modify: `pepta-frontend/src/screens/app/favourites.ts`
- Modify: `pepta-frontend/src/screens/app/useFavourites.test.tsx`
- Modify: `pepta-frontend/src/screens/app/useFavourites.ts`

- [ ] **Step 1: Write failing client and component tests**

Define the desired order: read blob, request intent with actual size, POST required fields and file, confirm media ID, then make it saveable. NewItemSheet must retain the ID until save and discard by ID on replacement/cancel:

```ts
it("uploads and confirms before returning a media id", async () => {
  await api.uploadMediaPhoto({
    intent: "favourite_photo", uri: "file:///photo.jpg", contentType: "image/jpeg",
  });
  expect(requests).toEqual([
    ["POST", "/media/upload-intent"],
    ["POST", "https://bucket.example"],
    ["POST", "/media/confirm"],
  ]);
});

it("saves an opaque id and never a storage key", async () => {
  apiMock.uploadMediaPhoto.mockResolvedValue({ mediaId: MEDIA, status: "ready" });
  // pick + save
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ photoMediaId: MEDIA }));
  expect(onSave.mock.calls[0]![0]).not.toHaveProperty("photoS3Key");
});

it("discards replaced and cancelled uploads by media id", async () => {
  // pick MEDIA_A, replace with MEDIA_B, close
  expect(apiMock.discardMedia.mock.calls.map(([id]) => id)).toEqual([MEDIA_A, MEDIA_B]);
});
```

Update pure favourite and hook tests to assert `photoMediaId` round-trips and signed URLs never go back to the server.

- [ ] **Step 2: Run and observe RED**

Run:

```bash
npx vitest run src/services/api.test.ts src/components/NewItemSheet.test.tsx src/screens/app/favourites.test.ts src/screens/app/useFavourites.test.tsx
```

from `pepta-frontend/`.

Expected: FAIL because the client and state still use raw keys and PUT.

- [ ] **Step 3: Implement the client upload contract**

Add API methods:

```ts
public createMediaUploadIntent(
  input: MediaUploadIntentInput,
): Promise<MediaUploadIntentResponse> {
  return this.request("/media/upload-intent", mediaUploadIntentResponseSchema, {
    method: "POST",
    body: JSON.stringify(mediaUploadIntentInputSchema.parse(input)),
  });
}
public confirmMedia(mediaId: string): Promise<MediaReadyResponse> {
  return this.request("/media/confirm", mediaReadyResponseSchema, {
    method: "POST",
    body: JSON.stringify(mediaConfirmInputSchema.parse({ mediaId })),
  });
}
public discardMedia(mediaId: string): Promise<unknown> {
  return this.request("/media/discard", z.unknown(), {
    method: "POST",
    body: JSON.stringify(mediaDiscardInputSchema.parse({ mediaId })),
  });
}
public async uploadMediaPhoto(input: {
  intent: MediaIntent; uri: string; contentType: MediaContentType;
}): Promise<MediaReadyResponse> {
  const local = await fetch(input.uri);
  const blob = await local.blob();
  const intent = await this.createMediaUploadIntent({
    intent: input.intent,
    contentType: input.contentType,
    sizeBytes: blob.size,
  });
  const form = new FormData();
  Object.entries(intent.fields).forEach(([key, value]) => form.append(key, value));
  form.append("file", blob, "upload");
  const uploaded = await fetch(intent.uploadUrl, { method: "POST", body: form });
  if (!uploaded.ok) throw new Error(`Photo upload failed: ${uploaded.status}`);
  return this.confirmMedia(intent.mediaId);
}
```

Change NewItemSheet's state/ref/draft fields to `photoMediaId`. It calls `uploadMediaPhoto`, discards the previous pending ID only after the new one confirms, and clears pending only when Save is pressed. Change `Favourite`, `NewItemDraft`, `favouriteFromDraft`, and `useFavourites` to propagate `photoMediaId`. Remove the favourite-specific upload methods.

- [ ] **Step 4: Run and observe GREEN**

Run the same four focused test files; expect pass.

- [ ] **Step 5: Commit**

```bash
git add pepta-frontend/src/services/api.ts pepta-frontend/src/services/api.test.ts pepta-frontend/src/components/NewItemSheet.tsx pepta-frontend/src/components/NewItemSheet.test.tsx pepta-frontend/src/screens/app/favourites.ts pepta-frontend/src/screens/app/favourites.test.ts pepta-frontend/src/screens/app/useFavourites.ts pepta-frontend/src/screens/app/useFavourites.test.tsx
git commit -m "feat: upload favourite photos through opaque media ids"
```

### Task 10: Verify the completed first gap

**Files:**
- Modify: this plan's checkboxes only after commands succeed.

- [ ] **Step 1: Run focused tests**

Run shared schema tests, all new media backend tests, favourite/user backend tests, and the four frontend tests from Tasks 1-9. Expected: all pass.

- [ ] **Step 2: Run typechecks**

Run from the repository root:

```bash
npm run build -w @pepta/shared
npm run typecheck -w @pepta/backend
npm run typecheck -w @pepta/frontend
```

Expected: all exit 0.

- [ ] **Step 3: Run lint**

Run: `npm run lint` from the repository root.

Expected: exit 0 with no new warnings.

- [ ] **Step 4: Run full tests**

Run: `npm test -w @pepta/shared`, `npm test -w @pepta/backend` with local-port permission, and `npm test -w @pepta/frontend`.

Expected baseline or better: shared 26+, backend 380+, frontend 1,571+ tests, all passing.

- [ ] **Step 5: Inspect the exploit closure**

Run:

```bash
rg -n "photoS3Key|photo-intent|photo-discard" shared/src pepta-backend/src/services/favourite.service.ts pepta-backend/src/routes/favourites.routes.ts pepta-frontend/src/components/NewItemSheet.tsx pepta-frontend/src/screens/app/favourites.ts pepta-frontend/src/screens/app/useFavourites.ts
```

Expected: no favourite raw-key contract or route remains. Meal/progress legacy references outside this first slice may still exist and are handled by subsequent plans.

- [ ] **Step 6: Review the diff and commit verification bookkeeping if needed**

Run `git diff --check`, `git status --short`, and inspect `git diff` for secrets, live IDs, or unrelated design changes. Do not deploy, migrate live data, or delete live S3 objects.
