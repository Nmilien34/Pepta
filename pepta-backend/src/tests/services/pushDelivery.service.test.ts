import { describe, expect, it, vi } from "vitest";
import { sendExpoPushNotifications } from "../../services/pushDelivery.service";

describe("push delivery service", () => {
  it("sends companion push notifications through Expo's push API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ status: "ok", id: "expo-ticket-1" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const result = await sendExpoPushNotifications(
      [
        {
          token: "ExponentPushToken[abc123]",
          title: "Pep: shot window",
          body: "Your dose window is close.",
          data: {
            priorityId: "dose_due",
            windowKey: "dose_due:2026-06-21",
          },
        },
      ],
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify([
          {
            to: "ExponentPushToken[abc123]",
            title: "Pep: shot window",
            body: "Your dose window is close.",
            sound: "default",
            data: {
              priorityId: "dose_due",
              windowKey: "dose_due:2026-06-21",
            },
          },
        ]),
      }),
    );
    expect(result).toEqual({
      sent: 1,
      skipped: 0,
      tickets: [{ status: "ok", id: "expo-ticket-1" }],
    });
  });

  it("skips invalid Expo tokens without calling the network", async () => {
    const fetchMock = vi.fn();

    const result = await sendExpoPushNotifications(
      [
        {
          token: "not-a-token",
          title: "Pep: shot window",
          body: "Your dose window is close.",
          data: { priorityId: "dose_due", windowKey: "dose_due:2026-06-21" },
        },
      ],
      { fetch: fetchMock },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 1, tickets: [] });
  });
});
