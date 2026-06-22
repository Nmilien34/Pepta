import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { isDatabaseReachable } from './db/mongo';
import { AppError } from './lib/errors';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/request-logger.middleware';
import authRoutes from './routes/auth.routes';
import {
  activityLogInputSchema,
  doseLogInputSchema,
  mealLogInputSchema,
  measurementInputSchema,
  proteinLogInputSchema,
  sideEffectLogInputSchema,
  waterLogInputSchema,
  weightLogInputSchema,
} from '@pepta/shared';
import {
  activityLogService,
  doseLogService,
  mealLogService,
  measurementService,
  proteinLogService,
  sideEffectLogService,
  waterLogService,
  weightLogService,
} from './services/logs.service';
import {
  createCompoundsRouter,
  createCyclesRouter,
  createResearchLibraryRouter,
  createSchedulesRouter,
} from './routes/catalog.routes';
import { createLogRouter } from './routes/log-routes.factory';
import { createHealthRouter } from './routes/health.routes';
import diagnosticsRoutes from './routes/diagnostics.routes';
import homeRoutes from './routes/home.routes';
import insightsRoutes from './routes/insights.routes';
import mealScansRoutes from './routes/meal-scans.routes';
import medicationLevelRoutes from './routes/medication-level.routes';
import meRoutes from './routes/me.routes';
import onboardingRoutes from './routes/onboarding.routes';
import progressRoutes from './routes/progress.routes';
import progressPhotosRoutes from './routes/progress-photos.routes';
import trackRoutes from './routes/track.routes';
import webhookRoutes from './routes/webhook.routes';
import weeklyRetentionRoutes from './routes/weekly-retention.routes';

const LOCAL_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function corsOptions(): CorsOptions {
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origin === env.frontendOrigin || (env.isDevelopment && LOCAL_ORIGIN_PATTERN.test(origin))) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: 'BAD_REQUEST',
          message: 'Origin is not allowed by CORS',
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

  app.disable('x-powered-by');
  app.disable('etag');
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(requestLogger);
  app.use('/meal-scans', express.json({ limit: '14mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use(createHealthRouter(healthCheck));
  app.use('/auth', authRoutes);
  app.use('/me', meRoutes);
  app.use('/onboarding', onboardingRoutes);
  app.use('/home', homeRoutes);
  app.use('/track', trackRoutes);
  app.use('/progress', progressRoutes);
  app.use('/medication-level', medicationLevelRoutes);
  app.use('/insights', insightsRoutes);
  app.use('/weekly-retention', weeklyRetentionRoutes);
  app.use('/diagnostics', diagnosticsRoutes);
  app.use('/meal-scans', mealScansRoutes);
  app.use('/compounds', createCompoundsRouter());
  app.use('/cycles', createCyclesRouter());
  app.use('/schedules', createSchedulesRouter());
  app.use('/dose-logs', createLogRouter(doseLogInputSchema, doseLogService));
  app.use('/weight-logs', createLogRouter(weightLogInputSchema, weightLogService));
  app.use('/meal-logs', createLogRouter(mealLogInputSchema, mealLogService));
  app.use('/water-logs', createLogRouter(waterLogInputSchema, waterLogService));
  app.use('/protein-logs', createLogRouter(proteinLogInputSchema, proteinLogService));
  app.use('/activity-logs', createLogRouter(activityLogInputSchema, activityLogService));
  app.use('/side-effect-logs', createLogRouter(sideEffectLogInputSchema, sideEffectLogService));
  app.use('/measurements', createLogRouter(measurementInputSchema, measurementService));
  app.use('/progress-photos', progressPhotosRoutes);
  app.use('/research-library', createResearchLibraryRouter());
  app.use('/webhooks', webhookRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
