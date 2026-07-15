import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import {
  PepPushDeliveryModel,
  PushTokenModel,
  UserModel,
  type PepPushCopySource,
} from "../models";
import {
  createPepPushNotification,
  loadPepPushContext,
  selectPepPushCandidate,
  type PepPushCandidate,
  type PepPushContext,
} from "./pepPushCopy.service";
import {
  recordPepMemoryNotification,
  refreshPepMemoryFromContext,
} from "./pepMemory.service";
import {
  sendExpoPushNotifications,
  type ExpoPushPayload,
  type ExpoPushResult,
} from "./pushDelivery.service";

export interface EligiblePushUser {
  userId: string;
  aiPushCopyConsent: boolean;
  tokens: Array<{
    token: string;
    platform: string;
  }>;
}

export interface PepPushMaintenanceNotification {
  candidate: Pick<
    PepPushCandidate,
    "priorityId" | "importance" | "pushEligible" | "windowKey"
  >;
  title: string;
  body: string;
  source: PepPushCopySource;
}

export interface RecordPepPushDeliveryInput {
  userId: string;
  priorityId: string;
  windowKey: string;
  source: PepPushCopySource;
  sentAt: Date;
  tokenCount: number;
}

export interface PepPushMaintenanceDeps {
  loadEligibleUsers(): Promise<EligiblePushUser[]>;
  loadContext(userId: string, now: Date): Promise<unknown>;
  createNotification(input: {
    userId: string;
    aiPushCopyConsent: boolean;
    context: unknown;
    now: Date;
  }): Promise<PepPushMaintenanceNotification | null>;
  hasDeliveryForWindow(input: {
    userId: string;
    priorityId: string;
    windowKey: string;
  }): Promise<boolean>;
  sendNotifications(payloads: ExpoPushPayload[]): Promise<ExpoPushResult>;
  recordDelivery(input: RecordPepPushDeliveryInput): Promise<void>;
}

export interface PepPushMaintenanceResult {
  checked: number;
  sent: number;
  skipped: number;
  duplicates: number;
  noCandidate: number;
}

function documentObject(document: unknown): Record<string, unknown> {
  if (document && typeof document === "object") {
    const maybeDocument = document as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      const value = maybeDocument.toObject();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }
    return document as Record<string, unknown>;
  }
  return {};
}

function idToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

async function defaultLoadEligibleUsers(): Promise<EligiblePushUser[]> {
  const tokenDocs = await PushTokenModel.find({ enabled: true });
  const tokensByUser = new Map<string, EligiblePushUser["tokens"]>();

  for (const tokenDoc of tokenDocs) {
    const token = documentObject(tokenDoc);
    const userId = idToString(token.userId);
    const value = typeof token.token === "string" ? token.token : "";
    const platform = typeof token.platform === "string" ? token.platform : "ios";
    if (!userId || !value) continue;
    const list = tokensByUser.get(userId) ?? [];
    list.push({ token: value, platform });
    tokensByUser.set(userId, list);
  }

  if (tokensByUser.size === 0) return [];

  const users = await UserModel.find({
    _id: { $in: [...tokensByUser.keys()] },
    onboardingComplete: true,
  });

  return users
    .map((userDoc) => {
      const user = documentObject(userDoc);
      const userId = idToString(user.id ?? user._id);
      const preferences = documentObject(user.notificationPreferences);
      return {
        userId,
        aiPushCopyConsent: preferences.aiPushCopyConsent === true,
        tokens: tokensByUser.get(userId) ?? [],
      };
    })
    .filter((user) => user.userId && user.tokens.length > 0);
}

async function defaultCreateNotification(input: {
  userId: string;
  aiPushCopyConsent: boolean;
  context: unknown;
  now: Date;
}): Promise<PepPushMaintenanceNotification | null> {
  const context = input.context as PepPushContext;
  const candidate = selectPepPushCandidate(context, input.now);
  if (!candidate) {
    await refreshPepMemoryFromContext(input.userId, context, input.now, {
      aiPushCopyConsent: input.aiPushCopyConsent,
      candidate: null,
    });
    return null;
  }
  const notification = await createPepPushNotification({
    context,
    candidate,
    aiPushCopyConsent: input.aiPushCopyConsent,
  });
  await refreshPepMemoryFromContext(input.userId, context, input.now, {
    aiPushCopyConsent: input.aiPushCopyConsent,
    candidate,
    notification,
  });
  return notification;
}

