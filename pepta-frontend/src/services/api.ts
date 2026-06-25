import {
  appleAuthSchema,
  authResponseSchema,
  googleAuthSchema,
  homeResponseSchema,
  userAccountPatchSchema,
  userProfileSettingsPatchSchema,
  userResponseSchema,
  activityLogInputSchema,
  activityLogResponseSchema,
  compoundInputSchema,
  compoundResponseSchema,
  doseLogInputSchema,
  doseLogResponseSchema,
  mealLogInputSchema,
  mealLogResponseSchema,
  mealScanInputSchema,
  mealScanResponseSchema,
  mealVoiceInputSchema,
  measurementInputSchema,
  measurementResponseSchema,
  onboardingCompleteInputSchema,
  onboardingResultResponseSchema,
  progressPhotoConfirmInputSchema,
  progressPhotoInputSchema,
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  progressResponseSchema,
  proteinLogInputSchema,
  proteinLogResponseSchema,
  fiberLogInputSchema,
  fiberLogResponseSchema,
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
  type AuthResponse,
  type CompoundInput,
  type CompoundResponse,
  type DoseLogInput,
  type DoseLogResponse,
  type GoogleAuth,
  type HomeRangeKey,
  type HomeResponse,
  type UserProfileSettingsPatch,
  type MealLogInput,
  type MealLogResponse,
  type MealScanInput,
  type MealScanResponse,
  type MealVoiceInput,
  type MeasurementInput,
  type MeasurementResponse,
  type OnboardingCompleteInput,
  type OnboardingResultResponse,
  type ProgressPhoto,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
  type ProgressPhotoUploadIntentResponse,
  type ProgressResponse,
  type ProteinLogInput,
  type ProteinLogResponse,
  type FiberLogInput,
  type FiberLogResponse,
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
import type { FoodSearchResult } from "../screens/app/mealLog";
import type { CompanionNote } from "../screens/app/companionNotes";

type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

// Frontend-defined contract for the (pending) server-side transcription endpoint.
const mealTranscriptResponseSchema = z.object({
  transcript: z.string().min(1),
});

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

// Carries the HTTP status so callers (and the retry logic) can branch on it.
class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

    // 401 → the session is dead. Clear the token and tell AuthContext to sign the
    // UI out so we don't loop on a stale token.
    if (response.status === 401) {
      this.authToken = null;
      this.onUnauthorized?.();
      throw new ApiError(401, `Pepta API request failed: 401`);
    }

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Pepta API request failed: ${response.status}`,
      );
    }

    const envelope = z.object({ data: z.unknown() }).parse(json);
    return schema.parse(envelope.data);
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

    if (response.status === 401) {
      this.authToken = null;
      this.onUnauthorized?.();
      throw new ApiError(401, `Pepta API request failed: 401`);
    }

    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Pepta API request failed: ${response.status}`,
      );
    }
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

  public getHome(range?: HomeRangeKey): Promise<HomeResponse> {
    const suffix =
      range && range !== "today" ? `?range=${encodeURIComponent(range)}` : "";
    return this.request(`/home${suffix}`, homeResponseSchema);
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

  public updateAccount(body: UserAccountPatch): Promise<User> {
    return this.request("/me/account", userResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(userAccountPatchSchema.parse(body)),
    });
  }

  public deleteAccount(): Promise<void> {
    return this.fetchNoContent("/me/account", { method: "DELETE" });
  }

  // POST /compounds → CompoundResponse (201). Adds a medication to track.
  public createCompound(body: CompoundInput): Promise<CompoundResponse> {
    return this.request("/compounds", compoundResponseSchema, {
      method: "POST",
      body: JSON.stringify(compoundInputSchema.parse(body)),
    });
  }

  public getTrack(): Promise<TrackResponse> {
    return this.request("/track", trackResponseSchema);
  }

  public getProgress(): Promise<ProgressResponse> {
    return this.request("/progress", progressResponseSchema);
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

  // POST /meal-scans/voice → MealScanResponse. Analyzes a spoken/typed description.
  public analyzeMealVoice(body: MealVoiceInput): Promise<MealScanResponse> {
    return this.request("/meal-scans/voice", mealScanResponseSchema, {
      method: "POST",
      body: JSON.stringify(mealVoiceInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/transcribe → { transcript }. Server-side speech-to-text is
  // intentionally deferred in the backend today (501), so the voice flow falls
  // back to typed entry while still keeping the OpenAI key server-side.
  public transcribeMealAudio(body: {
    audioData: string;
    audioMimeType: string;
  }): Promise<{ transcript: string }> {
    return this.request(
      "/meal-scans/transcribe",
      mealTranscriptResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(body),
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

  // GET /meal-scans/foods?q= → food-database results. The backend route exists
  // but returns an empty list until a nutrition database is wired.
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

  // Progress-photo upload is a 3-step presigned-S3 flow:
  // 1) intent → presigned uploadUrl, 2) PUT bytes to S3, 3) confirm.
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

  // Raw binary PUT straight to the presigned S3 URL (no auth header / no JSON envelope).
  public async uploadToPresignedUrl(
    uploadUrl: string,
    uri: string,
    contentType: string,
  ): Promise<void> {
    const file = await fetch(uri);
    const blob = await file.blob();
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!res.ok) {
      throw new Error(`Photo upload failed: ${res.status}`);
    }
  }

  public confirmPhoto(body: ProgressPhotoConfirmInput): Promise<ProgressPhoto> {
    return this.request("/progress-photos/confirm", progressPhotoSchema, {
      method: "POST",
      body: JSON.stringify(progressPhotoConfirmInputSchema.parse(body)),
    });
  }
}

export const api = new PeptaApi();
