import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheFindOne: vi.fn(),
  cacheUpdateOne: vi.fn(),
  fetch: vi.fn(),
  openAI: vi.fn(),
  responsesCreate: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

vi.mock("../../config/env", () => ({
  env: {
    openai: {
      apiKey: "test-openai-key",
      productSearchModel: "gpt-5.5",
    },
    openFoodFacts: {
      userAgent: "Pepta/1.0 (support@pepta.app)",
    },
  },
}));

vi.mock("../../models", () => ({
  ProductNutritionCacheModel: {
    findOne: mocks.cacheFindOne,
    updateOne: mocks.cacheUpdateOne,
  },
}));

vi.mock("openai", () => ({
  default: mocks.openAI,
}));

import {
  lookupBarcodeNutrition,
  resolveProductNutrition,
} from "../../services/product-nutrition.service";

describe("product nutrition service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheFindOne.mockReturnValue({
      lean: () => Promise.resolve(null),
    });
    mocks.cacheUpdateOne.mockResolvedValue(undefined);
    mocks.openAI.mockImplementation(() => ({
      responses: {
        create: mocks.responsesCreate,
      },
    }));
  });

  it("looks up a barcode in Open Food Facts and writes the shared product cache", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 1,
          product: {
            brands: "Chobani",
            product_name: "Zero Sugar Greek Yogurt",
            serving_size: "1 container",
            nutriments: {
              proteins_serving: 11,
              "energy-kcal_serving": 60,
              carbohydrates_serving: 5,
              fat_serving: 0,
              fiber_serving: 0,
            },
          },
        }),
    });

    const result = await lookupBarcodeNutrition("081212903020");

    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://world.openfoodfacts.org/api/v2/product/081212903020.json?fields=product_name,brands,nutriments,serving_size,serving_quantity,code,url",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "Pepta/1.0 (support@pepta.app)",
        }),
      }),
    );
    expect(mocks.cacheUpdateOne).toHaveBeenCalledWith(
      { cacheKey: "barcode:081212903020" },
      expect.objectContaining({
        $set: expect.objectContaining({
          cacheKey: "barcode:081212903020",
          source: "open_food_facts",
          brand: "Chobani",
          productName: "Zero Sugar Greek Yogurt",
        }),
      }),
      { upsert: true },
    );
    expect(result).toEqual(
      expect.objectContaining({
        source: "open_food_facts",
        barcode: "081212903020",
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        analysis: expect.objectContaining({
          foodName: "Chobani Zero Sugar Greek Yogurt",
          servingSize: "1 container",
          protein: 11,
          calories: 60,
          carbs: 5,
          fat: 0,
          fiber: 0,
          confidence: 0.88,
        }),
      }),
    );
  });

  it("falls back to OpenAI web search when barcode/name lookup has no usable match", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 404 });
    mocks.responsesCreate.mockResolvedValue({
      output_text: JSON.stringify({
        brand: "Magic Spoon",
        productName: "Fruity Cereal",
        servingSize: "1 cup",
        protein: 13,
        calories: 140,
        carbs: 15,
        fat: 7,
        fiber: 4,
        confidence: 0.74,
        citations: [
          {
            title: "Magic Spoon Fruity nutrition facts",
            url: "https://www.magicspoon.com/products/fruity",
          },
        ],
      }),
    });

    const result = await resolveProductNutrition({
      brand: "Magic Spoon",
      productName: "Fruity Cereal",
      visibleLabelText: "13g protein",
      confidence: 0.8,
    });

    expect(mocks.openAI).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
      timeout: expect.any(Number),
    });
    expect(mocks.responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        tools: [{ type: "web_search" }],
        store: false,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        source: "openai_web_search",
        brand: "Magic Spoon",
        productName: "Fruity Cereal",
        citations: [
          {
            title: "Magic Spoon Fruity nutrition facts",
            url: "https://www.magicspoon.com/products/fruity",
          },
        ],
        analysis: expect.objectContaining({
          protein: 13,
          calories: 140,
          confidence: 0.74,
        }),
      }),
    );
  });

  it("returns the product-not-found path when OpenAI web search is unavailable", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 404 });
    mocks.responsesCreate.mockRejectedValue(new Error("OpenAI unavailable"));

    await expect(
      resolveProductNutrition({
        brand: "Small Brand",
        productName: "Mystery Bar",
        confidence: 0.7,
      }),
    ).rejects.toThrow(
      "We couldn't find reliable nutrition facts for that product.",
    );

    expect(mocks.cacheUpdateOne).not.toHaveBeenCalled();
  });
});
