// Hides rendered health values from PostHog session replay.
//
// WHY THIS EXISTS. The replay config masks all text INPUTS and all images, but
// a value the user has already committed is rendered back as a plain <Text> —
// "5 mg", "226 lb", "Tirzepatide". Those are not inputs, so no global switch
// covers them, and they are exactly what would make a replay of this app a
// medical record.
//
// HOW MASKING IS DETECTED (verified against the pinned pod, not assumed):
// PostHog/Replay/UIView+Util.swift checks `accessibilityLabel` on the view AND
// on its parent, matching `label.lowercased().contains("ph-no-capture")`. So
// anything carrying that label — and everything inside it — is redacted.
//
// TWO WAYS TO USE IT, and the first is usually right:
//
//   1. MASK_PROPS spread onto a container that ALREADY exists in the JSX.
//      Adds no view, changes no layout. Prefer this: wrapping a <Text> in a
//      fresh <View> introduces a block box and can shift a row.
//
//   2. <MaskedHealthValue> when there is genuinely no container to hang it on.
//      This renders a real View (collapsable={false}, so RN cannot flatten it
//      away) and therefore participates in layout.
//
// ACCESSIBILITY IS NOT SACRIFICED EITHER WAY. `accessibilityLabel` on a View
// that is not itself an accessibility element is never announced — VoiceOver
// still reads the child <Text> normally. That is also why the label goes on a
// CONTAINER and never directly on the Text rendering the value: doing that
// would make VoiceOver read "ph-no-capture" instead of "5 mg" to a blind user
// of a medication app.

import React from "react";
import { View, type ViewProps } from "react-native";

/** The exact string the native replay SDK looks for. */
export const PH_NO_CAPTURE = "ph-no-capture";

/**
 * Spread onto any existing container View to redact its subtree from replay.
 *
 * `importantForAccessibility: "no"` mirrors what the SDK's own PostHogMaskView
 * sets, so the wrapper cannot swallow the accessible content beneath it on
 * Android. `collapsable: false` keeps the view in the native hierarchy — RN
 * flattens layout-only views, and a flattened view has no label for the native
 * side to read, which silently un-masks the subtree.
 */
export const MASK_PROPS = {
  accessibilityLabel: PH_NO_CAPTURE,
  importantForAccessibility: "no",
  collapsable: false,
} as const;

export interface MaskedHealthValueProps extends ViewProps {
  children: React.ReactNode;
}

/**
 * Wrap anything that renders a dose, a weight, or a medication name back to
 * the user. Named for the reason rather than the mechanism, so a reader who
 * has never heard of PostHog still knows not to unwrap it.
 */
export function MaskedHealthValue({ children, ...viewProps }: MaskedHealthValueProps) {
  return (
    <View {...viewProps} {...MASK_PROPS}>
      {children}
    </View>
  );
}
