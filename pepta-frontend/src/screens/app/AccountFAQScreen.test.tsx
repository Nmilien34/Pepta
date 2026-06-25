import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountFAQScreen } from "./AccountFAQScreen";

const mocks = vi.hoisted(() => ({
  goBack: vi.fn(),
}));

vi.mock("react-native", () => ({
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
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fafafa",
      border: "#eee",
      primary: "#8B5CF6",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    shadows: { card: {} },
    sizes: { card: { borderRadius: 24 } },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Text", null, children),
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

function pressableContaining(
  root: TestRenderer.ReactTestRenderer["root"],
  text: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        nodeText(node).includes(text),
    )
    .at(0);
  if (!match) throw new Error(`No Pressable containing "${text}"`);
  return match;
}

describe("AccountFAQScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Pepta FAQ groups and expands answers", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<AccountFAQScreen />);
    });

    expect(nodeText(tree!.root)).toContain("FAQ");
    expect(nodeText(tree!.root)).toContain("MEAL SCANS");
    expect(nodeText(tree!.root)).toContain("What happens to meal photos?");
    expect(nodeText(tree!.root)).not.toContain(
      "Meal scan photos are uploaded to S3",
    );

    await act(async () => {
      pressableContaining(
        tree!.root,
        "What happens to meal photos?",
      ).props.onPress();
    });

    expect(nodeText(tree!.root)).toContain(
      "Meal scan photos are uploaded to S3",
    );
  });
});
