// WeightChart — area + line chart for the weight history. The line "draws on"
// via an animated stroke-dashoffset (exact length from the polyline, so the
// reveal completes cleanly), the area fades in, and the latest point gets a dot
// with a floating value pill. Re-animates whenever the series changes (range).

import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  View,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { useTheme } from "../theme";
import { AppText } from "./AppText";

const AnimatedPath = Animated.createAnimatedComponent(Path);

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

const W = 300;

export function WeightChart({
  points,
  color,
  unit,
  formatDate,
  height = 120,
}: WeightChartProps) {
  const theme = useTheme();
  const H = height;
  const padY = 20;

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const minT = points[0]!.t;
    const spanT = points[points.length - 1]!.t - minT || 1;
    const x = (t: number) =>
      points.length === 1 ? W / 2 : ((t - minT) / spanT) * W;
    const y = (v: number) => H - padY - ((v - minV) / range) * (H - padY * 2);
    const screen = points.map((p) => ({ x: x(p.t), y: y(p.value) }));

    const line = screen
      .map(
        (s, i) => `${i === 0 ? "M" : "L"}${s.x.toFixed(1)} ${s.y.toFixed(1)}`,
      )
      .join(" ");
    const last = screen[screen.length - 1]!;
    const first = screen[0]!;
    const area = `${line} L${last.x.toFixed(1)} ${H} L${first.x.toFixed(1)} ${H} Z`;

    let length = 0;
    for (let i = 1; i < screen.length; i += 1) {
      length += Math.hypot(
        screen[i]!.x - screen[i - 1]!.x,
        screen[i]!.y - screen[i - 1]!.y,
      );
    }
    return { line, area, length: Math.max(1, length), last, screen };
  }, [points, H]);

  const draw = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const length = geom?.length ?? 1;

  useEffect(() => {
    draw.setValue(length);
    fade.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(draw, {
        toValue: 0,
        duration: 900,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [length, draw, fade]);

  if (!geom || points.length === 0) {
    return (
      <View
        style={{ height: H, alignItems: "center", justifyContent: "center" }}
      >
        <AppText variant="body" color="textSecondary">
          Log your weight to see your trend.
        </AppText>
      </View>
    );
  }

  const latest = points[points.length - 1]!;
  const labelLeft: DimensionValue = `${Math.max(8, Math.min(92, (geom.last.x / W) * 100))}%`;
  const pillBaseStyle: ViewStyle = {
    position: "absolute",
    top: -6,
    left: labelLeft,
    transform: [{ translateX: -36 }],
    zIndex: 2,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 0.5,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
  };
  const pillOpacityStyle = { opacity: fade } as unknown as ViewStyle;

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ position: "relative" }}>
        {/* floating current value pill, anchored over the latest point */}
        <Animated.View
          style={[pillBaseStyle, theme.shadows.card, pillOpacityStyle]}
        >
          <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
            {latest.value}
            <AppText variant="caption" color="textSecondary">
              {" "}
              {unit}
            </AppText>
          </AppText>
        </Animated.View>

        <Svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          style={{ marginTop: 18 }}
        >
          <Defs>
            <LinearGradient id="weightFill" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line
            x1={0}
            y1={H * 0.35}
            x2={W}
            y2={H * 0.35}
            stroke={theme.colors.border}
            strokeWidth={1}
          />
          <Line
            x1={0}
            y1={H * 0.7}
            x2={W}
            y2={H * 0.7}
            stroke={theme.colors.border}
            strokeWidth={1}
          />
          <AnimatedPath d={geom.area} fill="url(#weightFill)" opacity={fade} />
          <AnimatedPath
            d={geom.line}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={geom.length}
            strokeDashoffset={draw}
          />
          <Circle
            cx={geom.last.x}
            cy={geom.last.y}
            r={5}
            fill={color}
            stroke="#fff"
            strokeWidth={2.5}
          />
        </Svg>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <AppText
          variant="caption"
          color="textTertiary"
          style={{ fontSize: 10 }}
        >
          {formatDate(points[0]!.iso)}
        </AppText>
        <AppText variant="caption" style={{ fontSize: 10, color }}>
          {formatDate(latest.iso)}
        </AppText>
      </View>
    </View>
  );
}
