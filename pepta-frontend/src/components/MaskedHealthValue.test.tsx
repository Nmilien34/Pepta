// Replay masking must actually reach the native side.
//
// The mechanism is not a PostHog API call — it is a prop the native SDK reads
// off the view tree. PostHog/Replay/UIView+Util.swift does:
//
//     label.lowercased().contains("ph-no-capture")
//
// against the view's accessibilityLabel AND its parent's. So the only thing
// that makes masking work is that literal string surviving to a rendered
// native view. These tests pin exactly that, because every way this breaks is
// SILENT: no error, no type failure, just readable doses in a replay.
//
// The registry test at the bottom exists because of a real miss during the
// masking pass: five health sheets were "masked" by spreading MASK_PROPS onto
// <BottomSheet>, which destructures a fixed prop list and never spreads rest.
// JSX spread skips excess-property checks, so TypeScript said nothing and all
// five were no-ops.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// setup.ts's global react-native mock exports only AppState and Platform, so
// render tests bring their own. Host-component strings are enough here: the
// assertions are about PROPS reaching a rendered element, not about layout.
vi.mock("react-native", () => ({ View: "View", Text: "Text" }));

import { Text, View } from "react-native";
import { MASK_PROPS, MaskedHealthValue, PH_NO_CAPTURE } from "./MaskedHealthValue";

describe("the native masking contract", () => {
  it("carries the exact literal the iOS SDK greps for", () => {
    // Not a stylistic constant: change this string and masking silently stops.
    expect(PH_NO_CAPTURE).toBe("ph-no-capture");
    expect(MASK_PROPS.accessibilityLabel).toBe("ph-no-capture");
  });

  it("keeps the view in the native tree so the label survives", () => {
    // RN flattens layout-only views. A flattened view has no label for the
    // native side to read, which un-masks the subtree without any visible
    // change — hence collapsable: false.
    expect(MASK_PROPS.collapsable).toBe(false);
  });

  it("does not swallow the accessible content beneath it", () => {
    // A blind user of a medication app must still hear "5 mg". The label is
    // for the replay SDK, not for VoiceOver.
    expect(MASK_PROPS.importantForAccessibility).toBe("no");
  });

  it("renders the mask props onto a real element", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <MaskedHealthValue>
          <Text>5 mg</Text>
        </MaskedHealthValue>,
      );
    });
    // Asserted by TYPE, not by label lookup: the repo bans matching on
    // accessibilityLabel in tests (two controls can share one). The wrapper is
    // the outermost View, so its props are the contract.
    const wrapper = tree.root.findAllByType("View" as never)[0]!;
    expect(wrapper.props.accessibilityLabel).toBe(PH_NO_CAPTURE);
    expect(wrapper.props.collapsable).toBe(false);
    expect(wrapper.props.importantForAccessibility).toBe("no");
    // The value still renders — masking is a replay concern, not a hidden view.
    expect(
      tree.root.findAll((n) => n.props?.children === "5 mg").length,
    ).toBeGreaterThan(0);
  });

  it("survives being spread onto an existing container", () => {
    // The preferred usage: no new view, no layout change.
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <View {...MASK_PROPS}>
          <Text>226 lb</Text>
        </View>,
      );
    });
    const container = tree.root.findAllByType("View" as never)[0]!;
    expect(container.props.accessibilityLabel).toBe(PH_NO_CAPTURE);
  });
});

// Every file that renders a user's dose, weight, medication or compound.
// Adding a screen here without masking it fails; removing a mask from one of
// these fails. Either way a reviewer has to approve the diff deliberately.
const MASKED_SURFACES = [
  "src/screens/app/HomeScreen.tsx",
  "src/screens/app/TrackScreen.tsx",
  "src/screens/app/ProgressScreen.tsx",
  "src/screens/app/WeightDetailScreen.tsx",
  "src/screens/app/DoseSettingsScreen.tsx",
  "src/screens/app/MixCalculatorScreen.tsx",
  "src/screens/app/CycleSetupScreen.tsx",
  "src/screens/app/LibraryEntryScreen.tsx",
  "src/screens/app/WidgetSetupScreen.tsx",
  "src/screens/app/ActivityLogScreen.tsx",
  "src/components/MedicationLevelCard.tsx",
  "src/components/ShotDetailSheet.tsx",
  "src/components/QuickLogSheet.tsx",
  "src/components/ScheduleSheet.tsx",
  "src/components/AddCompoundSheet.tsx",
  "src/components/MealLogSheet.tsx",
  "src/components/DataHealthCard.tsx",
  "src/components/DoseTimeSheet.tsx",
  "src/components/TimingSheet.tsx",
];

describe("the masked-surface registry", () => {
  it.each(MASKED_SURFACES)("%s masks its health values", (file) => {
    const source = readFileSync(file, "utf-8");
    // USAGE, not the identifier. Asserting `toContain("MASK_PROPS")` passes on
    // the leftover import alone — deleting the actual spread leaves the import
    // behind and the test green. Caught by mutation, not by review.
    const used =
      source.includes("{...MASK_PROPS}") || source.includes("panelProps={MASK_PROPS}");
    expect(used).toBe(true);
  });

  it("routes sheet masking through panelProps, never a bare spread", () => {
    // <BottomSheet {...MASK_PROPS}> type-checks and does NOTHING: the
    // component destructures a fixed prop list. This is the assertion that
    // would have caught the original five no-ops.
    for (const file of MASKED_SURFACES) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toContain("<BottomSheet {...MASK_PROPS}");
    }
  });
});
