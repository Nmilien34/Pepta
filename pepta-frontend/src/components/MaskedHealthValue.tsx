// Hides a rendered health value from PostHog session replay.
//
// WHY THIS EXISTS. The replay config masks all text INPUTS and all images, but
// a value the user has already committed is usually rendered back as a plain
// <Text> — "5 mg", "226 lb", "Tirzepatide". Those are not inputs, so no global
// switch covers them, and they are exactly the fields that make a replay of
// this app a medical record.
//
// PostHogMaskView works by setting accessibilityLabel="ph-no-capture" and
// collapsable={false} so React Native cannot flatten the wrapper away. It is a
// plain View otherwise, so it participates in layout — wrap the smallest
// region that contains the value, not a whole screen, or the surrounding
// flex behaviour changes.
//
// It stays a no-op if PostHog is absent, so it is safe to leave in place.

import React from "react";
import { PostHogMaskView } from "posthog-react-native";
import type { ViewProps } from "react-native";

export interface MaskedHealthValueProps extends ViewProps {
  children: React.ReactNode;
}

/**
 * Wrap anything that renders a dose, a weight, or a medication name back to
 * the user. Named for the reason rather than the mechanism, so a reader who
 * has never heard of PostHog still knows not to unwrap it.
 */
export function MaskedHealthValue({ children, ...viewProps }: MaskedHealthValueProps) {
  return <PostHogMaskView {...viewProps}>{children}</PostHogMaskView>;
}
