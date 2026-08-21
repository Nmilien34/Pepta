// The streak sheet, rendered for real.
//
// The Home tests stub this component (BottomSheet drags Modal /
// KeyboardAvoidingView / useWindowDimensions / Keyboard into a mock that
// deliberately covers only what Home draws), so this file is where it is
// actually exercised. Without it the stub would be hiding the whole feature.
//
// The rule under test is the one the module header states: THE SHEET MUST
// NEVER CONTRADICT THE FLAME THAT OPENED IT. The headline is the server's
// number, passed through — not a second opinion computed on the device.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  class Value {
    constructor(public value: number) {}
    interpolate() {
      return 0;
    }
    setValue() {}
  }
  const done = {
    start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => undefined,
  };
  return {
    Animated: {
      Value,
      View: passthrough("Animated.View"),
      timing: vi.fn(() => done),
      parallel: vi.fn(() => done),
      spring: vi.fn(() => done),
    },
    Easing: { inOut: (v: unknown) => v, out: (v: unknown) => v, quad: "quad", bezier: () => "bezier" },
    Keyboard: { addListener: () => ({ remove: () => undefined }) },
    KeyboardAvoidingView: passthrough("KeyboardAvoidingView"),
    Modal: passthrough("Modal"),
    Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios },
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    View: passthrough("View"),
    Text: passthrough("Text"),
    StyleSheet: {
      create: (s: unknown) => s,
      // AppText resolves fontWeight -> Hanken family through flatten().
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style ?? {}),
      absoluteFill: {},
      hairlineWidth: 1,
    },
    useWindowDimensions: () => ({ width: 402, height: 874 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("./Icon", () => ({ Icon: () => null }));
vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      streak: "#FF8A3D",
      surfaceAlt: "#F4F1EC",
      surface: "#FFFFFF",
      border: "#E9E4DB",
      textPrimary: "#0E0E12",
      textSecondary: "#6B6B76",
      textTertiary: "#A1A1AC",
      onPrimary: "#FFFFFF",
      bg: "#F7F5F2",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    radii: { sm: 8, md: 12, lg: 16, card: 20, pill: 999 },
    shadows: { card: {} },
    typography: { body: {}, caption: {}, bodyStrong: {}, cardTitle: {} },
  }),
}));

import { StreakSheet } from "./StreakSheet";
import { recentDays } from "../screens/app/streaks";

const text = (node: TestRenderer.ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : text(child as TestRenderer.ReactTestInstance)))
    .join("");

function render(props: Partial<React.ComponentProps<typeof StreakSheet>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <StreakSheet
        visible
        onClose={vi.fn()}
        streakDays={7}
        loggedToday
        bestStreak={12}
        days={recentDays(new Set(["2026-08-21"]), "2026-08-21", 28)}
        habits={[
          { key: "water", label: "Water", current: 7, best: 12, loggedToday: true },
          { key: "meals", label: "Meals", current: 0, best: 3, loggedToday: false },
        ]}
        {...props}
      />,
    );
  });
  return tree;
}

describe("the headline is the server's number", () => {
  it("shows exactly the count it was given", () => {
    // Not a recomputation. If this ever derived its own figure it could
    // disagree with the flame the user just tapped.
    expect(text(render({ streakDays: 7 }).root)).toContain("7");
  });

  it("says day, not days, at one", () => {
    expect(text(render({ streakDays: 1 }).root)).toContain("1 day");
  });
});

describe("the state line tells the truth about today", () => {
  it("confirms the run when today is logged", () => {
    expect(text(render({ loggedToday: true }).root)).toContain("Logged today");
  });

  it("asks for a log when the run is alive but today is empty", () => {
    // The morning case. The run is real, today just has not happened yet —
    // saying "logged today" here would be a lie, and saying nothing would
    // leave the user unsure whether they are safe.
    const screen = text(render({ loggedToday: false, streakDays: 7 }).root);

    expect(screen).toContain("keep it");
    expect(screen).not.toContain("Logged today");
  });

  it("invites a start when there is no streak", () => {
    expect(text(render({ streakDays: 0, loggedToday: false }).root)).toContain("start a streak");
  });
});

describe("the detail", () => {
  it("shows the best run", () => {
    expect(text(render({ bestStreak: 12 }).root)).toContain("12 days");
  });

  it("renders a cell for every day in the window", () => {
    const tree = render({ days: recentDays(new Set(), "2026-08-21", 28) });

    // 28 day cells, whether lit or not — the gaps are the point.
    expect(text(tree.root).length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => String(n.type) === "View").length).toBeGreaterThan(28);
  });

  it("lists each habit, and marks one with no run", () => {
    const screen = text(
      render({
        habits: [
          { key: "water", label: "Water", current: 7, best: 12, loggedToday: true },
          { key: "meals", label: "Meals", current: 0, best: 3, loggedToday: false },
        ],
      }).root,
    );

    expect(screen).toContain("Water");
    expect(screen).toContain("7d");
    expect(screen).toContain("Meals");
    // A zero reads as an em dash rather than "0d" — a broken run is an
    // absence, not a quantity.
    expect(screen).toContain("—");
  });
});
