import {
  mealScanInputSchema,
  mealTranscriptionInputSchema,
  mealVoiceInputSchema,
} from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import { searchFoods } from "../services/food-search.service";
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

router.get(
  "/foods",
  asyncHandler(async (req, res) => {
    const query =
      typeof req.query.q === "string"
        ? req.query.q
        : typeof req.query.query === "string"
          ? req.query.query
          : "";

    sendData(res, await searchFoods(query));
  }),
);

export default router;
