// Regression guard for the crash that took the app down on entry in builds
// 20–22: HomeScreen called useCompanionName/useSeenTeachCards/useMemo AFTER an
// early `if (!home) return`, so the re-render where /home data arrived ran
// more hooks than the render before it. React throws on that, and the root
// boundary showed "Something went wrong" to every user the moment they got in.
//
// This test renders the REAL HomeScreen through the exact transition —
// home: null → home: data — which is invisible to any single-mount test.

import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: { home: null as unknown, track: null as unknown },
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
    // The shortcuts grid renders photo tiles.
    Image: passthrough("Image"),
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
    Dimensions: { get: () => ({ width: 402, height: 874 }) },
    Switch: passthrough('Switch'),
    Pressable: passthrough("Pressable"),
    RefreshControl: "RefreshControl",
    ScrollView: passthrough("ScrollView"),
    Text: passthrough("Text"),
    TouchableOpacity: passthrough("TouchableOpacity"),
    View: passthrough("View"),
  };
});

vi.mock("react-native-svg", () => {
  const comp = (n: string) => n;
  return {
    default: "Svg",
    Svg: "Svg",
    Circle: comp("Circle"),
    ClipPath: comp("ClipPath"),
    Defs: comp("Defs"),
    Ellipse: comp("Ellipse"),
    G: comp("G"),
    Line: comp("Line"),
    LinearGradient: comp("LinearGradient"),
    Path: comp("Path"),
    Rect: comp("Rect"),
    Stop: comp("Stop"),
    Text: comp("SvgText"),
  };
});

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Soft: "soft", Light: "light", Medium: "medium", Rigid: "rigid", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// The barrel is presentation-only from this screen's point of view; the hooks
// whose ORDER this test guards live in HomeScreen itself and in the directly
// imported useCompanionName/useSeenTeachCards, which stay real.
vi.mock("../../components", () => {
  const passthrough = (name: string) =>
    ({ children }: { children?: React.ReactNode }) => React.createElement(name, null, children);
  return {
    AppText: passthrough("AppText"),
    Button: passthrough("Button"),
    Card: passthrough("Card"),
    CardIcon: () => null,
    CountUp: passthrough("CountUp"),
    GlassEdge: passthrough("GlassEdge"),
    // Renders null for users whose data is healthy, which is this fixture —
    // but it owns hooks, so it must exist as a real component or the hook-order
    // assertion below is measuring a crash instead of the order.
    DataHealthCardView: passthrough("DataHealthCardView"),
    // Owns useRef + useState + two useEffects. Same reasoning as above: it has
    // to exist as a real component or this test measures a crash, not order.
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
// The streak sheet is a BottomSheet, which pulls Modal / KeyboardAvoidingView
// / useWindowDimensions / Keyboard into a mock that deliberately covers only
// what Home itself renders. These tests never open the sheet, so stub it
// rather than teaching the mock four more RN internals — StreakSheet has its
// own render test.
vi.mock("../../components/StreakSheet", () => ({ StreakSheet: () => null }));
vi.mock("../../components/Icon", () => ({
  Icon: () => null,
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", text: "#000", card: "#fff", primary: "#7C5CFC", border: "#eee",
      surface: "#fff", textSecondary: "#666", textTertiary: "#999", success: "#0a0",
      warning: "#fa0", danger: "#f00", primarySoft: "#eee", chipBg: "#eee",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    radii: { sm: 8, md: 12, lg: 16, xl: 24 },
    shadows: { card: {} },
  }),
}));
vi.mock("../../services/api", () => ({
  api: { getCoachNotes: vi.fn(() => Promise.resolve([])) },
}));
vi.mock("../../services/aiConsent", () => ({
  hasAIDataSharingConsent: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.data.home,
    track: mocks.data.track,
    // Scheduling drives whether the level card's log button is on screen
    // (doseCta.ts); null reads as "don't know yet", which shows it.
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
  useLogSheets: () => ({ openQuickLog: vi.fn(), openMeal: vi.fn() }),
}));

import { homeResponseSchema } from "@pepta/shared";
import { HomeScreen } from "./HomeScreen";

// The byte-for-byte payload the deployed backend serves (captured via the
// review account). Checked in so this test does not depend on the network.
const home = homeResponseSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", "prod-home.json"), "utf8")).data,
);

describe("HomeScreen hook order across the data transition", () => {
  it("survives home: null → data — the render where the crash lived", async () => {
    mocks.data.home = null;
    mocks.data.track = null;

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<HomeScreen />);
    });
    // Loading state on first render.
    expect(tree.root.findAll((n) => String(n.type) === "ActivityIndicator").length).toBeGreaterThan(0);

    // Data lands; the re-render MUST NOT change the hook count. Before the
    // fix, this update threw "Rendered more hooks than during the previous
    // render" and the root boundary blanked the whole app.
    mocks.data.home = home;
    await act(async () => {
      tree.update(<HomeScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();

    // And back to null (sign-out / refresh failure) must hold too.
    mocks.data.home = null;
    await act(async () => {
      tree.update(<HomeScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
