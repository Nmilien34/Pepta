import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPresignedGetUrl: vi.fn(),
  generateMealScanNote: vi.fn(),
  generateMealTextAnalysis: vi.fn(),
  generateMealScanVision: vi.fn(),
  mealFind: vi.fn(),
  mealLogFindOne: vi.fn(),
  mealScanCreate: vi.fn(),
  mealScanFindOne: vi.fn(),
  proteinFind: vi.fn(),
  userProfileFindOne: vi.fn(),
  putS3Object: vi.fn(),
}));

vi.mock("../../models", () => ({
  MealLogModel: {
    find: mocks.mealFind,
    findOne: mocks.mealLogFindOne,
  },
  MealScanModel: {
    create: mocks.mealScanCreate,
    findOne: mocks.mealScanFindOne,
  },
  ProteinLogModel: {
    find: mocks.proteinFind,
  },
  UserProfileModel: {
    findOne: mocks.userProfileFindOne,
  },
}));

vi.mock("../../services/s3.service", () => ({
  createPresignedGetUrl: mocks.createPresignedGetUrl,
  putS3Object: mocks.putS3Object,
}));

vi.mock("../../services/meal-scan-vision.service", () => ({
  MEAL_SCAN_VISION_ENGINE_VERSION: "meal-scan-vision-v1",
  generateMealScanVision: mocks.generateMealScanVision,
}));

vi.mock("../../services/meal-scan-note.service", () => ({
  MEAL_SCAN_NOTE_COPY_VERSION: "meal-scan-note-v1",
  generateMealScanNote: mocks.generateMealScanNote,
}));

vi.mock("../../services/meal-scan-text.service", () => ({
  MEAL_SCAN_TEXT_ENGINE_VERSION: "meal-scan-text-v1",
  generateMealTextAnalysis: mocks.generateMealTextAnalysis,
}));

import {
  analyzeMealScan,
  getMealLogScanDetail,
  parseVoiceMeal,
} from "../../services/meal-scan.service";

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const analysis = {
  foodName: "Chicken rice bowl",
  servingSize: "1 bowl",
  protein: 42,
  calories: 640,
  carbs: 72,
  fat: 18,
  fiber: 7,
  confidence: 0.82,
};

function document(value: Record<string, unknown>) {
  return {
    _id: value.id,
    ...value,
    toObject: () => value,
  };
}

function mongooseLikeSubdocument(value: Record<string, unknown>) {
  return {
    ...value,
    _doc: value,
    $__: {},
    parentArray: () => [],
    toObject: () => value,
  };
}

