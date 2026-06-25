import {
  mealScanInputSchema,
  mealTranscriptionInputSchema,
  mealVoiceInputSchema,
} from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import { analyzeMealScan, parseVoiceMeal } from "../services/meal-scan.service";
import { transcribeMealAudio } from "../services/meal-scan-transcription.service";

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

router.post(
  "/transcribe",
  validateBody(mealTranscriptionInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await transcribeMealAudio(req.body));
  }),
);

// Pending integration — defined so the client gets a clean, intentional response
// (and falls back gracefully) instead of a 404. Replace with a nutrition DB search
// implementation (USDA / Nutritionix / Edamam).
router.get(
  "/foods",
  asyncHandler(async (_req, res) => {
    sendData(res, { results: [] });
  }),
);

export default router;
