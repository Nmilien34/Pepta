import type {
  HomeResponse,
  MealLogResponse,
  ProgressPhoto,
  ProgressResponse,
  TrackResponse,
} from "@pepta/shared";
import { describe, expect, it } from "vitest";
import {
  buildPeptaReportExportPayload,
  buildPeptaReportExportShareContent,
} from "./reportExport";

const mealWithPhoto = {
  id: "meal_1",
  userId: "user_1",
  foodName: "Greek yogurt",
  protein: 24,
  calories: 180,
  source: "scan",
  datetime: "2026-06-24T12:00:00.000Z",
  photoS3Key: "pepta/meal-scans/user_1/photo.jpg",
  deletedAt: null,
  createdAt: "2026-06-24T12:00:00.000Z",
  updatedAt: "2026-06-24T12:00:00.000Z",
} as MealLogResponse;

const progressPhoto = {
  id: "photo_1",
  userId: "user_1",
  captureDate: "2026-06-24",
  s3Key: "pepta/progress-photos/user_1/photo.jpg",
  contentType: "image/jpeg",
  status: "uploaded",
  viewUrl: "https://signed.example.com/photo.jpg",
  createdAt: "2026-06-24T12:00:00.000Z",
  updatedAt: "2026-06-24T12:00:00.000Z",
} as ProgressPhoto;

describe("reportExport", () => {
  it("builds a Pepta report payload without storage-only photo fields", () => {
    const payload = buildPeptaReportExportPayload(
      {
        home: {
          profile: null,
          activeCompounds: [],
          medicationLevels: [],
          selectedRange: "today",
          todayProteinGrams: 24,
          todayFiberGrams: 6,
          todayCalories: 520,
          todayWaterOz: 48,
          streakDays: 3,
          setupProgress: { loggedItems: 3, required: 4, unlocked: false },
          nextDose: null,
          latestWeight: null,
          insights: [],
          weeklyRetention: null,
          sectionErrors: {},
        } as unknown as HomeResponse,
        track: {
          doseLogs: [],
          mealLogs: [mealWithPhoto],
          waterLogs: [],
          proteinLogs: [],
          activityLogs: [],
          sideEffectLogs: [],
          measurements: [],
          sectionErrors: {},
        } as unknown as TrackResponse,
        progress: {
          weights: [],
          measurements: [],
          progressPhotos: [progressPhoto],
          weeklyRetention: [],
          sectionErrors: {},
        } as unknown as ProgressResponse,
      },
      new Date("2026-06-24T15:30:00.000Z"),
    );

    expect(payload.app).toBe("Pepta");
    expect(payload.exportedAt).toBe("2026-06-24T15:30:00.000Z");
    expect(payload.summary.today).toEqual({
      proteinGrams: 24,
      fiberGrams: 6,
      calories: 520,
      waterOz: 48,
    });
    expect(payload.logs.mealLogs[0]).not.toHaveProperty("photoS3Key");
    expect(payload.progress.photos).toEqual([
      {
        id: "photo_1",
        captureDate: "2026-06-24",
        contentType: "image/jpeg",
        sizeBytes: undefined,
        kind: "body",
        faceFullness: undefined,
        status: "uploaded",
        createdAt: "2026-06-24T12:00:00.000Z",
        updatedAt: "2026-06-24T12:00:00.000Z",
      },
    ]);
  });

  it("turns the report payload into shareable JSON", () => {
    const payload = buildPeptaReportExportPayload(
      { home: null, track: null, progress: null },
      new Date("2026-06-24T15:30:00.000Z"),
    );

    const share = buildPeptaReportExportShareContent(payload);

    expect(share.title).toBe("Pepta report export");
    expect(JSON.parse(share.message).exportedAt).toBe(
      "2026-06-24T15:30:00.000Z",
    );
  });
});
