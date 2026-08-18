// The Protein / Fiber screen reads REAL logged data.
//
// Every figure on the card — the pill, the bar fill, and the "N g to go" line
// — has to move when the user's logs move, and has to be today's rather than
// whatever range Home is displaying. These drive the actual screen with
// different data and assert the rendered text differs.

import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openMeal: vi.fn(),
  kind: "protein" as "protein" | "fiber",
  home: null as unknown,
  refreshHome: vi.fn(),
  pendingLogs: 0,
  homeRefreshing: false,
}));

vi.mock("react-native", () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    ActivityIndicator: passthrough("ActivityIndicator"),
    Image: passthrough("Image"),
    Pressable: passthrough("Pressable"),
    RefreshControl: passthrough("RefreshControl"),
    // RN renders the refreshControl element; the passthrough would drop it on
    // the floor as a plain prop and the tests could not see it.
    ScrollView: ({ children, refreshControl, ...props }: { children?: React.ReactNode; refreshControl?: React.ReactNode }) =>
      React.createElement("ScrollView", props, refreshControl, children),
    Text: passthrough("Text"),
    View: passthrough("View"),
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
    Platform: { OS: "ios" },
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate, goBack: vi.fn() }),
  useRoute: () => ({ params: { kind: mocks.kind } }),
  // Real enough to exercise the focus refresh: run the callback, honour its
  // cleanup, exactly as navigation does when the screen comes into view.
  useFocusEffect: (cb: () => undefined | (() => void)) => React.useEffect(cb, [cb]),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const passthrough = (name: string) =>
    ({ children }: { children?: React.ReactNode }) => React.createElement(name, null, children);
  return {
    AppText: passthrough("AppText"),
    Card: passthrough("Card"),
    // Keeps its props so the bar's fill can be asserted.
    ProgressBar: (props: { pct: number }) => React.createElement("ProgressBar", props),
  };
});
vi.mock("../../components/Icon", () => ({ Icon: (props: { name: string }) => React.createElement("Icon", props) }));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", surface: "#fff", surfaceAlt: "#f4f1ec", border: "#eee",
      textPrimary: "#000", textSecondary: "#666", textTertiary: "#999",
      protein: "#FF8A3D", fiber: "#34C759",
    },
    spacing: { sm: 8, md: 12, lg: 16 },
    radii: { pill: 999 },
  }),
}));
vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.home,
    refreshHome: mocks.refreshHome,
    pendingLogs: mocks.pendingLogs,
    homeRefreshing: mocks.homeRefreshing,
  }),
}));
vi.mock("../../services/api", () => ({
  api: {
    getFavourites: vi.fn(async () => ({ favourites: [] })),
    saveFavourite: vi.fn(async () => ({})),
    removeFavourite: vi.fn(async () => ({})),
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (k: string) => store[k] ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: vi.fn(async (k: string) => {
        delete store[k];
      }),
    },
  };
});
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal }),
}));

import { NutrientWaysScreen } from "./NutrientWaysScreen";

function homeWith(loggedProtein: number, target: number | null = 120, extra: object = {}) {
  return {
    profile: target == null ? {} : { dailyProteinTargetGrams: target },
    todayProteinGrams: loggedProtein,
    todayFiberGrams: 0,
    todayWaterOz: 0,
    todayCalories: 0,
    ...extra,
  };
}

function render(home: unknown, kind: "protein" | "fiber" = "protein") {
  mocks.openMeal.mockClear();
  mocks.navigate.mockClear();
  mocks.kind = kind;
  mocks.home = home;
  mocks.refreshHome.mockClear();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<NutrientWaysScreen />);
  });
  return tree;
}

function texts(tree: TestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance) => {
    for (const c of n.children) {
      if (typeof c === "string") out.push(c);
      else walk(c);
    }
  };
  walk(tree.root);
  return out.join("");
}

const barPct = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === "ProgressBar")[0]?.props.pct;

