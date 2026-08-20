import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAvatarViewUrl: vi.fn(),
  auth: {
    isAuthenticated: true,
    user: {
      id: "507f1f77bcf86cd799439011",
      hasAvatar: true,
      avatarUrl: "https://provider.example/must-not-render",
      displayName: "Pepta User",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
  },
}));

vi.mock("react-native", () => ({
  Image: "Image",
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));

vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../services/api", () => ({
  api: { getAvatarViewUrl: mocks.getAvatarViewUrl },
}));
vi.mock("../theme", () => ({
  useTheme: () => ({ colors: { primary: "#7254d6" } }),
}));
vi.mock("./AppText", () => ({ AppText: "AppText" }));

import { UserAvatar } from "./UserAvatar";

describe("UserAvatar signed URL lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes before expiry and never falls back to the provider URL", async () => {
    mocks.getAvatarViewUrl
      .mockResolvedValueOnce({
        viewUrl: "https://signed.example/first",
        expiresAt: "2026-08-19T12:01:00.000Z",
      })
      .mockResolvedValueOnce({
        viewUrl: "https://signed.example/refreshed",
        expiresAt: "2026-08-19T12:02:00.000Z",
      });
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(<UserAvatar />);
    });
    expect(tree.root.find((node) => (node.type as unknown) === "Image").props.source.uri).toBe(
      "https://signed.example/first",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.getAvatarViewUrl).toHaveBeenCalledTimes(2);
    expect(tree.root.find((node) => (node.type as unknown) === "Image").props.source.uri).toBe(
      "https://signed.example/refreshed",
    );
    expect(JSON.stringify(tree.toJSON())).not.toContain("provider.example");

    await act(async () => tree.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders initials when signing fails", async () => {
    mocks.getAvatarViewUrl.mockRejectedValueOnce(new Error("offline"));
    let tree!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(<UserAvatar />);
    });

    expect(
      tree.root.findAll((node) => (node.type as unknown) === "Image"),
    ).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain("provider.example");
  });
});
