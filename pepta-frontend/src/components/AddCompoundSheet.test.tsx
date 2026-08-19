import React from "react";
import { all } from "../tests/byLabel";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AddCompoundSheet } from "./AddCompoundSheet";

const mocks = vi.hoisted(() => ({
  addCompound: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
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
  TextInput: (props: Record<string, unknown>) => React.createElement("TextInput", props),
  View: "View",
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      border: "#eee",
      danger: "#dc2626",
      onPrimary: "#fff",
      primary: "#8B5CF6",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    sizes: { hitSlop: 10 },
    spacing: { sm: 8, md: 12 },
    typography: { body: {} },
  }),
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({
    addCompound: mocks.addCompound,
  }),
}));

vi.mock("./AppText", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
}));

vi.mock("./BottomSheet", () => ({
  BottomSheet: ({
    visible,
    children,
    ...props
  }: {
    visible: boolean;
    children?: React.ReactNode;
  }) => (visible ? React.createElement("BottomSheet", props, children) : null),
}));

vi.mock("./Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("Button", { label, onPress }, label),
}));

vi.mock("./Icon", () => ({
  Icon: "Icon",
}));

vi.mock("./onboarding/Chip", () => ({
  Chip: ({ label }: { label: string }) =>
    React.createElement("Chip", null, label),
}));

vi.mock("./SearchField", () => ({
  SearchField: (props: Record<string, unknown>) =>
    React.createElement("SearchField", props),
}));

describe("AddCompoundSheet", () => {
  it("keeps the medication search sheet usable while the keyboard is open", async () => {
    const onClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <AddCompoundSheet visible={true} onClose={onClose} />,
      );
    });

    const bottomSheet = tree!.root.find(
      (node) => String(node.type) === "BottomSheet",
    );
    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close medication picker",
    });

    expect(bottomSheet.props).toMatchObject({
      avoidKeyboard: false,
      scrollable: true,
    });
    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton.props.onPress();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('routes "Something else" into the custom form — never a junk compound named "Something else"', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<AddCompoundSheet visible={true} onClose={vi.fn()} />);
    });

    // "Something else" sits past the 6-row search cap — reach it the way a
    // user does, by searching for it.
    const search = tree!.root.findAll((node) => String(node.type) === "SearchField").at(-1)!;
    await act(async () => {
      search.props.onChangeText("something");
    });

    const text = (node: TestRenderer.ReactTestInstance): string =>
      node.children
        .map((child) => (typeof child === "string" ? child : text(child as TestRenderer.ReactTestInstance)))
        .join("");
    const row = tree!.root
      .findAll(
        (node) =>
          String(node.type) === "Pressable" &&
          node.props?.onPress != null &&
          text(node).includes("Something else"),
      )
      .at(-1)!;

    await act(async () => {
      row.props.onPress();
    });

    // The custom form opened (name field present) and nothing was created.
    expect(
      tree!.root.findAll(
        (node) => String(node.type) === "TextInput" && node.props?.placeholder === "e.g. Foundayo",
      ),
    ).toHaveLength(1);
    expect(mocks.addCompound).not.toHaveBeenCalled();
  });

  it('always offers "Add your own" without needing a failed search', async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<AddCompoundSheet visible={true} onClose={vi.fn()} />);
    });
    expect(
      all(tree!, "Add your own medication", "Pressable"),
    ).toHaveLength(1);
  });

  it("keeps decimal keystrokes on screen — typing 2.5 into the dose field", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<AddCompoundSheet visible={true} onClose={vi.fn()} />);
    });
    await act(async () => {
      all(tree!, "Add your own medication", null)
        .at(-1)!
        .props.onPress();
    });

    const doseField = () =>
      tree!.root.findAll(
        (n) => String(n.type) === "TextInput" && n.props?.keyboardType === "decimal-pad",
      )[0]!;

    // The exact sequence a user types. Before the fix "2." re-rendered as "2"
    // (decimal erased) and a leading "0" re-rendered as "" — so 0.5 and 2.5
    // were both impossible to enter.
    for (const keystroke of ["2", "2.", "2.5"]) {
      await act(async () => {
        doseField().props.onChangeText(keystroke);
      });
      expect(doseField().props.value).toBe(keystroke);
    }

    await act(async () => {
      doseField().props.onChangeText("0");
    });
    expect(doseField().props.value).toBe("0");
    await act(async () => {
      doseField().props.onChangeText("0.5");
    });
    expect(doseField().props.value).toBe("0.5");
  });
});
