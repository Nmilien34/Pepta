// The screen is shared by both star rows and has to open on the side the user
// came from. Everything else — counts, rows, Worth saving, the first-run
// nudge — comes from real data.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  kind: undefined as "food" | "drink" | undefined,
  track: null as unknown,
  getFavourites: vi.fn(),
  saveFavourite: vi.fn(),
  removeFavourite: vi.fn(),
  openMeal: vi.fn(),
  openQuickLog: vi.fn(),
  bumpWater: vi.fn(),
}));

vi.mock("react-native", () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    Text: passthrough("Text"),
    View: passthrough("View"),
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
    Platform: { OS: "ios" },
  };
});
vi.mock("react-native-svg", () => {
  const p = (n: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(n, null, children);
  return { default: p("Svg"), Svg: p("Svg"), ClipPath: p("ClipPath"), Defs: p("Defs"), G: p("G"), Path: p("Path"), Rect: p("Rect") };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
  useRoute: () => ({ params: { kind: mocks.kind } }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const p = (n: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(n, null, children);
  return { AppText: p("AppText"), Card: p("Card") };
});
vi.mock("../../components/Icon", () => ({ Icon: () => null }));
vi.mock("../../components/VesselIcon", () => ({
  VesselIcon: (props: { vessel: string }) => React.createElement("VesselIcon", props),
}));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", surface: "#fff", surfaceAlt: "#eee", border: "#eee", danger: "#f00",
      textPrimary: "#000", textSecondary: "#666", textTertiary: "#999",
      protein: "#FF8A3D", fiber: "#34C759", water: "#2FA8FF",
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
  usePeptaData: () => ({ track: mocks.track, bumpWater: mocks.bumpWater }),
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal, openQuickLog: mocks.openQuickLog }),
}));

import { FavouritesScreen } from "./FavouritesScreen";

const row = (over: Record<string, unknown>) => ({
  id: "r", key: "k", kind: "food", name: "N", portion: "P", source: "item",
  createdAt: "2026-08-17T12:00:00.000Z", updatedAt: "2026-08-17T12:00:00.000Z", ...over,
});

const chicken = row({ key: "food:chicken-breast:6-oz", name: "Chicken breast", portion: "6 oz, grilled", protein: 54, calories: 280 });
const bottle = row({ key: "drink:water-bottle:16-oz", kind: "drink", name: "Water bottle", portion: "The one on your desk", ounces: 16 });
const yogurtRecipe = row({ key: "food:greek-yogurt-berries:1-cup", name: "Greek yogurt + berries", portion: "1 cup, blueberries, honey", protein: 20, calories: 240, source: "recipe" });

async function render(favourites: unknown[], kind?: "food" | "drink") {
  mocks.kind = kind;
  mocks.getFavourites.mockResolvedValue({ favourites });
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<FavouritesScreen />);
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

const find = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => String(n.type) === "Pressable").find((x) => x.props.accessibilityLabel === label);

const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const p = find(tree, label);
  expect(p, `no pressable labelled "${label}"`).toBeDefined();
  act(() => p!.props.onPress());
};

beforeEach(() => {
  mocks.track = { mealLogs: [] };
  mocks.getFavourites.mockReset().mockResolvedValue({ favourites: [] });
  mocks.saveFavourite.mockReset().mockResolvedValue({});
  mocks.removeFavourite.mockReset().mockResolvedValue({});
  mocks.openMeal.mockReset();
  mocks.openQuickLog.mockReset();
  mocks.bumpWater.mockReset();
});

describe("FavouritesScreen · which side it opens on", () => {
  it("opens on Food when reached from Protein or Fiber", async () => {
    const tree = await render([chicken, bottle], "food");
    expect(find(tree, "Log Chicken breast")).toBeDefined();
    expect(find(tree, "Log Water bottle")).toBeUndefined();
  });

  it("opens on Drinks when reached from the Water screen", async () => {
    const tree = await render([chicken, bottle], "drink");
    expect(find(tree, "Log Water bottle")).toBeDefined();
    expect(find(tree, "Log Chicken breast")).toBeUndefined();
  });

  it("defaults to Food when nothing said where it came from", async () => {
    const tree = await render([chicken, bottle], undefined);
    expect(find(tree, "Log Chicken breast")).toBeDefined();
  });

  it("switches sides, and counts both whichever is showing", async () => {
    const tree = await render([chicken, bottle], "food");
    expect(texts(tree)).toContain("Food · 1");
    expect(texts(tree)).toContain("Drinks · 1");
    press(tree, "Drinks, 1 saved");
    expect(find(tree, "Log Water bottle")).toBeDefined();
  });
});

