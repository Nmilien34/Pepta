import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { MealCamera } from "./MealCamera";
import { ProgressPhotoCapture } from "./ProgressPhotoCapture";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  Modal: ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("Modal", { visible }, children) : null),
  Pressable: ({
    children,
    ...props
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: false }, vi.fn()],
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Error: "error", Success: "success" },
}));

vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Path: "Path",
  Rect: "Rect",
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textSecondary: "#666",
      warning: "#f59e0b",
    },
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    createPhotoUploadIntent: vi.fn(),
    uploadToPresignedUrl: vi.fn(),
    confirmPhoto: vi.fn(),
  },
}));

vi.mock("../screens/app/progressView", () => ({
  formatShortDate: () => "Jul 9",
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Text", null, children),
}));

vi.mock("./Button", () => ({
  Button: ({ label }: { label: string }) =>
    React.createElement("Button", null, label),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

describe("camera permission prompts", () => {
  it("uses a neutral Continue button before meal camera permission", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <MealCamera
          visible
          onClose={vi.fn()}
          onCapture={vi.fn()}
          onSearch={vi.fn()}
          onVoice={vi.fn()}
        />,
      );
    });

    expect(nodeText(tree!.root)).toContain("Continue");
    expect(nodeText(tree!.root)).not.toContain("Allow camera");
  });

  it("uses a neutral Continue button before progress photo camera permission", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <ProgressPhotoCapture
          visible
          onClose={vi.fn()}
          onSaved={vi.fn()}
          recentPhotos={[]}
        />,
      );
    });

    expect(nodeText(tree!.root)).toContain("Continue");
    expect(nodeText(tree!.root)).not.toContain("Allow camera");
  });
});
