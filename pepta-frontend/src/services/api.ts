import {
  appleAuthSchema,
  authResponseSchema,
  googleAuthSchema,
  homeResponseSchema,
  activityLogInputSchema,
  activityLogResponseSchema,
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
  progressPhotoConfirmInputSchema,
  progressPhotoInputSchema,
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  progressResponseSchema,
  proteinLogInputSchema,
  proteinLogResponseSchema,
  sideEffectLogInputSchema,
  sideEffectLogResponseSchema,
  trackResponseSchema,
  userProfileResponseSchema,
  waterLogInputSchema,
  waterLogResponseSchema,
  weightLogInputSchema,
  weightLogResponseSchema,
  type ActivityLogInput,
  type ActivityLogResponse,
  type AppleAuth,
  type AuthResponse,
  type DoseLogInput,
  type DoseLogResponse,
  type GoogleAuth,
  type HomeResponse,
  type MealLogInput,
  type MealLogResponse,
  type MealScanInput,
  type MealScanResponse,
  type MealVoiceInput,
  type MeasurementInput,
  type MeasurementResponse,
  type OnboardingCompleteInput,
  type ProgressPhoto,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
  type ProgressPhotoUploadIntentResponse,
  type ProgressResponse,
  type ProteinLogInput,
  type ProteinLogResponse,
  type SideEffectLogInput,
  type SideEffectLogResponse,
  type TrackResponse,
  type UserProfileResponse,
  type WaterLogInput,
  type WaterLogResponse,
  type WeightLogInput,
  type WeightLogResponse,
} from '@pepta/shared';
import { z } from 'zod';
import { API_BASE_URL } from '../config';
import type { FoodSearchResult } from '../screens/app/mealLog';

type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

// Frontend-defined contract for the (pending) server-side transcription endpoint.
const mealTranscriptResponseSchema = z.object({ transcript: z.string().min(1) });

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

