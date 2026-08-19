// The Water screen's logic is covered in hydration.test.ts. This covers the
// wiring — the glass, the stepper, the vessel row, and the two things a drink
// row can do.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { duplicateLabels, maybeOne, one } from "../../tests/byLabel";

const mocks = vi.hoisted(() => ({
  home: null as unknown,
  navigate: vi.fn(),
  bumpWater: vi.fn(),
  refreshHome: vi.fn(),
  openQuickLog: vi.fn(),
  getFavourites: vi.fn(),
  saveFavourite: vi.fn(),
  removeFavourite: vi.fn(),
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
    ScrollView: ({ children, refreshControl, ...props }: { children?: React.ReactNode; refreshControl?: React.ReactNode }) =>
      React.createElement("ScrollView", props, refreshControl, children),
    Text: passthrough("Text"),
    View: passthrough("View"),
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: "ios" },
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate, goBack: vi.fn() }),
  useFocusEffect: (cb: () => undefined | (() => void)) => React.useEffect(cb, [cb]),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const p = (n: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(n, null, children);
  return { AppText: p("AppText"), Card: p("Card"), WaterCup: (props: object) => React.createElement("WaterCup", props) };
});
vi.mock("../../components/Icon", () => ({ Icon: () => null }));
vi.mock("../../components/VesselIcon", () => ({
  VesselIcon: (props: { vessel: string }) => React.createElement("VesselIcon", props),
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", surface: "#fff", surfaceAlt: "#eee", border: "#eee",
      textPrimary: "#000", textSecondary: "#666", textTertiary: "#999",
      water: "#2FA8FF", protein: "#FF8A3D", fiber: "#34C759", warning: "#fa0",
    },
    radii: { pill: 999 },
  }),
}));
vi.mock("../../services/api", () => ({
  api: {
    getFavourites: mocks.getFavourites,
    saveFavourite: mocks.saveFavourite,
    removeFavourite: mocks.removeFavourite,
  },
}));
vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    home: mocks.home,
    bumpWater: mocks.bumpWater,
    refreshHome: mocks.refreshHome,
    homeRefreshing: false,
    pendingLogs: 0,
  }),
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openQuickLog: mocks.openQuickLog }),
}));

import { WaterScreen } from "./WaterScreen";
import { HYDRATION_EXAMPLES, DRINK_PANELS } from "./hydration";

const home = {
  profile: { dailyWaterTargetOz: 100 },
  todayWaterOz: 42, todayProteinGrams: 0, todayFiberGrams: 0, todayCalories: 0,
};

async function render(h: unknown = home) {
  mocks.home = h;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<WaterScreen />);
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
  return out.join("|");
}

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.bumpWater.mockReset();
  mocks.openQuickLog.mockReset();
  mocks.refreshHome.mockReset();
  mocks.getFavourites.mockReset().mockResolvedValue({ favourites: [], suggestions: [] });
  mocks.saveFavourite.mockReset().mockResolvedValue({});
  mocks.removeFavourite.mockReset().mockResolvedValue({});
});

describe("WaterScreen · the glass and the stepper", () => {
  it("fills the glass from today's real total", async () => {
    const tree = await render();
    const cup = tree.root.findAll((n) => String(n.type) === "WaterCup")[0]!;
    expect(cup.props.value).toBe(42);
    expect(cup.props.target).toBe(100);
  });

  it("adds and removes 8 oz from the stepper", async () => {
    const tree = await render();
    act(() => one(tree, "Add 8 ounces").props.onPress());
    expect(mocks.bumpWater).toHaveBeenCalledWith(8);
    act(() => one(tree, "Remove 8 ounces").props.onPress());
    expect(mocks.bumpWater).toHaveBeenCalledWith(-8);
  });

  it("names the goal, and asks for one when there is none", async () => {
    expect(texts(await render())).toContain("of your 100 oz goal");
    const noGoal = { ...home, profile: {} };
    expect(texts(await render(noGoal))).toContain("Set a daily water goal");
  });
});

describe("WaterScreen · Quick add", () => {
  it("logs the vessel's own volume, not the first one's", async () => {
    const tree = await render();
    act(() => one(tree, "Shaker, add 24 ounces").props.onPress());
    expect(mocks.bumpWater).toHaveBeenCalledTimes(1);
    expect(mocks.bumpWater).toHaveBeenCalledWith(24);
  });

  it("reaches a full cup — the row runs to the goal", async () => {
    const tree = await render();
    // 100 oz goal, 42 logged → a tile that adds the remaining 58.
    expect(maybeOne(tree, "Fill the cup, add 58 ounces")).toBeDefined();
  });

  it("sends Custom to the sheet that takes a typed amount", async () => {
    const tree = await render();
    act(() => one(tree, "Type a custom amount").props.onPress());
    expect(mocks.openQuickLog).toHaveBeenCalledWith("water");
    expect(mocks.bumpWater).not.toHaveBeenCalled();
  });
});

describe("WaterScreen · a drink row does two different things", () => {
  const vita = HYDRATION_EXAMPLES.find((d) => d.key === "vita-coco")!;

  it("opens detail from the row body, carrying its panel", async () => {
    const tree = await render();
    act(() =>
      one(tree, `${vita.brand}, ${vita.volume}. ${vita.fact}. Adds ${vita.ounces} ounces`).props.onPress(),
    );
    const [route, params] = mocks.navigate.mock.calls[0]!;
    expect(route).toBe("ItemDetail");
    const item = (params as { item: Record<string, unknown> }).item;
    expect(item.name).toBe(vita.brand);
    expect(item.potassium).toBe(DRINK_PANELS["vita-coco"]!.potassium);
    expect(item.source).toBe(DRINK_PANELS["vita-coco"]!.source);
    expect(mocks.bumpWater).not.toHaveBeenCalled();
  });

  it("logs straight from the plus, without navigating", async () => {
    const tree = await render();
    act(() => one(tree, `Log ${vita.brand}`).props.onPress());
    expect(mocks.bumpWater).toHaveBeenCalledWith(vita.ounces);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("stars a drink with its volume, so Log and Quick add both work later", async () => {
    const tree = await render();
    await act(async () => one(tree, `Save ${vita.brand} to favourites`).props.onPress());
    expect(mocks.saveFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "drink", name: vita.brand, ounces: vita.ounces }),
    );
  });
});

describe("WaterScreen · staying honest", () => {
  it("shows a spinner and fetches rather than claiming no goal", async () => {
    const tree = await render(null);
    expect(tree.root.findAll((n) => String(n.type) === "ActivityIndicator")).toHaveLength(1);
    expect(mocks.refreshHome).toHaveBeenCalled();
    expect(texts(tree)).not.toContain("Set a daily water goal");
  });

  it("offers pull-to-refresh", async () => {
    const tree = await render();
    const rc = tree.root.findAll((n) => String(n.type) === "RefreshControl")[0];
    expect(rc).toBeDefined();
    act(() => rc!.props.onRefresh());
    expect(mocks.refreshHome).toHaveBeenCalled();
  });

  it("no two controls answer to one label", async () => {
    expect(duplicateLabels(await render())).toEqual([]);
  });
});
