// The stepper drives every number on this screen, and the buttons write real
// logs. Both are asserted against the rendered output rather than the helpers.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { duplicateLabels, one } from "../../tests/byLabel";

const mocks = vi.hoisted(() => ({
  item: null as unknown,
  home: null as unknown,
  navigate: vi.fn(),
  goBack: vi.fn(),
  bumpWater: vi.fn(),
  addMeal: vi.fn(),
  saveLog: vi.fn(),
  openMeal: vi.fn(),
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
    Animated: {
      Value: class {
        constructor(public value: number) {}
        interpolate() { return 0; }
        setValue() {}
      },
      View: passthrough("Animated.View"),
      ScrollView: passthrough("Animated.ScrollView"),
      event: () => () => undefined,
    },
    Pressable: passthrough("Pressable"),
    View: passthrough("View"),
    Text: passthrough("Text"),
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: "ios" },
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  useRoute: () => ({ params: { item: mocks.item } }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const p = (n: string) => ({ children }: { children?: React.ReactNode }) => React.createElement(n, null, children);
  return {
    AppText: p("AppText"),
    Card: p("Card"),
    Button: (props: { label: string; onPress: () => void; disabled?: boolean }) =>
      React.createElement("Button", props),
  };
});
vi.mock("../../components/Icon", () => ({ Icon: (p: { name: string }) => React.createElement("Icon", p) }));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", surface: "#fff", surfaceAlt: "#eee", border: "#eee", warning: "#fa0",
      textPrimary: "#000", textSecondary: "#666", textTertiary: "#999",
      protein: "#FF8A3D", fiber: "#34C759", water: "#2FA8FF", primary: "#7C5CFC",
    },
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
    addMeal: mocks.addMeal,
    saveLog: mocks.saveLog,
    refreshHome: vi.fn(),
    refreshTrack: vi.fn(),
  }),
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal }),
}));

import { ItemDetailScreen } from "./ItemDetailScreen";

const chicken = {
  key: "food:chicken", kind: "food" as const, name: "Chicken breast",
  servingLabel: "4 oz, cooked", servingNoun: "serving",
  calories: 185, protein: 34.7, carbs: 0, fat: 4, satFat: 1.1, fiber: 0, sodium: 83,
  source: "USDA FoodData Central · Chicken breast (171477)",
  note: "Cook a few at once.",
};

const lmnt = {
  key: "drink:lmnt", kind: "drink" as const, name: "LMNT",
  servingLabel: "Makes 16 fl oz", servingNoun: "serving",
  calories: 10, ounces: 16, sodium: 1000, potassium: 200, magnesium: 60,
  source: "LMNT label, one stick",
};

const home = { profile: { dailyProteinTargetGrams: 120, dailyWaterTargetOz: 100 }, todayProteinGrams: 74, todayFiberGrams: 0, todayWaterOz: 48, todayCalories: 0 };

async function render(item: unknown) {
  mocks.item = item;
  mocks.home = home;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ItemDetailScreen />);
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

const button = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === "Button")[0]!;

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockReset?.());
  mocks.getFavourites.mockResolvedValue({ favourites: [], suggestions: [] });
  mocks.saveFavourite.mockResolvedValue({});
  mocks.removeFavourite.mockResolvedValue({});
  mocks.saveLog.mockResolvedValue("saved");
});

describe("ItemDetailScreen · the stepper drives every number", () => {
  it("shows one serving's figures to begin with", async () => {
    const out = texts(await render(chicken));
    expect(out).toContain("34.7");
    expect(out).toContain("185");
    expect(out).toContain("83");
  });

  it("scales the macros, the projection and the button together", async () => {
    const tree = await render(chicken);
    expect(button(tree).props.label).toBe("Log 1 serving");
    act(() => one(tree, "One more").props.onPress());
    const out = texts(tree);
    expect(out).toContain("69.4");   // protein doubled
    expect(out).toContain("370");    // calories doubled
    expect(out).toContain("143.4");  // 74 + 69.4 projected
    expect(button(tree).props.label).toBe("Log 2 servings");
  });

  it("will not step below one — logging zero is not a log", async () => {
    const tree = await render(chicken);
    act(() => one(tree, "One fewer").props.onPress());
    expect(button(tree).props.label).toBe("Log 1 serving");
  });

  it("says what a drink adds, in its own unit", async () => {
    const tree = await render(lmnt);
    expect(button(tree).props.label).toBe("Log 1 serving · 16 oz");
    act(() => one(tree, "One more").props.onPress());
    expect(button(tree).props.label).toBe("Log 2 servings · 32 oz");
    expect(texts(tree)).toContain("2000"); // sodium doubled
  });
});

describe("ItemDetailScreen · the buttons do what they say", () => {
  it("logs a food as the meal it is, at the chosen amount", async () => {
    const tree = await render(chicken);
    act(() => one(tree, "One more").props.onPress());
    await act(async () => button(tree).props.onPress());
    expect(mocks.addMeal).toHaveBeenCalledTimes(1);
    expect(mocks.addMeal.mock.calls[0]![0]).toMatchObject({
      foodName: "Chicken breast",
      servingSize: "2 servings",
      protein: 69.4,
      calories: 370,
    });
    // Durable behind the optimistic write, same as the meal sheet.
    expect(mocks.saveLog).toHaveBeenCalledWith("meal", expect.objectContaining({ foodName: "Chicken breast" }));
  });

  it("logs a drink as ounces, never as a meal", async () => {
    const tree = await render(lmnt);
    await act(async () => button(tree).props.onPress());
    expect(mocks.bumpWater).toHaveBeenCalledWith(16);
    expect(mocks.addMeal).not.toHaveBeenCalled();
  });

  it("stars the item with the portion shown", async () => {
    const tree = await render(chicken);
    await act(async () => one(tree, "Save Chicken breast to favourites").props.onPress());
    expect(mocks.saveFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Chicken breast", portion: "4 oz, cooked", protein: 34.7 }),
    );
  });

  it("hands Add to a recipe to the keep-as-recipe path, not to today's log", async () => {
    const tree = await render(chicken);
    await act(async () => one(tree, "Add to a recipe").props.onPress());
    expect(mocks.openMeal).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: "Chicken breast" }),
      { keepAsRecipe: true },
    );
    expect(mocks.addMeal).not.toHaveBeenCalled();
  });
});

describe("ItemDetailScreen · what it says about today, and about itself", () => {
  it("projects from where today stands to where this would take it", async () => {
    const out = texts(await render(chicken));
    expect(out).toContain("74");
    expect(out).toContain("108.7");
    expect(out).toContain("11.3 g would still be left");
  });

  it("uses ounces and the water target for a drink", async () => {
    expect(texts(await render(lmnt))).toContain("36 oz would still be left");
  });

  it("shows the source when there is one, and labels the note as an opinion", async () => {
    const out = texts(await render(chicken));
    expect(out).toContain("USDA FoodData Central");
    expect(out).toContain("PEP’S NOTE");
  });

  it("omits the source line entirely when the item has none", async () => {
    const out = texts(await render({ ...chicken, source: undefined, note: undefined }));
    expect(out).not.toContain("Source:");
    expect(out).not.toContain("PEP’S NOTE");
  });

  it("renders nothing rather than crashing when opened with no item", async () => {
    const out = texts(await render(undefined));
    expect(out).toContain("Nothing to show.");
  });

  it("no two controls answer to one label", async () => {
    expect(duplicateLabels(await render(chicken))).toEqual([]);
    expect(duplicateLabels(await render(lmnt))).toEqual([]);
  });
});
