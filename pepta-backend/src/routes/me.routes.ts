import { userProfileSettingsPatchSchema } from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import {
  getCurrentUser,
  updateProfileSettings,
} from "../services/user.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    sendData(res, await getCurrentUser(req.user!.id));
  }),
);

router.patch(
  "/",
  validateBody(userProfileSettingsPatchSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await updateProfileSettings(req.user!.id, req.body));
  }),
);

export default router;
