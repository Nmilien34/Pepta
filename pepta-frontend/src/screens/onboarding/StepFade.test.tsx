import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepFade, STEP_FADE_IN_MS, STEP_FADE_OUT_MS } from "./StepFade";

// Synchronous Animated stub: every timing completes immediately and records
// its target, so the fade-out → swap → fade-in order is assertable.
const mocks = vi.hoisted(() => ({
  timings: [] as Array<{ toValue: number; duration: number }>,
}));

vi.mock("react-native", () => ({
  Animated: {
    Value: class {
      constructor(public value: number) {}
    },
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("AnimatedView", props, children),
    timing: (
      _value: unknown,
      config: { toValue: number; duration: number },
    ) => ({
      start: (cb?: (result: { finished: boolean }) => void) => {
        mocks.timings.push({ toValue: config.toValue, duration: config.duration });
        cb?.({ finished: true });
      },
    }),
  },
  Easing: {
    in: (f: unknown) => f,
    out: (f: unknown) => f,
    quad: () => 0,
  },
}));

describe("StepFade", () => {
  beforeEach(() => {
    mocks.timings.length = 0;
  });

  it("renders the current turn with no animation on first mount", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <StepFade stepKey="welcome">
          <>welcome-screen</>
        </StepFade>,
      );
    });
    expect(renderer.toJSON()).toMatchObject({ children: ["welcome-screen"] });
    expect(mocks.timings).toEqual([]);
  });

  it("fades out, swaps, and fades back in when the step changes", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <StepFade stepKey="welcome">
          <>welcome-screen</>
        </StepFade>,
      );
    });
    act(() => {
      renderer.update(
        <StepFade stepKey="meetPep">
          <>meet-pep-screen</>
        </StepFade>,
      );
    });
    expect(mocks.timings).toEqual([
      { toValue: 0, duration: STEP_FADE_OUT_MS },
      { toValue: 1, duration: STEP_FADE_IN_MS },
    ]);
    expect(renderer.toJSON()).toMatchObject({ children: ["meet-pep-screen"] });
  });

  it("passes same-step prop updates straight through without animating", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <StepFade stepKey="needs">
          <>zero-selected</>
        </StepFade>,
      );
    });
    act(() => {
      renderer.update(
        <StepFade stepKey="needs">
          <>one-selected</>
        </StepFade>,
      );
    });
    expect(mocks.timings).toEqual([]);
    expect(renderer.toJSON()).toMatchObject({ children: ["one-selected"] });
  });

  it("accepts taps only when no swap is in flight", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <StepFade stepKey="welcome">
          <>welcome-screen</>
        </StepFade>,
      );
    });
    const view = renderer.root.findByType("AnimatedView" as never);
    // Settled (synchronous animations complete within the update): taps flow.
    expect(view.props.pointerEvents).toBe("auto");
  });
});
