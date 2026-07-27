import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateAppScreen } from "./RateAppScreen";

const mocks = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(() => Promise.resolve(true)),
  openURL: vi.fn(() => Promise.resolve()),
  requestReview: vi.fn(() => Promise.resolve()),
  store: new Map<string, string>(),
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
  StatusBar: "StatusBar",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mocks.store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mocks.store.set(key, value);
      return Promise.resolve();
    }),
  },
}));

vi.mock("expo-store-review", () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  requestReview: mocks.requestReview,
}));

vi.mock("../../components", () => ({
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement(
      "Pressable",
      { accessibilityRole: "button", accessibilityLabel: label, onPress },
      label,
    ),
  Icon: (props: { name: string }) => React.createElement("Icon", props),
  Typewriter: ({ text }: { text: string }) => React.createElement("Text", null, text),
  convo: {
    dim: "#777",
    ground: "#fff",
    hairline: "#eee",
    ink: "#111",
    primary: "#7C5CFC",
  },
}));

vi.mock("../../theme/typography", () => ({
  typography: {
    fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" },
  },
}));

vi.mock("../../config", () => ({
  APPSFLYER_APP_ID: "6784368155",
}));

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function render(onContinue = vi.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <RateAppScreen progress={0.9} onContinue={onContinue} />,
    );
  });
  return { renderer, onContinue };
}

describe("RateAppScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.isAvailableAsync.mockClear();
    mocks.openURL.mockClear();
    mocks.requestReview.mockClear();
    mocks.store.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-presents the native star card once the screen settles", async () => {
    render();
    expect(mocks.requestReview).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });

    expect(mocks.requestReview).toHaveBeenCalledTimes(1);
  });

  it("never re-prompts on a later visit (once per install)", async () => {
    const first = render();
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    act(() => first.renderer.unmount());

    render();
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });

    expect(mocks.requestReview).toHaveBeenCalledTimes(1);
  });

  it("skips the card when StoreKit review is unavailable, without breaking the screen", async () => {
    mocks.isAvailableAsync.mockResolvedValueOnce(false);
    const { renderer, onContinue } = render();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    expect(mocks.requestReview).not.toHaveBeenCalled();

    const cta = renderer.root.findAll(
      (node) => node.props.accessibilityLabel === "Continue",
    )[0]!;
    act(() => cta.props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("opens the App Store review composer from the write-a-review link", async () => {
    const { renderer } = render();
    const link = renderer.root.findAll(
      (node) => node.props.accessibilityLabel === "Write a review",
    )[0]!;

    await act(async () => {
      link.props.onPress();
      await flush();
    });

    expect(mocks.openURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6784368155?action=write-review",
    );
  });

  it("cancels the pending prompt when the user moves on before it fires", async () => {
    const { renderer } = render();
    act(() => renderer.unmount());

    await act(async () => {
      vi.advanceTimersByTime(1400);
      await flush();
    });

    expect(mocks.requestReview).not.toHaveBeenCalled();
  });
});
