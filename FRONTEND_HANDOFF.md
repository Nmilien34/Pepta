# Pepta Frontend Handoff

This scaffold exists so the UI agent can build screens against typed backend contracts without reverse-engineering routes.

## Changelog

- 2026-06-21: Chunk 2 additive schema update landed.
  `UserProfileInput` now requires `goalWeight`, `goalWeightUnit`, and `goalPace`
  (`gentle | steady | ambitious`).
- 2026-06-21: `UserProfileResponse` now includes
  `targetWeeklyLossPercent`, `estimatedGoalDate`, and `dailyFiberTargetGrams`.
- 2026-06-21: `HomeResponse` now includes `streakDays`, `setupProgress`,
  `todayFiberGrams`, `todayCalories`, and a consolidated nullable `nextDose`.
- 2026-06-21: `MedicationLevelResponse` now includes
  `estimateBasis: "relative-dose-equivalent"`; curve points are sampled every 6
  hours by the backend engine.
- 2026-06-21: `WeeklyRetentionResponse` may include `penaltyApplied`; all log
  families support soft-delete and weight logs now expose nullable `deletedAt`.
- 2026-06-21: `Insight` may include optional `copyVersion`; `/insights` now
  reuses fresh cached copy and only regenerates prose when signal data changes or
  the cache is stale.
- 2026-06-21: Chunk 3 onboarding model landed. `UserProfileInput` now accepts
  optional `dateOfBirth`, optional `sex`, `genderIdentity`, `medicationStatus`,
  and `sideEffectBaseline`; `UserProfileResponse` always includes derived
  `ageYears`, `dailyWaterTargetOz`, and `dailyStepTarget`.
- 2026-06-21: Medication catalog and compounds now include `route`
  (`injection | oral`); catalog items also expose `defaultFrequency` and
  `commonDoses`. `SCHEDULE_FREQUENCIES` includes `biweekly`.
- 2026-06-21: `POST /onboarding/complete` returns `OnboardingResultResponse`
  with `{ profile, lifestyleTargets, planHighlights }`. Active medication
  onboarding creates compound/schedule/last-dose records; `starting_soon` and
  `none` skip medication records.
- 2026-06-21: Settings edits are live. `PATCH /me` accepts
  `UserProfileSettingsPatch` and returns `UserProfileResponse`; `PATCH
/compounds/:id` accepts `CompoundPatch`; `PATCH /schedules/:id` accepts
  `SchedulePatch`.

## App Shell

`pepta-frontend/App.tsx` is intentionally minimal:

- `loading`
- `auth`
- `onboarding`
- `main`

Do not treat the placeholder text as UI direction. Replace it with real screens, navigation, and design.

## Contexts

- `AuthContext`: stores the current `User`, Pepta JWT, and sign-in methods.
- `OnboardingContext`: stores an onboarding draft shaped as `Partial<OnboardingCompleteInput>`.
- `PeptaDataContext`: stores `HomeResponse`, `TrackResponse`, and `ProgressResponse`.

## API Service

`src/services/api.ts` validates responses with `@pepta/shared` schemas.

Available methods:

- `signInWithGoogle(body: GoogleAuth): Promise<AuthResponse>`
- `signInWithApple(body: AppleAuth): Promise<AuthResponse>`
- `getHome(): Promise<HomeResponse>`
- `getTrack(): Promise<TrackResponse>`
- `getProgress(): Promise<ProgressResponse>`
- `setAuthToken(token: string | null): void`

## Endpoint Contracts

| Endpoint                              | Shared Response Type                                |
| ------------------------------------- | --------------------------------------------------- |
| `POST /auth/google`                   | `AuthResponse`                                      |
| `POST /auth/apple`                    | `AuthResponse`                                      |
| `GET /me`                             | `User`                                              |
| `PATCH /me`                           | `UserProfileResponse`                               |
| `POST /onboarding/complete`           | `OnboardingResultResponse`                          |
| `GET /home`                           | `HomeResponse`                                      |
| `GET /track`                          | `TrackResponse`                                     |
| `GET /progress`                       | `ProgressResponse`                                  |
| `GET /medication-level`               | `MedicationLevelResponse[]`                         |
| `GET /insights`                       | `Insight[]`                                         |
| `GET /weekly-retention`               | `WeeklyRetentionResponse`                           |
| `POST /diagnostics/stall`             | `StallDiagnosticResponse`                           |
| `POST /meal-scans/analyze`            | `MealScanResponse`                                  |
| `POST /meal-scans/voice`              | `MealScanResponse` or meal-log draft                |
| `GET /compounds/catalog`              | `MedicationCatalogItem[]`                           |
| `GET/POST/PATCH /compounds`           | `CompoundResponse[]` / `CompoundResponse`           |
| `GET/POST /cycles`                    | `CycleResponse[]` / `CycleResponse`                 |
| `GET/POST/PATCH /schedules`           | `ScheduleResponse[]` / `ScheduleResponse`           |
| `GET/POST /dose-logs`                 | `DoseLogResponse[]` / `DoseLogResponse`             |
| `GET/POST /weight-logs`               | `WeightLogResponse[]` / `WeightLogResponse`         |
| `GET/POST /meal-logs`                 | `MealLogResponse[]` / `MealLogResponse`             |
| `GET/POST /water-logs`                | `WaterLogResponse[]` / `WaterLogResponse`           |
| `GET/POST /protein-logs`              | `ProteinLogResponse[]` / `ProteinLogResponse`       |
| `GET/POST /activity-logs`             | `ActivityLogResponse[]` / `ActivityLogResponse`     |
| `GET/POST /side-effect-logs`          | `SideEffectLogResponse[]` / `SideEffectLogResponse` |
| `GET/POST /measurements`              | `MeasurementResponse[]` / `MeasurementResponse`     |
| `GET /progress-photos`                | `ProgressPhoto[]`                                   |
| `POST /progress-photos/upload-intent` | `ProgressPhotoUploadIntentResponse`                 |
| `POST /progress-photos/confirm`       | `ProgressPhoto`                                     |
| `GET /research-library`               | `ResearchArticle[]`                                 |

## Auth Contract

The backend returns `{ token, user }` from native Google or Apple identity-token sign-in. The frontend sends `Authorization: Bearer <token>` for every route except `/auth/*`, `/webhooks/*`, and `/healthz`.

Apple token audience is the native iOS bundle ID: `ai.boltzman.pepta`.
