// The first-run Home, end to end: the Get started checklist and the medication
// level card in their brand-new-user state.
//
// The view-model is covered in planView.test.ts. What this covers is the part
// a user actually touches — that the checklist renders every task, that a
// pending row opens the right sheet, that a completed row is inert, and that
// the level card admits it has nothing rather than drawing a curve.

import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  data: { home: null as unknown, track: null as unknown },
  openQuickLog: vi.fn(),
  openMeal: vi.fn(),
}));

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate() {
      return 0;
    }
    setValue() {}
  }
  const finished = {
    start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => undefined,
  };
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    ActivityIndicator: "ActivityIndicator",
    Animated: {
      Value,
      View: "Animated.View",
      Text: "Animated.Text",
      ScrollView: "Animated.ScrollView",
      timing: vi.fn(() => finished),
      spring: vi.fn(() => finished),
      sequence: vi.fn(() => finished),
      loop: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
      createAnimatedComponent: (c: unknown) => c,
      event: vi.fn(() => vi.fn()),
    },
    Easing: { inOut: (v: unknown) => v, out: (v: unknown) => v, quad: "quad", cubic: "cubic", bezier: () => "bezier" },
    Image: passthrough("Image"),
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
    Pressable: passthrough("Pressable"),
    RefreshControl: "RefreshControl",
    ScrollView: passthrough("ScrollView"),
    Text: passthrough("Text"),
    TouchableOpacity: passthrough("TouchableOpacity"),
    View: passthrough("View"),
  };
});
vi.mock("react-native-svg", () => {
  const passthrough = (name: string) =>
    ({ children }: { children?: React.ReactNode }) => React.createElement(name, null, children);
  return {
    default: passthrough("Svg"),
    Svg: passthrough("Svg"),
    ClipPath: passthrough("ClipPath"),
    Defs: passthrough("Defs"),
    Ellipse: passthrough("Ellipse"),
    G: passthrough("G"),
    LinearGradient: passthrough("LinearGradient"),
    Path: passthrough("Path"),
    Rect: passthrough("Rect"),
    Stop: passthrough("Stop"),
    Circle: passthrough("Circle"),
    Text: passthrough("SvgText"),
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const passthrough = (name: string) =>
    ({ children }: { children?: React.ReactNode }) => React.createElement(name, null, children);
  return {
    AppText: passthrough("AppText"),
    Button: passthrough("Button"),
    Card: passthrough("Card"),
    CountUp: passthrough("CountUp"),
    GlassEdge: passthrough("GlassEdge"),
    DataHealthCardView: passthrough("DataHealthCardView"),
    LogDoseCta: passthrough("LogDoseCta"),
    Mascot: passthrough("Mascot"),
    ProgressBar: passthrough("ProgressBar"),
    ProgressRing: passthrough("ProgressRing"),
    Reveal: passthrough("Reveal"),
    SectionErrorBanner: passthrough("SectionErrorBanner"),
    WaterCup: passthrough("WaterCup"),
  };
});
vi.mock("../../components/LivingMascot", () => ({
  LivingMascot: () => React.createElement("LivingMascot"),
}));
vi.mock("../../components/Icon", () => ({ Icon: () => null }));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", text: "#000", card: "#fff", primary: "#7C5CFC", border: "#eee",
      surface: "#fff", surfaceAlt: "#f4f1ec", textPrimary: "#000", textSecondary: "#666",
      textTertiary: "#999", success: "#0a0", warning: "#fa0", danger: "#f00",
      primarySoft: "#eee", chipBg: "#eee", water: "#2FA8FF", fiber: "#34C759",
      protein: "#FF8A3D", weight: "#7C5CFC", activity: "#FF6B5A", streak: "#FF8A3D",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    radii: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
    shadows: { card: {} },
  }),
}));
vi.mock("../../services/api", () => ({ api: { getCoachNotes: vi.fn(() => Promise.resolve([])) } }));
vi.mock("../../services/aiConsent", () => ({ hasAIDataSharingConsent: vi.fn(() => Promise.resolve(false)) }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));
vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.data.home,
    track: mocks.data.track,
    schedules: null,
    cycles: [],
    homeLoading: false,
    homeError: null,
    homeRefreshing: false,
    homeRange: "today",
    refreshHome: vi.fn(),
    refreshTrack: vi.fn(),
    refreshScheduling: vi.fn(),
    bumpProtein: vi.fn(),
    bumpWater: vi.fn(),
    bumpFiber: vi.fn(),
  }),
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openQuickLog: mocks.openQuickLog, openMeal: mocks.openMeal }),
}));

