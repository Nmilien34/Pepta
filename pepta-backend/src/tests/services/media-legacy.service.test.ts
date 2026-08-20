// The legacy raw-key bridge. What matters here:
//   - reads go through the NATIVE collections (strictQuery would silently
//     strip the legacy-field filters from mongoose queries),
//   - a key is only ever registered under its owner's own prefix,
//   - registration is idempotent by storageKey, including within one batch
//     (a meal log echoes its scan's key),
//   - deletion-time registrations are immediately visible to the reaper's
//     lease filter (nextDeleteAttemptAt set), and unattached ready ones
//     carry an expiry so the TTL sweep can find them.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  favouriteRows: vi.fn(),
  favouriteUpdateOne: vi.fn(),
  mealLogRows: vi.fn(),
  mealLogUpdateOne: vi.fn(),
  mealScanRows: vi.fn(),
  mealScanUpdateOne: vi.fn(),
  userRows: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  progressRows: vi.fn(),
  progressUpdateOne: vi.fn(),
  assetExists: vi.fn(),
  assetCreate: vi.fn(),
  assetFindOne: vi.fn(),
  assetUpdateOne: vi.fn(),
}));

function nativeCollection(rows: () => Promise<unknown[]>, updateOne: unknown, findOne?: unknown) {
  return {
    find: vi.fn((filter: unknown) => ({
      project: vi.fn(() => ({ toArray: () => rows() })),
      filter,
    })),
    findOne: findOne ?? vi.fn().mockResolvedValue(null),
    updateOne,
  };
}

vi.mock("../../models", () => ({
  FavouriteModel: {
    collection: nativeCollection(() => mocks.favouriteRows(), mocks.favouriteUpdateOne),
  },
  MealLogModel: {
    collection: nativeCollection(() => mocks.mealLogRows(), mocks.mealLogUpdateOne),
  },
  MealScanModel: {
    collection: nativeCollection(() => mocks.mealScanRows(), mocks.mealScanUpdateOne),
  },
  UserModel: {
    collection: {
      ...nativeCollection(() => mocks.userRows(), mocks.userUpdateOne),
      findOne: (...args: unknown[]) => mocks.userFindOne(...args),
    },
  },
  ProgressPhotoModel: {
    collection: nativeCollection(() => mocks.progressRows(), mocks.progressUpdateOne),
  },
}));

vi.mock("../../models/media-asset.model", () => ({
  MediaAssetModel: {
    exists: mocks.assetExists,
    create: mocks.assetCreate,
    findOne: mocks.assetFindOne,
    updateOne: mocks.assetUpdateOne,
  },
}));

import { Types } from "mongoose";
import {
  legacyBackfillReadable,
  registerLegacyReadyAsset,
  scanAllLegacyMediaRefs,
  setLegacyMediaPointer,
  sweepLegacyMediaForDeletion,
} from "../../services/media-legacy.service";