describe("NutrientWaysScreen · the numbers are the user's own", () => {
  it("renders what they logged, not a fixture", () => {
    expect(texts(render(homeWith(74)))).toContain("74 of 120 g");
    expect(texts(render(homeWith(21)))).toContain("21 of 120 g");
    expect(texts(render(homeWith(0)))).toContain("0 of 120 g");
  });

  it("moves the gap line with the logs", () => {
    expect(texts(render(homeWith(74)))).toContain("46 g to go");
    expect(texts(render(homeWith(100)))).toContain("20 g to go");
  });

  it("fills the bar in proportion, and never past full", () => {
    expect(barPct(render(homeWith(0)))).toBe(0);
    expect(barPct(render(homeWith(60)))).toBeCloseTo(0.5);
    expect(barPct(render(homeWith(120)))).toBe(1);
    expect(barPct(render(homeWith(300)))).toBe(1);
  });

  it("follows the user's own target, not a hard-coded 120", () => {
    expect(texts(render(homeWith(74, 160)))).toContain("74 of 160 g");
    expect(texts(render(homeWith(74, 160)))).toContain("86 g to go");
  });

  it("congratulates instead of demanding once the target is met", () => {
    const out = texts(render(homeWith(130)));
    expect(out).toContain("Target met");
    expect(out).not.toContain("to go");
  });

  it("shows TODAY even when Home is displaying a whole week", () => {
    // rangeTotals is what buildHomeView would have used; this screen must not.
    const weekly = homeWith(74, 120, {
      rangeTotals: { label: "This week", dayCount: 7, proteinGrams: 520, calories: 0, fiberGrams: 0, waterOz: 0 },
    });
    const out = texts(render(weekly));
    expect(out).toContain("74 of 120 g");
    expect(out).not.toContain("520");
    expect(out).not.toContain("840");
  });

  it("asks for a loaded state rather than claiming no goal", () => {
    mocks.refreshHome.mockClear();
    const tree = render(null);
    expect(tree.root.findAll((n) => String(n.type) === "ActivityIndicator")).toHaveLength(1);
    // …and it goes and fetches, rather than sitting on an empty screen.
    expect(mocks.refreshHome).toHaveBeenCalled();
    expect(texts(tree)).not.toContain("Set a daily");
  });

  it("says so plainly when the user genuinely has no target", () => {
    const out = texts(render(homeWith(74, null)));
    expect(out).toContain("Set a daily protein target");
    expect(out).not.toContain("of 0 g");
  });

  it("uses the meat icon beside Today, as the frame does", () => {
    const icons = render(homeWith(74)).root
      .findAll((n) => String(n.type) === "Icon")
      .map((n) => n.props.name);
    expect(icons).toContain("food-drumstick");
    expect(icons).not.toContain("leaf");
  });
});

describe("NutrientWaysScreen · staying current", () => {
  it("refetches on focus, so arriving shows today rather than the cache", () => {
    mocks.pendingLogs = 0;
    render(homeWith(74));
    expect(mocks.refreshHome).toHaveBeenCalledTimes(1);
  });

  it("does NOT refetch on top of a queued log", () => {
    // The server has not seen it yet; refreshing would make the user's own
    // entry vanish and come back when the queue drains.
    mocks.pendingLogs = 1;
    render(homeWith(74));
    expect(mocks.refreshHome).not.toHaveBeenCalled();
    mocks.pendingLogs = 0;
  });

  it("offers pull-to-refresh, wired to the same fetch", () => {
    mocks.pendingLogs = 0;
    const tree = render(homeWith(74));
    const rc = tree.root.findAll((n) => String(n.type) === "RefreshControl")[0];
    expect(rc).toBeDefined();
    mocks.refreshHome.mockClear();
    act(() => {
      rc!.props.onRefresh();
    });
    expect(mocks.refreshHome).toHaveBeenCalledTimes(1);
  });

  it("shows the spinner state while a refresh is in flight", () => {
    mocks.homeRefreshing = true;
    const tree = render(homeWith(74));
    expect(tree.root.findAll((n) => String(n.type) === "RefreshControl")[0]!.props.refreshing).toBe(true);
    mocks.homeRefreshing = false;
  });

  it("refetches only once per visit, not on every re-render", () => {
    mocks.pendingLogs = 0;
    const tree = render(homeWith(74));
    mocks.refreshHome.mockClear();
    act(() => {
      tree.update(<NutrientWaysScreen />);
    });
    expect(mocks.refreshHome).not.toHaveBeenCalled();
  });
});

function fiberHome(loggedFiber: number, target: number | null = 30) {
  return {
    profile: target == null ? {} : { dailyFiberTargetGrams: target },
    todayFiberGrams: loggedFiber,
    todayProteinGrams: 0,
    todayWaterOz: 0,
    todayCalories: 0,
  };
}