class PeptaApi {
  private authToken: string | null = null;

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  private async request<T>(
    path: string,
    schema: ResponseSchema<T>,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        ...options.headers,
      },
    });
    const json = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(`Pepta API request failed: ${response.status}`);
    }

    const envelope = z.object({ data: z.unknown() }).parse(json);
    return schema.parse(envelope.data);
  }

  public signInWithGoogle(body: GoogleAuth): Promise<AuthResponse> {
    return this.request('/auth/google', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(googleAuthSchema.parse(body)),
    });
  }

  public signInWithApple(body: AppleAuth): Promise<AuthResponse> {
    return this.request('/auth/apple', authResponseSchema, {
      method: 'POST',
      body: JSON.stringify(appleAuthSchema.parse(body)),
    });
  }

  // POST /onboarding/complete → UserProfileResponse (plus created resources). We
  // validate the core profile; if the backend later returns a richer onboarding
  // result, swap in its schema.
  public completeOnboarding(body: OnboardingCompleteInput): Promise<UserProfileResponse> {
    return this.request('/onboarding/complete', userProfileResponseSchema, {
      method: 'POST',
      body: JSON.stringify(onboardingCompleteInputSchema.parse(body)),
    });
  }

  public getHome(): Promise<HomeResponse> {
    return this.request('/home', homeResponseSchema);
  }

  public getTrack(): Promise<TrackResponse> {
    return this.request('/track', trackResponseSchema);
  }

  public getProgress(): Promise<ProgressResponse> {
    return this.request('/progress', progressResponseSchema);
  }

  // POST /protein-logs → ProteinLogResponse (201). Backed by the same log-router
  // factory as water; Home steppers fire this in the background.
  public createProteinLog(body: ProteinLogInput): Promise<ProteinLogResponse> {
    return this.request('/protein-logs', proteinLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(proteinLogInputSchema.parse(body)),
    });
  }

  // POST /water-logs → WaterLogResponse (201).
  public createWaterLog(body: WaterLogInput): Promise<WaterLogResponse> {
    return this.request('/water-logs', waterLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(waterLogInputSchema.parse(body)),
    });
  }

  // POST /dose-logs → DoseLogResponse (201). Logs a shot (compound, amount, site).
  public createDoseLog(body: DoseLogInput): Promise<DoseLogResponse> {
    return this.request('/dose-logs', doseLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(doseLogInputSchema.parse(body)),
    });
  }

  // POST /weight-logs → WeightLogResponse (201).
  public createWeightLog(body: WeightLogInput): Promise<WeightLogResponse> {
    return this.request('/weight-logs', weightLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(weightLogInputSchema.parse(body)),
    });
  }

  // POST /side-effect-logs → SideEffectLogResponse (201).
  public createSideEffectLog(body: SideEffectLogInput): Promise<SideEffectLogResponse> {
    return this.request('/side-effect-logs', sideEffectLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(sideEffectLogInputSchema.parse(body)),
    });
  }

  // POST /measurements → MeasurementResponse (201).
  public createMeasurement(body: MeasurementInput): Promise<MeasurementResponse> {
    return this.request('/measurements', measurementResponseSchema, {
      method: 'POST',
      body: JSON.stringify(measurementInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/analyze → MealScanResponse. AI vision on a base64 photo.
  public analyzeMealPhoto(body: MealScanInput): Promise<MealScanResponse> {
    return this.request('/meal-scans/analyze', mealScanResponseSchema, {
      method: 'POST',
      body: JSON.stringify(mealScanInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/voice → MealScanResponse. Analyzes a spoken/typed description.
  public analyzeMealVoice(body: MealVoiceInput): Promise<MealScanResponse> {
    return this.request('/meal-scans/voice', mealScanResponseSchema, {
      method: 'POST',
      body: JSON.stringify(mealVoiceInputSchema.parse(body)),
    });
  }

  // POST /meal-scans/transcribe → { transcript }. Server-side speech-to-text (the
  // OpenAI key stays in the BACKEND env — never the client). FRONTEND-DEFINED
  // contract: this endpoint is pending on Codex's backend; until it exists the
  // call 404s and the meal voice flow falls back to typed entry.
  public transcribeMealAudio(body: { audioData: string; audioMimeType: string }): Promise<{ transcript: string }> {
    return this.request('/meal-scans/transcribe', mealTranscriptResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // GET /meal-scans/foods?q= → food-database results. FRONTEND-DEFINED contract:
  // pending on Codex's backend (needs a nutrition DB). 404s → empty until live.
  public searchFoods(query: string): Promise<FoodSearchResult[]> {
    return this.request(`/meal-scans/foods?q=${encodeURIComponent(query)}`, foodSearchResponseSchema).then((r) => r.results);
  }

  // POST /meal-logs → MealLogResponse (201). The actual logged meal.
  public createMealLog(body: MealLogInput): Promise<MealLogResponse> {
    return this.request('/meal-logs', mealLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(mealLogInputSchema.parse(body)),
    });
  }

  // POST /activity-logs → ActivityLogResponse (201). Steps / workout / resistance.
  public createActivityLog(body: ActivityLogInput): Promise<ActivityLogResponse> {
    return this.request('/activity-logs', activityLogResponseSchema, {
      method: 'POST',
      body: JSON.stringify(activityLogInputSchema.parse(body)),
    });
  }

  // Progress-photo upload is a 3-step presigned-S3 flow:
  // 1) intent → presigned uploadUrl, 2) PUT bytes to S3, 3) confirm.
  public createPhotoUploadIntent(body: ProgressPhotoInput): Promise<ProgressPhotoUploadIntentResponse> {
    return this.request('/progress-photos/upload-intent', progressPhotoUploadIntentResponseSchema, {
      method: 'POST',
      body: JSON.stringify(progressPhotoInputSchema.parse(body)),
    });
  }

  // Raw binary PUT straight to the presigned S3 URL (no auth header / no JSON envelope).
  public async uploadToPresignedUrl(uploadUrl: string, uri: string, contentType: string): Promise<void> {
    const file = await fetch(uri);
    const blob = await file.blob();
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!res.ok) {
      throw new Error(`Photo upload failed: ${res.status}`);
    }
  }

  public confirmPhoto(body: ProgressPhotoConfirmInput): Promise<ProgressPhoto> {
    return this.request('/progress-photos/confirm', progressPhotoSchema, {
      method: 'POST',
      body: JSON.stringify(progressPhotoConfirmInputSchema.parse(body)),
    });
  }
}

export const api = new PeptaApi();
