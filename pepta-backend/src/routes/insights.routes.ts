import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { getInsights } from "../services/insights.service";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    sendData(res, await getInsights(req.user!.id));
  }),
);

export default router;
