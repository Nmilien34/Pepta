# Meal and Recipe Media Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Follow test-driven development for every behavior change.

**Goal:** Replace raw meal-photo S3 keys with owner-scoped media IDs, retain unlinked meal scans for seven days, retain linked photos while a meal log or recipe exists, and show saved recipe photos in a restrained framed hero without changing the app's established visual language.

**Architecture:** Meal and product analysis must finish before any durable media row or S3 object is created. Successful analysis hands validated bytes to the existing `MediaAsset` authority, which creates a crash-recoverable `processing` row, normalizes and uploads a canonical JPEG, and marks it `ready` with a seven-day unattached expiry. Meal scans, meal logs, and recipes persist only `photoMediaId`; services verify ownership/readiness, maintain `meal_log` and `recipe` links, compensate failed writes, and resolve signed URLs server-side. The recipe client opens a dedicated detail route that refreshes its signed URL from the recipe read endpoint and conditionally renders the agreed framed hero.

**Tech Stack:** TypeScript, Zod, Express, Mongoose, AWS SDK/S3, Sharp, React Native/Expo, React Navigation, Vitest.

---

## File Map

- `shared/src/schemas/index.ts`, `shared/src/schemas/index.test.ts`: replace meal raw-key contracts with opaque media IDs and add recipe photo response fields.
- `pepta-backend/src/models/cache.model.ts`, `log.model.ts`, `recipe.model.ts`: store `photoMediaId` references.
- `pepta-backend/src/services/media.service.ts`: persist server-ingested meal photos with a seven-day unattached TTL and a recovery expiry while processing.
- `pepta-backend/src/services/media-cleanup.service.ts`: recover expired `processing` assets as well as pending/ready assets.
- `pepta-backend/src/services/meal-scan.service.ts`: analyze first, persist canonical media second, compensate scan-write/idempotency races, and resolve scan detail through media ownership.
- `pepta-backend/src/services/meal-log.service.ts`: create/list/delete meal logs while attaching and detaching media links.
- `pepta-backend/src/services/logs.service.ts`, `pepta-backend/src/routes/meal-logs.routes.ts`: use the specialized meal-log lifecycle service.
- `pepta-backend/src/services/recipe.service.ts`, `pepta-backend/src/routes/recipes.routes.ts`: attach, sign, fetch, and detach recipe photos.
- `pepta-frontend/src/services/api.ts`: fetch a single recipe through the typed response schema.
- `pepta-frontend/src/components/MealLogSheet.tsx`, `pepta-frontend/src/screens/app/mealLog.ts`: propagate `photoMediaId` into meal logs and recipes.
- `pepta-frontend/src/screens/app/recipes.ts`, `RecipesScreen.tsx`, `RecipeDetailScreen.tsx`, `pepta-frontend/src/navigation/MainTabs.tsx`: preserve recipe media when logging and add row-to-detail navigation with the framed hero.
- Focused regression tests live in the existing shared, backend service/model, and frontend component/screen test suites, with new files only where a new service or screen is introduced.

### Task 1: Change the shared meal and recipe wire contracts

**Files:**
- Modify: `shared/src/schemas/index.test.ts`
- Modify: `shared/src/schemas/index.ts`

- [ ] Write failing schema tests proving meal-log input/response and meal-scan response accept `photoMediaId`, reject `photoS3Key`, and recipe input/response expose optional `photoMediaId` plus nullable `photoUrl` only on responses.
- [ ] Run `npx vitest run src/schemas/index.test.ts` from `shared/` and confirm RED.
- [ ] Replace the raw fields with `idSchema` media identifiers. Keep recipe input strict, set `photoUrl` to nullable/default-null on responses, and ensure voice/barcode scan responses remain valid without media.
- [ ] Re-run the focused schema tests and build `@pepta/shared`; confirm GREEN.
- [ ] Commit: `feat: replace meal photo keys with media ids`.

### Task 2: Store media references in scan, log, and recipe models

**Files:**
- Modify: `pepta-backend/src/tests/models/media-asset.model.test.ts`
- Add or modify focused model tests for cache/log/recipe schemas
- Modify: `pepta-backend/src/models/cache.model.ts`
- Modify: `pepta-backend/src/models/log.model.ts`
- Modify: `pepta-backend/src/models/recipe.model.ts`

