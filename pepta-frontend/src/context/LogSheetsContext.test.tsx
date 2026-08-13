import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogSheetsProvider, useLogSheets } from "./LogSheetsContext";

vi.mock("../components/QuickLogSheet", () => ({
  QuickLogSheet: (props: Record<string, unknown>) =>
    React.createElement("QuickLogSheet", props),
}));

vi.mock("../components/MealLogSheet", () => ({
  MealLogSheet: (props: Record<string, unknown>) =>
    React.createElement("MealLogSheet", props),
}));

vi.mock("react-native", () => ({
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("View", props, children),
}));

// Presentation-only here: this suite tests sheet orchestration, not the
// celebration. It owns hooks and Animated, so it must be mocked rather than
// half-rendered through a minimal react-native mock.
vi.mock("../components/DoseCelebration", () => ({
  DoseCelebrationOverlay: (props: Record<string, unknown>) =>
    React.createElement("DoseCelebrationOverlay", props),
}));

vi.mock("../components/AppText", () => ({
  AppText: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("Text", props, children),
}));

vi.mock("../components/Icon", () => ({
  Icon: "Icon",
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      primary: "#8B5CF6",
      shadow: "#000",
      success: "#22c55e",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
    },
    radii: { card: 20, pill: 999 },
    shadows: { card: {} },
  }),
}));

function Launcher() {
  const { openMeal, openQuickLog } = useLogSheets();
  return React.createElement("Launcher", { openMeal, openQuickLog });
}

function findByMockType(root: TestRenderer.ReactTestInstance, type: string) {
  return root.find((node) => String(node.type) === type);
}

function textContent(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : textContent(child as TestRenderer.ReactTestInstance),
    )
    .join("");
}

describe("LogSheetsProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns to quick log when the meal chooser X is pressed after launching from quick log", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <LogSheetsProvider>
          <Launcher />
        </LogSheetsProvider>,
      );
    });

    const launcher = findByMockType(tree!.root, "Launcher");

    await act(async () => {
      launcher.props.openQuickLog();
    });

    let quickSheet = findByMockType(tree!.root, "QuickLogSheet");
    expect(quickSheet.props.visible).toBe(true);

    await act(async () => {
      quickSheet.props.onMeal();
    });

    quickSheet = findByMockType(tree!.root, "QuickLogSheet");
    expect(quickSheet.props.visible).toBe(false);

    await act(async () => {
      quickSheet.props.onDismissed();
      vi.advanceTimersByTime(40);
    });

    let mealSheet = findByMockType(tree!.root, "MealLogSheet");
    expect(mealSheet.props.visible).toBe(true);
    expect(mealSheet.props.onBack).toBeTypeOf("function");

    await act(async () => {
      mealSheet.props.onBack();
    });

    mealSheet = findByMockType(tree!.root, "MealLogSheet");
    expect(mealSheet.props.visible).toBe(false);

    await act(async () => {
      mealSheet.props.onDismissed();
    });

    quickSheet = findByMockType(tree!.root, "QuickLogSheet");
    expect(quickSheet.props.visible).toBe(true);
  });

  it("shows a short confirmation when quick shot is saved", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <LogSheetsProvider>
          <Launcher />
        </LogSheetsProvider>,
      );
    });

    const quickSheet = findByMockType(tree!.root, "QuickLogSheet");

    await act(async () => {
      quickSheet.props.onQuickShotSaved({
        title: "Shot saved",
        detail: "Mounjaro · 2.5 mg logged for today",
      });
    });

    expect(textContent(tree!.root)).toContain("Shot saved");
    expect(textContent(tree!.root)).toContain(
      "Mounjaro · 2.5 mg logged for today",
    );

    await act(async () => {
      vi.advanceTimersByTime(2400);
    });

    expect(textContent(tree!.root)).not.toContain("Shot saved");
  });

  it("HOLDS the celebration until the sheet has fully dismissed", async () => {
    // QuickLogSheet is a native Modal — on iOS its own window sits ABOVE this
    // tree. Showing the celebration on commit would play the confetti burst and
    // most of the card's spring behind a sheet still animating out, so the user
    // would meet it already half over. It must wait for onDismissed.
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <LogSheetsProvider>
          <Launcher />
        </LogSheetsProvider>,
      );
    });

    const quickSheet = findByMockType(tree!.root, "QuickLogSheet");
    await act(async () => {
      quickSheet.props.onDoseLogged({
        previousDoseCount: 0,
        noun: "shot",
        tracksLevels: true,
      });
    });

    // Still nothing on screen — the sheet is mid-dismiss.
    expect(
      findByMockType(tree!.root, "DoseCelebrationOverlay").props.celebration,
    ).toBeNull();

    await act(async () => {
      findByMockType(tree!.root, "QuickLogSheet").props.onDismissed();
    });

    const shown = findByMockType(tree!.root, "DoseCelebrationOverlay").props
      .celebration as { title: string; burst: boolean };
    expect(shown.title).toBe("You did it!");
    expect(shown.burst).toBe(true);
  });

  it("does not stack a toast and a celebration for one tap", async () => {
    // The one-tap path raises "Shot saved" as well. Two notifications for one
    // action is clutter, and the celebration already says it with the payoff.
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <LogSheetsProvider>
          <Launcher />
        </LogSheetsProvider>,
      );
    });

    const quickSheet = findByMockType(tree!.root, "QuickLogSheet");
    await act(async () => {
      quickSheet.props.onQuickShotSaved({ title: "Shot saved", detail: "2.5 mg logged" });
      quickSheet.props.onDoseLogged({
        previousDoseCount: 0,
        noun: "shot",
        tracksLevels: true,
      });
    });
    await act(async () => {
      findByMockType(tree!.root, "QuickLogSheet").props.onDismissed();
    });

    expect(tree!.root.findAll((n) => String(n.type) === "LogSavedToast")).toHaveLength(0);
    expect(
      findByMockType(tree!.root, "DoseCelebrationOverlay").props.celebration,
    ).not.toBeNull();
  });

  it("still opens the meal sheet when a celebration is also queued", async () => {
    // The flush must not be swallowed by the meal early-return, and vice versa.
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <LogSheetsProvider>
          <Launcher />
        </LogSheetsProvider>,
      );
    });
    const launcher = findByMockType(tree!.root, "Launcher");
    await act(async () => {
      launcher.props.openQuickLog();
    });
    await act(async () => {
      findByMockType(tree!.root, "QuickLogSheet").props.onDoseLogged({
        previousDoseCount: 2,
        noun: "shot",
        tracksLevels: true,
      });
      findByMockType(tree!.root, "QuickLogSheet").props.onMeal();
    });
    await act(async () => {
      findByMockType(tree!.root, "QuickLogSheet").props.onDismissed();
    });

    expect(
      findByMockType(tree!.root, "DoseCelebrationOverlay").props.celebration,
    ).not.toBeNull();
  });
});
