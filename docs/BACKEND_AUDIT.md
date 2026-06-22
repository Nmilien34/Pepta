# PEPTA Backend Audit

Audit date: 2026-06-21

Scope: `pepta-backend/src` and `shared/src`, with `FRONTEND_HANDOFF.md` checked for contract alignment. This is a read-only audit: no code fixes were made.

## A. Status Matrix

| Area                           | Status                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell / route mounting     | ✅ real                                       | `pepta-backend/src/app.ts:88-125` applies helmet, CORS, no-store, body caps, mounts all backend routes, then not-found/error handlers.                                                                                                                                                                                                                                     |
| Healthz                        | ✅ real                                       | `pepta-backend/src/routes/health.routes.ts:8-16` calls injected DB health check and returns `status/database`.                                                                                                                                                                                                                                                             |
| Native auth routes             | ❌ stub                                       | `pepta-backend/src/routes/auth.routes.ts:10-26` validates Google/Apple request bodies but returns `{ status: "not_implemented" }` with 501.                                                                                                                                                                                                                                |
| Auth provider helper libs      | ⛔ deferred-by-decision                       | Google and Apple token verifiers exist in `pepta-backend/src/auth/google.ts:13-38` and `pepta-backend/src/auth/apple.ts:31-58`, but routes are not wired to them. Treat provider hookup as deferred, not a foundation defect.                                                                                                                                              |
| Session auth middleware        | ✅ real                                       | `pepta-backend/src/auth/middleware.ts:5-24` enforces bearer JWT and sets `req.user.id`; all protected routers call `router.use(requireAuth)`.                                                                                                                                                                                                                              |
| `/me` GET                      | ✅ real                                       | `pepta-backend/src/routes/me.routes.ts:16-20` calls `getCurrentUser`; service upserts a user shell and serializes `userResponseSchema` in `pepta-backend/src/services/user.service.ts:27-64`.                                                                                                                                                                              |
| `/me` PATCH                    | ✅ real                                       | `pepta-backend/src/routes/me.routes.ts:23-29` validates `userProfileSettingsPatchSchema`; `updateProfileSettings` merges the existing profile, recomputes profile targets, and returns `userProfileResponseSchema` in `pepta-backend/src/services/user.service.ts:67-133`.                                                                                                 |
| Onboarding                     | 🟡 partial                                    | Real model writes for profile, compound/schedule/last dose, weight logs, and legal acceptance in `pepta-backend/src/services/onboarding.service.ts:95-302`; returns shared `onboardingResultResponseSchema`. Partial because `planHighlights` are canned strings (`onboarding.service.ts:75-87`) and current-weight idempotency is weak (`onboarding.service.ts:243-253`). |
| Home                           | 🟡 partial                                    | `pepta-backend/src/services/home.service.ts:100-171` aggregates profile, active compounds, med levels, totals, latest weight, insights, retention, streak. It is real model-backed, but section failures are converted to empty arrays/null/zero fallback values with `sectionErrors` (`home.service.ts:123-137`).                                                         |
| Track                          | 🟡 partial                                    | `pepta-backend/src/services/track.service.ts:12-46` aggregates real log services, but failed sections become empty arrays with `sectionErrors`.                                                                                                                                                                                                                            |
| Progress                       | 🟡 partial                                    | `pepta-backend/src/services/progress.service.ts:37-68` returns real weight/measurement/photo/retention data, but failed sections become empty arrays with `sectionErrors`.                                                                                                                                                                                                 |
| Medication level               | ✅ real                                       | `pepta-backend/src/services/medication-level.service.ts:5-53` reads active compounds, dose logs, schedules, then parses `computeMedicationLevel` output through `medicationLevelResponseSchema`.                                                                                                                                                                           |
| Insights                       | 🟡 partial                                    | `pepta-backend/src/services/insights.service.ts:396-443` generates real deterministic drafts from medication levels/logs/weights and caches `InsightModel` writes. Copy falls back to canned deterministic prose when OpenAI is absent/fails (`insights.service.ts:107-109`, `170-181`).                                                                                   |
| Weekly retention               | ✅ real technically, ⚠️ coach-flavored        | `pepta-backend/src/services/muscle-retention.service.ts:35-142` reads real logs/profile, computes score/verdict/drivers, caches `WeeklyRetentionModel`, and returns `weeklyRetentionResponseSchema`. Product framing is coach-like; see section F.                                                                                                                         |
| Diagnostics / stall            | ✅ real technically, ⚠️ coach-flavored        | `pepta-backend/src/services/stall-diagnostic.service.ts:6-64` reads weight/meal/protein/activity/dose logs, runs `detectStall`, and returns deterministic reasons. `suggestedFix` is prescriptive; see section F.                                                                                                                                                          |
| Meal scan analyze              | ❌ stub                                       | `pepta-backend/src/services/meal-scan.service.ts:11-26` returns `Unconfirmed meal`, zero macros, fixed confidence, and canned `coachProse`. No image analysis or storage happens.                                                                                                                                                                                          |
| Meal scan voice                | ❌ stub                                       | `pepta-backend/src/services/meal-scan.service.ts:29-45` uses transcript word count for calories, zeroes other macros, and returns canned `coachProse`. No parsing/NLP or persistence.                                                                                                                                                                                      |
| Weight log CRUD                | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:114`; `createLogRouter` validates schema and calls `weightLogService`; `createCrudService` persists/list/soft-deletes via Mongoose in `pepta-backend/src/services/crud.service.ts:66-120`.                                                                                                                                            |
| Dose log CRUD                  | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:113`; same real CRUD path as above, using `DoseLogModel` via `logs.service.ts:23-28`.                                                                                                                                                                                                                                                 |
| Meal log CRUD                  | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:115`; model-backed through `MealLogModel` in `logs.service.ts:30-35`.                                                                                                                                                                                                                                                                 |
| Water log CRUD                 | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:116`; model-backed through `WaterLogModel` in `logs.service.ts:37-42`.                                                                                                                                                                                                                                                                |
| Protein log CRUD               | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:117`; model-backed through `ProteinLogModel` in `logs.service.ts:44-49`.                                                                                                                                                                                                                                                              |
| Activity log CRUD              | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:118`; model-backed through `ActivityLogModel` in `logs.service.ts:51-56`.                                                                                                                                                                                                                                                             |
| Side-effect log CRUD           | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:119`; model-backed through `SideEffectLogModel` in `logs.service.ts:58-63`.                                                                                                                                                                                                                                                           |
| Measurement CRUD               | ✅ real                                       | Mounted in `pepta-backend/src/app.ts:120`; model-backed through `MeasurementModel` in `logs.service.ts:65-70`.                                                                                                                                                                                                                                                             |
| Compounds                      | ✅ real                                       | `pepta-backend/src/routes/catalog.routes.ts:29-73` exposes list/create/delete/patch; service uses `CompoundModel` and response schema in `catalog.service.ts:48-96`.                                                                                                                                                                                                       |
| Schedules                      | ✅ real                                       | `pepta-backend/src/routes/catalog.routes.ts:76-113` exposes list/create/delete/patch; service uses `ScheduleModel` and response schema in `catalog.service.ts:99-153`.                                                                                                                                                                                                     |
| Cycles                         | ✅ real                                       | `pepta-backend/src/routes/catalog.routes.ts:116-140` exposes list/create/delete; service uses `CycleModel` in `catalog.service.ts:155-183`.                                                                                                                                                                                                                                |
| Medication catalog             | ✅ real                                       | `GET /compounds/catalog` is mounted through `createCompoundsRouter`; `listMedicationCatalog` reads active `MedicationCatalogModel` and serializes `medicationCatalogItemSchema` in `catalog.service.ts:29-36`.                                                                                                                                                             |
| Research library               | ✅ real seeded content                        | `pepta-backend/src/routes/catalog.routes.ts:155-164` returns `ResearchArticleModel` rows via `catalog.service.ts:38-45`; seed entries are static PubMed-search style resources in `catalogs.seed.ts:170-214`.                                                                                                                                                              |
| Progress photos                | 🟡 partial                                    | Model-backed create/list/confirm in `progress-photo.service.ts:46-84`; upload URL is not presigned and falls back to `https://pepta.local` when no S3 bucket is set (`progress-photo.service.ts:12-14`, `58`).                                                                                                                                                             |
| RevenueCat webhook             | ✅ real, integration-config dependent         | `pepta-backend/src/routes/webhook.routes.ts:23-30` requires a secret and validates body; `applyRevenueCatWebhook` dedupes, finds user, applies entitlement, and marks processed in `revenuecat.service.ts:113-167`. Returns 503 when the secret is not configured (`revenuecat.service.ts:53-62`).                                                                         |
| Mongo connection               | ⛔ deferred-by-decision / real local plumbing | `pepta-backend/src/db/mongo.ts:5-15` connects to `env.mongoUri`; local default is in `config/env.ts:12`. Atlas/prod wiring is intentionally deferred.                                                                                                                                                                                                                      |
| Shared constants/schemas/types | ✅ real                                       | `shared/src/schemas/index.ts:35-755` defines input/response schemas, patch schemas, onboarding result, home/track/progress, webhook schema, and log query schema; `shared/src/types/index.ts` exports inferred types.                                                                                                                                                      |
| Nutrition lib                  | ✅ real                                       | `pepta-backend/src/lib/nutrition.ts:97-181` computes calorie/protein/fiber/deficit/goal date with neutral-sex path.                                                                                                                                                                                                                                                        |
| Lifestyle targets lib          | ✅ real                                       | `pepta-backend/src/lib/lifestyle-targets.ts:30-67` computes hydration/fiber/steps from weight, activity, and side-effect baseline.                                                                                                                                                                                                                                         |
| Profile targets lib            | ✅ real                                       | `pepta-backend/src/lib/profile-targets.ts:24-95` derives age and combines nutrition/lifestyle targets.                                                                                                                                                                                                                                                                     |
| Pharmacokinetics lib           | ✅ real                                       | `pepta-backend/src/lib/pharmacokinetics.ts:197-243` computes relative medication level, curve, peak/trough, next dose.                                                                                                                                                                                                                                                     |
| Muscle-retention lib           | ✅ real technically, ⚠️ coach-flavored        | `pepta-backend/src/lib/muscle-retention.ts:81-126` computes 0-100 score/verdict/drivers; real deterministic math but product framing is coach-like.                                                                                                                                                                                                                        |
| Insight detectors lib          | ✅ real                                       | `pepta-backend/src/lib/insight-detectors.ts:50-206` contains deterministic detectors for medication level, dose trough, protein trend, stall, and side-effect cycle correlation.                                                                                                                                                                                           |
| Streak/week/dates libs         | ✅ real                                       | Date/week/streak helpers are implemented in `dates.ts`, `week.ts`, and `streak.ts` with unit tests.                                                                                                                                                                                                                                                                        |
| Seeds                          | ✅ real static seed data                      | Medication catalog and research rows are upserted in `pepta-backend/src/seeds/catalogs.seed.ts:217-234`; includes injectables, oral semaglutide/Rybelsus/Wegovy Pill, Trulicity, and research links.                                                                                                                                                                       |

