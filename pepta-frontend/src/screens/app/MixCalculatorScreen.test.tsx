// The save flow must never dead-end: with no medication yet, "Save as my
// dose" opens the add sheet and the dose lands on the compound the sheet
// creates (2026-08-05 — the disabled button stranded every not-yet-medicated
// user, exactly the people doing first-shot vial math).

import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MixCalculatorScreen } from "./MixCalculatorScreen";

const mocks = vi.hoisted(() => ({
  updateCompound: vi.fn(() => Promise.resolve({})),
  refreshHome: vi.fn(() => Promise.resolve()),
  home: null as unknown,
}));

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", props, children),
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: vi.fn(), navigate: vi.fn() }),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fafafa",
      border: "#eee",
      fiber: "#34C759",
      onPrimary: "#fff",
      primary: "#8B5CF6",
      protein: "#FF8A3D",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
      water: "#2FA8FF",
    },
    sizes: { hitSlop: 10 },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  }),
}));

vi.mock("../../components", () => ({
  AddCompoundSheet: ({ visible }: { visible: boolean }) =>
    React.createElement("AddCompoundSheet", { visible }),
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Button: ({ label, ...props }: { label: string }) =>
    React.createElement("Button", { ...props, label }),
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children),
}));

vi.mock("../../components/Icon", () => ({
  Icon: (props: object) => React.createElement("Icon", props),
}));

vi.mock("../../components/onboarding/SegmentedToggle", () => ({
  SegmentedToggle: (props: object) => React.createElement("SegmentedToggle", props),
}));

vi.mock("../../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: mocks.home, refreshHome: mocks.refreshHome }),
}));

vi.mock("../../services/api", () => ({
  api: { updateCompound: mocks.updateCompound },
}));

function findButton(root: TestRenderer.ReactTestRenderer["root"]): ReactTestInstance {
  return root.findAll((n) => (n.type as unknown) === "Button")[0]!;
}

function sheet(root: TestRenderer.ReactTestRenderer["root"]): ReactTestInstance {
  return root.findAll((n) => (n.type as unknown) === "AddCompoundSheet")[0]!;
}

describe("MixCalculatorScreen save flow", () => {
  beforeEach(() => {
    mocks.updateCompound.mockClear();
    mocks.refreshHome.mockClear();
    mocks.home = { activeCompounds: [] };
  });

  it("keeps Save enabled with no medication and opens the add sheet on tap", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<MixCalculatorScreen />);
    });

    const button = findButton(tree!.root);
    expect(button.props.disabled).toBeFalsy();
    expect(sheet(tree!.root).props.visible).toBe(false);

    await act(async () => {
      await button.props.onPress();
    });
    expect(sheet(tree!.root).props.visible).toBe(true);
    expect(mocks.updateCompound).not.toHaveBeenCalled();
  });

  it("saves the dose onto the compound the sheet just created", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<MixCalculatorScreen />);
    });
    await act(async () => {
      await findButton(tree!.root).props.onPress();
    });

    // The sheet's addCompound put the new medication into home — the screen
    // must finish the save the user asked for, without another tap.
    mocks.home = {
      activeCompounds: [{ id: "c-new", name: "Semaglutide", plannedDose: null, doseUnit: null }],
    };
    await act(async () => {
      tree!.update(<MixCalculatorScreen />);
    });

    expect(mocks.updateCompound).toHaveBeenCalledWith("c-new", {
      plannedDose: 250,
      doseUnit: "mcg",
    });
  });

  it("saves directly when a medication already exists", async () => {
    mocks.home = {
      activeCompounds: [{ id: "c1", name: "Tirzepatide", plannedDose: 2.5, doseUnit: "mg" }],
    };
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<MixCalculatorScreen />);
    });

    await act(async () => {
      await findButton(tree!.root).props.onPress();
    });

    expect(sheet(tree!.root).props.visible).toBe(false);
    // 2.5 mg compound default seeds the dose input as 2500 mcg; not a whole
    // number of mg, so it stores in the mcg family.
    expect(mocks.updateCompound).toHaveBeenCalledWith("c1", {
      plannedDose: 2500,
      doseUnit: "mcg",
    });
  });
});
