import { describe, expect, it, vi } from "vitest";
import { runPepPushMaintenance } from "../../services/pepPushScheduler.service";

const now = new Date("2026-06-21T14:00:00.000Z");

describe("Pep push scheduler service", () => {
  it("sends high-priority companion nudges and records the delivery window", async () => {
    const loadEligibleUsers = vi.fn(async () => [
      {
        userId: "user-1",
        aiPushCopyConsent: true,
        tokens: [{ token: "ExponentPushToken[abc123]", platform: "ios" }],
      },
    ]);
    const loadContext = vi.fn(async () => ({ userId: "user-1" }));
    const createNotification = vi.fn(async () => ({
      candidate: {
        priorityId: "dose_due",
        importance: "high",
        pushEligible: true,
        windowKey: "dose_due:2026-06-21",
      } as const,
      title: "Pep: shot window",
      body: "Your dose window is close.",
      source: "ai" as const,
    }));
    const hasDeliveryForWindow = vi.fn(async () => false);
    const sendNotifications = vi.fn(async () => ({
      sent: 1,
      skipped: 0,
      tickets: [{ status: "ok", id: "ticket-1" }],
    }));
    const recordDelivery = vi.fn(async () => undefined);

    const result = await runPepPushMaintenance(now, {
      loadEligibleUsers,
      loadContext,
      createNotification,
      hasDeliveryForWindow,
      sendNotifications,
      recordDelivery,
    });

    expect(loadContext).toHaveBeenCalledWith("user-1", now);
    expect(createNotification).toHaveBeenCalledWith({
      userId: "user-1",
      aiPushCopyConsent: true,
      context: { userId: "user-1" },
      now,
    });
    expect(sendNotifications).toHaveBeenCalledWith([
      {
        token: "ExponentPushToken[abc123]",
        title: "Pep: shot window",
        body: "Your dose window is close.",
        data: {
          priorityId: "dose_due",
          windowKey: "dose_due:2026-06-21",
          source: "ai",
        },
      },
    ]);
    expect(recordDelivery).toHaveBeenCalledWith({
      userId: "user-1",
      priorityId: "dose_due",
      windowKey: "dose_due:2026-06-21",
      source: "ai",
      sentAt: now,
      tokenCount: 1,
    });
    expect(result).toEqual({
      checked: 1,
      sent: 1,
      skipped: 0,
      duplicates: 0,
      noCandidate: 0,
    });
  });

  it("does not send duplicates for the same user and priority window", async () => {
    const sendNotifications = vi.fn();

    const result = await runPepPushMaintenance(now, {
      loadEligibleUsers: async () => [
        {
          userId: "user-1",
          aiPushCopyConsent: false,
          tokens: [{ token: "ExponentPushToken[abc123]", platform: "ios" }],
        },
      ],
      loadContext: async () => ({ userId: "user-1" }),
      createNotification: async () => ({
        candidate: {
          priorityId: "dose_due",
          importance: "high",
          pushEligible: true,
          windowKey: "dose_due:2026-06-21",
        } as const,
        title: "Pep: shot window",
        body: "Your dose window is close.",
        source: "deterministic" as const,
      }),
      hasDeliveryForWindow: async () => true,
      sendNotifications,
      recordDelivery: async () => undefined,
    });

    expect(sendNotifications).not.toHaveBeenCalled();
    expect(result.duplicates).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("ignores low-priority or non-push companion notes", async () => {
    const sendNotifications = vi.fn();

    const result = await runPepPushMaintenance(now, {
      loadEligibleUsers: async () => [
        {
          userId: "user-1",
          aiPushCopyConsent: true,
          tokens: [{ token: "ExponentPushToken[abc123]", platform: "ios" }],
        },
      ],
      loadContext: async () => ({ userId: "user-1" }),
      createNotification: async () => ({
        candidate: {
          priorityId: "hydration_check",
          importance: "normal",
          pushEligible: false,
          windowKey: "hydration_check:2026-06-21",
        } as const,
        title: "Pep: hydration",
        body: "Water check.",
        source: "deterministic" as const,
      }),
      hasDeliveryForWindow: async () => false,
      sendNotifications,
      recordDelivery: async () => undefined,
    });

    expect(sendNotifications).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