- [ ] Write failing model assertions that `photoMediaId` is an ObjectId reference to `MediaAsset`, that scan media IDs are unique, and that the three schemas contain no `photoS3Key` path.
- [ ] Run the focused model tests and confirm RED.
- [ ] Update TypeScript document interfaces and Mongoose fields. Meal scan media is required; meal-log and recipe media are optional; seeded starter recipes remain photo-free by default.
- [ ] Re-run focused tests and backend typecheck; confirm GREEN.
- [ ] Commit: `feat: store meal and recipe media references`.

### Task 3: Persist canonical server-ingested meal media with seven-day retention

**Files:**
- Modify: `pepta-backend/src/tests/services/media.service.test.ts`
- Modify: `pepta-backend/src/tests/services/media-cleanup.service.test.ts`
- Modify: `pepta-backend/src/services/media.service.ts`
- Modify: `pepta-backend/src/services/media-cleanup.service.ts`

- [ ] Write failing tests for `persistMealScanMedia`: it creates an owned `processing` `meal_scan`/`meal_photo` row before S3, normalizes with meal limits, writes only the canonical JPEG key, and marks it ready/unlinked with `expiresAt = now + 7 days`.
- [ ] Add failure tests proving normalization/S3/finalization failures queue durable deletion and that the initial processing expiry allows crash recovery.
- [ ] Add a failing cleanup test proving expired unlinked `processing` rows are queued alongside pending and ready rows.
- [ ] Run both focused suites and confirm RED.
- [ ] Implement the ingest function using the existing quota, normalizer, and generated canonical key boundaries. Extend expiry queueing to `processing` only when it is unlinked and expired.
- [ ] Re-run focused suites and confirm GREEN.
- [ ] Commit: `feat: retain unattached meal media for seven days`.

### Task 4: Analyze before upload and compensate meal-scan persistence failures

**Files:**
- Modify: `pepta-backend/src/tests/services/meal-scan.service.test.ts`
- Modify: `pepta-backend/src/services/meal-scan.service.ts`

- [ ] Replace existing raw-S3 expectations with failing tests proving AI/nutrition/snapshot failures create neither a media row nor an S3 object, while successful meal/product scans persist media only after analysis and return `photoMediaId`.
- [ ] Add failing tests for database-create failure and duplicate-idempotency races: the newly persisted unlinked media must be discarded, and a race returns the already-successful scan.
- [ ] Add failing scan-detail tests proving lookup joins on `photoMediaId` and gets the signed URL only through `getMediaViewUrl(userId, mediaId)`.
- [ ] Run the focused suite and confirm RED.
- [ ] Remove the raw key builder/direct S3 calls, call `persistMealScanMedia` after all analysis work succeeds, persist `photoMediaId`, and ensure every post-media failure attempts `discardMedia` without hiding the original error.
- [ ] Re-run the suite and confirm GREEN.
- [ ] Commit: `fix: make meal scan media persistence conditional`.

### Task 5: Attach and detach meal-log media ownership

**Files:**
- Add: `pepta-backend/src/tests/services/meal-log.service.test.ts`
- Add: `pepta-backend/src/services/meal-log.service.ts`
- Modify: `pepta-backend/src/services/logs.service.ts`
- Modify: `pepta-backend/src/routes/meal-logs.routes.ts`

- [ ] Write failing tests that create validates owned ready `meal_photo` media, attaches `{ kind: "meal_log", resourceId }`, preserves idempotent creates, and compensates a failed attachment by removing the uncommitted new log.
- [ ] Write failing delete tests that soft-delete the owned log and detach its exact media link, while photo-free logs behave as before.
- [ ] Run the new suite and confirm RED.
- [ ] Implement a specialized service while retaining the generic list window/serialization behavior. Do not accept a key or sign media inside general list responses.
- [ ] Re-run service and meal route tests; confirm GREEN.
- [ ] Commit: `feat: attach meal photos to meal logs`.

### Task 6: Attach, sign, fetch, and detach recipe photos

**Files:**
- Modify: `pepta-backend/src/tests/services/recipe.service.test.ts`
- Add or modify: recipe route tests
- Modify: `pepta-backend/src/services/recipe.service.ts`
- Modify: `pepta-backend/src/routes/recipes.routes.ts`