## B. Stubs & Placeholders

1. `pepta-backend/src/routes/auth.routes.ts:10-26`
   - Current behavior: Google and Apple sign-in validate request bodies, then return `501` with `{ status: "not_implemented" }`.
   - Real would require: call provider token verifier, create/link `User.authProviders`, issue session JWT, return `AuthResponse`.
   - Note: provider verification itself is deferred by decision, not a foundation defect, but the endpoints are stubs.

2. `pepta-backend/src/services/meal-scan.service.ts:11-26`
   - Current behavior: image analysis returns `foodName: "Unconfirmed meal"`, macros all `0`, `confidence: 0.35`, and canned `coachProse`.
   - Real would require: image upload/storage or vision model input, extraction of foods/macros, confidence provenance, and a path to create/edit a meal log.

3. `pepta-backend/src/services/meal-scan.service.ts:29-45`
   - Current behavior: voice meal parse uses transcript word count for calories (`words * 12`, clamped), zeroes protein/carbs/fat/fiber, and returns canned `coachProse`.
   - Real would require: structured food parsing, macro estimates, quantity handling, user confirmation, and optional meal-log creation.

4. `pepta-backend/src/services/progress-photo.service.ts:12-14` and `:58`
   - Current behavior: upload URL is a deterministic public URL with `?upload=1`, or `https://pepta.local/...` without S3 config.
   - Real would require: `@aws-sdk/s3-request-presigner` presigned PUT/POST URL, content-type constraints, and storage verification.

