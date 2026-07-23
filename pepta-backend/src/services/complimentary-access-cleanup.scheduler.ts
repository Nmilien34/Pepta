// Minute-level runner for the post-deletion promotional cleanup queue.
// Mirrors PepPushScheduler's lifecycle so index.ts starts/stops it with the
// API. No-ops entirely when RevenueCat is not configured.

import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { runDueCleanups } from "./complimentary-access-cleanup.service";
import { isRevenueCatConfigured } from "./revenuecat.client";

export class ComplimentaryCleanupScheduler {
  private static instance: ComplimentaryCleanupScheduler | null = null;
  private task: ScheduledTask | null = null;
  private running = false;

  public static getInstance(): ComplimentaryCleanupScheduler {
    ComplimentaryCleanupScheduler.instance ??= new ComplimentaryCleanupScheduler();
    return ComplimentaryCleanupScheduler.instance;
  }

  public start(): void {
    if (this.task || !isRevenueCatConfigured()) return;
    this.task = cron.schedule(
      "* * * * *",
      () => {
        if (this.running) return; // never overlap slow runs
        this.running = true;
        void runDueCleanups("worker")
          .then(({ attempted, succeeded }) => {
            if (attempted > 0) {
              logger.info(
                { attempted, succeeded },
                "[complimentary-cleanup] drained due cleanup tasks",
              );
            }
          })
          .catch((error) => {
            logger.warn(
              { error: (error as Error).message },
              "[complimentary-cleanup] cleanup run failed",
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
