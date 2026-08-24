// Button — primary / secondary / ghost.
//
// FLAT FILL WITH ITS OWN EDGE. This was a gradient (#6751E8→#8C63F4) in a full
// pill under a coloured glow: three softening effects at once and no defined
// boundary, so the shape read as a lozenge painted onto the surface rather
// than an object cut into it. The gradient was the worst of the three — a ~5%
// luminance shift across 56pt is too subtle to read as a deliberate gradient
// and too present to read as one clean colour, which left the fill looking
// unresolved.
//
// Now: one flat colour, a one-step-darker stroke (a real edge reads as the
// object's own boundary catching less light), radius 14 so four corners
// survive, and no shadow. The fill moved to `buttonFill` (#6751E8) — the old
// gradient's own deeper end, so it is not a new colour — which also fixes
// contrast: white on it is 5.2:1 and passes AA, where the lighter #7C5CFC was
// 4.3:1 and failed for anything but large text.
//
// PRESS DARKENS INSTEAD OF SCALING. A spring-scale blurs the edge for the
// length of the animation, which is precisely the thing this restyle exists
// to give the button. Darkening the fill keeps the shape still.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./AppText";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  // Optional leading element (icon).
  leading?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  fullWidth = true,
  accessibilityLabel,
  leading,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const base: ViewStyle = {
    height: theme.sizes.button.height,
    borderRadius: theme.sizes.button.borderRadius,
    borderWidth: theme.sizes.button.borderWidth,
    paddingHorizontal: theme.sizes.button.paddingHorizontal,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
    width: fullWidth ? "100%" : undefined,
    opacity: isDisabled ? 0.45 : 1,
  };

  /** Fill and edge per variant; pressed darkens both, never moves the shape. */
  const skin = (pressed: boolean): ViewStyle => {
    if (variant === "primary") {
      return {
        backgroundColor:
          pressed && !isDisabled
            ? theme.colors.buttonFillPressed
            : theme.colors.buttonFill,
        borderColor:
          pressed && !isDisabled
            ? theme.colors.buttonEdgePressed
            : theme.colors.buttonEdge,
      };
    }
    if (variant === "secondary") {
      // The same edge logic on a tinted fill, so the pair reads as one family.
      return {
        backgroundColor: pressed && !isDisabled ? "#E4DDFF" : "#EFEBFF",
        borderColor: "#DCD3FF",
      };
    }
    return {
      backgroundColor: pressed && !isDisabled ? theme.colors.surfaceAlt : "transparent",
      borderColor: "transparent",
    };
  };

  // SECONDARY'S LABEL IS buttonFill, NOT primary. The restyle put a purple
  // label on a tinted fill, and #7C5CFC on #EFEBFF is 3.75:1 — a fail, and an
  // accessibility regression introduced by a change whose whole argument was
  // accessibility. The deeper #6751E8 is 4.59:1 and passes, and it is the same
  // token the primary fill uses, so the pair still reads as one family.
  const labelColor =
    variant === "primary" ? "onPrimary" : variant === "secondary" ? "buttonFill" : "primary";

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary"
              ? theme.colors.onPrimary
              : theme.colors.primary
          }
        />
      ) : (
        <>
          {leading}
          <AppText variant="button" color={labelColor}>
            {label}
          </AppText>
        </>
      )}
    </>
  );

  return (
    <View style={[{ width: fullWidth ? "100%" : undefined }, style]}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{
          disabled: Boolean(isDisabled),
          busy: Boolean(loading),
        }}
      >
        {({ pressed }) => <View style={[base, skin(pressed)]}>{inner}</View>}
      </Pressable>
    </View>
  );
}