describe("FavouritesScreen · the rows", () => {
  it("shows the saved portion and its figures, not a category", async () => {
    const out = texts(await render([chicken], "food"));
    expect(out).toContain("Chicken breast");
    expect(out).toContain("6 oz, grilled");
    expect(out).toContain("54 g protein");
    expect(out).toContain("280 cal");
  });

  it("badges a favourite that came from a recipe", async () => {
    expect(texts(await render([yogurtRecipe], "food"))).toContain("RECIPE");
    expect(texts(await render([chicken], "food"))).not.toContain("RECIPE");
  });

  it("draws a drink as the vessel you pick up, sized to its volume", async () => {
    const tree = await render([bottle], "drink");
    const vessels = tree.root.findAll((n) => String(n.type) === "VesselIcon");
    expect(vessels).toHaveLength(1);
    expect(vessels[0]!.props.vessel).toBe("bottle");
  });

  it("logs food through the meal sheet, seeded with the saved portion", async () => {
    const tree = await render([chicken], "food");
    press(tree, "Log Chicken breast");
    expect(mocks.openMeal).toHaveBeenCalledWith({
      foodName: "Chicken breast",
      servingSize: "6 oz, grilled",
      protein: 54,
      calories: 280,
      fiber: undefined,
    });
  });

  it("logs a drink as its volume", async () => {
    const tree = await render([bottle], "drink");
    press(tree, "Log Water bottle");
    expect(mocks.bumpWater).toHaveBeenCalledWith(16);
  });
});

describe("FavouritesScreen · Edit", () => {
  it("is offered only when there is something to edit", async () => {
    expect(find(await render([chicken], "food"), "Edit")).toBeDefined();
    expect(find(await render([], "food"), "Edit")).toBeUndefined();
  });

  it("swaps Log for a remove, and removes", async () => {
    const tree = await render([chicken], "food");
    expect(find(tree, "Remove Chicken breast from favourites")).toBeUndefined();
    press(tree, "Edit");
    expect(find(tree, "Log Chicken breast")).toBeUndefined();
    await act(async () => {
      find(tree, "Remove Chicken breast from favourites")!.props.onPress();
    });
    expect(mocks.removeFavourite).toHaveBeenCalledWith(chicken.key);
  });
});

describe("FavouritesScreen · before anything is saved", () => {
  it("says so, and offers a start rather than a dead end", async () => {
    const out = texts(await render([], "food"));
    expect(out).toContain("Nothing saved yet");
    expect(out).toContain("Start with these");
    expect(out).toContain("Greek yogurt");
  });

  it("saves a suggestion only when it is tapped", async () => {
    const tree = await render([], "food");
    expect(mocks.saveFavourite).not.toHaveBeenCalled();
    press(tree, "Save Greek yogurt to favourites");
    expect(mocks.saveFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Greek yogurt", portion: "1 cup, plain" }),
    );
  });

  it("stops suggesting once the list has something in it", async () => {
    expect(texts(await render([chicken], "food"))).not.toContain("Start with these");
  });

  it("stops suggesting on BOTH tabs once anything is saved", async () => {
    // A curated Food list must not make Drinks look like a first run.
    expect(texts(await render([chicken], "drink"))).not.toContain("Start with these");
  });

  it("lists all three on a truly empty screen, per the frame", async () => {
    const out = texts(await render([], "food"));
    expect(out).toContain("Greek yogurt");
    expect(out).toContain("Chicken breast");
    // The drink is offered too, drawn as a vessel rather than a food tile.
    expect(out).toContain("Water bottle");
  });

  it("draws the suggested drink as a vessel even on the Food tab", async () => {
    const tree = await render([], "food");
    const vessels = tree.root.findAll((n) => String(n.type) === "VesselIcon");
    expect(vessels).toHaveLength(1);
    expect(vessels[0]!.props.vessel).toBe("bottle");
  });

  it("offers Add your own on the drinks side", async () => {
    const tree = await render([], "drink");
    expect(texts(tree)).toContain("Name it, set the volume");
    press(tree, "Add your own drink");
    expect(mocks.openQuickLog).toHaveBeenCalledWith("water");
  });
});

describe("FavouritesScreen · Worth saving", () => {
  it("offers what was logged repeatedly, with the count", async () => {
    const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    mocks.track = {
      mealLogs: [1, 3, 5].map((d) => ({
        id: `m${d}`, foodName: "Protein bar", servingSize: "1 bar",
        protein: 20, calories: 210, datetime: at(d), deletedAt: null,
      })),
    };
    const out = texts(await render([], "food"));
    expect(out).toContain("Worth saving");
    expect(out).toContain("Protein bar");
    expect(out).toContain("Logged 3 times in two weeks");
  });

  it("stays quiet on the drinks side, where log names do not exist", async () => {
    expect(texts(await render([bottle], "drink"))).not.toContain("Worth saving");
  });
});

