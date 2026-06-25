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

import { searchFoods } from "../../services/food-search.service";

describe("food search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
                  foodName: "Chicken Caesar salad",
                  servingSize: "1 bowl",
                  protein: 35,
                  calories: 470,
                  carbs: 18,
                  fat: 28,
                  fiber: 4,
                },
                {
                  foodName: "Grilled chicken salad",
                  servingSize: "1 entree salad",
                  protein: 38,
                  calories: 420,
                  carbs: 16,
                  fat: 22,
                  fiber: 6,
                },
              ],
            }),
          },
        },
      ],
    });
  });

  it("searches food nutrition with OpenAI and returns app-ready results", async () => {
    const result = await searchFoods(" chicken salad ");

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
            content: "chicken salad",
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      results: [
        {
          foodName: "Chicken Caesar salad",
          servingSize: "1 bowl",
          protein: 35,
          calories: 470,
          carbs: 18,
          fat: 28,
          fiber: 4,
        },
        {
          foodName: "Grilled chicken salad",
          servingSize: "1 entree salad",
          protein: 38,
          calories: 420,
          carbs: 16,
          fat: 22,
          fiber: 6,
        },
      ],
    });
  });

  it("does not call OpenAI for too-short queries", async () => {
    await expect(searchFoods(" c ")).resolves.toEqual({ results: [] });

    expect(mocks.openAI).not.toHaveBeenCalled();
    expect(mocks.createCompletion).not.toHaveBeenCalled();
  });
});
