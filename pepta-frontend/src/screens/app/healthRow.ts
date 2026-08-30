// The "Sync Apple Health" row's state, as a pure function of what the device
// can actually do. Rejected TWICE over this row, in opposite directions:
//
//   2.1(a), build 45 — the row did NOTHING when tapped on an iPad. `void
//   toggleHealthSync()` discarded the promise, so a throw produced no UI at
//   all, and iPadOS has no HealthKit so the enable path threw every time.
//
//   2.1(a), build 47 — the fix for that surfaced an Alert instead ("Apple
//   Health isn't available"), and Apple counted the error message itself as
//   the bug: "an error message appeared when 'Sync Apple Health' was tapped."
//
// Both rejections came from an iPad Air, and both share one cause: the row
// offered a control the device could never honour. A control that cannot work
// should not invite the tap — so on a device without HealthKit the row is
// still SHOWN and still explains itself, but it is not tappable and it raises
// no alert. There is nothing left to go wrong on tap because there is no tap.
//
// The same build drew 2.5.1 — "does not clearly identify the HealthKit
// functionality in the app's user interface" — because the only identification
// anywhere was the four-word row label, and on the iPad they reviewed even
// that led to an error rather than an explanation. So every state carries a
// description naming what Pepta reads and, just as importantly, that it never
// writes back. That line is the identification, and it is present on devices
// that have HealthKit and devices that do not.

export type HealthAvailability = "checking" | "available" | "unavailable";

export interface HealthRowState {
  /** Right-hand value on the row. */
  value: string;
  /** The line under the label. Always names the HealthKit functionality. */
  sub: string;
  /** False means the row renders disabled — no press handler, no alert. */
  tappable: boolean;
}

/**
 * What Pepta does with HealthKit, in the user's words. Read-only is the part
 * worth stating plainly: it is the reassurance a health app owes, and it is
 * the transparency 2.5.1 asks for.
 */
const READS = "Reads Steps and Workouts from Apple Health. Pepta never writes to it.";

export function healthRowState(
  availability: HealthAvailability,
  syncOn: boolean,
  busy: boolean,
): HealthRowState {
  if (availability === "unavailable") {
    return {
      // Not "Error", not "Failed". Nothing went wrong — this iPad simply has
      // no Health app, and the sentence says so without sounding like a fault.
      value: "iPhone only",
      sub: "Apple Health is available on iPhone. Everything else in Pepta works here.",
      tappable: false,
    };
  }

  // Availability is resolved asynchronously on mount. Until it lands the row
  // must not be tappable: tapping into an unknown state is how the first
  // rejection happened.
  if (availability === "checking" || busy) {
    return { value: "Checking…", sub: READS, tappable: false };
  }

  return { value: syncOn ? "On" : "Off", sub: READS, tappable: true };
}