describe("NutrientWaysScreen · the Fiber side", () => {
  it("shows every section the frame has", () => {
    const out = texts(render(fiberHome(12), "fiber"));
    expect(out).toContain("Fiber");
    expect(out).toContain("Today");
    expect(out).toContain("Easy ways to hit fiber");
    // The one line of why — fiber carries it, protein deliberately does not.
    expect(out).toContain("Constipation is one of the most common");
  });

  it("carries no such note on the protein side", () => {
    expect(texts(render(homeWith(74), "protein"))).not.toContain("Constipation");
  });

  it("reads the user's logged fiber, not protein and not a fixture", () => {
    expect(texts(render(fiberHome(12), "fiber"))).toContain("12 of 30 g");
    expect(texts(render(fiberHome(27), "fiber"))).toContain("27 of 30 g");
  });

  it("moves the bar and the gap line with those logs", () => {
    expect(barPct(render(fiberHome(0), "fiber"))).toBe(0);
    expect(barPct(render(fiberHome(15), "fiber"))).toBeCloseTo(0.5);
    expect(texts(render(fiberHome(12), "fiber"))).toContain("18 g to go");
    expect(texts(render(fiberHome(27), "fiber"))).toContain("3 g to go");
  });

  it("follows the user's own fiber target", () => {
    expect(texts(render(fiberHome(12, 45), "fiber"))).toContain("12 of 45 g");
    expect(texts(render(fiberHome(12, 45), "fiber"))).toContain("33 g to go");
  });

  it("uses the leaf icon beside Today, not the meat one", () => {
    const icons = render(fiberHome(12), "fiber").root
      .findAll((n) => String(n.type) === "Icon")
      .map((n) => n.props.name);
    expect(icons).toContain("leaf");
    expect(icons).not.toContain("food-drumstick");
  });

  it("lists all five examples, in the frame's order, in both the strip and the rows", () => {
    const out = texts(render(fiberHome(12), "fiber"));
    for (const name of ["Oh Oh Cookie Dough", "Edamame", "Avocado", "Almonds", "Psyllium fiber powder"]) {
      expect(out, `missing ${name}`).toContain(name);
    }
    // List order, per the frame. Asserted on names, not gram labels: the
    // labels collide as substrings ("18 g to go" contains "8 g").
    const order = ["Oh Oh Cookie Dough", "Edamame", "Avocado", "Almonds", "Psyllium fiber powder"]
      .map((n) => out.indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Brands as written.
    expect(out).toContain("TRUBAR");
    expect(out).toContain("GoodSense");
  });

  it("scrolls the examples strip rather than clipping them", () => {
    const tree = render(fiberHome(12), "fiber");
    const strips = tree.root.findAll((n) => String(n.type) === "ScrollView" && n.props.horizontal);
    expect(strips).toHaveLength(1);
    // Padding must live on the content, or swiping back clips the first tile.
    expect(strips[0]!.props.contentContainerStyle.paddingHorizontal).toBe(20);
    expect(strips[0]!.props.style.paddingLeft).toBeUndefined();
  });
});

describe("NutrientWaysScreen · tapping a food", () => {
  const rowFor = (tree: TestRenderer.ReactTestRenderer, needle: string) =>
    tree.root
      .findAll((n) => String(n.type) === "Pressable")
      .find((p) => String(p.props.accessibilityLabel).includes(needle));

  it("seeds the meal sheet with the food, not a blank chooser", () => {
    const tree = render(fiberHome(12), "fiber");
    act(() => {
      rowFor(tree, "Edamame")!.props.onPress();
    });
    expect(mocks.openMeal).toHaveBeenCalledWith({
      foodName: "Edamame",
      servingSize: "1 cup, shelled",
      calories: 188,
      fiber: 8,
    });
  });

  it("seeds protein on the protein side", () => {
    const tree = render(homeWith(74), "protein");
    act(() => {
      rowFor(tree, "Chicken breast")!.props.onPress();
    });
    expect(mocks.openMeal).toHaveBeenCalledWith({
      foodName: "Chicken breast",
      servingSize: "4 oz, cooked",
      calories: 185,
      protein: 35,
    });
  });

  it("never invents the macro this screen did not measure", () => {
    // Edamame HAS protein; this screen does not know how much, and logging 0
    // would quietly understate the user's protein for the day.
    const tree = render(fiberHome(12), "fiber");
    act(() => {
      rowFor(tree, "Edamame")!.props.onPress();
    });
    const seed = mocks.openMeal.mock.calls[0]![0] as Record<string, unknown>;
    expect(seed).not.toHaveProperty("protein");

    const tree2 = render(homeWith(74), "protein");
    act(() => {
      rowFor(tree2, "Chicken breast")!.props.onPress();
    });
    expect(mocks.openMeal.mock.calls[0]![0]).not.toHaveProperty("fiber");
  });

  it("seeds from the strip photo too — the frame says tap the photos", () => {
    const tree = render(fiberHome(12), "fiber");
    const photo = tree.root
      .findAll((n) => String(n.type) === "Pressable")
      .find((p) => p.props.accessibilityLabel === "Avocado, 7 g of fiber");
    expect(photo).toBeDefined();
    act(() => {
      photo!.props.onPress();
    });
    expect(mocks.openMeal).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: "Avocado", fiber: 7 }),
    );
  });
});

describe("NutrientWaysScreen · Yours", () => {
  const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
    const p = tree.root
      .findAll((n) => String(n.type) === "Pressable")
      .find((x) => x.props.accessibilityLabel === label);
    expect(p, `no pressable labelled "${label}"`).toBeDefined();
    act(() => {
      p!.props.onPress();
    });
  };

  it("offers Favourites, and opens it on the food side", () => {
    const tree = render(fiberHome(12), "fiber");
    expect(texts(tree)).toContain("Yours");
    press(tree, "Favourites");
    expect(mocks.navigate).toHaveBeenCalledWith("Favourites", { kind: "food" });
  });

  it("invites a first star rather than claiming a count of zero", () => {
    expect(texts(render(fiberHome(12), "fiber"))).toContain("Star anything to keep it here");
  });

  it("stars a food with the portion shown, and unstars it again", async () => {
    const tree = render(fiberHome(12), "fiber");
    await act(async () => undefined); // let the saved list hydrate
    press(tree, "Save Edamame to favourites");
    // The label flips, which is how the row reports it worked.
    press(tree, "Remove Edamame from favourites");
    press(tree, "Save Edamame to favourites");
  });
});
