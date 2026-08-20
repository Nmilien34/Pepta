import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import {
  queueExpiredMedia,
  runDueMediaCleanup,
} from "./media-cleanup.service";

export class MediaCleanupScheduler {
  private static instance: MediaCleanupScheduler | null = null;
  private task: ScheduledTask | null = null;
  private running = false;

  public static getInstance(): MediaCleanupScheduler {
    MediaCleanupScheduler.instance ??= new MediaCleanupScheduler();
    return MediaCleanupScheduler.instance;
  }

  public start(): void {
    if (this.task) return;
    this.task = cron.schedule(
      env.scheduler.mediaCleanupCron,
      () => {
        if (this.running) return;
        this.running = true;
        void queueExpiredMedia()
          .then(async (expired) => {
            const cleanup = await runDueMediaCleanup();
            if (expired > 0 || cleanup.attempted > 0) {
              logger.info(
                { expired, ...cleanup },
                "[media-cleanup] processed expired and due media",
              );
            }
          })
          .catch((error) => {
            logger.warn(
              { error: (error as Error).message },
              "[media-cleanup] cleanup run failed",
            );
          })
          .finally(() => {
            this.running = false;
          });
      },
      { timezone: env.scheduler.timezone },
    );
  }

  public stop(): void {
    this.task?.stop();
    this.task = null;
  }
}