import { homeResponseSchema, trackResponseSchema, type HomeResponse } from "@pepta/shared";
import { HomeScreen } from "./HomeScreen";
import { recentDayLetters } from "./homeView";

const prod = homeResponseSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", "prod-home.json"), "utf8")).data,
);

/** Nothing logged, every list the screen reads present and empty. */
const EMPTY_TRACK = trackResponseSchema.parse({
  doseLogs: [],
  mealLogs: [],
  waterLogs: [],
  proteinLogs: [],
  activityLogs: [],
  sideEffectLogs: [],
  measurements: [],
});

/** Day one: account made, medication chosen, nothing logged, no level yet. */
function firstRun(): HomeResponse {
  return {
    ...prod,
    setupProgress: { loggedItems: 1, required: 5, unlocked: false },
    medicationLevels: [],
    todayCalories: 0,
    todayProteinGrams: 0,
    todayFiberGrams: 0,
    todayWaterOz: 0,
    latestWeight: null,
  } as HomeResponse;
}

function render(home: HomeResponse) {
  mocks.data.home = home;
  mocks.data.track = EMPTY_TRACK;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<HomeScreen />);
  });
  return tree;
}

/** Every string the screen renders, flattened. */
function texts(tree: TestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance) => {
    for (const child of node.children) {
      if (typeof child === "string") out.push(child);
      else walk(child);
    }
  };
  walk(tree.root);
  return out;
}

/** The joined label of a task row, so split text nodes still match. */
function rowWithText(tree: TestRenderer.ReactTestRenderer, needle: string) {
  return tree.root
    .findAll((n) => String(n.type) === "Pressable")
    .find((row) => texts({ root: row } as TestRenderer.ReactTestRenderer).join(" ").includes(needle));
}

beforeEach(() => {
  mocks.openQuickLog.mockClear();
  mocks.openMeal.mockClear();
});

describe("Home · first run — the Get started checklist", () => {
  it("shows every task, with the medication named", () => {
    const all = texts(render(firstRun())).join("\n");
    expect(all).toContain("Get started");
    expect(all).toContain("Create your account");
    expect(all).toContain("Log your first meal");
    expect(all).toContain("Add a glass of water");
    expect(all).toContain("Check in your weight");
    // The shot task names the user's own compound rather than saying "shot".
    expect(all).toMatch(/Log your first \w+ (shot|dose)/);
  });

  it("counts the done tasks in the header", () => {
    // Account is done; nothing else is logged on day one.
    expect(texts(render(firstRun())).join(" ")).toMatch(/\b1\b.*\bof\b.*\b5\b/s);
  });

  it("opens the meal sheet from the meal row", () => {
    const tree = render(firstRun());
    const row = rowWithText(tree, "Log your first meal");
    expect(row).toBeDefined();
    act(() => {
      row!.props.onPress();
    });
    expect(mocks.openMeal).toHaveBeenCalledTimes(1);
  });

  it("opens the weight sheet from the weight row", () => {
    const tree = render(firstRun());
    act(() => {
      rowWithText(tree, "Check in your weight")!.props.onPress();
    });
    expect(mocks.openQuickLog).toHaveBeenCalledWith("weight");
  });

  it("leaves a completed row inert — it is a receipt, not a button", () => {
    const tree = render(firstRun());
    const done = rowWithText(tree, "Create your account")!;
    expect(done.props.disabled).toBe(true);
    act(() => {
      done.props.onPress();
    });
    expect(mocks.openMeal).not.toHaveBeenCalled();
    expect(mocks.openQuickLog).not.toHaveBeenCalled();
  });

  it("disappears once the backend unlocks the dashboard", () => {
    const unlocked = { ...firstRun(), setupProgress: { loggedItems: 5, required: 5, unlocked: true } } as HomeResponse;
    expect(texts(render(unlocked)).join("\n")).not.toContain("Get started");
  });
});

describe("Home · first run — the medication level card", () => {
  it("admits it has nothing instead of drawing a curve", () => {
    const all = texts(render(firstRun())).join("\n");
    expect(all).toContain("No doses yet");
    expect(all).toContain("—");
    expect(all).toContain("Current estimate");
    expect(all).toMatch(/Log your first (shot|dose) to start tracking levels\./);
  });

  it("labels the ghost bars with the real week, ending today", () => {
    const all = texts(render(firstRun()));
    const letters = recentDayLetters(new Date());
    // The seven day letters appear in order somewhere in the render.
    const joined = all.join("");
    let cursor = -1;
    for (const letter of letters) {
      cursor = joined.indexOf(letter, cursor + 1);
      expect(cursor, `missing day letter ${letter}`).toBeGreaterThan(-1);
    }
  });
});