5. `pepta-backend/src/services/home.service.ts:123-137`, `track.service.ts:30-46`, `progress.service.ts:53-68`
   - Current behavior: aggregate endpoints fail soft. If a section rejects, the endpoint returns empty arrays/null/zeros plus `sectionErrors`.
   - Real would require: the same model data on success, which exists; the placeholder aspect is only the fallback values on section failure.

6. `pepta-backend/src/services/insights.service.ts:107-109`, `:170-181`
   - Current behavior: if OpenAI is absent/fails, insight copy uses canned fallback headline/body.
   - Real would require: configured OpenAI key and successful `responses.create`; deterministic signal generation is real.

7. `pepta-backend/src/services/onboarding.service.ts:75-87`
   - Current behavior: `planHighlights` are static template strings.
   - Real would require: either neutral tracker wording or UI-side display of computed targets without plan-like copy.

8. `pepta-backend/src/services/muscle-retention.service.ts:19-32`
   - Current behavior: verdict prose is hardcoded from `protected/steady/watch/at_risk`.
   - Real would require: tracker-appropriate neutral observations, or display-only indicators without verdict copy.

9. `pepta-backend/src/services/stall-diagnostic.service.ts:57-62`
   - Current behavior: `suggestedFix` is canned and prescriptive.
   - Real would require: passive plateau observation/nudge, or a richer deterministic explanation surfaced automatically.

