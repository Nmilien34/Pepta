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
    // The scheduler holds nudges outside the user's waking hours, so the
    // context needs a zone; 14:00 UTC is 10:00 in New York.
    const loadContext = vi.fn(async () => ({
      userId: "user-1",
      timezone: "America/New_York",
    }));
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
      context: { userId: "user-1", timezone: "America/New_York" },
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
      quietHours: 0,
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
      loadContext: async () => ({
        userId: "user-1",
        timezone: "America/New_York",
      }),
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
      loadContext: async () => ({
        userId: "user-1",
        timezone: "America/New_York",
      }),
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

// The sweep runs every 15 minutes around the clock. Without a gate it had no
// idea what time it was where the user is, so an audible nudge could land at
// 12:15am — right after their day rolled over, before they could have logged
// anything — or a dose reminder at 4am for an 8am dose.
describe("quiet hours", () => {
  function deps(overrides: Record<string, unknown> = {}) {
    return {
      loadEligibleUsers: async () => [
        {
          userId: "user-1",
          aiPushCopyConsent: true,
          tokens: [{ token: "ExponentPushToken[abc123]", platform: "ios" }],
        },
      ],
      loadContext: async () => ({
        userId: "user-1",
        timezone: "America/New_York",
      }),
      createNotification: async () => ({
        candidate: {
          priorityId: "protein_anchor",
          importance: "high",
          pushEligible: true,
          windowKey: "protein_anchor:2026-06-21",
        } as const,
        title: "Pep: protein checkpoint",
        body: "You're 150g from today's protein target.",
        source: "deterministic" as const,
      }),
      hasDeliveryForWindow: async () => false,
      sendNotifications: vi.fn(async () => ({
        sent: 1,
        skipped: 0,
        tickets: [{ status: "ok", id: "t1" }],
      })),
      recordDelivery: async () => undefined,
      ...overrides,
    };
  }

  it("holds a nudge that would land just after the user's midnight", async () => {
    const sendNotifications = vi.fn(async () => ({ sent: 0, skipped: 0, tickets: [] }));
    // 04:15 UTC = 00:15 in New York.
    const result = await runPepPushMaintenance(
      new Date("2026-06-21T04:15:00.000Z"),
      deps({ sendNotifications }) as never,
    );

    expect(sendNotifications).not.toHaveBeenCalled();
    expect(result.quietHours).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("holds one that would land before the user is up", async () => {
    const sendNotifications = vi.fn(async () => ({ sent: 0, skipped: 0, tickets: [] }));
    // 11:00 UTC = 07:00 in New York, still inside quiet hours.
    await runPepPushMaintenance(
      new Date("2026-06-21T11:00:00.000Z"),
      deps({ sendNotifications }) as never,
    );

    expect(sendNotifications).not.toHaveBeenCalled();
  });

  it("sends during the user's waking hours", async () => {
    const sendNotifications = vi.fn(async () => ({
      sent: 1,
      skipped: 0,
      tickets: [{ status: "ok", id: "t1" }],
    }));
    // 17:00 UTC = 13:00 in New York.
    const result = await runPepPushMaintenance(
      new Date("2026-06-21T17:00:00.000Z"),
      deps({ sendNotifications }) as never,
    );

    expect(sendNotifications).toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it("holds rather than guesses when the context has no usable zone", async () => {
    const sendNotifications = vi.fn(async () => ({ sent: 0, skipped: 0, tickets: [] }));
    await runPepPushMaintenance(
      new Date("2026-06-21T17:00:00.000Z"),
      deps({
        loadContext: async () => ({ userId: "user-1" }),
        sendNotifications,
      }) as never,
    );

    expect(sendNotifications).not.toHaveBeenCalled();
  });
});
