import {
  mealBarcodeInputSchema,
  mealProductScanInputSchema,
  mealScanInputSchema,
  mealTranscriptionInputSchema,
  mealVoiceInputSchema,
} from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { searchFoods } from "../services/food-search.service";
import {
  analyzeMealScan,
  analyzeProductScan,
  lookupBarcodeMeal,
  parseVoiceMeal,
} from "../services/meal-scan.service";
import { transcribeMealAudio } from "../services/meal-scan-transcription.service";

const router = Router();

// The camera/voice budget. These are the expensive calls (vision, whisper) and
// they get the ceiling to themselves — see the note on /foods below.
const scanLimiter = createInMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: "Too many meal intelligence requests",
  keyBy: "userOrIp",
  bucket: "scan",
});

router.post(
  "/analyze",
  scanLimiter,
  validateBody(mealScanInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await analyzeMealScan(req.user!.id, req.body));
  }),
);

router.post(
  "/product",
  scanLimiter,
  validateBody(mealProductScanInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await analyzeProductScan(req.user!.id, req.body));
  }),
);

router.post(
  "/barcode",
  scanLimiter,
  validateBody(mealBarcodeInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await lookupBarcodeMeal(req.user!.id, req.body));
  }),
);

router.post(
  "/voice",
  scanLimiter,
  validateBody(mealVoiceInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await parseVoiceMeal(req.user!.id, req.body));
  }),
);

router.post(
  "/transcribe",
  scanLimiter,
  validateBody(mealTranscriptionInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await transcribeMealAudio(req.body));
  }),
);

// Typeahead search gets its OWN budget. Sharing the mount's 20/min with the
// camera meant typing a food name a character at a time could spend most of
// the minute's allowance, and the next meal photo came back "Couldn't analyze
// that photo" — with Try again also blocked. Searching must never cost the
// user their camera.
router.get(
  "/foods",
  createInMemoryRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 40,
    message: "Searching a bit fast — try again in a moment",
    keyBy: "userOrIp",
    bucket: "food-search",
  }),
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
