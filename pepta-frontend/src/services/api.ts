import {
  apiErrorResponseSchema,
  appleAuthSchema,
  avatarConfirmRequestSchema,
  avatarViewUrlResponseSchema,
  authResponseSchema,
  googleAuthSchema,
  homeResponseSchema,
  userAccountPatchSchema,
  discoverySourceInputSchema,
  dismissedNudgesResponseSchema,
  dataHealthResponseSchema,
  mergeCompoundsInputSchema,
  nudgeDismissInputSchema,
  type DataHealthCard,
  type MergeCompoundsInput,
  userProfileSettingsPatchSchema,
  userResponseSchema,
  activityLogInputSchema,
  activityLogResponseSchema,
  compoundInputSchema,
  compoundPatchSchema,
  compoundResponseSchema,
  cycleInputSchema,
  cycleResponseSchema,
  medicationCatalogItemSchema,
  scheduleInputSchema,
  schedulePatchSchema,
  scheduleResponseSchema,
  doseLogInputSchema,
  doseLogResponseSchema,
  mealLogInputSchema,
  mealLogResponseSchema,
  mealBarcodeInputSchema,
  mealProductScanInputSchema,
  mealScanInputSchema,
  mealScanResponseSchema,
  mealTranscriptResponseSchema,
  mealTranscriptionInputSchema,
  mealVoiceInputSchema,
  mediaConfirmInputSchema,
  mediaDiscardInputSchema,
  mediaReadyResponseSchema,
  mediaUploadIntentInputSchema,
  mediaUploadIntentResponseSchema,
  measurementInputSchema,
  measurementResponseSchema,
  notificationPreferencesPatchSchema,
  notificationPreferencesResponseSchema,
  onboardingCompleteInputSchema,
  onboardingResultResponseSchema,
  pepChatRequestSchema,
  accessDecisionSchema,
  referralClaimRequestSchema,
  referralClaimResponseSchema,
  pepChatResponseSchema,
  progressPhotoConfirmInputSchema,
  progressPhotoInputSchema,
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  progressResponseSchema,
  proteinLogInputSchema,
  proteinLogResponseSchema,
  fiberLogInputSchema,
  fiberLogResponseSchema,
  pushTokenRegistrationRequestSchema,
  pushTokenRegistrationResponseSchema,
  sideEffectLogInputSchema,
  sideEffectLogResponseSchema,
  trackResponseSchema,
  waterLogInputSchema,
  waterLogResponseSchema,
  weightLogInputSchema,
  weightLogResponseSchema,
  type ActivityLogInput,
  type ActivityLogResponse,
  type AppleAuth,
  type AvatarConfirmRequest,
  type AvatarViewUrlResponse,
  type AuthResponse,
  type CompoundInput,
  type CompoundPatch,
  type CompoundResponse,
  type CycleInput,
  type CycleResponse,
  type MedicationCatalogItem,
  type ScheduleInput,
  type SchedulePatch,
  type ScheduleResponse,
  type DoseLogInput,
  type DoseLogResponse,
  type GoogleAuth,
  type HomeRangeKey,
  type HomeResponse,
  type DiscoverySource,
  type UserProfileSettingsPatch,
  medicationLevelsResponseSchema,
  uiPreferencesResponseSchema,
  favouriteResponseSchema,
  favouritesResponseSchema,
  type FavouriteInput,
  type LevelRangeKey,
  type MedicationLevelsResponse,
  type UiPreferencesInput,
  type UiPreferencesResponse,
  type FavouriteResponse,
  type FavouritesResponse,
  recipeComposeResponseSchema,
  recipeResponseSchema,
  recipesResponseSchema,
  type RecipeComposeInput,
  type RecipeComposeResponse,
  type RecipeInput,
  type RecipeResponse,
  type RecipesResponse,
  type MealLogInput,
  type MealLogResponse,
  type MealBarcodeInput,
  type AccessDecision,
  type ReferralClaimInput,
  type ReferralClaimResponse,
  type MealProductScanInput,
  type MealScanInput,
  type MealScanResponse,
  type MealTranscriptResponse,
  type MealTranscriptionInput,
  type MealVoiceInput,
  type MediaConfirmInput,
  type MediaContentType,
  type MediaIntent,
  type MediaReadyResponse,
  type MediaUploadIntentInput,
  type MediaUploadIntentResponse,
  type MeasurementInput,
  type MeasurementResponse,
  type NotificationPreferencesPatch,
  type NotificationPreferencesResponse,
  type OnboardingCompleteInput,
  type OnboardingResultResponse,
  type PepChatMessage,
  type PepChatResponse,
  type ProgressPhoto,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
  type ProgressPhotoUploadIntentResponse,
  type ProgressResponse,
  type ProteinLogInput,
  type ProteinLogResponse,
  type FiberLogInput,
  type FiberLogResponse,
  type PushTokenRegistrationRequest,
  type PushTokenRegistrationResponse,
  type SideEffectLogInput,
  type SideEffectLogResponse,
  type TrackResponse,
  type User,
  type UserAccountPatch,
  type WaterLogInput,
  type WaterLogResponse,
  type WeightLogInput,
  type WeightLogResponse,
} from "@pepta/shared";
import { z } from "zod";
import { API_BASE_URL } from "../config";
import { ApiError, ResponseParseError } from "./apiError";
import type { FoodSearchResult } from "../screens/app/mealLog";
import type { CompanionNote } from "../screens/app/companionNotes";

