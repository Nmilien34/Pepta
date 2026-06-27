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

// Legal pages served by the active backend for onboarding, settings, and App Store metadata.
export const TERMS_URL = `${API_BASE_URL}/legal/terms`;
export const PRIVACY_URL = `${API_BASE_URL}/legal/privacy`;
