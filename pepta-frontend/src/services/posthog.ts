// PostHog — product analytics + session replay.
//
// SECOND DESTINATION, NOT A REPLACEMENT. AppsFlyer stays the attribution
// backbone (Meta postbacks depend on it) and nothing in appsflyer.ts is
// touched. funnelEvents.ts fans every event out to both, under the same event
// names, so the two tools can be compared directly.
//
// THIS IS A HEALTH APP. Screens carry medication names, doses and body weight,
// so replay masking is a correctness requirement rather than a setting: every
// mask option is ON and stays on. See `SESSION_REPLAY_CONFIG` below.
//
// NEVER THROWS, NEVER BLOCKS. Every method swallows its own errors. An
// analytics outage must not surface to a user, must not break the AppsFlyer
// send that shares the call site, and must not touch the durable-logging
// outbox (which this module deliberately knows nothing about).

import Constants from "expo-constants";
import PostHog, {
  type PostHogSessionReplayConfig,
} from "posthog-react-native";
import { POSTHOG_API_KEY, POSTHOG_ENVIRONMENT, POSTHOG_HOST } from "../config";

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function warnInDev(message: string, error?: unknown): void {
  if (!isDevRuntime()) return;
  if (error) console.warn(message, error);
  else console.warn(message);
}

/**
 * EVERY MASK ON. The SDK already defaults these to true; they are written out
 * explicitly because a future SDK release flipping a default would silently
 * put doses and weights into readable replays. An explicit `true` fails the
 * diff review rather than the privacy review.
 */
export const SESSION_REPLAY_CONFIG: PostHogSessionReplayConfig = {
  maskAllTextInputs: true,
  maskAllImages: true,
  maskAllSandboxedViews: true,
  // Console logs on a health app can carry payload fragments in a stack trace.
  captureLog: false,
};

/**
 * 100%, deliberately. At ~40 installs/day the volume is trivial, and a
 * sampled replay is worth very little when the question is usually "what did
 * THIS user hit" rather than an aggregate. Revisit if installs pass ~1k/day.
 */
export const SESSION_REPLAY_SAMPLE_RATE = 1;

let client: PostHog | null = null;
let initAttempted = false;

/**
 * The live client, or null when PostHog is off or failed to start.
 * Exported for tests; callers should use the helpers below.
 */
export function getPostHogClient(): PostHog | null {
  return client;
}

/** Test seam: inject a fake (or null to clear). */
export function setPostHogClientForTest(next: PostHog | null): void {
  client = next;
  initAttempted = true;
}

export function resetPostHogInitForTest(): void {
  client = null;
  initAttempted = false;
}

/**
 * Start PostHog. Safe to call more than once; only the first call constructs.
 *
 * Returns whether a client is live, so the caller can log — but callers must
 * NOT branch app behaviour on it. A false here means analytics are missing,
 * never that the app should do something different.
 */
export function initPostHog(): boolean {
  if (initAttempted) return client !== null;
  initAttempted = true;

  // No key configured (local dev, or a build that deliberately omits it):
  // stay off entirely rather than construct a client that 401s on every send.
  if (!POSTHOG_API_KEY) {
    warnInDev("[PostHog] No API key configured — analytics disabled.");
    return false;
  }

  try {
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // MANUAL EVENTS ONLY. The app already emits its own screen events
      // through funnelEvents (onboarding_step et al). Navigation autocapture
      // would double-count those screens under different names and make the
      // AppsFlyer/PostHog comparison meaningless — which is the entire reason
      // the event names were kept identical.
      captureAppLifecycleEvents: false,
      enableSessionReplay: true,
      sessionReplayConfig: SESSION_REPLAY_CONFIG,
    });

    // Stamped on every event from here on.
    client.register({
      $environment: POSTHOG_ENVIRONMENT,
      // __DEV__ is FALSE in TestFlight (it is a Release build), so
      // $environment alone calls TestFlight "production". The build number
      // separates them: TestFlight builds run ahead of whatever is live in
      // the App Store, so filtering on it isolates internal traffic.
      app_version: Constants.expoConfig?.version ?? "unknown",
      build_number: Constants.expoConfig?.ios?.buildNumber ?? "unknown",
    });
    return true;
  } catch (error) {
    // A failed init must leave the app completely unaffected.
    client = null;
    warnInDev("[PostHog] init failed — continuing without analytics.", error);
    return false;
  }
}

/**
 * Fire-and-forget capture. Swallows everything: this shares a call site with
 * the AppsFlyer send, and a PostHog failure must not take that with it.
 */
/**
 * Record<string, string> rather than a looser shape, because that is exactly
 * what every call site already produces: the AppsFlyer wrapper takes string
 * values only, so funnelEvents stringifies booleans and numbers before the
 * fan-out. Keeping the same type here guarantees both destinations receive
 * byte-identical properties — the parity the whole integration rests on.
 */
export function capture(event: string, properties?: Record<string, string>): void {
  if (!client) return;
  try {
    client.capture(event, properties);
  } catch (error) {
    warnInDev(`[PostHog] Failed to capture ${event}.`, error);
  }
}

/**
 * Tie events to the backend user id.
 *
 * NO HEALTH DATA, NO PII. Person properties are limited to journey stage and
 * platform — never email, name, medication, dose or weight. Those are the
 * properties that would end up in a PostHog person profile, which is the one
 * place in this integration where data would be retained against a
 * identifiable individual rather than an anonymous session.
 */
export function identify(
  userId: string,
  properties?: { journeyStage?: string; platform?: string },
): void {
  if (!client) return;
  try {
    client.identify(userId, properties);
  } catch (error) {
    warnInDev("[PostHog] Failed to identify.", error);
  }
}

/**
 * Drop the identity so the next session does not stitch to the previous user.
 *
 * THIS DEVICE MAY BE SHARED. The same reasoning that makes logout() clear the
 * offline snapshot applies here: without a reset, the next person to sign in
 * on a resold or borrowed handset continues the previous user's PostHog
 * person and session recording.
 */
export function reset(): void {
  if (!client) return;
  try {
    client.reset();
  } catch (error) {
    warnInDev("[PostHog] Failed to reset.", error);
  }
}

export const posthog = { initPostHog, capture, identify, reset };
