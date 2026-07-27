import {
  avatarConfirmRequestSchema,
  avatarUploadIntentRequestSchema,
  notificationPreferencesPatchSchema,
  pushTokenRegistrationRequestSchema,
  userAccountPatchSchema,
  userProfileSettingsPatchSchema,
} from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData, sendNoContent } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import {
  confirmAvatarUpload,
  createAvatarUploadIntent,
  getAvatarViewUrl,
} from "../services/avatar.service";
import {
  deleteCurrentUser,
  getCurrentUser,
  updateCurrentUser,
  updateProfileSettings,
} from "../services/user.service";
import {
  getNotificationPreferences,
  registerPushToken,
  updateNotificationPreferences,
} from "../services/pushToken.service";
import { exportDoseLogsCsv } from "../services/export.service";

const router = Router();

router.use(requireAuth);

// CSV export of the user's dose log (their own data — deliberately outside
// the premium guard). ?tz=<IANA zone> localizes the date/time columns.
router.get(
  "/export/logs.csv",
  asyncHandler(async (req, res) => {
    const tz = typeof req.query.tz === "string" ? req.query.tz : undefined;
    const csv = await exportDoseLogsCsv(req.user!.id, tz);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pepta-dose-log.csv"',
    );
    res.send(csv);
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    sendData(res, await getCurrentUser(req.user!.id));
  }),
);

router.post(
  "/avatar/upload-intent",
  validateBody(avatarUploadIntentRequestSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await createAvatarUploadIntent(req.user!.id, req.body));
  }),
);

router.post(
  "/push-tokens",
  validateBody(pushTokenRegistrationRequestSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await registerPushToken(req.user!.id, req.body));
  }),
);

router.get(
  "/notification-preferences",
  asyncHandler(async (req, res) => {
    sendData(res, await getNotificationPreferences(req.user!.id));
  }),
);

router.patch(
  "/notification-preferences",
  validateBody(notificationPreferencesPatchSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await updateNotificationPreferences(req.user!.id, req.body));
  }),
);

router.post(
  "/avatar",
  validateBody(avatarConfirmRequestSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await confirmAvatarUpload(req.user!.id, req.body));
  }),
);

router.get(
  "/avatar/view-url",
  asyncHandler(async (req, res) => {
    sendData(res, await getAvatarViewUrl(req.user!.id));
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
