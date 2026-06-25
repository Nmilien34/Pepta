import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { QuickLogSheet } from "./QuickLogSheet";

vi.mock("react-native", () => ({
  Animated: {
    Value: vi.fn(() => ({})),
    View: "Animated.View",
    parallel: vi.fn(() => ({ start: (done?: () => void) => done?.() })),
    spring: vi.fn(() => ({})),
    timing: vi.fn(() => ({})),
  },
  Easing: {
    in: vi.fn((value) => value),
    out: vi.fn((value) => value),
    quad: "quad",
  },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
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
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  View: "View",
  useWindowDimensions: () => ({ height: 667, width: 375 }),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ bottom: 34, top: 0, left: 0, right: 0 }),
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
      fiber: "#22c55e",
      onPrimary: "#fff",
      primary: "#8B5CF6",
      primaryGradientEnd: "#A855F7",
      primaryGradientStart: "#8B5CF6",
      protein: "#f97316",
      success: "#22c55e",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
      warning: "#f59e0b",
      water: "#38bdf8",
      weight: "#a78bfa",
    },
    radii: { card: 20, pill: 999 },
    shadows: { card: {} },
    spacing: { sm: 8 },
    sizes: {
      button: { height: 56, borderRadius: 18, paddingHorizontal: 16 },
    },
    motion: {
      scale: { pressIn: 0.98, pressOut: 1 },
      springs: { press: {} },
    },
    typography: {
      body: {},
      bodyStrong: {},
      button: {},
      caption: {},
      cardTitle: {},
      statBig: {},
    },
  }),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    addDoseLog: vi.fn(),
    addMeasurement: vi.fn(),
    addSideEffectLog: vi.fn(),
    addWeightLog: vi.fn(),
    bumpProtein: vi.fn(),
    bumpWater: vi.fn(),
    home: {
      activeCompounds: [
        {
          id: "compound_1",
          name: "Mounjaro",
          plannedDose: 2.5,
          doseUnit: "mg",
        },
      ],
      latestWeight: { value: 180, unit: "lb" },
      profile: { weightUnit: "lb", heightUnit: "in" },
    },
    homeLoading: false,
    refreshHome: vi.fn(() => Promise.resolve()),
    refreshProgress: vi.fn(() => Promise.resolve()),
    refreshTrack: vi.fn(() => Promise.resolve()),
    track: { doseLogs: [] },
  }),
}));

vi.mock("../services/api", () => ({
  api: {
    createActivityLog: vi.fn(() => Promise.resolve()),
    createDoseLog: vi.fn(() => Promise.resolve()),
    createMeasurement: vi.fn(() => Promise.resolve()),
    createSideEffectLog: vi.fn(() => Promise.resolve()),
    createWeightLog: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("./Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("Button", { label, onPress }, label),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./AddCompoundSheet", () => ({
  AddCompoundSheet: () => null,
}));

vi.mock("./BodyMap", () => ({
  BodyMap: () => null,
}));

vi.mock("./ProgressBar", () => ({
  ProgressBar: () => null,
}));

vi.mock("./RulerPicker", () => ({
  RulerPicker: () => null,
}));

vi.mock("./onboarding/Chip", () => ({
  Chip: ({ label }: { label: string }) =>
    React.createElement("Chip", null, label),
}));

vi.mock("./onboarding/SegmentedToggle", () => ({
  SegmentedToggle: () => null,
}));

function textContent(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : textContent(child as TestRenderer.ReactTestInstance),
    )
    .join("");
}

describe("QuickLogSheet", () => {
  it("keeps the chooser compact, closable, and lifted above the bottom edge", async () => {
    const onClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet visible={true} onClose={onClose} onMeal={vi.fn()} />,
      );
    });

    const safeArea = tree!.root.find(
      (node) => String(node.type) === "SafeAreaView",
    );
    const scrollView = tree!.root.find(
      (node) => String(node.type) === "ScrollView",
    );
    const keyboardAvoidingView = tree!.root.find(
      (node) => String(node.type) === "KeyboardAvoidingView",
    );
    const sheetFrame = tree!.root.find(
      (node) =>
        String(node.type) === "Animated.View" &&
        node.props.style?.borderTopLeftRadius === 28,
    );
    const shotButton = tree!.root.findByProps({ label: "Save shot now" });
    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close log sheet",
    });

    expect(sheetFrame.props.style.height).toBeUndefined();
    expect(sheetFrame.props.style).toMatchObject({
      maxHeight: Math.round(667 * 0.84) + 34,
    });
    expect(keyboardAvoidingView.props.style).toMatchObject({ bottom: 0 });
    expect(safeArea.props.style).toEqual({ maxHeight: "100%" });
    expect(scrollView.props.style).toEqual({ flexShrink: 1 });
    expect(scrollView.props.contentContainerStyle).toMatchObject({
      paddingBottom: 8,
    });
    expect(shotButton.parent?.props.style).toMatchObject({
      marginBottom: 24,
    });
    expect(shotButton).toBeDefined();

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("explains the quick shot and announces when the record is saved", async () => {
    const onQuickShotSaved = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet
          visible={true}
          onClose={vi.fn()}
          onMeal={vi.fn()}
          onQuickShotSaved={onQuickShotSaved}
        />,
      );
    });

    expect(textContent(tree!.root)).toContain(
      "Tap below to save 2.5 mg of Mounjaro as today’s shot.",
    );
    expect(textContent(tree!.root)).toContain(
      "Need to change dose or site? Use Log a shot above.",
    );

    const shotButton = tree!.root.findByProps({ label: "Save shot now" });

    await act(async () => {
      shotButton.props.onPress();
    });

    expect(onQuickShotSaved).toHaveBeenCalledWith({
      title: "Shot saved",
      detail: "Mounjaro · 2.5 mg logged for today",
    });
  });
});
