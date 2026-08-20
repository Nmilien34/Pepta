# Media pipeline operations

How user photos live and die, and the CLI that keeps the bucket honest.
All commands run from `pepta-backend/`. Every mutation is dry-run by default
and, against production, additionally requires `CONFIRM_PRODUCTION=yes`.

## The model in one paragraph

Every S3 object the app owns is supposed to have exactly one `MediaAsset`
row. Product documents (favourites, recipes, meal logs, progress photos,
avatars) point at assets by id; assets list their referrers in `links`.
Detaching the last link queues the asset for deletion; a lease-based reaper
(`runDueMediaCleanup`) does the actual S3 deletes with exponential backoff.
After 12 failed attempts a row is **parked** (`lastDeleteErrorCode:
RETRYABLE_EXHAUSTED`, no next attempt) and waits for an operator.

Pre-pipeline ("legacy") objects were referenced by raw S3 keys on the product
rows instead. Those fields are gone from the schemas, so **mongoose queries
cannot see them** (`strictQuery` silently strips unknown filter paths — this
is why everything legacy goes through the native driver in
`media-legacy.service.ts`). Two safety nets exist:

- **Account deletion** runs `sweepLegacyMediaForDeletion` before the user's
  rows are destroyed, registering every conforming legacy key straight into
  the reaper's queue. No S3 calls on that path — deletion works mid-outage.
  It reads raw keys *whether or not* the row has a media pointer: replacing a
  photo through the pipeline writes the new pointer but never clears the old
  raw field, so a migrated-looking row can still be the last record of a
  historical object. Registration dedupes by `storageKey`, so a key that is
  already tracked costs one lookup and nothing else.
- **`media:reconcile`** (below) backfills the rest of the historical data.

A key is only ever acted on when it sits under its owner's prefix
(`favourites/<uid>/…`, `pepta/avatars/<uid>/…`, `pepta/progress-photos/<uid>/…`,
`pepta/meal-scans/<uid>/…`). Meal-log keys were client-supplied once upon a
time; anything outside the owner's prefix is reported and left untouched.
Note favourites live **outside** the `pepta/` namespace — any bucket sweep
must cover both roots.

## Runbooks

### Migrate historical raw-key media (one-time, rerunnable)

```bash
npm run media:reconcile                 # dry run: prints the full plan
npm run media:reconcile -- --execute    # writes assets + pointers
```

What it does per reference: verifies the owner prefix, HEADs the object,
creates a `ready` `legacy_backfill` asset linked to the product document, and
sets the document's media pointer. Idempotent and resumable — a crash between
asset and pointer self-heals on the next run, because what gets linked is
decided by the SOURCE, never by what already exists. Special cases:

- **meal scans never get a link.** Nothing in the app detaches a scan
  (deleting a meal log detaches the *log's* id), so a scan link would pin the
  asset above zero links forever and its object could never be reaped. A
  scan-only photo is registered unattached with a 7-day TTL and ages out; if
  a meal log shares the key, the log is the referrer that owns its lifetime.
- **soft-deleted rows are reaped, not relinked.** Meal logs are soft-deleted
  and these scans use the native driver, which bypasses the `deletedAt: null`
  middleware — so a deleted meal's photo is queued for deletion rather than
  linked back to life. Same for soft-deleted progress photos.
- objects already gone from S3 are reported as `MISS`; nothing is written.

Two things it deliberately refuses and leaves for a human, both reported in
the summary:

- **unservable content type** — progress photos are read through
  `getMediaReadDetails`, which requires a jpeg and a known size. A non-jpeg
  legacy progress photo cannot be backfilled into a readable asset, and
  pointing the row at one anyway would 404 that photo *and* the whole
  progress-photo list endpoint that maps over it.
- **referrer not recordable** — the asset already carries 8 links (the cap),
  or its status moved mid-run. Writing the pointer regardless would leave a
  live document pointing at an object that does not list it, so the next
  detach of some other referrer would free a photo this document still shows.

Exit code 1 means some HEADs failed transiently — run it again.

### Weekly: check for parked deletions

```bash
npm run media:failed
npm run media:retry -- --id <id>[,<id>...]   # or --all
```

`failed` lists rows the reaper gave up on. Fix the underlying cause first
(IAM, bucket policy, S3 incident); `retry` zeroes the attempt counter and
makes them due immediately. Retry only ever touches parked rows — it cannot
hurry a row that is merely between backoffs.

### Occasionally: sweep for orphaned objects

```bash
npm run media:orphans                                   # dry run, 30d age gate
npm run media:orphans -- --older-than-days 60 --execute
```

Lists everything under `pepta/` and `favourites/`, subtracts every key the
database references (asset storage + staging keys, plus *every* legacy raw
key still stored anywhere — pointer set or not, so the scan can never race
the migration or a stale field into deleting a live object), and reports the
remainder older than the age gate. `--execute` registers each orphan whose
key parses to an owner as `deletion_pending`; the reaper does the deleting
with its usual retries. Keys with no parseable owner are only ever reported.

Run `media:reconcile --execute` **before** the first orphan execute, or
still-referenced legacy keys will inflate the orphan report (they are
protected from deletion either way).

### After bucket/IAM changes: safety check

```bash
npm run media:check
```

Read-only. Verifies public access is fully blocked, default encryption is on,
CORS rules don't allow mutating methods from `*`, and lifecycle rules exist
(recommended: abort incomplete multipart uploads). Exit code 1 on any WARN,
so it can gate CI.

## Notes for whoever edits this code

- Output masks user ids inside keys; pass `--full-keys` when you need to act
  on a specific object. Signed URLs are never printed.
- `deletion_pending` rows MUST carry `nextDeleteAttemptAt` or the reaper's
  lease filter never sees them. `registerLegacyKeyForDeletion` does this;
  keep it that way.
- `storageKey` has no unique index. All registration paths dedupe by lookup
  first — a second asset for the same key would double-free the object.
- Product-row deletion must detach media BEFORE deleting the row
  (`removeFavourite`, `deleteRecipe`): the reverse order strands the asset if
  the process dies between the two steps.
- A `link` is a claim on the object's LIFETIME, and it is only honest when
  some code path detaches it again. Before adding a link kind for a new
  referrer, find the detach that removes it — otherwise the asset can never
  return to zero links and its object becomes unreapable.
- The native driver bypasses BOTH `strictQuery` and the `deletedAt: null`
  soft-delete middleware. The first is why these reads exist; the second is a
  trap — handle soft-deleted rows explicitly in anything reading this way.
