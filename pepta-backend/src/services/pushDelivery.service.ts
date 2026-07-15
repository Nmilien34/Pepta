export interface ExpoPushPayload {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface ExpoPushTicket {
  status: string;
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ExpoPushResult {
  sent: number;
  skipped: number;
  tickets: ExpoPushTicket[];
}

interface PushFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface PushDeliveryDeps {
  fetch: (
    input: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
    },
  ) => Promise<PushFetchResponse>;
}

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_PATTERN.test(token);
}

function normalizeTickets(value: unknown): ExpoPushTicket[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.filter((ticket): ticket is ExpoPushTicket => {
    return (
      ticket !== null &&
      typeof ticket === "object" &&
      typeof (ticket as { status?: unknown }).status === "string"
    );
  });
}

export async function sendExpoPushNotifications(
  payloads: ExpoPushPayload[],
  deps: PushDeliveryDeps = { fetch: globalThis.fetch },
): Promise<ExpoPushResult> {
  const valid = payloads.filter((payload) => isExpoPushToken(payload.token));
  const skipped = payloads.length - valid.length;

  if (valid.length === 0) {
    return { sent: 0, skipped, tickets: [] };
  }

  const body = valid.map((payload) => ({
    to: payload.token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    data: payload.data,
  }));

  const response = await deps.fetch(EXPO_PUSH_SEND_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Expo push request failed: ${response.status}`);
  }

  return {
    sent: valid.length,
    skipped,
    tickets: normalizeTickets(json),
  };
}
