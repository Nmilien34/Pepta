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
  Keyboard: { addListener: vi.fn(() => ({ remove: vi.fn() })) },
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
      button: { height: 56, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 22 },
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

const dataMocks = vi.hoisted(() => ({
  // Per-test route for the single active compound. undefined = legacy record
  // with no route — which must behave exactly like injection.
  compoundRoute: undefined as "oral" | "injection" | undefined,
  // Stable across renders so a test can count how many saves one sheet made.
  saveLog: vi.fn(async () => "saved" as const),
  bumpWater: vi.fn(),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    saveLog: dataMocks.saveLog,
    addDoseLog: vi.fn(),
    addMeasurement: vi.fn(),
    addSideEffectLog: vi.fn(),
    addWeightLog: vi.fn(),
    bumpProtein: vi.fn(),
    bumpWater: dataMocks.bumpWater,
    home: {
      activeCompounds: [
        {
          id: "compound_1",
          name: "Mounjaro",
          plannedDose: 2.5,
          doseUnit: "mg",
          route: dataMocks.compoundRoute,
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

vi.mock("./LivingMascot", () => ({
  // Real one pulls in react-native-svg, which this suite does not transform.
  LivingMascot: "LivingMascot",
}));

vi.mock("./BodyMap", () => ({
  BodyMap: (props: object) => React.createElement("BodyMap", props),
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
    // The footer must never shrink away (the safe-area padding provides the
    // bottom clearance instead of a hardcoded margin).
    expect(shotButton.parent?.props.style).toMatchObject({
      flexShrink: 0,
    });
    expect(shotButton.parent?.props.style.marginBottom).toBeUndefined();
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

  it("renders the injection-site picker for injection and route-unknown compounds", async () => {
    for (const route of ["injection", undefined] as const) {
      dataMocks.compoundRoute = route;
      let tree: TestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(
          <QuickLogSheet visible={true} initialMode="dose" onClose={vi.fn()} onMeal={vi.fn()} />,
        );
      });
      expect(
        tree!.root.findAll((node) => String(node.type) === "BodyMap"),
      ).toHaveLength(1);
    }
    dataMocks.compoundRoute = undefined;
  });

  it("renders NO injection-site picker for an oral compound — a pill has no site", async () => {
    dataMocks.compoundRoute = "oral";
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet visible={true} initialMode="dose" onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });
    expect(
      tree!.root.findAll((node) => String(node.type) === "BodyMap"),
    ).toHaveLength(0);
    dataMocks.compoundRoute = undefined;
  });

  it("uses DOSE wording throughout the sheet for an oral compound", async () => {
    dataMocks.compoundRoute = "oral";
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet visible={true} initialMode="dose" onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });
    const text = textContent(tree!.root);
    expect(text).toContain("Log a dose");
    expect(text).toContain("Log dose");
    expect(text).not.toContain("Log a shot");
    expect(text).not.toContain("Log shot");
    dataMocks.compoundRoute = undefined;
  });

  it("keeps SHOT wording byte-identical for injection and route-undefined", async () => {
    for (const route of ["injection", undefined] as const) {
      dataMocks.compoundRoute = route;
      let tree: TestRenderer.ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(
          <QuickLogSheet visible={true} initialMode="dose" onClose={vi.fn()} onMeal={vi.fn()} />,
        );
      });
      const text = textContent(tree!.root);
      expect(text).toContain("Log a shot");
      expect(text).toContain("Log shot");
      expect(text).not.toContain("Log a dose");
    }
    dataMocks.compoundRoute = undefined;
  });

  it("names the saved toast by route", async () => {
    for (const [route, expected] of [["oral", "Dose saved"], ["injection", "Shot saved"]] as const) {
      dataMocks.compoundRoute = route;
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
      const label = route === "oral" ? "Save dose now" : "Save shot now";
      await act(async () => {
        tree!.root.findByProps({ label }).props.onPress();
      });
      expect(onQuickShotSaved).toHaveBeenCalledWith(
        expect.objectContaining({ title: expected }),
      );
    }
    dataMocks.compoundRoute = undefined;
  });

  // close() only starts the dismiss animation, so the CTA stays mounted and
  // hittable for the duration. Two taps used to mean two independently-keyed
  // logs — two doses on the chart from one intent, and the idempotency key
  // cannot dedupe them because each press mints its own.
  it("saves once no matter how many times the CTA is pressed", async () => {
    dataMocks.saveLog.mockClear();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet visible={true} onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });

    const shotButton = tree!.root.findByProps({ label: "Save shot now" });
    await act(async () => {
      shotButton.props.onPress();
      shotButton.props.onPress();
      shotButton.props.onPress();
    });

    expect(dataMocks.saveLog).toHaveBeenCalledTimes(1);
  });

  it("re-arms the CTA when the sheet is opened again", async () => {
    dataMocks.saveLog.mockClear();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <QuickLogSheet visible={true} onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });
    await act(async () => {
      tree!.root.findByProps({ label: "Save shot now" }).props.onPress();
    });

    // Close, then reopen — the next log is a new intent, not a double tap.
    await act(async () => {
      tree!.update(
        <QuickLogSheet visible={false} onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });
    await act(async () => {
      tree!.update(
        <QuickLogSheet visible={true} onClose={vi.fn()} onMeal={vi.fn()} />,
      );
    });
    await act(async () => {
      tree!.root.findByProps({ label: "Save shot now" }).props.onPress();
    });

    expect(dataMocks.saveLog).toHaveBeenCalledTimes(2);
  });
});
