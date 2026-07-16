import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PepCompanion } from "./PepCompanion";

const mocks = vi.hoisted(() => ({
  coachChat: vi.fn(),
  getCoachNotes: vi.fn(),
  hasAIDataSharingConsent: vi.fn(),
  saveAIDataSharingConsent: vi.fn(),
  openMeal: vi.fn(),
  openQuickLog: vi.fn(),
  safeAreaInsets: { top: 59, bottom: 34, left: 0, right: 0 },
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {
    Value: vi.fn(() => ({
      interpolate: vi.fn(() => "interpolated"),
    })),
    View: "Animated.View",
    spring: vi.fn(() => ({ start: vi.fn() })),
  },
  KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("KeyboardAvoidingView", props, children),
  Modal: ({
    visible,
    children,
    ...props
  }: {
    visible?: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("Modal", props, children) : null),
  Platform: { OS: "ios" },
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
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", props, children),
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
  useSafeAreaInsets: () => mocks.safeAreaInsets,
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      danger: "#dc2626",
      primary: "#7C5CFC",
      primarySoft: "#EFEBFF",
      surface: "#fff",
      surfaceAlt: "#f6f6f7",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    shadows: { card: {} },
    sizes: { hitSlop: 10 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  }),
}));

vi.mock("./AppText", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./Mascot", () => ({
  Mascot: "Mascot",
}));

vi.mock("./Float", () => ({
  Float: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("Float", null, children),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: { todayProteinGrams: 40 } }),
}));

vi.mock("../context/LogSheetsContext", () => ({
  useLogSheets: () => ({
    openMeal: mocks.openMeal,
    openQuickLog: mocks.openQuickLog,
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    coachChat: mocks.coachChat,
    getCoachNotes: mocks.getCoachNotes,
  },
}));

vi.mock("../services/aiConsent", () => ({
  hasAIDataSharingConsent: mocks.hasAIDataSharingConsent,
  saveAIDataSharingConsent: mocks.saveAIDataSharingConsent,
}));

vi.mock("../screens/app/companionNotes", () => ({
  buildCompanionNotes: () => [
    {
      id: "first",
      text: "First Pep note.",
      tone: "nudge",
    },
    {
      id: "second",
      text: "Second Pep note.",
      tone: "nudge",
    },
  ],
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

function button(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityLabel === label,
    )
    .at(0);
  if (!match) throw new Error(`No button named "${label}"`);
  return match;
}

function pressableContaining(
  root: TestRenderer.ReactTestRenderer["root"],
  text: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Pressable" && nodeText(node).includes(text),
    )
    .at(0);
  if (!match) throw new Error(`No pressable containing "${text}"`);
  return match;
}

function allText(root: TestRenderer.ReactTestRenderer["root"]): string {
  return root
    .findAll((node) => (node.type as unknown) === "Text")
    .map(nodeText)
    .join("\n");
}

function styleObject(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(styleObject));
  }
  return style && typeof style === "object" ? (style as Record<string, unknown>) : {};
}

async function openChat(tree: TestRenderer.ReactTestRenderer): Promise<void> {
  await act(async () => {
    vi.runOnlyPendingTimers();
  });

  if (!allText(tree.root).includes("First Pep note.")) {
    await act(async () => {
      await button(tree.root, "Pep — tips and next steps").props.onPress();
    });
  }

  await act(async () => {
    await button(tree.root, "Pep — tips and next steps").props.onPress();
  });

  await act(async () => {
    await button(tree.root, "Pep — tips and next steps").props.onPress();
  });
}

describe("PepCompanion chat handoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.coachChat.mockReset();
    mocks.coachChat.mockResolvedValue({
      reply: "Your next dose is tomorrow. Keep logging meals today.",
      refused: false,
    });
    mocks.getCoachNotes.mockReset();
    mocks.getCoachNotes.mockResolvedValue([]);
    mocks.hasAIDataSharingConsent.mockReset();
    mocks.hasAIDataSharingConsent.mockResolvedValue(true);
    mocks.saveAIDataSharingConsent.mockReset();
    mocks.saveAIDataSharingConsent.mockResolvedValue(undefined);
    mocks.openMeal.mockClear();
    mocks.openQuickLog.mockClear();
    mocks.safeAreaInsets = { top: 59, bottom: 34, left: 0, right: 0 };
  });

  it("keeps the full-screen chat chrome clear of device safe areas", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<PepCompanion />);
    });

    await openChat(tree!);

    const header = tree!.root
      .findAll((node) => {
        const style = styleObject(node.props.style);
        return (
          (node.type as unknown) === "View" &&
          style.borderBottomWidth === 0.5 &&
          nodeText(node).includes("Ask Pep")
        );
      })
      .at(0);
    const composer = tree!.root
      .findAll((node) => {
        const style = styleObject(node.props.style);
        return (node.type as unknown) === "View" && style.borderTopWidth === 0.5;
      })
      .at(0);

    if (!header) throw new Error("No Ask Pep header found");
    if (!composer) throw new Error("No Ask Pep input composer found");

    expect(styleObject(header.props.style).paddingTop).toBeGreaterThanOrEqual(
      mocks.safeAreaInsets.top + 10,
    );
    expect(styleObject(composer.props.style).paddingBottom).toBeGreaterThanOrEqual(
      mocks.safeAreaInsets.bottom + 12,
    );
  });

  it("opens chat after the user taps through every current Pep note", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<PepCompanion />);
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    if (!allText(tree!.root).includes("First Pep note.")) {
      await act(async () => {
        await button(tree!.root, "Pep — tips and next steps").props.onPress();
      });
    }
    expect(allText(tree!.root)).toContain("First Pep note.");

    await act(async () => {
      await button(tree!.root, "Pep — tips and next steps").props.onPress();
    });
    expect(allText(tree!.root)).toContain("Second Pep note.");

    await act(async () => {
      await button(tree!.root, "Pep — tips and next steps").props.onPress();
    });

    expect(allText(tree!.root)).toContain("Ask Pep");
    expect(allText(tree!.root)).toContain("Most asked");

    await act(async () => {
      await pressableContaining(tree!.root, "What should I focus on today?").props.onPress();
    });

    expect(mocks.coachChat).toHaveBeenCalledWith([
      { role: "user", text: "What should I focus on today?" },
    ]);
    expect(allText(tree!.root)).toContain(
      "Your next dose is tomorrow. Keep logging meals today.",
    );
  });
});