## C. Deferred By Decision (Not Defects)

- Google/Apple auth verification and account-linking: verifier helpers exist, routes remain 501 (`auth.routes.ts:10-26`). Deferred integration.
- Mongo/Atlas production wiring: local/default `MONGODB_URI` exists (`config/env.ts:12`), `connect()` is real (`db/mongo.ts:5-15`), but Atlas environment setup is deferred.
- OpenAI insight copy generation: service is ready when `OPENAI_API_KEY` is configured (`insights.service.ts:117-168`), and falls back deterministically otherwise.
- S3 progress photo uploads: env and AWS dependencies exist, but current upload URL is not presigned (`progress-photo.service.ts:58`).
- RevenueCat live hookup: webhook logic is real, but requires `REVENUECAT_WEBHOOK_SECRET` and external RevenueCat configuration (`revenuecat.service.ts:53-62`).
- Push/notifications: no models/routes/jobs are present. Deferred.
- Custom domain/hosting: no backend code path. Deferred outside this foundation.
- Cron/scheduler jobs: env keys and `node-cron` dependency exist (`config/env.ts:30-32`), but no scheduler registration/import is wired in `pepta-backend/src`.

## D. Contract Integrity

- Shared schemas are broadly aligned with route returns:
  - `/onboarding/complete` validates `onboardingCompleteInputSchema` and returns `onboardingResultResponseSchema` (`onboarding.routes.ts:13-18`, `onboarding.service.ts:287-302`).
  - `PATCH /me` validates `userProfileSettingsPatchSchema` and returns `UserProfileResponse` (`me.routes.ts:23-29`, `user.service.ts:67-133`).
  - `PATCH /compounds/:id` and `PATCH /schedules/:id` validate `compoundPatchSchema` / `schedulePatchSchema` and serialize response schemas (`catalog.routes.ts:62-70`, `102-110`).
- `FRONTEND_HANDOFF.md` now matches the real backend table for `/onboarding/complete`, `PATCH /me`, compounds, and schedules (`FRONTEND_HANDOFF.md:31-39`, `71-92`).
- Important drift/risk: `biweekly` is in shared schedules and medication-level handling, but dose-cycle insight detection only defaults weekly schedules to 7 days. Without `intervalDays`, a `biweekly` schedule is skipped in `doseCycleDrafts` (`insights.service.ts:253`), while medication-level handles it (`medication-level.service.ts:24-28`).
- Important idempotency risk: onboarding baseline weight uses deterministic `journeyStartAt` (`onboarding.service.ts:221-237`), but current weight upsert filters on exact `new Date()` and inserts another `new Date()` (`onboarding.service.ts:243-253`). Re-running onboarding can create duplicate current-weight logs instead of staying idempotent.
- `ProgressPhotoUploadIntentResponse.uploadUrl` passes schema validation because it is a URL, but semantically it is not a real upload intent/presigned URL (`progress-photo.service.ts:58`).
- Frontend API client does not yet expose most backend routes; `pepta-frontend/src/services/api.ts` only wraps auth/home/track/progress. This is frontend client incompleteness, not backend contract drift.
- No computed profile target appears missing from backend responses: `UserProfileResponse` includes calories, protein, fiber, water, steps, goal date, and engine version (`shared/src/schemas/index.ts:192-207`).

## E. Test & Quality Readiness

### Verification Commands

- `npm run lint`: passed.
- `npm run typecheck -ws --if-present`: passed for shared, backend, frontend.
- `npm run test -ws --if-present`: passed.
  - Shared: 1 file, 10 tests.
  - Backend: 14 files, 41 tests.
  - Frontend: no test files; exits 0 via `--passWithNoTests`.
- `npm run build -ws --if-present`: passed.
  - Shared `tsc` passed.
  - Backend `tsc` passed.
  - Frontend `expo export -p web` passed.
- `npm audit --audit-level=moderate`: failed with 21 advisories (1 low, 20 moderate).

### Test Coverage Shape

- Meaningful tests exist for shared schemas, app health/auth guard/webhook public behavior, nutrition, lifestyle targets, pharmacokinetics, muscle retention, insight detectors, dates/week/streak, RevenueCat service, insights service, onboarding service, user settings service, and catalog edit service.
- No direct tests found for Mongo integration, auth route success paths, meal scan real analysis, progress-photo presigned upload behavior, track/progress/home aggregate failure semantics, or actual scheduler jobs.
- Many service tests mock Mongoose models; they verify service intent and response shapes, not live database behavior.