describe("FavouritesScreen · the right row acts, not the first one", () => {
  const salmon = row({ key: "food:salmon:6-oz", name: "Salmon", portion: "6 oz fillet", protein: 40, calories: 350 });
  const yogurt = row({ key: "food:greek-yogurt:1-cup", name: "Greek yogurt", portion: "1 cup", protein: 20, calories: 140 });
  const coffee = row({ key: "drink:morning-coffee:12-oz", kind: "drink", name: "Morning coffee", portion: "Black, large mug", ounces: 12 });

  it("logs the third food, with the third food's numbers", async () => {
    const tree = await render([chicken, salmon, yogurt], "food");
    press(tree, "Log Greek yogurt");
    expect(mocks.openMeal).toHaveBeenCalledTimes(1);
    expect(mocks.openMeal).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: "Greek yogurt", protein: 20, calories: 140 }),
    );
  });

  it("logs the second drink's own volume", async () => {
    const tree = await render([bottle, coffee], "drink");
    press(tree, "Log Morning coffee");
    expect(mocks.bumpWater).toHaveBeenCalledTimes(1);
    expect(mocks.bumpWater).toHaveBeenCalledWith(12);
  });

  it("removes the one whose remove was pressed", async () => {
    const tree = await render([chicken, salmon, yogurt], "food");
    press(tree, "Edit");
    await act(async () => {
      find(tree, "Remove Salmon from favourites")!.props.onPress();
    });
    expect(mocks.removeFavourite).toHaveBeenCalledTimes(1);
    expect(mocks.removeFavourite).toHaveBeenCalledWith(salmon.key);
  });

  it("gives every row its own Log, so none is unreachable", async () => {
    const tree = await render([chicken, salmon, yogurt], "food");
    for (const name of ["Chicken breast", "Salmon", "Greek yogurt"]) {
      expect(find(tree, `Log ${name}`), name).toBeDefined();
    }
  });

  it("keeps Worth saving offering the row that was starred", async () => {
    const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const logs = (name: string, protein: number) =>
      [1, 3, 5].map((d) => ({
        id: `${name}${d}`, foodName: name, servingSize: "1 serving",
        protein, calories: 200, datetime: at(d), deletedAt: null,
      }));
    mocks.track = { mealLogs: [...logs("Protein bar", 20), ...logs("Three eggs", 19)] };
    const tree = await render([], "food");
    press(tree, "Save Three eggs to favourites");
    expect(mocks.saveFavourite).toHaveBeenCalledTimes(1);
    expect(mocks.saveFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Three eggs", protein: 19 }),
    );
  });
});

describe("FavouritesScreen · the drinks side", () => {
  const waterLogs = (oz: number, times: number) =>
    Array.from({ length: times }, (_, i) => ({
      id: `${oz}-${i}`,
      amountOz: oz,
      datetime: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
      deletedAt: null,
    }));

  it("offers drinks you keep adding by hand, from real water logs", async () => {
    mocks.track = { mealLogs: [], waterLogs: waterLogs(34, 4) };
    const out = texts(await render([], "drink"));
    expect(out).toContain("Worth saving");
    expect(out).toContain("Drinks you keep adding by hand");
    // 34 oz is a Sports bottle exactly, so it is named as one.
    expect(out).toContain("Sports bottle");
    expect(out).toContain("Logged 4 times in two weeks");
  });

  it("names a volume that is not a vessel after the volume", async () => {
    mocks.track = { mealLogs: [], waterLogs: waterLogs(20, 3) };
    expect(texts(await render([], "drink"))).toContain("20 oz");
  });

  it("stays quiet below the threshold rather than inventing a habit", async () => {
    mocks.track = { mealLogs: [], waterLogs: waterLogs(34, 2) };
    expect(texts(await render([], "drink"))).not.toContain("Worth saving");
  });

  it("saves a drink offer with its volume, so Log and Quick add both work", async () => {
    mocks.track = { mealLogs: [], waterLogs: waterLogs(34, 4) };
    const tree = await render([], "drink");
    press(tree, "Save Sports bottle to favourites");
    expect(mocks.saveFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "drink", name: "Sports bottle", ounces: 34 }),
    );
  });

  it("draws every drink row as a vessel, never a generic icon", async () => {
    mocks.track = { mealLogs: [], waterLogs: waterLogs(34, 4) };
    const tree = await render([bottle], "drink");
    const vessels = tree.root.findAll((n) => String(n.type) === "VesselIcon");
    // One for the saved bottle, one for the offer.
    expect(vessels.length).toBe(2);
    expect(vessels.map((v) => v.props.vessel)).toEqual(["bottle", "sports"]);
  });

  it("keeps food's Worth saving off the drinks tab and vice versa", async () => {
    const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    mocks.track = {
      mealLogs: [1, 2, 3].map((d) => ({
        id: `m${d}`, foodName: "Protein bar", servingSize: "1 bar",
        protein: 20, calories: 210, datetime: at(d), deletedAt: null,
      })),
      waterLogs: waterLogs(34, 4),
    };
    expect(texts(await render([], "drink"))).not.toContain("Protein bar");
    expect(texts(await render([], "food"))).not.toContain("Sports bottle");
  });

  it("still offers Edit and removes the right drink", async () => {
    const coffee = row({ key: "drink:morning-coffee:12-oz", kind: "drink", name: "Morning coffee", portion: "Black, large mug", ounces: 12 });
    const tree = await render([bottle, coffee], "drink");
    press(tree, "Edit");
    await act(async () => {
      find(tree, "Remove Morning coffee from favourites")!.props.onPress();
    });
    expect(mocks.removeFavourite).toHaveBeenCalledWith(coffee.key);
  });
});
