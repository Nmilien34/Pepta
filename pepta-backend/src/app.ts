import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { requireAuth } from "./auth/middleware";
import { env } from "./config/env";
import { isDatabaseReachable } from "./db/mongo";
import { AppError } from "./lib/errors";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { createInMemoryRateLimiter } from "./middleware/rate-limit.middleware";
import { requestLogger } from "./middleware/request-logger.middleware";
import authRoutes from "./routes/auth.routes";
import coachRoutes from "./routes/coach.routes";
import {
  activityLogInputSchema,
  doseLogInputSchema,
  measurementInputSchema,
  proteinLogInputSchema,
  fiberLogInputSchema,
  sideEffectLogInputSchema,
  waterLogInputSchema,
  weightLogInputSchema,
} from "@pepta/shared";
import {
  activityLogService,
  doseLogService,
  mealLogService,
  measurementService,
  proteinLogService,
  fiberLogService,
  sideEffectLogService,
  waterLogService,
  weightLogService,
} from "./services/logs.service";
import {
  createCompoundsRouter,
  createCyclesRouter,
  createMedicationCatalogRouter,
  createResearchLibraryRouter,
  createSchedulesRouter,
} from "./routes/catalog.routes";
import { createLogRouter } from "./routes/log-routes.factory";
import { createAppConfigRouter } from "./routes/app-config.routes";
import { createHealthRouter } from "./routes/health.routes";
import diagnosticsRoutes from "./routes/diagnostics.routes";
import homeRoutes from "./routes/home.routes";
import insightsRoutes from "./routes/insights.routes";
import { createLegalRouter } from "./routes/legal.routes";
import { createMealLogsRouter } from "./routes/meal-logs.routes";
import mealScansRoutes from "./routes/meal-scans.routes";
import medicationLevelRoutes from "./routes/medication-level.routes";
import mediaRoutes from "./routes/media.routes";
import meRoutes from "./routes/me.routes";
import onboardingRoutes from "./routes/onboarding.routes";
import referralRoutes from "./routes/referral.routes";
import accessRoutes from "./routes/access.routes";
// Side-effect: registers the complimentary-access resolver into access decisions.
import "./services/complimentary-access.service";
import { requireActiveAccess } from "./middleware/require-active-access";
import progressRoutes from "./routes/progress.routes";
import progressPhotosRoutes from "./routes/progress-photos.routes";
import favouritesRoutes from "./routes/favourites.routes";
import recipesRoutes from "./routes/recipes.routes";
import trackRoutes from "./routes/track.routes";
import webhookRoutes from "./routes/webhook.routes";
import weeklyRetentionRoutes from "./routes/weekly-retention.routes";
import { withPepMemoryRefreshAfterLogCreate } from "./services/pepMemory.service";

const LOCAL_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function corsOptions(): CorsOptions {
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        origin === env.frontendOrigin ||
        (env.isDevelopment && LOCAL_ORIGIN_PATTERN.test(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: "BAD_REQUEST",
          message: "Origin is not allowed by CORS",
          statusCode: 403,
        }),
      );
    },
  };
}

interface CreateAppOptions {
  healthCheck?: () => Promise<boolean>;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const healthCheck = options.healthCheck ?? isDatabaseReachable;
  const trackedDoseLogService =
    withPepMemoryRefreshAfterLogCreate(doseLogService);
  const trackedWeightLogService =
    withPepMemoryRefreshAfterLogCreate(weightLogService);
  const trackedMealLogService =
    withPepMemoryRefreshAfterLogCreate(mealLogService);
  const trackedWaterLogService =
    withPepMemoryRefreshAfterLogCreate(waterLogService);
  const trackedProteinLogService =
    withPepMemoryRefreshAfterLogCreate(proteinLogService);
  const trackedFiberLogService =
    withPepMemoryRefreshAfterLogCreate(fiberLogService);
  const trackedActivityLogService =
    withPepMemoryRefreshAfterLogCreate(activityLogService);
  const trackedSideEffectLogService =
    withPepMemoryRefreshAfterLogCreate(sideEffectLogService);
  const trackedMeasurementService =
    withPepMemoryRefreshAfterLogCreate(measurementService);

  app.use("/legal", createLegalRouter());
  app.disable("x-powered-by");
  app.disable("etag");
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(requestLogger);
  app.use("/meal-scans", express.json({ limit: "14mb" }));
  app.use(express.json({ limit: "1mb" }));

