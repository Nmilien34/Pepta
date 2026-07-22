import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetPepScreen } from "./MeetPepScreen";

const mocks = vi.hoisted(() => ({
  onContinue: vi.fn(),
  notificationAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate() {
      return this.value;
    }
    setValue(next: number) {
      this.value = next;
    }
  }
  const finished = { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined };
  return {
    Animated: {
      Value,
      View: "Animated.View",
      Text: "Animated.Text",
      timing: vi.fn(() => finished),
      spring: vi.fn(() => finished),
      sequence: vi.fn(() => finished),
      loop: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
    },
    Easing: {
      inOut: (v: unknown) => v,
      out: (v: unknown) => v,
      quad: "quad",
    },
    Platform: { OS: "ios" },
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Text", props, children),
    View: "View",
  };
});

vi.mock("expo-haptics", () => ({
  notificationAsync: mocks.notificationAsync,
  NotificationFeedbackType: { Success: "success" },
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));

vi.mock("../../components", () => ({
  ConvoScreen: ({
    children,
    footer,
    onTyped,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    onTyped?: () => void;
  }) => {
    // The scaffold reveals children after the question types; fire it inline.
    onTyped?.();
    return React.createElement("View", null, children, footer);
  },
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  Mascot: ({ pose }: { pose: string }) => React.createElement("Mascot", { pose }),
  OnboardingMotionContext: React.createContext({ animate: true }),
  convo: {
    surface: "#fff",
    hairline: "#eee",
    ink: "#111",
  },
}));

describe("MeetPepScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onContinue.mockClear();
    mocks.notificationAsync.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderScreen() {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <MeetPepScreen progress={0.08} onContinue={mocks.onContinue} />,
      );
    });
    return tree!;
  }

  function waveButton(tree: TestRenderer.ReactTestRenderer) {
    return tree.root.find(
      (node) =>
        String(node.type) === "ConvoButton" &&
        typeof node.props.onPress === "function",
    );
  }

  it("greets with Pep idle, then waving back flips the pose and advances one beat later", async () => {
    const tree = await renderScreen();

    // Before the wave: idle Pep only.
    expect(
      tree.root.findAll((n) => String(n.type) === "Mascot").map((n) => n.props.pose),
    ).toEqual(["idle"]);

    await act(async () => {
      waveButton(tree).props.onPress();
    });

    // Wave pose mounts; the flow has not advanced yet — the wave holds a beat.
    expect(
      tree.root.findAll((n) => String(n.type) === "Mascot").map((n) => n.props.pose),
    ).toEqual(["idle", "wave"]);
    expect(mocks.onContinue).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(950);
    });
    expect(mocks.onContinue).toHaveBeenCalledTimes(1);

    // The success thump landed on the sent-beat delay.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(mocks.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it("ignores a double press — one wave, one advance", async () => {
    const tree = await renderScreen();

    await act(async () => {
      waveButton(tree).props.onPress();
      waveButton(tree).props.onPress();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mocks.onContinue).toHaveBeenCalledTimes(1);
  });
});
