import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", fetchMock);

vi.mock("../../config/env", () => ({
  env: {
    together: {
      apiKey: "test-together-key",
      visionModel: "Qwen/Qwen3.5-9B",
    },
  },
}));

import {
  generateProductCluesFromImage,
  parseProductCluesJson,
} from "../../services/product-scan-vision.service";

describe("product scan vision service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  brand: "Chobani",
                  productName: "Zero Sugar Greek Yogurt",
                  flavor: "Vanilla",
                  visibleLabelText: "11g protein",
                  servingText: "1 container",
                  nutritionPanelText: "Calories 60 Protein 11g",
                  barcodeText: "081212903020",
                  confidence: 0.88,
                }),
              },
            },
          ],
        }),
    });
  });

  it("parses Together product-clue JSON into a conservative app shape", () => {
    const result = parseProductCluesJson(
      JSON.stringify({
        brand: "  Chobani ",
        productName: " Zero Sugar Greek Yogurt ",
        barcodeText: " 081212903020 ",
        confidence: 1.2,
      }),
    );

    expect(result).toEqual({
      brand: "Chobani",
      productName: "Zero Sugar Greek Yogurt",
      barcodeText: "081212903020",
      confidence: 1,
    });
  });

  it("calls Together with image_url input and reasoning disabled", async () => {
    const result = await generateProductCluesFromImage(
      "base64-image",
      "image/png",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.together.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-together-key",
          "content-type": "application/json",
        }),
      }),
    );
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = JSON.parse(String(firstCall?.[1].body));
    expect(body).toEqual(
      expect.objectContaining({
        model: "Qwen/Qwen3.5-9B",
        reasoning: { enabled: false },
        response_format: { type: "json_object" },
      }),
    );
    expect(body.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image_url",
          image_url: { url: "data:image/png;base64,base64-image" },
        }),
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        barcodeText: "081212903020",
        confidence: 0.88,
      }),
    );
  });
});