type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

interface HomeRequestOptions {
  aiDataSharingConsent?: boolean;
}

/** Device IANA zone ("America/New_York"), or null when Intl can't say. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

// Frontend-defined contract for the (pending) AI companion-notes endpoint
// (backend /coach → OpenAI, key server-side). See docs/coach-endpoint.md.
const coachNotesResponseSchema = z.object({
  notes: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      emoji: z.string().optional(),
      cta: z.string().optional(),
      action: z.enum(["dose", "meal", "water", "weight"]).optional(),
      tone: z.enum(["nudge", "win"]),
    }),
  ),
});

// Frontend-defined contract for the (pending) food-search endpoint, backed by a
// nutrition DB on the backend.
const foodSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      foodName: z.string().min(1),
      servingSize: z.string().min(1),
      protein: z.number().nonnegative(),
      calories: z.number().nonnegative(),
      carbs: z.number().nonnegative().optional(),
      fat: z.number().nonnegative().optional(),
      fiber: z.number().nonnegative().optional(),
    }),
  ),
});

// Abort a request that hangs (slow/dead network) so the UI never spins forever.
const REQUEST_TIMEOUT_MS = 15_000;
// Transient failures get one retry after a short backoff (the first request to a
// cold endpoint can be slow; by the retry it's usually warm).
const RETRY_DELAY_MS = 400;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Every log the activity feed can show, and where its rows live. */
export const LOG_PATHS = {
  dose: "/dose-logs",
  weight: "/weight-logs",
  meal: "/meal-logs",
  water: "/water-logs",
  protein: "/protein-logs",
  activity: "/activity-logs",
  sideEffect: "/side-effect-logs",
  measurement: "/measurements",
} as const;

export type DeletableLogKind = keyof typeof LOG_PATHS;

class PeptaApi {
  private authToken: string | null = null;
  private onUnauthorized?: () => void;

  // AuthContext registers this so a 401 from any request signs the user out of
  // the UI (not just clears the token) — prevents a stale-session 401 loop.
  public setUnauthorizedHandler(handler: (() => void) | undefined): void {
    this.onUnauthorized = handler;
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  // Turn a non-2xx response into a typed ApiError carrying the backend's
  // `{ error: { code, message } }` envelope (falls back to the status). Handles
  // the 401 side-effects (clear token + sign out) in one place.
  private async failFromResponse(response: Response): Promise<never> {
    let code: string | undefined;
    let message = `Pepta API request failed: ${response.status}`;
    try {
      const parsed = apiErrorResponseSchema.safeParse(await response.json());
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
      }
    } catch {
      // Non-JSON / empty body — keep the status-based message.
    }
    if (response.status === 401) {
      this.authToken = null;
      this.onUnauthorized?.();
    }
    throw new ApiError(response.status, message, code);
  }

