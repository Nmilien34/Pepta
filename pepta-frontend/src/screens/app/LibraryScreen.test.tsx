import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryScreen } from "./LibraryScreen";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  goBack: vi.fn(),
  home: { activeCompounds: [] as Array<{ id: string; name: string }> },
}));

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    ...props
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", props, children),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn(() => Promise.resolve()) }));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      onPrimary: "#fff",
      primary: "#7C5CFC",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    radii: { pill: 999 },
    spacing: { lg: 16 },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children),
  SearchField: (props: { value: string; onChangeText(v: string): void }) =>
    React.createElement("SearchField", props),
}));

vi.mock("../../components/Icon", () => ({
  Icon: (props: { name: string }) => React.createElement("Icon", props),
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: mocks.home }),
}));

function textOf(root: ReactTestInstance): string {
  return root
    .findAll((n) => n.type === "Text")
    .map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.map(String).join("")
        : String(n.props.children ?? ""),
    )
    .join("\n");
}

function byLabel(root: ReactTestInstance, label: string): ReactTestInstance {
  const match = root.findAll(
    (n) => n.type === "Pressable" && n.props.accessibilityLabel === label,
  )[0];
  if (!match) throw new Error(`No pressable labelled "${label}"`);
  return match;
}

function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<LibraryScreen />);
  });
  return renderer;
}

describe("LibraryScreen", () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.goBack.mockClear();
    mocks.home = { activeCompounds: [] };
  });

  it("renders stacks, categories and evidence pills", () => {
    const tree = render();
    const text = textOf(tree.root);

    expect(text).toContain("Library");
    expect(text).toContain("Wolverine");
    expect(text).toContain("COMMUNITY");
    expect(text).toContain("Healing & recovery");
    expect(text).toContain("BPC-157");
    // The differentiator: tiers visible on the list itself.
    expect(text).toContain("PRECLINICAL");
    expect(text).toContain("FDA APPROVED");
    expect(text).toContain("not medical advice");
  });

  it("search narrows to matching entries and hides stacks", () => {
    const tree = render();
    const field = tree.root.findByType("SearchField" as never);

    act(() => field.props.onChangeText("zepbound"));

    const text = textOf(tree.root);
    expect(text).toContain("Tirzepatide");
    expect(text).not.toContain("BPC-157");
    expect(text).not.toContain("Wolverine"); // stacks hidden while searching
  });

  it("goal chips filter the list", () => {
    const tree = render();

    act(() => byLabel(tree.root, "Filter: Cognitive").props.onPress());

    const text = textOf(tree.root);
    expect(text).toContain("Semax");
    expect(text).not.toContain("Tirzepatide");
  });

  it("shows an empty state with a working clear action", () => {
    const tree = render();
    const field = tree.root.findByType("SearchField" as never);

    act(() => field.props.onChangeText("zzzznotathing"));
    expect(textOf(tree.root)).toContain("No matches");

    act(() => byLabel(tree.root, "Clear search and filters").props.onPress());
    expect(textOf(tree.root)).toContain("BPC-157");
  });

  it("opens an entry, a stack, and goes back", () => {
    const tree = render();

    act(() => byLabel(tree.root, "BPC-157 — The Healer").props.onPress());
    expect(mocks.navigate).toHaveBeenCalledWith("LibraryEntry", { entryId: "bpc-157" });

    act(() => byLabel(tree.root, "Wolverine stack").props.onPress());
    expect(mocks.navigate).toHaveBeenLastCalledWith("LibraryEntry", { entryId: "bpc-157" });

    act(() => byLabel(tree.root, "Back").props.onPress());
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("flags entries the user already tracks, matching on brand name", () => {
    mocks.home = { activeCompounds: [{ id: "c1", name: "Zepbound" }] };
    const tree = render();
    expect(textOf(tree.root)).toContain("YOU TRACK THIS");
  });
});
