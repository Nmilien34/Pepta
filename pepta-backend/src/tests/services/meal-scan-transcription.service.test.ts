import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  createTranscription: vi.fn(),
  openAI: vi.fn(),
  toFile: vi.fn(),
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
  toFile: mocks.toFile,
}));

import { transcribeMealAudio } from "../../services/meal-scan-transcription.service";

describe("meal scan transcription service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openAI.mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mocks.createTranscription,
        },
      },
      chat: {
        completions: {
          create: mocks.createCompletion,
        },
      },
    }));
    mocks.toFile.mockResolvedValue("openai-upload-file");
    mocks.createTranscription.mockResolvedValue({
      text: " two eggs, avocado toast, and black coffee ",
    });
    mocks.createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"transcript":"two eggs, avocado toast, and black coffee"}',
          },
        },
      ],
    });
  });

  it("transcribes meal audio with OpenAI and returns the heard text", async () => {
    const audioData = Buffer.from("fake m4a bytes").toString("base64");

    const result = await transcribeMealAudio({
      audioData,
      audioMimeType: "audio/m4a",
    });

    expect(mocks.openAI).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
      timeout: expect.any(Number),
    });
    expect(mocks.toFile).toHaveBeenCalledWith(
      Buffer.from("fake m4a bytes"),
      "meal.m4a",
      { type: "audio/m4a" },
    );
    expect(mocks.createTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        file: "openai-upload-file",
        language: "en",
        model: "gpt-4o-mini-transcribe",
        response_format: "json",
      }),
    );
    expect(result).toEqual({
      transcript: "two eggs, avocado toast, and black coffee",
    });
  });

  it("removes conversational filler while preserving the food phrase", async () => {
    const audioData = Buffer.from("fake m4a bytes").toString("base64");
    mocks.createTranscription.mockResolvedValueOnce({
      text: " I ate some potatoe salad with chicken. that's it haha ",
    });
    mocks.createCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '{"transcript":"potatoe salad with chicken"}',
          },
        },
      ],
    });

    const result = await transcribeMealAudio({
      audioData,
      audioMimeType: "audio/m4a",
    });

    expect(mocks.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Remove conversational filler"),
          }),
          expect.objectContaining({
            role: "user",
            content: "I ate some potatoe salad with chicken. that's it haha",
          }),
        ]),
        response_format: { type: "json_object" },
      }),
    );
    expect(result).toEqual({
      transcript: "potatoe salad with chicken",
    });
  });
});
