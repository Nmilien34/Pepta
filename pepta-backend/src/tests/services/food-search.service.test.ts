import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  openAI: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    openai: {
      apiKey: "test-openai-key",
    },
  },
}));

vi.mock("openai", () => ({
  default: mocks.openAI,
}));

import {
  clearFoodSearchCacheForTests,
  searchFoods,
} from "../../services/food-search.service";

describe("food search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFoodSearchCacheForTests();
    mocks.openAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: mocks.createCompletion,
        },
      },
    }));
    mocks.createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  foodName: "Jollof rice",
                  servingSize: "1 bowl",
                  protein: 12,
                  calories: 520,
                  carbs: 78,
                  fat: 16,
                  fiber: 5,
                },
              ],
            }),
          },
        },
      ],
    });
  });

  it("searches food nutrition with OpenAI and returns app-ready results", async () => {
    const result = await searchFoods(" jollof rice ");

    expect(mocks.openAI).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
      timeout: expect.any(Number),
    });
    expect(mocks.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Return JSON only"),
          }),
          expect.objectContaining({
            role: "user",
            content: "jollof rice",
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      results: [
        {
          foodName: "Jollof rice",
          servingSize: "1 bowl",
          protein: 12,
          calories: 520,
          carbs: 78,
          fat: 16,
          fiber: 5,
        },
      ],
    });
  });

  it("does not call OpenAI for too-short queries", async () => {
    await expect(searchFoods(" c ")).resolves.toEqual({ results: [] });

    expect(mocks.openAI).not.toHaveBeenCalled();
    expect(mocks.createCompletion).not.toHaveBeenCalled();
  });

  it("shows local recommendations after the first 2 letters without waiting on OpenAI", async () => {
    const result = await searchFoods("pi");

    expect(result.results[0]).toEqual(
      expect.objectContaining({
        foodName: "Pizza",
        servingSize: "2 slices",
      }),
    );
    expect(mocks.openAI).not.toHaveBeenCalled();
  });

  it("returns obvious common foods from local cache without waiting on OpenAI", async () => {
    const result = await searchFoods("pizza");

    expect(result.results[0]).toEqual(
      expect.objectContaining({
        foodName: "Pizza",
        servingSize: "2 slices",
      }),
    );
    expect(mocks.openAI).not.toHaveBeenCalled();
    expect(mocks.createCompletion).not.toHaveBeenCalled();
  });

  it("handles likely food misspellings and still returns useful matches", async () => {
    const result = await searchFoods("piza");

    expect(result.results[0]).toEqual(
      expect.objectContaining({
        foodName: "Pizza",
        servingSize: "2 slices",
      }),
    );
    expect(mocks.openAI).not.toHaveBeenCalled();
    expect(mocks.createCompletion).not.toHaveBeenCalled();
  });

  it("caches AI-backed searches by normalized query", async () => {
    const firstResult = await searchFoods("jollof rice");
    const secondResult = await searchFoods("  jollof   rice  ");

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.results[0]).toEqual(
      expect.objectContaining({
        foodName: "Jollof rice",
        servingSize: "1 bowl",
      }),
    );
    expect(mocks.openAI).toHaveBeenCalledTimes(1);
    expect(mocks.createCompletion).toHaveBeenCalledTimes(1);
  });
});