const USER = "665500000000000000000001";
const OTHER = "665500000000000000000999";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.favouriteRows.mockResolvedValue([]);
  mocks.mealLogRows.mockResolvedValue([]);
  mocks.mealScanRows.mockResolvedValue([]);
  mocks.userRows.mockResolvedValue([]);
  mocks.userFindOne.mockResolvedValue(null);
  mocks.progressRows.mockResolvedValue([]);
  mocks.assetExists.mockResolvedValue(null);
  mocks.assetCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
    ...doc,
    _id: new Types.ObjectId(),
  }));
  mocks.assetFindOne.mockResolvedValue(null);
  mocks.assetUpdateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("sweepLegacyMediaForDeletion", () => {
  it("registers every conforming key as deletion_pending, due immediately", async () => {
    mocks.favouriteRows.mockResolvedValue([
      { _id: "f1", photoS3Key: `favourites/${USER}/a.jpg` },
    ]);
    mocks.progressRows.mockResolvedValue([
      { _id: "p1", s3Key: `pepta/progress-photos/${USER}/b.jpg`, status: "active" },
    ]);

    const result = await sweepLegacyMediaForDeletion(USER);

    expect(result).toEqual({ registered: 2, alreadyTracked: 0, nonConforming: 0 });
    expect(mocks.assetCreate).toHaveBeenCalledTimes(2);
    for (const [doc] of mocks.assetCreate.mock.calls) {
      expect(doc.source).toBe("legacy_backfill");
      expect(doc.status).toBe("deletion_pending");
      // Without this, the row never matches the reaper's lease filter.
      expect(doc.nextDeleteAttemptAt).toBeInstanceOf(Date);
      expect(doc.links).toEqual([]);
    }
  });

  it("never registers a key that sits outside the user's own prefix", async () => {
    mocks.favouriteRows.mockResolvedValue([
      // Another user's object, and plain garbage — both client-suppliable.
      { _id: "f1", photoS3Key: `favourites/${OTHER}/theirs.jpg` },
      { _id: "f2", photoS3Key: "https://evil.example/x.jpg" },
    ]);

    const result = await sweepLegacyMediaForDeletion(USER);

    expect(result).toEqual({ registered: 0, alreadyTracked: 0, nonConforming: 2 });
    expect(mocks.assetCreate).not.toHaveBeenCalled();
  });

  it("registers a shared meal-scan/meal-log key exactly once", async () => {
    const shared = `pepta/meal-scans/${USER}/meal.jpg`;
    mocks.mealLogRows.mockResolvedValue([{ _id: "l1", photoS3Key: shared }]);
    mocks.mealScanRows.mockResolvedValue([{ _id: "s1", photoS3Key: shared }]);

    const result = await sweepLegacyMediaForDeletion(USER);

    // Two authorities for one object would be a double-free at the reaper.
    expect(result.registered).toBe(1);
    expect(mocks.assetCreate).toHaveBeenCalledTimes(1);
  });

  it("leaves keys alone that some asset already tracks", async () => {
    mocks.userFindOne.mockResolvedValue({
      _id: USER,
      avatarKey: `pepta/avatars/${USER}/me.jpg`,
    });
    mocks.assetExists.mockResolvedValue({ _id: "existing" });

    const result = await sweepLegacyMediaForDeletion(USER);

    expect(result).toEqual({ registered: 0, alreadyTracked: 1, nonConforming: 0 });
    expect(mocks.assetCreate).not.toHaveBeenCalled();
  });
});

describe("scanAllLegacyMediaRefs", () => {
  it("derives the owner from each row and judges conformance per owner", async () => {
    mocks.favouriteRows.mockResolvedValue([
      { _id: "f1", userId: USER, photoS3Key: `favourites/${USER}/mine.jpg` },
      { _id: "f2", userId: OTHER, photoS3Key: `favourites/${USER}/stolen.jpg` },
    ]);

    const refs = await scanAllLegacyMediaRefs();

    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ userId: USER, conforming: true });
    // The key exists but belongs to USER's prefix — for OTHER's row it is
    // non-conforming, so nothing downstream may act on it.
    expect(refs[1]).toMatchObject({ userId: OTHER, conforming: false });
  });

  it("carries the legacy progress-photo status through for the CLI", async () => {
    mocks.progressRows.mockResolvedValue([
      {
        _id: "p1",
        userId: USER,
        s3Key: `pepta/progress-photos/${USER}/x.jpg`,
        status: "deleted",
      },
    ]);

    const refs = await scanAllLegacyMediaRefs();

    expect(refs[0]).toMatchObject({ legacyStatus: "deleted" });
  });
});

