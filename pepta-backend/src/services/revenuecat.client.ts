// RevenueCat server API boundary (v1 subscribers API — the battle-tested
// promotional-grant surface). Pure HTTP + error classification; no product
// decisions live here. The secret key is read from env, sent only as a
// header, and never logged or included in thrown errors.

import { env } from "../config/env";
import { logger } from "../lib/logger";

const BASE_URL = "https://api.revenuecat.com/v1";
const REQUEST_TIMEOUT_MS = 5_000;

export type RevenueCatFailureKind =
  | "retryable" // timeout, 423, 429, 5xx, network
  | "not_found" // 404
  | "conflict" // 409
  | "terminal"; // 400, 401, 403, 422 — configuration errors

export class RevenueCatClientError extends Error {
  public constructor(
    public readonly kind: RevenueCatFailureKind,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "RevenueCatClientError";
  }
}

export interface RevenueCatEntitlementInfo {
  expires_date: string | null;
  purchase_date?: string;
  product_identifier?: string;
}

export interface RevenueCatSubscriptionInfo {
  expires_date?: string | null;
  store?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  is_sandbox?: boolean;
  period_type?: string;
}

export interface RevenueCatSubscriber {
  original_app_user_id?: string;
  entitlements?: Record<string, RevenueCatEntitlementInfo>;
  subscriptions?: Record<string, RevenueCatSubscriptionInfo>;
  non_subscriptions?: Record<string, unknown>;
}

function classifyStatus(status: number): RevenueCatFailureKind {
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 423 || status === 429 || status >= 500) return "retryable";
  return "terminal";
}

function requireKey(): string {
  const key = env.revenueCat.secretApiKey;
  if (!key) {
    throw new RevenueCatClientError(
      "terminal",
      null,
      "REVENUECAT_SECRET_API_KEY is not configured",
    );
  }
  return key;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(env.revenueCat.secretApiKey);
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const key = requireKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    throw new RevenueCatClientError(
      "retryable",
      null,
      aborted ? "RevenueCat request timed out" : "RevenueCat request failed",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const kind = classifyStatus(response.status);
    logger.warn(
      { status: response.status, path: path.split("/").slice(0, 3).join("/"), kind },
      "[revenuecat-client] non-ok response",
    );
    throw new RevenueCatClientError(
      kind,
      response.status,
      `RevenueCat responded ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Fetch the full subscriber. RevenueCat's GET creates the customer when it
 * does not exist, which also satisfies "ensure a customer exists".
 */
export async function getSubscriber(
  appUserId: string,
): Promise<RevenueCatSubscriber> {
  const payload = await request<{ subscriber?: RevenueCatSubscriber }>(
    "GET",
    `/subscribers/${encodeURIComponent(appUserId)}`,
  );
  if (!payload.subscriber || typeof payload.subscriber !== "object") {
    throw new RevenueCatClientError(
      "retryable",
      null,
      "RevenueCat subscriber payload was malformed",
    );
  }
  return payload.subscriber;
}

/** Grant a promotional entitlement until the exact end time. Idempotent-safe. */
export async function grantPromotionalEntitlement(
  appUserId: string,
  entitlementId: string,
  endTime: Date,
): Promise<void> {
  await request(
    "POST",
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`,
    { end_time_ms: endTime.getTime() },
  );
}

/** Revoke every promotional grant of the entitlement for this customer. */
export async function revokePromotionalEntitlement(
  appUserId: string,
  entitlementId: string,
): Promise<void> {
  await request(
    "POST",
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke_promotionals`,
  );
}
