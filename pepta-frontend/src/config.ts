function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = withoutTrailingSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8080",
);

// Native Google sign-in client IDs. The web client ID MUST match the backend's
// GOOGLE_CLIENT_ID (the audience it verifies). See .env.example.
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
export const REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
export const APPSFLYER_DEV_KEY =
  process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? "";
export const APPSFLYER_APP_ID =
  process.env.EXPO_PUBLIC_APPSFLYER_APP_ID ?? "";
// SDK-verification ping (pepta_sdk_debug_ping). Dev-only by design: the env
// flag still arms it for local verification, but production builds never fire
// it regardless of env.
export const APPSFLYER_DIAGNOSTIC_EVENT_ENABLED =
  process.env.EXPO_PUBLIC_APPSFLYER_DIAGNOSTIC_EVENT_ENABLED === "true" &&
  (typeof __DEV__ !== "undefined" ? __DEV__ : false);

// PostHog — product analytics + session replay. Second destination behind the
// funnelEvents wrapper; AppsFlyer remains the attribution backbone and is
// untouched. An empty key disables PostHog entirely rather than half-arming it.
export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
export const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/**
 * SESSION REPLAY IS OFF BY DEFAULT, AND THAT IS THE SHIPPING STATE.
 *
 * This is a GLP-1 app. Global masking covers text INPUTS and images, but a
 * value the user already committed renders back as a plain <Text> — "5 mg",
 * "226 lb", "Tirzepatide" — and no global switch reaches those. Until the
 * MaskedHealthValue pass has been verified on a real replay (see
 * VERIFICATION.md), recording anything risks a readable medical record.
 *
 * Opt-in only, and deliberately env-driven rather than a code constant, so
 * turning it on is a deploy-time decision someone makes on purpose. Anything
 * other than the exact string "true" leaves it off.
 */
export const POSTHOG_SESSION_REPLAY_ENABLED =
  process.env.EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === "true";

/**
 * Belt to the braces above. `enableSessionReplay: false` already stops the
 * native recorder from initialising at all; this makes the sample rate 0 in
 * the same breath, so a future edit that flips only ONE of the two still
 * records nothing. 1 (100%) applies only once replay is explicitly enabled —
 * at ~40 installs/day the volume is trivial and a sampled replay answers
 * "what did THIS user hit" poorly.
 */
export const POSTHOG_SESSION_REPLAY_SAMPLE_RATE =
  POSTHOG_SESSION_REPLAY_ENABLED ? 1 : 0;

/**
 * Stamped on every PostHog event as `$environment` so a TestFlight or
 * simulator session cannot be mistaken for real traffic. __DEV__ is false in
 * TestFlight (it is a Release build), so this alone would call TestFlight
 * "production" — analytics.ts refines it with the Expo release channel.
 */
export const POSTHOG_ENVIRONMENT: "production" | "development" =
  typeof __DEV__ !== "undefined" && __DEV__ ? "development" : "production";

// Legal pages served by the active backend for onboarding, settings, and App Store metadata.
export const TERMS_URL = `${API_BASE_URL}/legal/terms`;
export const PRIVACY_URL = `${API_BASE_URL}/legal/privacy`;
