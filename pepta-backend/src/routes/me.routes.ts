import {
  userAccountPatchSchema,
  userProfileSettingsPatchSchema,
} from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData, sendNoContent } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import {
  deleteCurrentUser,
  getCurrentUser,
  updateCurrentUser,
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
  "/account",
  validateBody(userAccountPatchSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await updateCurrentUser(req.user!.id, req.body));
  }),
);

router.delete(
  "/account",
  asyncHandler(async (req, res) => {
    await deleteCurrentUser(req.user!.id);
    sendNoContent(res);
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