describe("registerLegacyReadyAsset", () => {
  it("creates a ready, linked asset carrying the HEAD-measured facts", async () => {
    const { outcome } = await registerLegacyReadyAsset({
      userId: USER,
      key: `favourites/${USER}/a.jpg`,
      source: "favourites.photoS3Key",
      resourceId: "f1",
      contentType: "image/png",
      sizeBytes: 12345,
    });

    expect(outcome).toBe("registered");
    const doc = mocks.assetCreate.mock.calls[0]![0];
    expect(doc).toMatchObject({
      source: "legacy_backfill",
      intent: "favourite_photo",
      status: "ready",
      declaredContentType: "image/png",
      declaredSizeBytes: 12345,
      byteSize: 12345,
    });
    expect(doc.links).toEqual([
      expect.objectContaining({ kind: "favourite", resourceId: "f1" }),
    ]);
    expect(doc.expiresAt).toBeUndefined();
  });

  it("repairs the missing link on an already-tracked ready asset instead of duplicating it", async () => {
    const existingId = new Types.ObjectId();
    mocks.assetFindOne.mockResolvedValue({ _id: existingId, status: "ready" });

    const result = await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/meal.jpg`,
      source: "meallogs.photoS3Key",
      resourceId: "l2",
      contentType: null,
      sizeBytes: null,
    });

    expect(result).toEqual({
      mediaId: existingId.toString(),
      outcome: "already-tracked",
    });
    expect(mocks.assetCreate).not.toHaveBeenCalled();
    // Guarded push: only when this exact link is absent and under the cap.
    const [filter, update] = mocks.assetUpdateOne.mock.calls[0]!;
    expect(filter.links.$not.$elemMatch).toEqual({ kind: "meal_log", resourceId: "l2" });
    expect(update.$push.links).toMatchObject({ kind: "meal_log", resourceId: "l2" });
  });

  it("refuses to point a document at a dying asset", async () => {
    mocks.assetFindOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      status: "deletion_pending",
    });

    const result = await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/avatars/${USER}/a.jpg`,
      source: "users.avatarKey",
      resourceId: USER,
      contentType: null,
      sizeBytes: null,
    });

    expect(result.outcome).toBe("tracked-terminal");
    expect(mocks.assetUpdateOne).not.toHaveBeenCalled();
  });

  it("gives an unattached scan-only asset an expiry so the TTL sweep can reap it", async () => {
    const expires = new Date("2026-09-01T00:00:00.000Z");
    await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/orphan-scan.jpg`,
      source: "mealscans.photoS3Key",
      resourceId: null,
      contentType: "image/jpeg",
      sizeBytes: 100,
      unattachedExpiresAt: expires,
    });

    const doc = mocks.assetCreate.mock.calls[0]![0];
    expect(doc.links).toEqual([]);
    expect(doc.expiresAt).toBe(expires);
  });

  it("rejects an unattached registration with no expiry — that row would be invisible forever", async () => {
    await expect(
      registerLegacyReadyAsset({
        userId: USER,
        key: `pepta/meal-scans/${USER}/x.jpg`,
        source: "mealscans.photoS3Key",
        resourceId: null,
        contentType: null,
        sizeBytes: null,
      }),
    ).rejects.toThrow(/expiry/);
  });
});

describe("setLegacyMediaPointer", () => {
  it("writes the right pointer field for the source, via the native collection", async () => {
    const mediaId = new Types.ObjectId().toString();
    const docId = new Types.ObjectId().toString();

    await setLegacyMediaPointer("progressphotos.s3Key", docId, mediaId);

    const [filter, update] = mocks.progressUpdateOne.mock.calls[0]!;
    expect(String(filter._id)).toBe(docId);
    expect(String(update.$set.mediaId)).toBe(mediaId);
  });
});

// Regression cover for the defects the adversarial review confirmed. Each of
// these was a way for a live photo to be freed, resurrected, or made
// permanently unreadable — so each gets a test that fails if it comes back.
describe("meal scans never claim an object's lifetime", () => {
  it("registers a scan key unattached even when a resourceId is offered", async () => {
    await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/shared.jpg`,
      source: "mealscans.photoS3Key",
      // The CLI may hand one over; the SOURCE decides, not the caller.
      resourceId: "scan-1",
      contentType: "image/jpeg",
      sizeBytes: 100,
      unattachedExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const doc = mocks.assetCreate.mock.calls[0]![0];
    // A "meal_log" link carrying a SCAN's id is undetachable — deleting a
    // meal log detaches the LOG's id, and nothing detaches a scan — so the
    // asset could never fall back to zero links and the object would leak.
    expect(doc.links).toEqual([]);
    expect(doc.expiresAt).toBeInstanceOf(Date);
  });

  it("adds no link to an asset a meal log already claimed, and leaves its expiry alone", async () => {
    mocks.assetFindOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      status: "ready",
    });

    const result = await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/shared.jpg`,
      source: "mealscans.photoS3Key",
      resourceId: "scan-1",
      contentType: "image/jpeg",
      sizeBytes: 100,
    });

    expect(result.outcome).toBe("already-tracked");
    expect(mocks.assetUpdateOne).not.toHaveBeenCalled();
    expect(mocks.assetCreate).not.toHaveBeenCalled();
  });
});

describe("backfilled assets stay readable", () => {
  it("sets contentType on a jpeg so getMediaReadDetails can match it", async () => {
    await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/progress-photos/${USER}/a.jpg`,
      source: "progressphotos.s3Key",
      resourceId: "p1",
      contentType: "image/jpeg",
      sizeBytes: 4096,
    });

    const doc = mocks.assetCreate.mock.calls[0]![0];
    // getMediaReadDetails matches on contentType "image/jpeg" AND byteSize>0,
    // and 404s otherwise — which would take the whole progress-photo list
    // endpoint down with it, not just the one photo.
    expect(doc.contentType).toBe("image/jpeg");
    expect(doc.byteSize).toBe(4096);
  });

  it("refuses to migrate a progress photo that could never be served", () => {
    expect(legacyBackfillReadable("progressphotos.s3Key", "image/png", 10)).toBe(false);
    expect(legacyBackfillReadable("progressphotos.s3Key", "image/jpeg", null)).toBe(false);
    expect(legacyBackfillReadable("progressphotos.s3Key", "image/jpeg", 10)).toBe(true);
    // Everything else reads through getMediaViewUrl, which has no such gate.
    expect(legacyBackfillReadable("favourites.photoS3Key", "image/png", 10)).toBe(true);
  });

  it("reports link-not-applied rather than success when the guarded push is refused", async () => {
    const id = new Types.ObjectId();
    mocks.assetFindOne
      .mockResolvedValueOnce({ _id: id, status: "ready" })
      // Re-read after the no-op push: still ready, but the link is absent —
      // the 8-link cap refused it.
      .mockResolvedValueOnce({ _id: id, status: "ready", links: [] });
    mocks.assetUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const result = await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/x.jpg`,
      source: "meallogs.photoS3Key",
      resourceId: "log-9",
      contentType: "image/jpeg",
      sizeBytes: 10,
    });

    // Reporting success here would let the caller point log-9 at an asset
    // that does not list it — and the next detach would free the object.
    expect(result.outcome).toBe("link-not-applied");
  });

  it("treats an already-present link as success, not as a refusal", async () => {
    const id = new Types.ObjectId();
    mocks.assetFindOne
      .mockResolvedValueOnce({ _id: id, status: "ready" })
      .mockResolvedValueOnce({
        _id: id,
        status: "ready",
        links: [{ kind: "meal_log", resourceId: "log-9" }],
      });
    mocks.assetUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const result = await registerLegacyReadyAsset({
      userId: USER,
      key: `pepta/meal-scans/${USER}/x.jpg`,
      source: "meallogs.photoS3Key",
      resourceId: "log-9",
      contentType: "image/jpeg",
      sizeBytes: 10,
    });

    expect(result.outcome).toBe("already-tracked");
  });
});

describe("the deletion sweep does not trust a set media pointer", () => {
  it("still registers a stale raw key on a row that has since been re-photographed", async () => {
    // Replacing a photo through the pipeline writes the new pointer but never
    // clears the old raw field. If the sweep skipped this row, the OLD S3
    // object would outlive the account with no cleanup authority at all.
    mocks.userFindOne.mockResolvedValue({
      _id: USER,
      avatarKey: `pepta/avatars/${USER}/old.jpg`,
      avatarMediaId: new Types.ObjectId(),
    });

    const result = await sweepLegacyMediaForDeletion(USER);

    expect(result.registered).toBe(1);
    expect(mocks.assetCreate).toHaveBeenCalledTimes(1);
    expect(mocks.assetCreate.mock.calls[0]![0].storageKey).toBe(
      `pepta/avatars/${USER}/old.jpg`,
    );
  });
});

describe("scanAllLegacyMediaRefs and soft deletes", () => {
  it("marks a soft-deleted meal log so reconcile reaps it instead of relinking it", async () => {
    // The native driver bypasses the deletedAt:null query middleware, so a
    // deleted meal log's photo reaches reconcile looking perfectly live.
    mocks.mealLogRows.mockResolvedValue([
      {
        _id: "l1",
        userId: USER,
        photoS3Key: `pepta/meal-scans/${USER}/gone.jpg`,
        deletedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    const refs = await scanAllLegacyMediaRefs();

    expect(refs[0]).toMatchObject({
      source: "meallogs.photoS3Key",
      legacyStatus: "deleted",
    });
  });

  it("leaves a live meal log unmarked", async () => {
    mocks.mealLogRows.mockResolvedValue([
      { _id: "l1", userId: USER, photoS3Key: `pepta/meal-scans/${USER}/live.jpg` },
    ]);

    const refs = await scanAllLegacyMediaRefs();

    expect(refs[0]!.legacyStatus).toBeUndefined();
  });
});