  app.use(createHealthRouter(healthCheck));
  // Public app config (update prompt): no auth — must answer on a cold
  // launch before sign-in. Part of the unauthenticated allowlist below.
  app.use("/app-config", createAppConfigRouter());
  app.use(
    "/auth",
    createInMemoryRateLimiter({
      windowMs: 15 * 60 * 1000,
      maxRequests: 30,
      message: "Too many authentication attempts",
    }),
  );
  app.use("/auth", authRoutes);
  // Access resolution stays OUTSIDE the premium guard (it is how access is
  // obtained); mounted before /me so it wins the prefix match.
  app.use("/me/access", accessRoutes);
  app.use("/me", meRoutes);
  // Premium product routes: requireAuth first (guard reads req.user), then
  // persisted-projection authorization. Allowlisted (design doc): auth, me,
  // access, onboarding, referrals, webhooks, legal, health, app-config.
  const premium = [requireAuth, requireActiveAccess] as const;
  app.use("/onboarding", onboardingRoutes);
  app.use("/referrals", referralRoutes);
  // /home can reach a language model (insight prose), so it needs a limiter
  // like the other AI-reaching routes — the /insights limiter below never saw
  // this traffic. The ceiling is generous because Home is the app's landing
  // screen and refetches on focus, pull, and after every log.
  app.use(
    "/home",
    ...premium,
    createInMemoryRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: "Too many home requests",
      keyBy: "userOrIp",
    }),
    homeRoutes,
  );
  app.use("/track", ...premium, trackRoutes);
  app.use("/media", ...premium, mediaRoutes);
  app.use("/favourites", ...premium, favouritesRoutes);
  app.use("/recipes", ...premium, recipesRoutes);
  app.use("/progress", ...premium, progressRoutes);
  app.use("/medication-level", ...premium, medicationLevelRoutes);
  app.use("/coach", ...premium, coachRoutes);
  app.use(
    "/insights",
    ...premium,
    createInMemoryRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: "Too many AI insight requests",
      keyBy: "userOrIp",
    }),
    insightsRoutes,
  );
  app.use("/weekly-retention", ...premium, weeklyRetentionRoutes);
  app.use("/diagnostics", ...premium, diagnosticsRoutes);
  // Rate limits live INSIDE this router: the camera/voice calls and the
  // typeahead food search need separate budgets, and a single mount-level
  // limiter necessarily pools them (one counter for the whole mount), so
  // searching a few foods could 429 the next meal photo.
  app.use("/meal-scans", ...premium, mealScansRoutes);
  app.use("/compounds", ...premium, createCompoundsRouter());
  app.use("/cycles", ...premium, createCyclesRouter());
  app.use("/schedules", ...premium, createSchedulesRouter());
  app.use("/dose-logs", ...premium, createLogRouter(doseLogInputSchema, trackedDoseLogService));
  app.use(
    "/weight-logs",
    ...premium,
    createLogRouter(weightLogInputSchema, trackedWeightLogService),
  );
  app.use("/meal-logs", ...premium, createMealLogsRouter(trackedMealLogService));
  app.use("/water-logs", ...premium, createLogRouter(waterLogInputSchema, trackedWaterLogService));
  app.use(
    "/protein-logs",
    ...premium,
    createLogRouter(proteinLogInputSchema, trackedProteinLogService),
  );
  app.use(
    "/fiber-logs",
    ...premium,
    createLogRouter(fiberLogInputSchema, trackedFiberLogService),
  );
  app.use(
    "/activity-logs",
    ...premium,
    createLogRouter(activityLogInputSchema, trackedActivityLogService),
  );
  app.use(
    "/side-effect-logs",
    ...premium,
    createLogRouter(sideEffectLogInputSchema, trackedSideEffectLogService),
  );
  app.use(
    "/measurements",
    ...premium,
    createLogRouter(measurementInputSchema, trackedMeasurementService),
  );
  app.use("/progress-photos", ...premium, progressPhotosRoutes);
  // Public reference data — mounted beside the other unauthenticated
  // surfaces so the onboarding medication picker (pre-sign-in) can read it.
  app.use("/medication-catalog", createMedicationCatalogRouter());
  app.use("/research-library", ...premium, createResearchLibraryRouter());
  app.use("/webhooks", webhookRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
