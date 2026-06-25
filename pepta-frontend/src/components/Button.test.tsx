import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {
    Value: vi.fn(() => ({})),
    View: "Animated.View",
    spring: vi.fn(() => ({ start: vi.fn() })),
  },
  Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Pressable", props, children),
  View: "View",
}));

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      onPrimary: "#fff",
      primary: "#7C5CFC",
      primaryGradientEnd: "#8C63F4",
      primaryGradientStart: "#6751E8",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
    },
    motion: {
      scale: { pressIn: 0.98, pressOut: 1 },
      springs: { press: {} },
    },
    sizes: {
      button: { height: 56, borderRadius: 18, paddingHorizontal: 16 },
    },
    spacing: { sm: 8 },
  }),
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => children,
}));

describe("Button", () => {
  it("renders primary buttons with a restrained premium gradient and subtle highlight", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(<Button label="Log a shot · 1 tap" />);
    });

    const gradients = tree!.root.findAll(
      (node) => String(node.type) === "LinearGradient",
    );

    expect(gradients[0]!.props.colors).toEqual(["#6751E8", "#8C63F4"]);
    expect(gradients[0]!.props.start).toEqual({ x: 0, y: 0 });
    expect(gradients[0]!.props.end).toEqual({ x: 1, y: 0.85 });
    expect(gradients[1]!.props.colors).toEqual([
      "rgba(255,255,255,0.24)",
      "rgba(255,255,255,0)",
    ]);
  });
});