async function defaultHasDeliveryForWindow(input: {
  userId: string;
  priorityId: string;
  windowKey: string;
}): Promise<boolean> {
  const existing = await PepPushDeliveryModel.exists(input);
  return Boolean(existing);
}

async function defaultRecordDelivery(
  input: RecordPepPushDeliveryInput,
): Promise<void> {
  await PepPushDeliveryModel.findOneAndUpdate(
    {
      userId: input.userId,
      priorityId: input.priorityId,
      windowKey: input.windowKey,
    },
    {
      $setOnInsert: {
        userId: input.userId,
        priorityId: input.priorityId,
        windowKey: input.windowKey,
      },
      $set: {
        source: input.source,
        sentAt: input.sentAt,
        tokenCount: input.tokenCount,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  await recordPepMemoryNotification(input);
}

function defaultDeps(): PepPushMaintenanceDeps {
  return {
    loadEligibleUsers: defaultLoadEligibleUsers,
    loadContext: loadPepPushContext,
    createNotification: defaultCreateNotification,
    hasDeliveryForWindow: defaultHasDeliveryForWindow,
    sendNotifications: sendExpoPushNotifications,
    recordDelivery: defaultRecordDelivery,
  };
}

export async function runPepPushMaintenance(
  now = new Date(),
  deps: PepPushMaintenanceDeps = defaultDeps(),
): Promise<PepPushMaintenanceResult> {
  const result: PepPushMaintenanceResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    duplicates: 0,
    noCandidate: 0,
  };

  const users = await deps.loadEligibleUsers();

  for (const user of users) {
    result.checked += 1;

    try {
      const context = await deps.loadContext(user.userId, now);
      const notification = await deps.createNotification({
        userId: user.userId,
        aiPushCopyConsent: user.aiPushCopyConsent,
        context,
        now,
      });

      if (!notification) {
        result.noCandidate += 1;
        continue;
      }

      const { candidate } = notification;
      if (!candidate.pushEligible || candidate.importance !== "high") {
        result.skipped += 1;
        continue;
      }

      const duplicate = await deps.hasDeliveryForWindow({
        userId: user.userId,
        priorityId: candidate.priorityId,
        windowKey: candidate.windowKey,
      });
      if (duplicate) {
        result.duplicates += 1;
        continue;
      }

      const payloads: ExpoPushPayload[] = user.tokens.map((token) => ({
        token: token.token,
        title: notification.title,
        body: notification.body,
        data: {
          priorityId: candidate.priorityId,
          windowKey: candidate.windowKey,
          source: notification.source,
        },
      }));
      const delivery = await deps.sendNotifications(payloads);
      result.sent += delivery.sent;
      result.skipped += delivery.skipped;

      if (delivery.sent > 0) {
        await deps.recordDelivery({
          userId: user.userId,
          priorityId: candidate.priorityId,
          windowKey: candidate.windowKey,
          source: notification.source,
          sentAt: now,
          tokenCount: delivery.sent,
        });
      }
    } catch (error) {
      result.skipped += 1;
      logger.error({ error, userId: user.userId }, "[pep-push] user job failed");
    }
  }

  return result;
}

export class PepPushScheduler {
  private static instance: PepPushScheduler;
  private task?: ScheduledTask;

  private constructor() {}

  public static getInstance(): PepPushScheduler {
    if (!PepPushScheduler.instance) {
      PepPushScheduler.instance = new PepPushScheduler();
    }
    return PepPushScheduler.instance;
  }

  public start(): void {
    if (this.task) {
      logger.info("[scheduler] Pep push scheduler already started");
      return;
    }

    this.task = cron.schedule(
      env.scheduler.pepPushCron,
      async () => {
        try {
          const result = await runPepPushMaintenance();
          logger.info(result, "[scheduler] Pep push maintenance complete");
        } catch (error) {
          logger.error({ error }, "[scheduler] Pep push maintenance failed");
        }
      },
      { timezone: env.scheduler.timezone },
    );

    logger.info(
      {
        cron: env.scheduler.pepPushCron,
        timezone: env.scheduler.timezone,
      },
      "[scheduler] Pep push scheduler started",
    );
  }

  public stop(): void {
    this.task?.stop();
    this.task = undefined;
    logger.info("[scheduler] Pep push scheduler stopped");
  }
}
