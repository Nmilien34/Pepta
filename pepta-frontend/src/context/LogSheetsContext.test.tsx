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
});
