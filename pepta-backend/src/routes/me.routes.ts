import {
  avatarConfirmRequestSchema,
  avatarUploadIntentRequestSchema,
  discoverySourceInputSchema,
  nudgeDismissInputSchema,
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
  dismissNudge,
  getCurrentUser,
  listDismissedNudges,
  recordDiscoverySource,
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

// "Where did you find us?" (onboarding step 7) — its own endpoint + collection
// so no strict client-facing response schema ever has to learn the field.
// Upsert semantics: safe to retry from handleComplete.
router.post(
  "/discovery-source",
  validateBody(discoverySourceInputSchema),
  asyncHandler(async (req, res) => {
    await recordDiscoverySource(req.user!.id, req.body.source);
    sendData(res, { received: true });
  }),
);

// One-time nudge dismissals. Own endpoint + collection, same reason as
// discovery-source: homeResponseSchema is strict and bundled into shipped
// builds, so this state cannot ride along on /home without breaking them.
router.get(
  "/nudges",
  asyncHandler(async (req, res) => {
    sendData(res, { dismissed: await listDismissedNudges(req.user!.id) });
  }),
);

router.post(
  "/nudges/dismiss",
  validateBody(nudgeDismissInputSchema),
  asyncHandler(async (req, res) => {
    await dismissNudge(req.user!.id, req.body.key);
    sendData(res, { received: true });
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
