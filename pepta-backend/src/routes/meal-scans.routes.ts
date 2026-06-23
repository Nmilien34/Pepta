import { mealScanInputSchema, mealVoiceInputSchema } from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { AppError } from "../lib/errors";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import { analyzeMealScan, parseVoiceMeal } from "../services/meal-scan.service";

const router = Router();

router.post(
  "/analyze",
  validateBody(mealScanInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await analyzeMealScan(req.user!.id, req.body));
  }),
);

router.post(
  "/voice",
  validateBody(mealVoiceInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await parseVoiceMeal(req.user!.id, req.body));
  }),
);

// Pending integrations — defined so the client gets a clean, intentional response
// (and falls back gracefully) instead of a 404. Replace with real implementations:
//   - /transcribe: speech-to-text (OpenAI Whisper) — key stays server-side.
//   - /foods: nutrition-database search (USDA / Nutritionix / Edamam).
router.post(
  "/transcribe",
  asyncHandler(async (_req, _res) => {
    throw new AppError({
      code: "NOT_IMPLEMENTED",
      message: "Voice transcription is not available yet.",
      statusCode: 501,
    });
  }),
);

router.get(
  "/foods",
  asyncHandler(async (_req, res) => {
    sendData(res, { results: [] });
  }),
);

export default router;
