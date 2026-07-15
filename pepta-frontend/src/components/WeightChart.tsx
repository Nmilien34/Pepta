// WeightChart — the weight-history trend, rendered by react-native-chart-kit
// via TrendLineChart (brand config: bezier line, soft area fill, latest-point
// dot). The floating value pill anchors to the exact latest-point coordinates
// chart-kit reports, and fades in on mount / range change. Points are REAL
// series from the /progress API — this component never invents data.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./AppText";
import { TrendLineChart } from "./TrendLineChart";

export interface WeightChartPoint {
  t: number;
  value: number;
  iso: string;
}

export interface WeightChartProps {
  points: WeightChartPoint[];
  color: string;
  unit: string;
  formatDate(iso: string): string;
  height?: number;
}

const PILL_HALF_WIDTH = 40;

export function WeightChart({
  points,
  color,
  unit,
  formatDate,
  height = 120,
}: WeightChartProps) {
  const theme = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const seriesKey = points.map((p) => `${p.t}:${p.value}`).join("|");

  useEffect(() => {
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      delay: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [seriesKey, fade]);

  if (points.length === 0) {
    return (
      <View
        style={{ height, alignItems: "center", justifyContent: "center" }}
      >
        <AppText variant="body" color="textSecondary">
          Log your weight to see your trend.
        </AppText>
      </View>
    );
  }

  const latest = points[points.length - 1]!;

  return (
    <View style={{ marginTop: 10 }}>
      <TrendLineChart
        values={points.map((p) => p.value)}
        color={color}
        height={height + 40}
        fillOpacity={0.18}
        renderLastDot={({ x, y, width }) => {
          const left = Math.max(
            6,
            Math.min(width - PILL_HALF_WIDTH * 2 - 6, x - PILL_HALF_WIDTH),
          );
          const pillStyle: ViewStyle = {
            position: "absolute",
            left,
            top: Math.max(0, y - 62),
            zIndex: 2,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 0.5,
            borderRadius: 12,
            paddingVertical: 5,
            paddingHorizontal: 10,
            alignItems: "center",
          };
          return (
            <Animated.View
              style={[pillStyle, theme.shadows.card, { opacity: fade }]}
            >
              <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                {latest.value}
                <AppText variant="caption" color="textSecondary">
                  {" "}
                  {unit}
                </AppText>
              </AppText>
              <AppText
                variant="caption"
                color="textTertiary"
                align="center"
                style={{ fontSize: 10, marginTop: 1 }}
              >
                {formatDate(latest.iso)}
              </AppText>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}