- [ ] Write failing tests that recipe create validates/attaches owned ready meal media, compensates failed attachment, and returns a signed `photoUrl` with no storage key.
- [ ] Add list/get tests for signed URL success and safe `photoUrl: null` degradation; get must allow an owned recipe or shared starter but never another user's recipe.
- [ ] Add delete tests that remove only owned recipes and detach their media link.
- [ ] Run focused recipe tests and confirm RED.
- [ ] Implement `getRecipe`, media-aware serialization, create compensation, and delete detachment; mount `GET /recipes/:id` after the static `/compose` route.
- [ ] Re-run focused service/route tests and confirm GREEN.
- [ ] Commit: `feat: retain meal photos on saved recipes`.

### Task 7: Propagate opaque media IDs through meal and recipe saves

**Files:**
- Modify: `pepta-frontend/src/screens/app/mealLog.test.ts`
- Modify: `pepta-frontend/src/components/MealLogSheet.test.tsx`
- Modify: `pepta-frontend/src/screens/app/recipes.test.ts`
- Modify: `pepta-frontend/src/screens/app/mealLog.ts`
- Modify: `pepta-frontend/src/components/MealLogSheet.tsx`
- Modify: `pepta-frontend/src/screens/app/recipes.ts`
- Modify: `pepta-frontend/src/services/api.ts`

- [ ] Write failing mapper/component tests showing scanned meal saves pass `photoMediaId`, scan-to-recipe saves reuse the same ID, voice/barcode/manual flows omit it, and logging a saved photo recipe carries its media ID into the meal seed.
- [ ] Run the focused frontend tests and confirm RED.
- [ ] Rename the mapper argument/property, include the scan media ID in recipe creation, add media to `MealSeed`, and retain it when the prefilled manual recipe log is committed. Add typed `getRecipe(id)` to the API client.
- [ ] Re-run focused tests and confirm GREEN.
- [ ] Commit: `feat: carry meal media into logs and recipes`.

### Task 8: Add the recipe detail screen and framed photo hero

**Files:**
- Modify: `pepta-frontend/src/screens/app/RecipesScreen.test.tsx`
- Add: `pepta-frontend/src/screens/app/RecipeDetailScreen.test.tsx`
- Modify: `pepta-frontend/src/screens/app/RecipesScreen.tsx`
- Add: `pepta-frontend/src/screens/app/RecipeDetailScreen.tsx`
- Modify: `pepta-frontend/src/navigation/MainTabs.tsx`

- [ ] Write failing screen tests that tapping a recipe's content navigates to `RecipeDetail`, row action buttons remain independent, and the detail screen fetches the recipe by ID.
- [ ] Add failing visual-behavior tests: a non-null `photoUrl` renders one cover-cropped rounded framed hero near the top; a null/failed URL leaves all recipe data visible and renders no placeholder hero; Log still opens the existing meal sheet.
- [ ] Run focused screen tests and confirm RED.
- [ ] Build the detail route using existing `SafeAreaView`, `AppText`, `Card`, theme border/radius/shadow tokens, ingredient/totals helpers, and a restrained aspect ratio. Do not introduce new theme colors, typography, or page chrome.
- [ ] Re-run focused tests and frontend typecheck; confirm GREEN.
- [ ] Commit: `feat: show saved photos on recipe details`.

### Task 9: Remove raw-key remnants and verify the full slice

**Files:**
- Modify only files identified by the audit/tests (for example export sanitizers whose obsolete omission type no longer compiles).

- [ ] Run `rg -n "photoS3Key|pepta/meal-scans" shared/src pepta-backend/src pepta-frontend/src` and remove production raw-key remnants. Historical migration documentation may retain the term.
- [ ] Run shared tests, backend tests, and frontend tests.
- [ ] Run `npm run build`, `npm run typecheck`, and `npm run lint` from the repository root.
- [ ] Review `git diff --check`, `git status --short`, and the complete diff for accidental theme/layout changes or unrelated files.
- [ ] Commit any final scoped cleanup as `chore: finish meal media migration`.

## Completion Criteria

- Failed meal/product analysis never creates an S3 object.
- Successful image scans return only `photoMediaId`; voice/barcode-only flows return no media ID.
- An unlinked scan photo is cleanup-eligible exactly seven days after readiness.
- Linking the same media to a meal log, a recipe, or both removes the expiry; deleting one link retains the asset while the other exists; deleting the last link queues durable S3 deletion.
- Recipe reads refresh signed URLs, and image failure cannot hide recipe content.
- The recipe list retains its existing theme and layout language; only row navigation and the framed detail hero are added.
- No caller-visible or caller-writable S3 storage key remains in the meal/recipe pipeline.