  private async fetchOnce<T>(
    path: string,
    schema: ResponseSchema<T>,
    options: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken
            ? { Authorization: `Bearer ${this.authToken}` }
            : {}),
          ...options.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      await this.failFromResponse(response); // throws an ApiError
    }

    // PAST THIS POINT THE WRITE HAS LANDED. The status was 2xx, so anything
    // that throws below is us failing to read a reply the server already
    // acted on — usually a response shape this build predates. Callers must
    // be able to tell that apart from "the request never arrived", or they
    // report a saved log as unsaved and queue a pointless retry.
    try {
      const json = (await response.json()) as unknown;
      const envelope = z.object({ data: z.unknown() }).parse(json);
      return schema.parse(envelope.data);
    } catch (error) {
      throw new ResponseParseError(response.status, error);
    }
  }

  private async fetchNoContent(
    path: string,
    options: RequestInit,
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken
            ? { Authorization: `Bearer ${this.authToken}` }
            : {}),
          ...options.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      await this.failFromResponse(response); // throws an ApiError
    }
  }

  // Raw text GET (no JSON envelope) — the CSV export endpoint.
  private async fetchText(path: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        signal: controller.signal,
        headers: this.authToken
          ? { Authorization: `Bearer ${this.authToken}` }
          : {},
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      await this.failFromResponse(response); // throws an ApiError
    }
    return response.text();
  }

  // GET /me/export/logs.csv → the dose log as CSV text (side effects column
  // included). tz localizes the date/time columns to the device's zone.
  public exportDoseLogsCsv(timeZone?: string): Promise<string> {
    const query = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : "";
    return this.fetchText(`/me/export/logs.csv${query}`);
  }

  private async request<T>(
    path: string,
    schema: ResponseSchema<T>,
    options: RequestInit = {},
  ): Promise<T> {
    // Only retry idempotent reads — retrying a POST/PATCH could double-write.
    const method = (options.method ?? "GET").toUpperCase();
    const idempotent = method === "GET";
    try {
      return await this.fetchOnce(path, schema, options);
    } catch (error) {
      // Retry once on a transient failure (network drop / timeout / 5xx), never
      // on a deterministic 4xx (a bad request won't succeed on retry).
      const is4xx =
        error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (idempotent && !is4xx) {
        await delay(RETRY_DELAY_MS);
        return this.fetchOnce(path, schema, options);
      }
      throw error;
    }
  }

  public signInWithGoogle(body: GoogleAuth): Promise<AuthResponse> {
    return this.request("/auth/google", authResponseSchema, {
      method: "POST",
      body: JSON.stringify(googleAuthSchema.parse(body)),
    });
  }

  public signInWithApple(body: AppleAuth): Promise<AuthResponse> {
    return this.request("/auth/apple", authResponseSchema, {
      method: "POST",
      body: JSON.stringify(appleAuthSchema.parse(body)),
    });
  }

  // POST /auth/demo → AuthResponse. App Store review demo login; the backend
  // scopes it to the seeded demo account (not a general password path).
  public signInWithDemo(
    email: string,
    password: string,
  ): Promise<AuthResponse> {
    return this.request("/auth/demo", authResponseSchema, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // POST /onboarding/complete → OnboardingResultResponse (profile + derived
  // targets + plan highlights).
  public completeOnboarding(
    body: OnboardingCompleteInput,
  ): Promise<OnboardingResultResponse> {
    return this.request(
      "/onboarding/complete",
      onboardingResultResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(onboardingCompleteInputSchema.parse(body)),
      },
    );
  }

  public getHome(
    range?: HomeRangeKey,
    options: HomeRequestOptions = {},
  ): Promise<HomeResponse> {
    const params = new URLSearchParams();
    if (range && range !== "today") params.set("range", range);
    // The device zone opts the request into the declared range semantics:
    // rolling windows (month = past 30 days) cut at the user's local midnight,
    // plus server-computed activity totals. Without it the backend serves the
    // legacy UTC calendar windows shipped builds expect.
    const tz = deviceTimeZone();
    if (tz) params.set("tz", tz);
    // Capability: this bundle's compound schema tolerates a null halfLifeDays
    // ("not modelled" custom meds). Old bundles never send this and never
    // receive unmodelled compounds — their strict parse stays safe.
    params.set("unmodeled", "1");
    const query = params.toString();
    return this.request(`/home${query ? `?${query}` : ""}`, homeResponseSchema, {
      headers: options.aiDataSharingConsent
        ? { "x-pepta-ai-consent": "true" }
        : undefined,
    });
  }

  // PATCH /me → updated profile settings. Used by Account preferences (units,
  // dose units). We don't need the response shape — callers refreshHome() after.
  public updateProfileSettings(
    body: UserProfileSettingsPatch,
  ): Promise<unknown> {
    return this.request("/me", z.unknown(), {
      method: "PATCH",
      body: JSON.stringify(userProfileSettingsPatchSchema.parse(body)),
    });
  }

  // "Where did you find us?" — its own endpoint (never a profile field: the
  // strict, client-bundled response schemas must never learn it). Upsert
  // server-side, so best-effort retries are safe.
  public recordDiscoverySource(source: DiscoverySource): Promise<unknown> {
    return this.request("/me/discovery-source", z.unknown(), {
      method: "POST",
      body: JSON.stringify(discoverySourceInputSchema.parse({ source })),
    });
  }

  // DATA HEALTH — at most one card, chosen server-side by detector priority.
  // Detectors run against real records rather than client heuristics, so the
  // logic that finds a problem in an audit query is the logic that renders it.
  public getDataHealthCard(): Promise<DataHealthCard | null> {
    return this.request("/me/data-health", dataHealthResponseSchema).then(
      (response) => response.card,
    );
  }

  public mergeCompounds(input: MergeCompoundsInput): Promise<unknown> {
    return this.request("/me/data-health/merge-compounds", z.unknown(), {
      method: "POST",
      body: JSON.stringify(mergeCompoundsInputSchema.parse(input)),
    });
  }

  // One-time nudge dismissals. Own endpoint for the same reason as
  // discovery-source: HomeResponse is strict and bundled into shipped builds,
  // so this state cannot ride along on /home. Costs one extra request on Home.
  public listDismissedNudges(): Promise<string[]> {
    return this.request("/me/nudges", dismissedNudgesResponseSchema).then(
      (response) => response.dismissed,
    );
  }

  public dismissNudge(key: string): Promise<unknown> {
    return this.request("/me/nudges/dismiss", z.unknown(), {
      method: "POST",
      body: JSON.stringify(nudgeDismissInputSchema.parse({ key })),
    });
  }

  public getCurrentUser(): Promise<User> {
    return this.request("/me", userResponseSchema);
  }

  public updateAccount(body: UserAccountPatch): Promise<User> {
    return this.request("/me/account", userResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(userAccountPatchSchema.parse(body)),
    });
  }

  public deleteAccount(): Promise<void> {
    return this.fetchNoContent("/me/account", { method: "DELETE" });
  }

  public confirmAvatarUpload(body: AvatarConfirmRequest): Promise<User> {
    return this.request("/me/avatar", userResponseSchema, {
      method: "POST",
      body: JSON.stringify(avatarConfirmRequestSchema.parse(body)),
    });
  }

  public getAvatarViewUrl(): Promise<AvatarViewUrlResponse> {
    return this.request("/me/avatar/view-url", avatarViewUrlResponseSchema);
  }

  public registerPushToken(
    body: PushTokenRegistrationRequest,
  ): Promise<PushTokenRegistrationResponse> {
    return this.request(
      "/me/push-tokens",
      pushTokenRegistrationResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(pushTokenRegistrationRequestSchema.parse(body)),
      },
    );
  }

  public updateNotificationPreferences(
    body: NotificationPreferencesPatch,
  ): Promise<NotificationPreferencesResponse> {
    return this.request(
      "/me/notification-preferences",
      notificationPreferencesResponseSchema,
      {
        method: "PATCH",
        body: JSON.stringify(notificationPreferencesPatchSchema.parse(body)),
      },
    );
  }

  // POST /compounds → CompoundResponse (201). Adds a medication to track.
  public createCompound(body: CompoundInput): Promise<CompoundResponse> {
    return this.request("/compounds", compoundResponseSchema, {
      method: "POST",
      body: JSON.stringify(compoundInputSchema.parse(body)),
    });
  }

  // PATCH /compounds/:id → CompoundResponse. Mix calculator's "Save as my
  // dose" writes plannedDose here.
  public updateCompound(
    compoundId: string,
    body: CompoundPatch,
  ): Promise<CompoundResponse> {
    return this.request(`/compounds/${compoundId}`, compoundResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(compoundPatchSchema.parse(body)),
    });
  }

  // GET /medication-catalog → MedicationCatalogItem[]. PUBLIC (no auth): the
  // onboarding picker reads it before sign-in. Clinical values only; the
  // bundled list supplies presentation.
  public listMedicationCatalog(): Promise<MedicationCatalogItem[]> {
    return this.request("/medication-catalog", z.array(medicationCatalogItemSchema));
  }

  // GET /schedules → ScheduleResponse[]. Dose timing per compound; the Track
  // week strip and month calendar derive planned days from these.
  public listSchedules(): Promise<ScheduleResponse[]> {
    return this.request("/schedules", z.array(scheduleResponseSchema));
  }

  // POST /schedules → ScheduleResponse. Until 2026-08-07 only onboarding
  // could create schedules — compounds added in-app had no cadence, so
  // nextDoseAt (and dose reminders) never armed for them.
  public createSchedule(input: ScheduleInput): Promise<ScheduleResponse> {
    return this.request("/schedules", scheduleResponseSchema, {
      method: "POST",
      body: JSON.stringify(scheduleInputSchema.parse(input)),
    });
  }

  // PATCH /schedules/:id → ScheduleResponse. The timing editor writes
  // timesOfDay/timing here.
  public updateSchedule(
    scheduleId: string,
    body: SchedulePatch,
  ): Promise<ScheduleResponse> {
    return this.request(`/schedules/${scheduleId}`, scheduleResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(schedulePatchSchema.parse(body)),
    });
  }

  // GET /cycles → CycleResponse[]. Cycle rows carry the on/off pattern
  // (weeksOn/weeksOff/repeats) that cycleWindows turns into rest windows.
  public listCycles(): Promise<CycleResponse[]> {
    return this.request("/cycles", z.array(cycleResponseSchema));
  }

  // POST /cycles → CycleResponse (201).
  public createCycle(body: CycleInput): Promise<CycleResponse> {
    return this.request("/cycles", cycleResponseSchema, {
      method: "POST",
      body: JSON.stringify(cycleInputSchema.parse(body)),
    });
  }

  // DELETE /cycles/:id → CycleResponse. The cycles router has no PATCH, so
  // "edit cycle" = delete + create (CycleSetupScreen does exactly that).
  public deleteCycle(cycleId: string): Promise<CycleResponse> {
    return this.request(`/cycles/${cycleId}`, cycleResponseSchema, {
      method: "DELETE",
    });
  }

  public getTrack(): Promise<TrackResponse> {
    return this.request("/track", trackResponseSchema);
  }

  public getFavourites(): Promise<FavouritesResponse> {
    return this.request("/favourites", favouritesResponseSchema);
  }

  /** Upsert: the server keys on (user, key), so a double tap is one row. */
  public saveFavourite(input: FavouriteInput): Promise<FavouriteResponse> {
    return this.request("/favourites", favouriteResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public createMediaUploadIntent(
    input: MediaUploadIntentInput,
  ): Promise<MediaUploadIntentResponse> {
    return this.request("/media/upload-intent", mediaUploadIntentResponseSchema, {
      method: "POST",
      body: JSON.stringify(mediaUploadIntentInputSchema.parse(input)),
    });
  }

  public confirmMedia(input: MediaConfirmInput): Promise<MediaReadyResponse> {
    return this.request("/media/confirm", mediaReadyResponseSchema, {
      method: "POST",
      body: JSON.stringify(mediaConfirmInputSchema.parse(input)),
    });
  }

  public discardMedia(mediaId: string): Promise<unknown> {
    return this.request("/media/discard", z.unknown(), {
      method: "POST",
      body: JSON.stringify(mediaDiscardInputSchema.parse({ mediaId })),
    });
  }

  public async uploadMediaPhoto(input: {
    intent: MediaIntent;
    uri: string;
    contentType: MediaContentType;
  }): Promise<MediaReadyResponse> {
    const local = await fetch(input.uri);
    const blob = await local.blob();
    const intent = await this.createMediaUploadIntent({
      intent: input.intent,
      contentType: input.contentType,
      sizeBytes: blob.size,
    });
    await this.uploadBlobToPostPolicy(intent.uploadUrl, intent.fields, blob);
    return this.confirmMedia({ mediaId: intent.mediaId });
  }

  private async uploadBlobToPostPolicy(
    uploadUrl: string,
    fields: Record<string, string>,
    blob: Blob,
  ): Promise<void> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append("file", blob, "upload");
    const uploaded = await fetch(uploadUrl, { method: "POST", body: form });
    if (!uploaded.ok) {
      throw new Error(`Photo upload failed: ${uploaded.status}`);
    }
  }

  /**
   * The level curve over a chosen window. Separate from /home, which keeps its
   * own +/-7 day levels: this call must never move the next-dose ring.
   */
  public getMedicationLevels(range: LevelRangeKey): Promise<MedicationLevelsResponse> {
    return this.request(
      `/medication-levels?range=${encodeURIComponent(range)}`,
      medicationLevelsResponseSchema,
    );
  }

  /**
   * Soft-deletes one log. The route exists for every kind the feed shows —
   * this is what had never been wired to a button.
   */
  public deleteLog(kind: DeletableLogKind, id: string): Promise<unknown> {
    return this.request(`${LOG_PATHS[kind]}/${encodeURIComponent(id)}`, z.unknown(), {
      method: "DELETE",
    });
  }

  /** Display preferences. Its own route — the profile schema is strict. */
  public getUiPreferences(): Promise<UiPreferencesResponse> {
    return this.request("/me/ui-preferences", uiPreferencesResponseSchema);
  }

  public putUiPreferences(input: UiPreferencesInput): Promise<UiPreferencesResponse> {
    return this.request("/me/ui-preferences", uiPreferencesResponseSchema, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public getRecipes(): Promise<RecipesResponse> {
    return this.request("/recipes", recipesResponseSchema);
  }

  public getRecipe(id: string): Promise<RecipeResponse> {
    return this.request(
      `/recipes/${encodeURIComponent(id)}`,
      recipeResponseSchema,
    );
  }

  /** Saving a starter as yours comes through here too — it is a copy. */
  public createRecipe(input: RecipeInput): Promise<RecipeResponse> {
    return this.request("/recipes", recipeResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Proposes a recipe from what the user said or the scan identified. */
  public composeRecipe(input: RecipeComposeInput): Promise<RecipeComposeResponse> {
    return this.request("/recipes/compose", recipeComposeResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public deleteRecipe(id: string): Promise<unknown> {
    return this.request(`/recipes/${encodeURIComponent(id)}`, z.unknown(), {
      method: "DELETE",
    });
  }

  public removeFavourite(key: string): Promise<unknown> {
    return this.request(`/favourites/${encodeURIComponent(key)}`, z.unknown(), {
      method: "DELETE",
    });
  }

  // The server window defaults to 30 days / 100 rows when the query is empty —
  // which is why the 90d/1y/All range buttons used to be cosmetic: they
  // filtered a 30-day payload client-side, and anything older looked deleted.
  // `sinceDays` widens the actual query window (Infinity → a fixed year-2000
  // floor); limit rides at the schema's 500-row cap. Beyond that, pagination
  // is the known follow-up.
  public getProgress(sinceDays?: number): Promise<ProgressResponse> {
    if (sinceDays == null) {
      return this.request("/progress", progressResponseSchema);
    }
    const from = Number.isFinite(sinceDays)
      ? new Date(Date.now() - sinceDays * 86_400_000)
      : new Date(2000, 0, 1);
    const query = `?from=${encodeURIComponent(from.toISOString())}&limit=500`;
    return this.request(`/progress${query}`, progressResponseSchema);
  }

  // POST /protein-logs → ProteinLogResponse (201). Backed by the same log-router
  // factory as water; Home steppers fire this in the background.
  public createProteinLog(body: ProteinLogInput): Promise<ProteinLogResponse> {
    return this.request("/protein-logs", proteinLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(proteinLogInputSchema.parse(body)),
    });
  }

  // POST /fiber-logs → FiberLogResponse (201). Same log-router factory; the Home
  // Fiber stepper fires this in the background.
  public createFiberLog(body: FiberLogInput): Promise<FiberLogResponse> {
    return this.request("/fiber-logs", fiberLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(fiberLogInputSchema.parse(body)),
    });
  }

  // POST /water-logs → WaterLogResponse (201).
  public createWaterLog(body: WaterLogInput): Promise<WaterLogResponse> {
    return this.request("/water-logs", waterLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(waterLogInputSchema.parse(body)),
    });
  }

  // POST /dose-logs → DoseLogResponse (201). Logs a shot (compound, amount, site).
  public createDoseLog(body: DoseLogInput): Promise<DoseLogResponse> {
    return this.request("/dose-logs", doseLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(doseLogInputSchema.parse(body)),
    });
  }

  // POST /weight-logs → WeightLogResponse (201).
  public createWeightLog(body: WeightLogInput): Promise<WeightLogResponse> {
    return this.request("/weight-logs", weightLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(weightLogInputSchema.parse(body)),
    });
  }

  // POST /side-effect-logs → SideEffectLogResponse (201).
  public createSideEffectLog(
    body: SideEffectLogInput,
  ): Promise<SideEffectLogResponse> {
    return this.request("/side-effect-logs", sideEffectLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(sideEffectLogInputSchema.parse(body)),
    });
  }

  // POST /measurements → MeasurementResponse (201).
  public createMeasurement(
    body: MeasurementInput,
  ): Promise<MeasurementResponse> {
    return this.request("/measurements", measurementResponseSchema, {
      method: "POST",
      body: JSON.stringify(measurementInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/analyze → MealScanResponse. AI vision on a base64 photo.
  public analyzeMealPhoto(body: MealScanInput): Promise<MealScanResponse> {
    return this.request("/meal-scans/analyze", mealScanResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealScanInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/product → MealScanResponse. Packaged-product label scan
  // using backend-only Together/OpenAI keys.
  public analyzeProductPhoto(
    body: MealProductScanInput,
  ): Promise<MealScanResponse> {
    return this.request("/meal-scans/product", mealScanResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealProductScanInputSchema.parse(body)),
    });
  }

  // POST /me/access/resolve → AccessDecision. Idempotent: reconciles stale
  // RevenueCat state and resumes complimentary provisioning. The ONLY
  // contract the app gates access on.
  public resolveAccess(): Promise<AccessDecision> {
    return this.request("/me/access/resolve", accessDecisionSchema, {
      method: "POST",
    });
  }

  // POST /referrals/claim → creator/referral attribution only. Never affects
  // subscription status or paywall eligibility. Backend validates the code;
  // 404 = unknown/expired, 409 = account already claimed a different code.
  public claimReferralCode(
    body: ReferralClaimInput,
  ): Promise<ReferralClaimResponse> {
    return this.request("/referrals/claim", referralClaimResponseSchema, {
      method: "POST",
      body: JSON.stringify(referralClaimRequestSchema.parse(body)),
    });
  }

  // POST /meal-scans/barcode → MealScanResponse. Deterministic barcode lookup
  // with Open Food Facts/OpenAI fallback on the backend.
  public analyzeMealBarcode(
    body: MealBarcodeInput,
  ): Promise<MealScanResponse> {
    return this.request("/meal-scans/barcode", mealScanResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealBarcodeInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/voice → MealScanResponse. Analyzes a spoken/typed description.
  public analyzeMealVoice(body: MealVoiceInput): Promise<MealScanResponse> {
    return this.request("/meal-scans/voice", mealScanResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealVoiceInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/transcribe → { transcript }. Server-side speech-to-text
  // keeps the OpenAI key out of the app bundle.
  public transcribeMealAudio(
    body: MealTranscriptionInput,
  ): Promise<MealTranscriptResponse> {
    return this.request(
      "/meal-scans/transcribe",
      mealTranscriptResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(mealTranscriptionInputSchema.parse(body)),
      },
    );
  }

  // GET /coach → AI companion notes (CompanionNote[]). FRONTEND-DEFINED contract,
  // pending on Codex's backend (OpenAI server-side). 404s → [] until live, so Pep
  // falls back to the deterministic local notes. See docs/coach-endpoint.md.
  public getCoachNotes(): Promise<CompanionNote[]> {
    return this.request("/coach", coachNotesResponseSchema).then(
      (r) => r.notes,
    );
  }

  // POST /coach/chat → Pep's grounded back-and-forth chat. OpenAI stays
  // server-side; the app sends only the user's current chat transcript.
  public coachChat(messages: PepChatMessage[]): Promise<PepChatResponse> {
    return this.request("/coach/chat", pepChatResponseSchema, {
      method: "POST",
      body: JSON.stringify(pepChatRequestSchema.parse({ messages })),
    });
  }

  // GET /meal-scans/foods?q= → nutrition search results for the meal picker.
  public searchFoods(query: string): Promise<FoodSearchResult[]> {
    return this.request(
      `/meal-scans/foods?q=${encodeURIComponent(query)}`,
      foodSearchResponseSchema,
    ).then((r) => r.results);
  }

  // POST /meal-logs → MealLogResponse (201). The actual logged meal.
  public createMealLog(body: MealLogInput): Promise<MealLogResponse> {
    return this.request("/meal-logs", mealLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealLogInputSchema.parse(body)),
    });
  }

  // POST /activity-logs → ActivityLogResponse (201). Steps / workout / resistance.
  public createActivityLog(
    body: ActivityLogInput,
  ): Promise<ActivityLogResponse> {
    return this.request("/activity-logs", activityLogResponseSchema, {
      method: "POST",
      body: JSON.stringify(activityLogInputSchema.parse(body)),
    });
  }

  // Progress-photo upload is a 3-step verified flow:
  // 1) intent with measured bytes, 2) policy-bound POST, 3) opaque confirmation.
  public createPhotoUploadIntent(
    body: ProgressPhotoInput,
  ): Promise<ProgressPhotoUploadIntentResponse> {
    return this.request(
      "/progress-photos/upload-intent",
      progressPhotoUploadIntentResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(progressPhotoInputSchema.parse(body)),
      },
    );
  }

  public confirmPhoto(body: ProgressPhotoConfirmInput): Promise<ProgressPhoto> {
    return this.request("/progress-photos/confirm", progressPhotoSchema, {
      method: "POST",
      body: JSON.stringify(progressPhotoConfirmInputSchema.parse(body)),
    });
  }

  public async uploadProgressPhoto(
    input: Omit<ProgressPhotoInput, "sizeBytes"> & { uri: string },
  ): Promise<ProgressPhoto> {
    const local = await fetch(input.uri);
    const blob = await local.blob();
    const intent = await this.createPhotoUploadIntent({
      captureDate: input.captureDate,
      contentType: input.contentType,
      sizeBytes: blob.size,
      kind: input.kind,
      ...(input.faceFullness === undefined
        ? {}
        : { faceFullness: input.faceFullness }),
    });
    await this.uploadBlobToPostPolicy(intent.uploadUrl, intent.fields, blob);
    return this.confirmPhoto({ photoId: intent.photo.id });
  }
}

export const api = new PeptaApi();
