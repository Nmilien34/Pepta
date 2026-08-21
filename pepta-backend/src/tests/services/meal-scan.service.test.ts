import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discardMedia: vi.fn(),
  generateMealScanNote: vi.fn(),
  generateMealTextAnalysis: vi.fn(),
  generateMealScanVision: vi.fn(),
  generateProductCluesFromImage: vi.fn(),
  mealFind: vi.fn(),
  mealLogFindOne: vi.fn(),
  mealScanCreate: vi.fn(),
  mealScanFindOne: vi.fn(),
  proteinFind: vi.fn(),
  resolveProductNutrition: vi.fn(),
  userProfileFindOne: vi.fn(),
  getMediaViewUrl: vi.fn(),
  persistMealScanMedia: vi.fn(),
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

vi.mock("../../services/media.service", () => ({
  discardMedia: mocks.discardMedia,
  getMediaViewUrl: mocks.getMediaViewUrl,
  persistMealScanMedia: mocks.persistMealScanMedia,
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

vi.mock("../../services/product-scan-vision.service", () => ({
  PRODUCT_SCAN_VISION_ENGINE_VERSION: "product-scan-v1",
  generateProductCluesFromImage: mocks.generateProductCluesFromImage,
}));

vi.mock("../../services/product-nutrition.service", () => ({
  resolveProductNutrition: mocks.resolveProductNutrition,
}));

import {
  analyzeMealScan,
  analyzeProductScan,
  getMealLogScanDetail,
  lookupBarcodeMeal,
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
    mocks.generateProductCluesFromImage.mockResolvedValue({
      brand: "Chobani",
      productName: "Zero Sugar Greek Yogurt",
      barcodeText: "081212903020",
      confidence: 0.88,
    });
    mocks.resolveProductNutrition.mockResolvedValue({
      source: "open_food_facts",
      barcode: "081212903020",
      brand: "Chobani",
      productName: "Zero Sugar Greek Yogurt",
      citations: [
        {
          title: "Chobani Zero Sugar Greek Yogurt",
          url: "https://world.openfoodfacts.org/product/081212903020",
        },
      ],
      analysis: {
        foodName: "Chobani Zero Sugar Greek Yogurt",
        servingSize: "1 container",
        protein: 11,
        calories: 60,
        carbs: 5,
        fat: 0,
        fiber: 0,
        confidence: 0.88,
      },
    });
    mocks.generateMealScanNote.mockResolvedValue(
      "This would put you at 96g of 120g protein today.",
    );
    mocks.discardMedia.mockResolvedValue(undefined);
    mocks.persistMealScanMedia.mockResolvedValue({
      mediaId: "media-1",
      status: "ready",
    });
    mocks.getMediaViewUrl.mockResolvedValue(
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

  it("analyzes first, then persists canonical media and the scan", async () => {
    const result = await analyzeMealScan("user-1", {
      imageData: onePixelPng,
      imageMimeType: "image/png",
      idempotencyKey: "scan-key-1",
    });

    expect(mocks.generateMealScanVision).toHaveBeenCalledWith(
      onePixelPng,
      "image/png",
    );
    expect(mocks.persistMealScanMedia).toHaveBeenCalledWith("user-1", {
      bytes: expect.any(Uint8Array),
      contentType: "image/png",
    });
    expect(mocks.generateMealScanVision.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.persistMealScanMedia.mock.invocationCallOrder[0]!,
    );
    expect(mocks.mealScanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        photoMediaId: "media-1",
        imageMimeType: "image/png",
        analysis,
        idempotencyKey: "scan-key-1",
        visionEngineVersion: "meal-scan-vision-v1",
      }),
    );
    expect(result).toEqual({
      scanId: "scan-1",
      photoMediaId: "media-1",
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
        photoMediaId: "media-existing",
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

    expect(mocks.persistMealScanMedia).not.toHaveBeenCalled();
    expect(mocks.generateMealScanVision).not.toHaveBeenCalled();
    expect(result.scanId).toBe("scan-existing");
    expect(result.photoMediaId).toBe("media-existing");
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

  it("resolves product nutrition before persisting its canonical media", async () => {
    const result = await analyzeProductScan("user-1", {
      imageData: onePixelPng,
      imageMimeType: "image/png",
      idempotencyKey: "product-scan-key-1",
    });

    expect(mocks.generateProductCluesFromImage).toHaveBeenCalledWith(
      onePixelPng,
      "image/png",
    );
    expect(mocks.resolveProductNutrition).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        barcodeText: "081212903020",
      }),
    );
    expect(mocks.resolveProductNutrition.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.persistMealScanMedia.mock.invocationCallOrder[0]!,
    );
    expect(mocks.mealScanCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        photoMediaId: "media-1",
        imageMimeType: "image/png",
        idempotencyKey: "product-scan-key-1",
        visionEngineVersion: "product-scan-v1",
        product: {
          mode: "product_scan",
          barcode: "081212903020",
          brand: "Chobani",
          productName: "Zero Sugar Greek Yogurt",
          source: "open_food_facts",
          citations: [
            {
              title: "Chobani Zero Sugar Greek Yogurt",
              url: "https://world.openfoodfacts.org/product/081212903020",
            },
          ],
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        scanId: "scan-1",
        analysis: expect.objectContaining({
          foodName: "Chobani Zero Sugar Greek Yogurt",
          protein: 11,
          calories: 60,
        }),
        product: {
          mode: "product_scan",
          barcode: "081212903020",
          brand: "Chobani",
          productName: "Zero Sugar Greek Yogurt",
          source: "open_food_facts",
          citations: [
            {
              title: "Chobani Zero Sugar Greek Yogurt",
              url: "https://world.openfoodfacts.org/product/081212903020",
            },
          ],
        },
        visionEngineVersion: "product-scan-v1",
      }),
    );
  });

  it("looks up a barcode and returns a meal-scan-shaped result without uploading a photo", async () => {
    const result = await lookupBarcodeMeal("user-1", {
      barcode: "081212903020",
    });

    expect(mocks.persistMealScanMedia).not.toHaveBeenCalled();
    expect(mocks.resolveProductNutrition).toHaveBeenCalledWith(
      expect.objectContaining({
        barcodeText: "081212903020",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        scanId: expect.stringMatching(/^barcode-/),
        product: expect.objectContaining({
          mode: "barcode",
          barcode: "081212903020",
          source: "open_food_facts",
        }),
        analysis: expect.objectContaining({
          foodName: "Chobani Zero Sugar Greek Yogurt",
        }),
      }),
    );
  });

  it("surfaces the failure instead of inventing nutrition when voice parsing is unavailable", async () => {
    // This used to return a fabricated analysis: protein/carbs/fat/fiber all
    // zero and calories derived from the transcript's WORD COUNT, shown to
    // the user as an ordinary review card with a confidence badge. Logging
    // it wrote 0 g of protein for a real meal into their day. In a
    // protein-tracking app that is worse than any error message.
    mocks.generateMealTextAnalysis.mockRejectedValueOnce(
      new Error("OpenAI unavailable"),
    );

    await expect(
      parseVoiceMeal("user-1", { transcript: "grilled chicken breast with rice" }),
    ).rejects.toThrow("OpenAI unavailable");
  });

  it("writes nothing to the user's log when voice parsing fails", async () => {
    mocks.generateMealTextAnalysis.mockRejectedValueOnce(
      new Error("OpenAI unavailable"),
    );

    await expect(
      parseVoiceMeal("user-1", { transcript: "grilled chicken breast with rice" }),
    ).rejects.toThrow();
    expect(mocks.mealScanCreate).not.toHaveBeenCalled();
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

    expect(mocks.persistMealScanMedia).not.toHaveBeenCalled();
    expect(mocks.generateMealScanVision).not.toHaveBeenCalled();
  });

  it("does not create media when vision analysis fails", async () => {
    mocks.generateMealScanVision.mockRejectedValueOnce(new Error("vision failed"));

    await expect(
      analyzeMealScan("user-1", {
        imageData: onePixelPng,
        imageMimeType: "image/png",
      }),
    ).rejects.toThrow("vision failed");

    expect(mocks.persistMealScanMedia).not.toHaveBeenCalled();
    expect(mocks.mealScanCreate).not.toHaveBeenCalled();
  });

  it("discards newly persisted media when the scan row cannot be created", async () => {
    const databaseError = new Error("database unavailable");
    mocks.mealScanCreate.mockRejectedValueOnce(databaseError);

    await expect(
      analyzeMealScan("user-1", {
        imageData: onePixelPng,
        imageMimeType: "image/png",
      }),
    ).rejects.toBe(databaseError);

    expect(mocks.discardMedia).toHaveBeenCalledWith("user-1", "media-1");
  });

  it("discards losing media and returns the winner of an idempotency race", async () => {
    mocks.mealScanCreate.mockRejectedValueOnce({
      code: 11000,
      keyPattern: { idempotencyKey: 1 },
    });
    mocks.mealScanFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        document({
          id: "scan-existing",
          userId: "user-1",
          photoMediaId: "media-existing",
          imageMimeType: "image/png",
          analysis,
          coachContent: null,
          note: "Winner note",
          idempotencyKey: "scan-key-1",
          visionEngineVersion: "meal-scan-vision-v1",
        }),
      );

    const result = await analyzeMealScan("user-1", {
      imageData: onePixelPng,
      imageMimeType: "image/png",
      idempotencyKey: "scan-key-1",
    });

    expect(mocks.discardMedia).toHaveBeenCalledWith("user-1", "media-1");
    expect(result.photoMediaId).toBe("media-existing");
  });

  it("returns signed photo URL and saved analysis for a scanned meal log", async () => {
    mocks.mealLogFindOne.mockResolvedValue({
      _id: "meal-1",
      userId: "user-1",
      photoMediaId: "media-1",
    });
    mocks.mealScanFindOne.mockResolvedValue(
      document({
        id: "scan-1",
        userId: "user-1",
        photoMediaId: "media-1",
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

    expect(mocks.getMediaViewUrl).toHaveBeenCalledWith("user-1", "media-1");
    expect(mocks.mealScanFindOne).toHaveBeenCalledWith({
      userId: "user-1",
      photoMediaId: "media-1",
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
      photoMediaId: "media-1",
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

// The snapshot decides the "you'd be at Xg of Yg protein today" figure that
// the AI note states as fact. Measured over UTC days it contradicted the
// user's own Home screen for most of the evening.
describe("the protein snapshot is measured in the user's day", () => {
  beforeEach(() => {
    // Self-contained: this block sits outside the suite above, so it sets up
    // (and clears) everything it needs itself.
    vi.clearAllMocks();
    mocks.generateMealTextAnalysis.mockResolvedValue({
      foodName: "Chicken and rice",
      servingSize: "1 bowl",
      protein: 42,
      calories: 640,
      carbs: 72,
      fat: 18,
      fiber: 7,
      confidence: 0.76,
    });
    mocks.generateMealScanNote.mockResolvedValue("note");
    mocks.mealScanFindOne.mockResolvedValue(null);
    mocks.mealScanCreate.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve(document({
        id: "scan-1",
        ...payload,
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      })),
    );
    mocks.mealFind.mockResolvedValue([]);
    mocks.proteinFind.mockResolvedValue([]);
    mocks.userProfileFindOne.mockResolvedValue({
      dailyProteinTargetGrams: 120,
      dailyCalorieTarget: 1800,
      timezone: "America/Los_Angeles",
    });
  });

  it("counts from local midnight, not UTC midnight", async () => {
    // 6pm PDT on 20 Aug is 01:00 UTC on 21 Aug — already "tomorrow" in UTC.
    const capturedAt = new Date("2026-08-21T01:00:00.000Z");
    mocks.mealFind.mockResolvedValue([]);
    mocks.proteinFind.mockResolvedValue([]);

    await parseVoiceMeal("user-1", {
      transcript: "chicken and rice",
      recordedAt: capturedAt.toISOString(),
    });

    const dayFilter = mocks.mealFind.mock.calls[0]![0].datetime;
    // Local midnight in Los Angeles = 07:00 UTC that morning, so breakfast
    // and lunch are inside the window rather than left in "yesterday".
    expect(dayFilter.$gte.toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(dayFilter.$lt.toISOString()).toBe("2026-08-21T07:00:00.000Z");
  });

  it("falls back to UTC days when the profile has no usable zone", async () => {
    mocks.userProfileFindOne.mockResolvedValue({
      dailyProteinTargetGrams: 120,
      dailyCalorieTarget: 1800,
      timezone: "Not/AZone",
    });
    mocks.mealFind.mockResolvedValue([]);
    mocks.proteinFind.mockResolvedValue([]);

    await parseVoiceMeal("user-1", {
      transcript: "chicken and rice",
      recordedAt: "2026-08-21T01:00:00.000Z",
    });

    const dayFilter = mocks.mealFind.mock.calls[0]![0].datetime;
    expect(dayFilter.$gte.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });
});
