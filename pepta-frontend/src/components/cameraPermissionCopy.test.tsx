import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MealCamera } from "./MealCamera";
import { ProgressPhotoCapture } from "./ProgressPhotoCapture";

const mocks = vi.hoisted(() => ({
  cameraPermission: {
    current: { granted: false, status: "undetermined" },
  },
  requestPermission: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  Linking: {
    openSettings: vi.fn(() => Promise.resolve()),
  },
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
  useCameraPermissions: () => [
    mocks.cameraPermission.current,
    mocks.requestPermission,
  ],
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
  beforeEach(() => {
    mocks.cameraPermission.current = {
      granted: false,
      status: "undetermined",
    };
    mocks.requestPermission.mockClear();
  });

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
    expect(nodeText(tree!.root)).not.toContain("Not now");
  });

  it("offers settings after meal camera permission has been denied", async () => {
    mocks.cameraPermission.current = { granted: false, status: "denied" };
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

    const text = nodeText(tree!.root);
    expect(text).toContain("Open Settings");
    expect(text).toContain("Choose another way");
    expect(text).not.toContain("Continue");
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
    expect(nodeText(tree!.root)).not.toContain("Not now");
  });

  it("offers settings after progress photo camera permission has been denied", async () => {
    mocks.cameraPermission.current = { granted: false, status: "denied" };
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

    const text = nodeText(tree!.root);
    expect(text).toContain("Open Settings");
    expect(text).toContain("Close");
    expect(text).not.toContain("Continue");
  });
});
