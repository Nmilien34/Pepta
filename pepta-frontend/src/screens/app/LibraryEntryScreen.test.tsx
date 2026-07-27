import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryEntryScreen } from "./LibraryEntryScreen";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  goBack: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
  askPep: vi.fn(),
  entryId: "bpc-157",
  home: { activeCompounds: [] as Array<{ id: string; name: string }> },
}));

vi.mock("react-native", () => ({
  Linking: { openURL: mocks.openURL },
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
  useRoute: () => ({ params: { entryId: mocks.entryId } }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      primary: "#7C5CFC",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
      warning: "#E8A13C",
    },
    spacing: { lg: 16 },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Button: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) =>
    React.createElement(
      "Pressable",
      { accessibilityRole: "button", accessibilityLabel: label, onPress, disabled },
      label,
    ),
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children),
}));

vi.mock("../../components/Icon", () => ({
  Icon: (props: { name: string }) => React.createElement("Icon", props),
}));

vi.mock("../../components/AddCompoundSheet", () => ({
  AddCompoundSheet: ({ visible, initialQuery }: { visible: boolean; initialQuery?: string }) =>
    visible ? React.createElement("AddCompoundSheet", { initialQuery }) : null,
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: mocks.home }),
}));

vi.mock("../../context/PepChatContext", () => ({
  usePepChat: () => ({ askPep: mocks.askPep, chatOpen: false }),
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
    renderer = TestRenderer.create(<LibraryEntryScreen />);
  });
  return renderer;
}

describe("LibraryEntryScreen", () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.goBack.mockClear();
    mocks.openURL.mockClear();
    mocks.askPep.mockClear();
    mocks.entryId = "bpc-157";
    mocks.home = { activeCompounds: [] };
  });

  it("renders the honest evidence framing for a preclinical entry", () => {
    const text = textOf(render().root);

    expect(text).toContain("BPC-157");
    expect(text).toContain("PRECLINICAL");
    expect(text).toContain("Human efficacy has not been established.");
    expect(text).toContain("Community protocol");
    expect(text).toContain("not medical advice or a recommendation");
    expect(text).toContain("Sources");
  });

  it("renders approval facts for an approved entry instead", () => {
    mocks.entryId = "tirzepatide";
    const text = textOf(render().root);

    expect(text).toContain("FDA APPROVED");
    expect(text).toContain("SURMOUNT-1");
    // An approved drug's schedule is the LABEL, never "community practice".
    expect(text).toContain("Label dosing");
    expect(text).toContain("Label dose");
    expect(text).toContain("From the FDA prescribing information");
    expect(text).not.toContain("Typical dose logged");
    expect(text).not.toContain("Community protocol");
  });

  it("opens Add medication prefilled with the compound name", () => {
    const tree = render();
    expect(tree.root.findAll((n) => n.type === "AddCompoundSheet")).toHaveLength(0);

    act(() => byLabel(tree.root, "Track this peptide").props.onPress());

    const sheet = tree.root.findAll((n) => n.type === "AddCompoundSheet")[0]!;
    expect(sheet.props.initialQuery).toBe("BPC-157");
  });

  it("disables tracking when the compound is already tracked", () => {
    mocks.home = { activeCompounds: [{ id: "c1", name: "BPC-157" }] };
    const tree = render();

    expect(textOf(tree.root)).toContain("YOU TRACK THIS");
    expect(byLabel(tree.root, "Already in your compounds").props.disabled).toBe(true);
  });

  it("links to the mix calculator for reconstituted compounds only", () => {
    const tree = render();
    act(() => byLabel(tree.root, "Open the mix calculator").props.onPress());
    expect(mocks.navigate).toHaveBeenCalledWith("MixCalculator");

    // Oral/prescribed products don't reconstitute — no link.
    mocks.entryId = "mk-677";
    const oral = render();
    expect(
      oral.root.findAll(
        (n) => n.props.accessibilityLabel === "Open the mix calculator",
      ),
    ).toHaveLength(0);
  });

  it("opens source links and goes back", () => {
    const tree = render();

    act(() =>
      byLabel(
        tree.root,
        "Open source: Emerging use of BPC-157 in orthopaedic sports medicine (2025)",
      ).props.onPress(),
    );
    expect(mocks.openURL).toHaveBeenCalledWith(
      "https://journals.sagepub.com/doi/abs/10.1177/15563316251355551",
    );

    act(() => byLabel(tree.root, "Back").props.onPress());
    expect(mocks.goBack).toHaveBeenCalledTimes(1);
  });

  it("opens Ask Pep seeded with this entry's framing", () => {
    const tree = render();

    act(() => byLabel(tree.root, "Ask Pep about BPC-157").props.onPress());

    expect(mocks.askPep).toHaveBeenCalledTimes(1);
    const seed = mocks.askPep.mock.calls[0]?.[0] as string;
    expect(seed).toContain("BPC-157");
    // The evidence tier rides along so Pep can't answer as if it were approved.
    expect(seed).toContain("preclinical — animal data only");
  });

  it("degrades gracefully for an unknown entry id", () => {
    mocks.entryId = "not-a-real-entry";
    expect(textOf(render().root)).toContain("isn’t available");
  });
});
