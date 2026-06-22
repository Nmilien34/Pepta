import { mealScanInputSchema, mealVoiceInputSchema } from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
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

export default router;
