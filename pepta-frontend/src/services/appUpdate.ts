// Self-maintaining update prompt. Fully generic: the running version comes
// from expo-constants (the same app.config.js the build embeds) and the
// latest version from GET /app-config/version, which the backend derives
// from Apple's iTunes Lookup API. NO version literals live here — shipping
// any future release starts prompting older installs with zero changes.
//
// Failure contract: this runs on launch and must never be able to stop the
// app from opening. Any network error, timeout, malformed response, or null
// latestVersion resolves to "show nothing", silently.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import Constants from "expo-constants";
import { API_BASE_URL } from "../config";

const FETCH_TIMEOUT_MS = 3_000;
const SOFT_PROMPT_INTERVAL_MS = 72 * 60 * 60 * 1000; // at most once per 72h
const SOFT_PROMPT_SHOWN_AT_KEY = "pepta:updatePrompt.softShownAt.v1";
// Only used if the backend response somehow lacks a store URL. An app id is
// not a version — the no-version-literals rule still holds.
const FALLBACK_STORE_URL = "https://apps.apple.com/app/id6784368155";

export type UpdateMode = "soft" | "hard";

export interface UpdateConfig {
  latestVersion: string | null;
  minimumVersion: string | null;
  forceUpdate: boolean;
  title: string;
  message: string;
  storeUrl: string;
}

export interface UpdatePrompt {
  mode: UpdateMode;
  runningVersion: string;
  latestVersion: string | null;
  title: string;
  message: string;
  storeUrl: string;
}

/**
 * Numeric dot-segment comparison — proper semver ordering, not string
 * comparison: "1.0.10" is newer than "1.0.9". Missing segments count as 0
 * ("1.0" == "1.0.0"); non-numeric segments count as 0 rather than throwing.
 * Returns <0 when a is older than b, 0 when equal, >0 when newer.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .split(".")
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The version this binary is running — from the same app.config.js the build
 * embeds (via expo-constants), never a duplicated constant. */
export function getRunningVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

/**
 * Pure mode selection. Hard wins: running below the minimum with the force
 * flag armed makes the app unusable until updated (dormant until the
 * PEPTA_FORCE_UPDATE env var is set server-side). Soft is any release newer
 * than the running build.
 */
export function selectUpdateMode(
  runningVersion: string,
  config: Pick<UpdateConfig, "latestVersion" | "minimumVersion" | "forceUpdate">,
): UpdateMode | null {
  if (
    config.forceUpdate &&
    config.minimumVersion &&
    compareVersions(runningVersion, config.minimumVersion) < 0
  ) {
    return "hard";
  }
  if (config.latestVersion && compareVersions(runningVersion, config.latestVersion) < 0) {
    return "soft";
  }
  return null;
}

function parseUpdateConfig(payload: unknown): UpdateConfig | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const optionalString = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : null;
  return {
    latestVersion: optionalString(raw.latestVersion),
    minimumVersion: optionalString(raw.minimumVersion),
    forceUpdate: raw.forceUpdate === true,
    title: optionalString(raw.title) ?? "Update available",
    message: optionalString(raw.message) ?? "A new version of Pepta is ready.",
    storeUrl: optionalString(raw.storeUrl) ?? FALLBACK_STORE_URL,
  };
}

async function fetchUpdateConfig(): Promise<UpdateConfig | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/app-config/version`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: unknown };
    return parseUpdateConfig(body?.data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True when a soft prompt was shown within the last 72 hours. Persisted so
 * the throttle survives relaunches. Hard mode never consults this. */
export async function isSoftPromptThrottled(nowMs: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SOFT_PROMPT_SHOWN_AT_KEY);
    if (!raw) return false;
    const shownAt = Date.parse(raw);
    if (!Number.isFinite(shownAt)) return false;
    return nowMs - shownAt < SOFT_PROMPT_INTERVAL_MS;
  } catch {
    return false;
  }
}

export async function markSoftPromptShown(nowMs: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(SOFT_PROMPT_SHOWN_AT_KEY, new Date(nowMs).toISOString());
  } catch {
    // Throttle bookkeeping must never surface as an error.
  }
}

/**
 * The single entry point. Resolves to a prompt to display, or null for
 * "show nothing" — which is also the answer to every failure.
 */
export async function checkForUpdate(): Promise<UpdatePrompt | null> {
  try {
    const runningVersion = getRunningVersion();
    if (!runningVersion) return null;
    const config = await fetchUpdateConfig();
    if (!config) return null;
    const mode = selectUpdateMode(runningVersion, config);
    if (!mode) return null;
    if (mode === "soft" && (await isSoftPromptThrottled(Date.now()))) return null;
    return {
      mode,
      runningVersion,
      latestVersion: config.latestVersion,
      title: config.title,
      message: config.message,
      storeUrl: config.storeUrl,
    };
  } catch {
    return null;
  }
}

/** Opens the App Store product page: itms-apps first (straight into the
 * store app), https as the fallback. */
export async function openAppStore(storeUrl: string): Promise<void> {
  const httpsUrl = storeUrl.startsWith("https://") ? storeUrl : FALLBACK_STORE_URL;
  const itmsUrl = httpsUrl.replace(/^https:\/\//, "itms-apps://");
  try {
    await Linking.openURL(itmsUrl);
  } catch {
    try {
      await Linking.openURL(httpsUrl);
    } catch {
      // Nowhere left to go; never throw out of a button handler.
    }
  }
}
