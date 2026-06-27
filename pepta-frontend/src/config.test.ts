import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
  }
  vi.resetModules();
});

async function loadConfig(apiBaseUrl?: string) {
  vi.resetModules();
  if (apiBaseUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = apiBaseUrl;
  }
  return import("./config");
}

describe("legal page URLs", () => {
  it("defaults to the backend legal routes for the active API base URL", async () => {
    const { PRIVACY_URL, TERMS_URL } = await loadConfig();

    expect(TERMS_URL).toBe("http://localhost:8080/legal/terms");
    expect(PRIVACY_URL).toBe("http://localhost:8080/legal/privacy");
  });

  it("uses configured backend legal routes without double slashes", async () => {
    const { PRIVACY_URL, TERMS_URL } = await loadConfig(
      "https://pepta-backend.onrender.com/",
    );

    expect(TERMS_URL).toBe("https://pepta-backend.onrender.com/legal/terms");
    expect(PRIVACY_URL).toBe(
      "https://pepta-backend.onrender.com/legal/privacy",
    );
  });
});
