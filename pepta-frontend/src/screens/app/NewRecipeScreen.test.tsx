// The three routes are the EXISTING ways to identify food. This screen adds no
// camera, no model, no search — it opens the meal sheet straight into one of
// them, and only the result differs (kept, not logged).

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const mocks = vi.hoisted(() => ({ openMeal: vi.fn(), goBack: vi.fn() }));

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
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: "ios" },
  };
});
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: mocks.goBack }),
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
    colors: { bg: "#fff", surfaceAlt: "#eee", border: "#eee", primary: "#7C5CFC", textSecondary: "#666", textTertiary: "#999" },
  }),
}));
vi.mock("../../context/LogSheetsContext", () => ({
  useLogSheets: () => ({ openMeal: mocks.openMeal }),
}));

import { NewRecipeScreen } from "./NewRecipeScreen";
import { duplicateLabels, maybeOne } from "../../tests/byLabel";

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<NewRecipeScreen />);
  });
  return tree;
}

const press = (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const p = maybeOne(tree, label, "Pressable");
  expect(p, `no pressable labelled "${label}"`).toBeDefined();
  act(() => p!.props.onPress());
};

beforeEach(() => {
  mocks.openMeal.mockReset();
  mocks.goBack.mockReset();
});

describe("NewRecipeScreen · connects to the features that already exist", () => {
  it("opens the camera flow from Scan the plate", () => {
    press(render(), "Scan the plate");
    expect(mocks.openMeal).toHaveBeenCalledWith(null, { keepAsRecipe: true, start: "scan" });
  });

  it("opens the voice flow from Say it or type it", () => {
    press(render(), "Say it or type it");
    expect(mocks.openMeal).toHaveBeenCalledWith(null, { keepAsRecipe: true, start: "voice" });
  });

  it("opens the food search from Search foods", () => {
    press(render(), "Search foods");
    expect(mocks.openMeal).toHaveBeenCalledWith(null, { keepAsRecipe: true, start: "search" });
  });

  it("never lands the user on the chooser they already answered", () => {
    for (const label of ["Scan the plate", "Say it or type it", "Search foods"]) {
      mocks.openMeal.mockClear();
      press(render(), label);
      const opts = mocks.openMeal.mock.calls[0]![1] as { start?: string };
      expect(opts.start, label).toBeDefined();
    }
  });

  it("keeps the result rather than logging it, on every route", () => {
    for (const label of ["Scan the plate", "Say it or type it", "Search foods"]) {
      mocks.openMeal.mockClear();
      press(render(), label);
      expect((mocks.openMeal.mock.calls[0]![1] as { keepAsRecipe?: boolean }).keepAsRecipe).toBe(true);
    }
  });

  it("leaves the chooser screen first, so dismissing returns to the list", () => {
    press(render(), "Scan the plate");
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("shows all three routes and the example line", () => {
    const out: string[] = [];
    const walk = (n: TestRenderer.ReactTestInstance) => {
      for (const c of n.children) {
        if (typeof c === "string") out.push(c);
        else walk(c);
      }
    };
    walk(render().root);
    const all = out.join(" ");
    expect(all).toContain("Scan the plate");
    expect(all).toContain("Say it or type it");
    expect(all).toContain("Search foods");
    expect(all).toContain("two eggs, oats and a scoop of whey");
  });
});

describe("NewRecipeScreen · no two controls answer to one label", () => {
  it("holds across the three routes", () => {
    expect(duplicateLabels(render())).toEqual([]);
  });
});
