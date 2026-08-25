import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepFade, STEP_FADE_IN_MS, STEP_FADE_OUT_MS, STEP_RISE_PT } from "./StepFade";

// Synchronous Animated stub: every timing completes immediately and records
// its target, so the fade-out → swap → fade-in order is assertable.
const mocks = vi.hoisted(() => ({
  timings: [] as Array<{ toValue: number; duration: number }>,
  seeded: [] as number[],
}));

vi.mock("react-native", () => ({
  Animated: {
    Value: class {
      constructor(public value: number) {}
      // The incoming turn is seeded to its start offset before the rise runs.
      setValue(v: number) {
        mocks.seeded.push(v);
        this.value = v;
      }
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
    // Opacity and rise run together on the way in.
    parallel: (animations: Array<{ start: (cb?: () => void) => void }>) => ({
      start: (cb?: () => void) => {
        for (const a of animations) a.start();
        cb?.();
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
    mocks.seeded.length = 0;
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
      // Opacity in, and the rise settling to 0 alongside it.
      { toValue: 1, duration: STEP_FADE_IN_MS },
      { toValue: 0, duration: STEP_FADE_IN_MS },
    ]);
    expect(renderer.toJSON()).toMatchObject({ children: ["meet-pep-screen"] });
  });

  it("seeds the incoming turn below its resting place, and only the incoming one", () => {
    // The rise is an ENTRANCE. Driving it on the way out would slide the
    // leaving turn away from the user, which is the "dramatic" reading the
    // pace work was explicitly trying to avoid.
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <StepFade stepKey="welcome">
          <>welcome-screen</>
        </StepFade>,
      );
    });
    expect(mocks.seeded).toEqual([]);

    act(() => {
      renderer.update(
        <StepFade stepKey="meetPep">
          <>meet-pep-screen</>
        </StepFade>,
      );
    });

    expect(mocks.seeded).toEqual([STEP_RISE_PT]);
    expect(STEP_RISE_PT).toBeGreaterThan(0);
  });

  it("fades slowly enough to be perceived as a fade", () => {
    // Below roughly 120ms the eye reads a dissolve as a cut with a flicker.
    // This shipped at 90ms out / 160ms in, which is why every turn snapped.
    expect(STEP_FADE_OUT_MS).toBeGreaterThanOrEqual(120);
    expect(STEP_FADE_IN_MS).toBeGreaterThanOrEqual(120);
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