### Audit Posture

- Advisories are mostly frontend/tooling tree (`esbuild` under Vite, `postcss` under Expo Metro, `js-yaml` under React Native/Jest tooling), but backend production deps are also touched:
  - `node-cron@3.0.3` pulls vulnerable `uuid@8.3.2`.
  - `google-auth-library` / `gaxios` and Mongoose transitive `gaxios` appear in the dependency tree.
- Several suggested fixes require breaking upgrades (`react-native`, `expo`, `node-cron`). Treat as dependency-upgrade planning, not a code-level audit failure.

### Security Baseline

- Present:
  - Helmet enabled (`app.ts:88`).
  - CORS restricted to configured frontend origin and dev localhost pattern (`app.ts:51-68`, `89`).
  - `Cache-Control: no-store` on all responses (`app.ts:90-94`).
  - Body caps: global `1mb`, meal-scans `14mb` (`app.ts:95-96`).
  - Protected routes use JWT `requireAuth` (`routes/*`, plus route mount evidence in `app.ts:99-123`).
  - RevenueCat webhook requires timing-safe secret check (`webhook.routes.ts:14-30`, `revenuecat.service.ts:53-75`).
  - Production env validation requires AWS/OpenAI/RevenueCat keys (`config/env.ts:35-56`).
- Absent / deferred:
  - Native auth success paths are not wired.
  - No webhook signature validation beyond shared-secret bearer/header check.
  - No rate limiting.
  - No real S3 presigned uploads.
  - No push/notification security model.

## F. Tracker-vs-Coach Alignment

1. `weekly-retention` is coach-framed.
   - Files: `shared/src/schemas/index.ts:557-566`, `pepta-backend/src/lib/muscle-retention.ts:81-126`, `pepta-backend/src/services/muscle-retention.service.ts:35-142`.
   - Why it reads as coach: returns a 0-100 `score`, `verdict` (`protected/steady/watch/at_risk`), `verdictProse`, and driver scores.
   - Tracker reframe: keep the underlying signal, but present as passive "muscle protection" insight: indicator/level, observed protein/training/pace signals, and one neutral observation. Avoid weekly judgment language.

2. `stall-diagnostic` is coach-framed.
   - Files: `shared/src/schemas/index.ts:570-586`, `pepta-backend/src/routes/diagnostics.routes.ts:13-18`, `pepta-backend/src/services/stall-diagnostic.service.ts:6-64`.
   - Why it reads as coach: on-demand "diagnose your plateau" endpoint returns `suggestedFix` with "Tighten one measurable lever this week..." copy.
   - Tracker reframe: passive plateau insight that auto-surfaces when weight is flat; show observed facts (flat days, logging completeness, recent dose context) and a light note, not a diagnostic/fix loop.

3. `coachProse` is out of positioning for meal scan.
   - Files: `shared/src/schemas/index.ts:604-618`, `pepta-backend/src/services/meal-scan.service.ts:24`, `:43`.
   - Why it reads as coach: field name and copy imply coaching rather than neutral review.
   - Tracker reframe: rename to `note` or `summary`, with neutral copy such as "Review before logging."

4. Insight fallback copy has some nudge language.
   - Files: `pepta-backend/src/services/insights.service.ts:228-230`, `:267-269`, `:306-308`, `:332-334`, `:413-414`.
   - Why it reads as coach: some lines suggest actions ("may help", "keep meals steady", "clarify the next lever").
   - Tracker reframe: keep cards as observations: "Protein logs are lower this week"; "Side effects cluster around cycle day N"; "Weights are flat over the last N days."

5. No Leanient-style weekly check-in or "today's plan" engine was found.
   - There is no route/service that creates a weekly check-in flow or prescriptive daily plan. The closest surfaces are weekly retention and stall diagnostics.

## G. Honest Bottom Line

The backend foundation is usable as a tracker once deferred integrations are wired: core profile/onboarding, log CRUD, catalog/schedule/compound management, home/track/progress aggregations, medication levels, deterministic insights, RevenueCat webhook logic, and shared schemas are real and model-backed. The top three real gaps excluding deferred integrations are: meal scan/voice are stubs, progress-photo upload intent is not a real presigned upload, and coach-flavored weekly retention/stall surfaces need reframing for Pepta's tracker positioning. Also fix the onboarding current-weight idempotency risk and biweekly dose-cycle insight drift before depending on those paths heavily.
