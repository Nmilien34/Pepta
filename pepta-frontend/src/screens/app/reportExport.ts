import type {
  HomeResponse,
  MealLogResponse,
  ProgressPhoto,
  ProgressResponse,
  TrackResponse,
} from "@pepta/shared";

export interface PeptaReportExportInput {
  home: HomeResponse | null;
  track: TrackResponse | null;
  progress: ProgressResponse | null;
}

export interface PeptaReportExportPayload {
  app: "Pepta";
  exportedAt: string;
  profile: HomeResponse["profile"] | null;
  summary: {
    activeCompounds: HomeResponse["activeCompounds"];
    medicationLevels: HomeResponse["medicationLevels"];
    selectedRange: HomeResponse["selectedRange"] | null;
    rangeTotals: HomeResponse["rangeTotals"] | null;
    today: {
      proteinGrams: number;
      fiberGrams: number;
      calories: number;
      waterOz: number;
    } | null;
    streakDays: number | null;
    setupProgress: HomeResponse["setupProgress"] | null;
    nextDose: HomeResponse["nextDose"] | null;
    latestWeight: HomeResponse["latestWeight"] | null;
    weeklyRetention: HomeResponse["weeklyRetention"] | null;
    insights: HomeResponse["insights"];
  };
  logs: {
    doseLogs: TrackResponse["doseLogs"];
    mealLogs: SanitizedMealLog[];
    waterLogs: TrackResponse["waterLogs"];
    proteinLogs: TrackResponse["proteinLogs"];
    activityLogs: TrackResponse["activityLogs"];
    sideEffectLogs: TrackResponse["sideEffectLogs"];
    measurements: TrackResponse["measurements"];
  };
  progress: {
    weights: ProgressResponse["weights"];
    measurements: ProgressResponse["measurements"];
    photos: ProgressPhotoExportMetadata[];
    weeklyRetention: ProgressResponse["weeklyRetention"];
  };
  sectionErrors: {
    home: HomeResponse["sectionErrors"] | null;
    track: TrackResponse["sectionErrors"] | null;
    progress: ProgressResponse["sectionErrors"] | null;
  };
}

export type SanitizedMealLog = Omit<MealLogResponse, "photoS3Key">;

export interface ProgressPhotoExportMetadata {
  id: string;
  captureDate: string;
  contentType: ProgressPhoto["contentType"];
  sizeBytes?: number;
  kind: ProgressPhoto["kind"];
  faceFullness?: ProgressPhoto["faceFullness"];
  status: ProgressPhoto["status"];
  createdAt: string;
  updatedAt: string;
}

export interface PeptaReportExportShareContent {
  title: string;
  message: string;
}

export function buildPeptaReportExportPayload(
  input: PeptaReportExportInput,
  now = new Date(),
): PeptaReportExportPayload {
  return {
    app: "Pepta",
    exportedAt: now.toISOString(),
    profile: input.home?.profile ?? null,
    summary: {
      activeCompounds: input.home?.activeCompounds ?? [],
      medicationLevels: input.home?.medicationLevels ?? [],
      selectedRange: input.home?.selectedRange ?? null,
      rangeTotals: input.home?.rangeTotals ?? null,
      today: input.home
        ? {
            proteinGrams: input.home.todayProteinGrams,
            fiberGrams: input.home.todayFiberGrams,
            calories: input.home.todayCalories,
            waterOz: input.home.todayWaterOz,
          }
        : null,
      streakDays: input.home?.streakDays ?? null,
      setupProgress: input.home?.setupProgress ?? null,
      nextDose: input.home?.nextDose ?? null,
      latestWeight: input.home?.latestWeight ?? null,
      weeklyRetention: input.home?.weeklyRetention ?? null,
      insights: input.home?.insights ?? [],
    },
    logs: {
      doseLogs: input.track?.doseLogs ?? [],
      mealLogs: (input.track?.mealLogs ?? []).map(toSanitizedMealLog),
      waterLogs: input.track?.waterLogs ?? [],
      proteinLogs: input.track?.proteinLogs ?? [],
      activityLogs: input.track?.activityLogs ?? [],
      sideEffectLogs: input.track?.sideEffectLogs ?? [],
      measurements: input.track?.measurements ?? [],
    },
    progress: {
      weights: input.progress?.weights ?? [],
      measurements: input.progress?.measurements ?? [],
      photos: (input.progress?.progressPhotos ?? []).map(
        toProgressPhotoExportMetadata,
      ),
      weeklyRetention: input.progress?.weeklyRetention ?? [],
    },
    sectionErrors: {
      home: input.home?.sectionErrors ?? null,
      track: input.track?.sectionErrors ?? null,
      progress: input.progress?.sectionErrors ?? null,
    },
  };
}

export function buildPeptaReportExportShareContent(
  payload: PeptaReportExportPayload,
): PeptaReportExportShareContent {
  return {
    title: "Pepta report export",
    message: JSON.stringify(payload, null, 2),
  };
}

function toSanitizedMealLog(meal: MealLogResponse): SanitizedMealLog {
  const safeMeal: Partial<MealLogResponse> = { ...meal };
  delete safeMeal.photoS3Key;
  return safeMeal as SanitizedMealLog;
}

function toProgressPhotoExportMetadata(
  photo: ProgressPhoto,
): ProgressPhotoExportMetadata {
  return {
    id: photo.id,
    captureDate: photo.captureDate,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    kind: photo.kind ?? "body",
    faceFullness: photo.faceFullness,
    status: photo.status,
    createdAt: photo.createdAt,
    updatedAt: photo.updatedAt,
  };
}
