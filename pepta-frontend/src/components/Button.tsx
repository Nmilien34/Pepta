// Button — primary / secondary / ghost. Primary fills with the brand gradient
// (Master Prompt §3A primaryGrad). Press gives a subtle, calm scale-spring
// (motion tokens). Pill radius, 56px height, bold label.

import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: theme.motion.scale.pressIn,
      useNativeDriver: true,
      ...theme.motion.springs.press,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: theme.motion.scale.pressOut,
      useNativeDriver: true,
      ...theme.motion.springs.press,
    }).start();

  const base: ViewStyle = {
    height: theme.sizes.button.height,
    borderRadius: theme.sizes.button.borderRadius,
    paddingHorizontal: theme.sizes.button.paddingHorizontal,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
    width: fullWidth ? "100%" : undefined,
    opacity: isDisabled ? 0.5 : 1,
  };
  const primaryShadow: ViewStyle | null =
    variant === "primary" && !isDisabled
      ? {
          shadowColor: theme.colors.primary,
          shadowOpacity: 0.24,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 3,
        }
      : null;

  const labelColor =
    variant === "primary"
      ? "onPrimary"
      : variant === "secondary"
        ? "textPrimary"
        : "primary";

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
    <Animated.View
      style={[
        { transform: [{ scale }], width: fullWidth ? "100%" : undefined },
        primaryShadow,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{
          disabled: Boolean(isDisabled),
          busy: Boolean(loading),
        }}
      >
        {variant === "primary" ? (
          <LinearGradient
            colors={[
              theme.colors.primaryGradientStart,
              theme.colors.primaryGradientEnd,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.85 }}
            style={[
              base,
              {
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
                overflow: "hidden",
              },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.24)", "rgba(255,255,255,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                position: "absolute",
                top: 1,
                left: 1,
                right: 1,
                height: Math.round(theme.sizes.button.height * 0.44),
                borderTopLeftRadius: theme.sizes.button.borderRadius - 1,
                borderTopRightRadius: theme.sizes.button.borderRadius - 1,
              }}
            />
            {inner}
          </LinearGradient>
        ) : (
          <View
            style={[
              base,
              variant === "secondary"
                ? { backgroundColor: theme.colors.surfaceAlt }
                : { backgroundColor: "transparent" },
            ]}
          >
            {inner}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
