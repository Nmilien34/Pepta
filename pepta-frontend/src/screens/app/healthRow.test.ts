import { describe, expect, it } from "vitest";
import { healthRowState } from "./healthRow";

describe("the Sync Apple Health row on a device without HealthKit", () => {
  // Guideline 2.1(a), build 47: "an error message appeared when 'Sync Apple
  // Health' was tapped" on an iPad Air. The row must not offer the tap.
  it("is not tappable, so nothing can go wrong on tap", () => {
    expect(healthRowState("unavailable", false, false).tappable).toBe(false);
  });

  it("reads as a fact about the device, not as a failure", () => {
    const { value, sub } = healthRowState("unavailable", false, false);
    for (const word of ["error", "failed", "unavailable", "couldn’t", "can’t"]) {
      expect(value.toLowerCase()).not.toContain(word);
      expect(sub.toLowerCase()).not.toContain(word);
    }
  });

  // Guideline 2.5.1: the HealthKit functionality has to be identified in the
  // UI. On the iPad they reviewed, the row was the only place it appeared —
  // so the explanation has to survive on the device that cannot use it.
  it("still identifies the Apple Health functionality", () => {
    const { sub } = healthRowState("unavailable", false, false);
    expect(sub).toContain("Apple Health");
  });
});

describe("the row on a device with HealthKit", () => {
  it("names what is read and states that nothing is written", () => {
    const { sub } = healthRowState("available", false, false);
    expect(sub).toContain("Steps");
    expect(sub).toContain("Workouts");
    // Read-only is the claim 2.5.1 is really asking us to make visible.
    expect(sub.toLowerCase()).toContain("never writes");
  });

  it("reflects on and off, and invites the tap", () => {
    expect(healthRowState("available", true, false)).toMatchObject({ value: "On", tappable: true });
    expect(healthRowState("available", false, false)).toMatchObject({ value: "Off", tappable: true });
  });

  it("locks the row while a request is in flight, so a double tap is visible", () => {
    const state = healthRowState("available", false, true);
    expect(state.value).toBe("Checking…");
    expect(state.tappable).toBe(false);
  });
});

describe("before availability is known", () => {
  // Availability resolves async on mount. Tapping into an unknown state is
  // exactly how the first rejection happened.
  it("does not let the row be tapped", () => {
    const state = healthRowState("checking", false, false);
    expect(state.tappable).toBe(false);
    expect(state.value).toBe("Checking…");
  });

  it("identifies the functionality even before the check lands", () => {
    expect(healthRowState("checking", false, false).sub).toContain("Apple Health");
  });
});