describe("meal scan service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateMealScanVision.mockResolvedValue(analysis);
    mocks.generateMealTextAnalysis.mockResolvedValue({
      ...analysis,
      foodName: "Chicken and rice",
      confidence: 0.76,
    });
    mocks.generateMealScanNote.mockResolvedValue(
      "This would put you at 96g of 120g protein today.",
    );
    mocks.putS3Object.mockResolvedValue(undefined);
    mocks.createPresignedGetUrl.mockResolvedValue(
      "https://signed.example/photo.jpg",
    );
    mocks.mealScanFindOne.mockResolvedValue(null);
    mocks.userProfileFindOne.mockResolvedValue({
      dailyProteinTargetGrams: 120,
      dailyCalorieTarget: 1800,
      biggestWorry: "losing_muscle",
    });
    mocks.mealFind.mockResolvedValue([{ protein: 54 }]);
    mocks.proteinFind.mockResolvedValue([]);
    mocks.mealScanCreate.mockImplementation(
      (payload: Record<string, unknown>) =>
        Promise.resolve(
          document({
            id: "scan-1",
            ...payload,
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z",
          }),
        ),
    );
  });

  it("stores the uploaded image, analyzes it with OpenAI vision, and persists the scan", async () => {
    const result = await analyzeMealScan("user-1", {
      imageData: onePixelPng,
      imageMimeType: "image/png",
      idempotencyKey: "scan-key-1",
    });

    expect(mocks.putS3Object).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^pepta\/meal-scans\/user-1\/.+\.png$/),
        body: expect.any(Uint8Array),
        contentType: "image/png",
      }),
    );
    expect(mocks.generateMealScanVision).toHaveBeenCalledWith(
      onePixelPng,
      "image/png",
    );
    expect(mocks.mealScanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        imageMimeType: "image/png",
        analysis,
        idempotencyKey: "scan-key-1",
        visionEngineVersion: "meal-scan-vision-v1",
      }),
    );
    expect(result).toEqual({
      scanId: "scan-1",
      photoS3Key: expect.stringMatching(/^pepta\/meal-scans\/user-1\/.+\.png$/),
      analysis,
      coachContent: expect.objectContaining({
        mode: "affirmation",
        callout: expect.stringContaining("Chicken rice bowl"),
        copyVersion: "meal-scan-coach-v1",
      }),
      note: "This would put you at 96g of 120g protein today.",
      visionEngineVersion: "meal-scan-vision-v1",
    });
    expect(mocks.generateMealScanNote).toHaveBeenCalledWith(
      analysis,
      expect.objectContaining({
        todayProteinLogged: 54,
        todayProteinTarget: 120,
        projectedProtein: 96,
        mode: "affirmation",
      }),
      expect.objectContaining({ biggestWorry: "losing_muscle" }),
    );
  });

  it("returns an existing successful scan for a repeated idempotency key", async () => {
    mocks.mealScanFindOne.mockResolvedValueOnce(
      document({
        id: "scan-existing",
        userId: "user-1",
        photoS3Key: "pepta/meal-scans/user-1/existing.png",
        imageMimeType: "image/png",
        analysis,
        coachContent: null,
        note: "Cached tracker note",
        idempotencyKey: "scan-key-1",
        visionEngineVersion: "meal-scan-vision-v1",
      }),
    );

    const result = await analyzeMealScan("user-1", {
      imageData: onePixelPng,
      imageMimeType: "image/png",
      idempotencyKey: "scan-key-1",
    });

    expect(mocks.putS3Object).not.toHaveBeenCalled();
    expect(mocks.generateMealScanVision).not.toHaveBeenCalled();
    expect(result.scanId).toBe("scan-existing");
    expect(result.photoS3Key).toBe("pepta/meal-scans/user-1/existing.png");
    expect(result.note).toBe("Cached tracker note");
  });

  it("parses a voice meal with OpenAI text analysis and returns a tracker note", async () => {
    const result = await parseVoiceMeal("user-1", {
      transcript: "chicken rice and broccoli",
      recordedAt: "2026-06-22T12:00:00.000Z",
    });

    expect(mocks.generateMealTextAnalysis).toHaveBeenCalledWith(
      "chicken rice and broccoli",
    );
    expect(result.scanId).toMatch(/^voice-/);
    expect(result.analysis.foodName).toBe("Chicken and rice");
    expect(result.note).toBe(
      "This would put you at 96g of 120g protein today.",
    );
    expect(result.visionEngineVersion).toBe("meal-scan-text-v1");
  });

  it("falls back safely when voice meal parsing is unavailable", async () => {
    mocks.generateMealTextAnalysis.mockRejectedValueOnce(
      new Error("OpenAI unavailable"),
    );

    const result = await parseVoiceMeal("user-1", {
      transcript: "small yogurt",
    });

    expect(result.analysis.foodName).toBe("small yogurt");
    expect(result.analysis.confidence).toBeLessThan(0.3);
    expect(result.note).toContain("Review this estimate");
    expect(result.visionEngineVersion).toBe("voice-log-fallback-v1");
  });

  it("rejects image bytes that do not match the declared mime type", async () => {
    await expect(
      analyzeMealScan("user-1", {
        imageData: onePixelPng,
        imageMimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_IMAGE",
      statusCode: 400,
    });

    expect(mocks.putS3Object).not.toHaveBeenCalled();
    expect(mocks.generateMealScanVision).not.toHaveBeenCalled();
  });

  it("returns signed photo URL and saved analysis for a scanned meal log", async () => {
    mocks.mealLogFindOne.mockResolvedValue({
      _id: "meal-1",
      userId: "user-1",
      photoS3Key: "pepta/meal-scans/user-1/scan.png",
    });
    mocks.mealScanFindOne.mockResolvedValue(
      document({
        id: "scan-1",
        userId: "user-1",
        photoS3Key: "pepta/meal-scans/user-1/scan.png",
        imageMimeType: "image/png",
        analysis,
        coachContent: null,
        note: "Saved scan note",
        visionEngineVersion: "meal-scan-vision-v1",
      }),
    );

    const result = await getMealLogScanDetail(
      "user-1",
      "507f1f77bcf86cd799439011",
    );

    expect(mocks.createPresignedGetUrl).toHaveBeenCalledWith({
      key: "pepta/meal-scans/user-1/scan.png",
    });
    expect(result).toEqual({
      photoViewUrl: "https://signed.example/photo.jpg",
      analysis,
      coachContent: null,
      note: "Saved scan note",
    });
  });

  it("serializes saved scan detail subdocuments before schema validation", async () => {
    const coachContent = {
      mode: "affirmation",
      callout: "Strong protein choice.",
      swap: null,
      copyVersion: "meal-scan-coach-v1",
    };
    mocks.mealLogFindOne.mockResolvedValue({
      _id: "meal-1",
      userId: "user-1",
      photoS3Key: "pepta/meal-scans/user-1/scan.png",
    });
    mocks.mealScanFindOne.mockResolvedValue({
      _id: "scan-1",
      analysis: mongooseLikeSubdocument(analysis),
      coachContent: mongooseLikeSubdocument(coachContent),
      note: "Saved scan note",
      toObject: () => ({
        id: "scan-1",
        analysis: mongooseLikeSubdocument(analysis),
        coachContent: mongooseLikeSubdocument(coachContent),
        note: "Saved scan note",
      }),
    });

    const result = await getMealLogScanDetail(
      "user-1",
      "507f1f77bcf86cd799439011",
    );

    expect(result.analysis).toEqual(analysis);
    expect(result.coachContent).toEqual(coachContent);
  });
});
