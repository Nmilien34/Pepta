import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeResponse } from "@pepta/shared";

const mocks = vi.hoisted(() => ({
  getRecipe: vi.fn(),
  goBack: vi.fn(),
  openMeal: vi.fn(),
}));

vi.mock("react-native", () => {
  const passthrough = (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(name, props, children);
  return {
    ActivityIndicator: passthrough("ActivityIndicator"),
    Image: passthrough("Image"),
    Pressable: passthrough("Pressable"),
    ScrollView: passthrough("ScrollView"),
    View: passthrough("View"),
  };
});

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
  useRoute: () => ({ params: { recipeId: "recipe-1" } }),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("AppText", props, children),
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children),
}));
vi.mock("../../components/Icon", () => ({ Icon: () => null }));
vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      border: "#eee",
      primary: "#7C5CFC",
      protein: "#FF8A3D",
      fiber: "#34C759",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    radii: { card: 20, pill: 999 },
    shadows: { card: { shadowOpacity: 0.08 } },
  }),
}));
vi.mock("../../services/api", () => ({
  api: { getRecipe: mocks.getRecipe },
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal }),
}));

import { RecipeDetailScreen } from "./RecipeDetailScreen";

const recipe: RecipeResponse = {
  id: "recipe-1",
  name: "Morning shake",
  isStarter: false,
  ingredients: [
    { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
    { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
  ],
  photoMediaId: "media-1",
  photoUrl: "https://signed.example/recipe.jpg",
  createdAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:00:00.000Z",
};

function text(tree: TestRenderer.ReactTestRenderer) {
  const values: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance) => {
    for (const child of node.children) {
      if (typeof child === "string") values.push(child);
      else walk(child);
    }
  };
  walk(tree.root);
  return values.join("");
}

async function render(value: RecipeResponse = recipe) {
  mocks.getRecipe.mockResolvedValue(value);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<RecipeDetailScreen />);
  });
  return tree;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecipeDetailScreen", () => {
  it("refreshes the recipe and renders its photo as a framed cover hero", async () => {
    const tree = await render();

    expect(mocks.getRecipe).toHaveBeenCalledWith("recipe-1");
    const hero = tree.root.findByProps({
      accessibilityLabel: "Morning shake photo",
    });
    expect(hero.props.source).toEqual({ uri: recipe.photoUrl });
    expect(hero.props.resizeMode).toBe("cover");
    expect(hero.props.style).toEqual(
      expect.objectContaining({ width: "100%", aspectRatio: 4 / 3 }),
    );
    expect(text(tree)).toContain("Morning shake");
    expect(text(tree)).toContain("Whey");
  });

  it("removes a failed hero without hiding recipe data or adding a placeholder", async () => {
    const tree = await render();
    const hero = tree.root.findByProps({
      accessibilityLabel: "Morning shake photo",
    });

    await act(async () => {
      hero.props.onError();
    });

    expect(
      tree.root.findAllByProps({ accessibilityLabel: "Morning shake photo" }),
    ).toHaveLength(0);
    expect(text(tree)).toContain("Morning shake");
    expect(text(tree)).toContain("Milk");
    expect(text(tree)).not.toMatch(/no photo|placeholder/i);
  });

  it("uses the same layout with no empty hero when the recipe has no photo", async () => {
    const tree = await render({
      ...recipe,
      photoMediaId: undefined,
      photoUrl: null,
    });

    expect(tree.root.findAll((node) => String(node.type) === "Image")).toHaveLength(0);
    expect(text(tree)).toContain("Morning shake");
  });

  it("logs through the existing meal sheet with the recipe media id", async () => {
    const tree = await render();

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: "Log Morning shake" }).props.onPress();
    });

    expect(mocks.openMeal).toHaveBeenCalledWith({
      foodName: "Morning shake",
      servingSize: "Whey, Milk",
      protein: 32,
      calories: 223,
      photoMediaId: "media-1",
    });
  });
});
