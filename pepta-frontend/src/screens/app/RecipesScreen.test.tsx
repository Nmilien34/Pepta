// Every figure on this screen is summed from ingredients. These drive the real
// component with different ingredient lists and assert the rendered text moves.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const mocks = vi.hoisted(() => ({
  getRecipes: vi.fn(),
  createRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
  openMeal: vi.fn(),
  navigate: vi.fn(),
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
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    Text: passthrough("Text"),
    View: passthrough("View"),
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
    Platform: { OS: "ios" },
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate, goBack: vi.fn() }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("../../components", () => {
  const passthrough = (name: string) =>
    ({ children }: { children?: React.ReactNode }) => React.createElement(name, null, children);
  return { AppText: passthrough("AppText"), Card: passthrough("Card") };
});
vi.mock("../../components/Icon", () => ({ Icon: () => null }));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff", surface: "#fff", surfaceAlt: "#eee", border: "#eee", primary: "#7C5CFC",
      textPrimary: "#000", textSecondary: "#666", textTertiary: "#999",
      protein: "#FF8A3D", fiber: "#34C759",
    },
    radii: { pill: 999 },
  }),
}));
vi.mock("../../services/api", () => ({
  api: {
    getRecipes: mocks.getRecipes,
    createRecipe: mocks.createRecipe,
    deleteRecipe: mocks.deleteRecipe,
  },
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal }),
}));

import { RecipesScreen } from "./RecipesScreen";
import { duplicateLabels } from "../../tests/byLabel";

const recipe = (name: string, ingredients: { name: string; amount: string; protein: number; calories: number; fiber?: number }[], id = name) => ({
  id,
  name,
  isStarter: false,
  ingredients,
  createdAt: "2026-08-17T12:00:00.000Z",
  updatedAt: "2026-08-17T12:00:00.000Z",
});

const shake = recipe("Morning shake", [
  { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
  { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
  { name: "Banana", amount: "1 medium", protein: 1, calories: 105, fiber: 3 },
  { name: "Peanut butter", amount: "1 tbsp", protein: 5, calories: 102 },
]);

async function render(payload: { recipes: unknown[]; starters: unknown[] }) {
  mocks.getRecipes.mockResolvedValue(payload);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<RecipesScreen />);
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

const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const p = tree.root.findAll((n) => String(n.type) === "Pressable").find((x) => x.props.accessibilityLabel === label);
  expect(p, `no pressable labelled "${label}"`).toBeDefined();
  act(() => p!.props.onPress());
};

beforeEach(() => {
  mocks.getRecipes.mockReset();
  mocks.createRecipe.mockReset().mockResolvedValue(shake);
  mocks.deleteRecipe.mockReset().mockResolvedValue({});
  mocks.openMeal.mockReset();
  mocks.navigate.mockReset();
});

describe("RecipesScreen · nothing is static", () => {
  it("sums each recipe's ingredients rather than printing a stored total", async () => {
    const out = texts(await render({ recipes: [shake], starters: [] }));
    expect(out).toContain("38 g protein");
    expect(out).toContain("430 cal");
    expect(out).toContain("Whey, Milk, Banana, Peanut butter");
  });

  it("moves when the ingredients move", async () => {
    const bigger = recipe("Morning shake", [
      { name: "Whey", amount: "2 scoops", protein: 48, calories: 240 },
      { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
    ]);
    const out = texts(await render({ recipes: [bigger], starters: [] }));
    expect(out).toContain("56 g protein");
    expect(out).toContain("343 cal");
  });

  it("counts what is actually saved", async () => {
    expect(texts(await render({ recipes: [shake], starters: [] }))).toContain("1 saved");
    expect(texts(await render({ recipes: [], starters: [] }))).toContain("Nothing saved yet");
  });

  it("shows starters separately, with their own summed figures", async () => {
    const starter = { ...recipe("Tuna salad", [
      { name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 },
      { name: "Light mayo", amount: "1 tbsp", protein: 0, calories: 45 },
      { name: "Celery", amount: "1/2 cup", protein: 0, calories: 10, fiber: 1 },
    ], "s1"), isStarter: true };
    const out = texts(await render({ recipes: [], starters: [starter] }));
    expect(out).toContain("Starters");
    expect(out).toContain("30 g protein");
    expect(out).toContain("220 cal");
  });
});

describe("RecipesScreen · the actions", () => {
  it("logs a recipe as the meal it is, with summed macros", async () => {
    const tree = await render({ recipes: [shake], starters: [] });
    press(tree, "Log Morning shake");
    expect(mocks.openMeal).toHaveBeenCalledWith({
      foodName: "Morning shake",
      servingSize: "Whey, Milk, Banana +1 more",
      protein: 38,
      calories: 430,
      fiber: 3,
    });
  });

  it("saves a starter as a COPY, ingredients and all", async () => {
    const starter = { ...recipe("Tuna salad", [{ name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 }], "s1"), isStarter: true };
    const tree = await render({ recipes: [], starters: [starter] });
    press(tree, "Save Tuna salad to your recipes");
    expect(mocks.createRecipe).toHaveBeenCalledWith({
      name: "Tuna salad",
      ingredients: starter.ingredients,
    });
  });

  it("offers no delete on a starter — it belongs to everybody", async () => {
    const starter = { ...recipe("Tuna salad", [{ name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 }], "s1"), isStarter: true };
    const tree = await render({ recipes: [], starters: [starter] });
    const del = tree.root.findAll((n) => String(n.type) === "Pressable").find((x) => x.props.accessibilityLabel === "Delete Tuna salad");
    expect(del).toBeUndefined();
  });

  it("deletes one of yours", async () => {
    const tree = await render({ recipes: [shake], starters: [] });
    press(tree, "Delete Morning shake");
    expect(mocks.deleteRecipe).toHaveBeenCalledWith("Morning shake");
  });

  it("opens the New recipe flow", async () => {
    const tree = await render({ recipes: [], starters: [] });
    press(tree, "New recipe");
    expect(mocks.navigate).toHaveBeenCalledWith("NewRecipe");
  });

  it("states the empty case rather than spinning forever when the load fails", async () => {
    mocks.getRecipes.mockRejectedValue(new Error("500"));
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<RecipesScreen />);
    });
    expect(tree.root.findAll((n) => String(n.type) === "ActivityIndicator")).toHaveLength(0);
    expect(texts(tree)).toContain("Starters could not be loaded");
  });
});

describe("RecipesScreen · no two controls answer to one label", () => {
  it("holds with both yours and starters on screen", async () => {
    const starter = { ...recipe("Tuna salad", [{ name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 }], "s1"), isStarter: true };
    expect(duplicateLabels(await render({ recipes: [shake], starters: [starter] }))).toEqual([]);
  });

  it("holds when a starter shares its name with one of yours", async () => {
    // Saving a starter copies it, so both lists can carry the same name — the
    // two rows must still be distinguishable by label.
    const mine = recipe("Tuna salad", [{ name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 }], "mine");
    const starter = { ...recipe("Tuna salad", [{ name: "Tuna", amount: "5 oz can", protein: 30, calories: 165 }], "s1"), isStarter: true };
    expect(duplicateLabels(await render({ recipes: [mine], starters: [starter] }))).toEqual([]);
  });
});
