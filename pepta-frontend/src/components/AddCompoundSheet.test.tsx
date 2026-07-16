import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AddCompoundSheet } from "./AddCompoundSheet";

const mocks = vi.hoisted(() => ({
  addCompound: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
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

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      danger: "#dc2626",
      onPrimary: "#fff",
      primary: "#8B5CF6",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    sizes: { hitSlop: 10 },
    spacing: { sm: 8, md: 12 },
    typography: { body: {} },
  }),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    addCompound: mocks.addCompound,
  }),
}));

vi.mock("./AppText", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
}));

vi.mock("./BottomSheet", () => ({
  BottomSheet: ({
    visible,
    children,
    ...props
  }: {
    visible: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("BottomSheet", props, children) : null),
}));

vi.mock("./Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("Button", { label, onPress }, label),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./onboarding/Chip", () => ({
  Chip: ({ label }: { label: string }) =>
    React.createElement("Chip", null, label),
}));

vi.mock("./SearchField", () => ({
  SearchField: (props: Record<string, unknown>) =>
    React.createElement("SearchField", props),
}));

describe("AddCompoundSheet", () => {
  it("keeps the medication search sheet usable while the keyboard is open", async () => {
    const onClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <AddCompoundSheet visible={true} onClose={onClose} />,
      );
    });

    const bottomSheet = tree!.root.find(
      (node) => String(node.type) === "BottomSheet",
    );
    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close medication picker",
    });

    expect(bottomSheet.props).toMatchObject({
      avoidKeyboard: false,
      scrollable: true,
    });
    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
