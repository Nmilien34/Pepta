// Onboarding — warm-up B · The value carousel (design-lab/trial-warmup.html).
// With a hard paywall the user has never seen the inside of the app; these
// four slides are the only product experience they get before deciding. Each
// slide is one real Pepta surface in a mini device frame with a one-line
// benefit caption in the user's words. Order is deliberate: logistics first
// (the immediate anxiety), the level curve second (the differentiator),
// outcome third, care last.
//
// Manual swiping only — no auto-advance. These cards carry medical content
// people actually read, and a mover fights that. The CTA persists across all
// slides with the exact first-person copy from screen A, so the ladder's
// second tap is the same yes as the first.
//
// Every slide animates when it becomes active — the level curve draws itself
// with the flow's both-ends ease, chips stagger in, the due-day dot pulses —
// and a selection tick lands on each page snap.

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import {
  ConvoButton,
  ConvoGround,
  ConvoProgressHeader,
  convo,
} from "../../components";
import { Mascot } from "../../components/Mascot";
import { typography } from "../../theme/typography";

const AnimatedPath = Animated.createAnimatedComponent(Path);
// The flow's watchable ease — soft departure, long tail (see leanMassBars).
const DRAW_EASING = Easing.bezier(0.32, 0, 0.24, 1);
// Dasharray upper bounds for the two curves (measured ≈332 / ≈312; a little
// slack only affects the first invisible millisecond of the draw).
const LEVEL_CURVE_LENGTH = 360;
const WEIGHT_CURVE_LENGTH = 330;

/** The medication-level curve, drawing itself when its slide becomes active. */
function LevelCurve({ active }: { active: boolean }) {
  const draw = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return undefined;
    started.current = true;
    const animation = Animated.timing(draw, {
      toValue: 1,
      duration: 1700,
      delay: 150,
      easing: DRAW_EASING,
      useNativeDriver: false, // SVG props are not native-driver animatable
    });
    animation.start();
    return () => animation.stop();
  }, [active, draw]);
  const dashOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [LEVEL_CURVE_LENGTH, 0],
  });
  const fillIn = draw.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 0.9] });
  return (
    <Svg viewBox="0 0 300 90" style={styles.levelSvg}>
      <Defs>
        <LinearGradient id="levelFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="rgba(124,92,252,0.22)" />
          <Stop offset="1" stopColor="rgba(124,92,252,0)" />
        </LinearGradient>
      </Defs>
      <Path d="M0 72 H300" stroke="#F0F0F3" strokeWidth={1} />
      <Path d="M0 40 H300" stroke="#F0F0F3" strokeWidth={1} />
      <AnimatedPath
        d="M0 64 C40 58 60 26 98 22 C140 18 152 52 192 56 C232 60 256 34 300 26 L300 84 L0 84 Z"
        fill="url(#levelFill)"
        opacity={fillIn}
      />
      <AnimatedPath
        d="M0 64 C40 58 60 26 98 22 C140 18 152 52 192 56 C232 60 256 34 300 26"
        fill="none"
        stroke={convo.primary}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${LEVEL_CURVE_LENGTH}`}
        strokeDashoffset={dashOffset}
      />
    </Svg>
  );
}

/** The weight trend line + the muscle chip popping in after it. */
function WeightTrend({ active }: { active: boolean }) {
  const draw = useRef(new Animated.Value(0)).current;
  const chipPop = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return undefined;
    started.current = true;
    const sequence = Animated.sequence([
      Animated.timing(draw, {
        toValue: 1,
        duration: 1300,
        delay: 150,
        easing: DRAW_EASING,
        useNativeDriver: false,
      }),
      Animated.spring(chipPop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]);
    sequence.start(({ finished }) => {
      if (finished && Platform.OS !== "web") {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
    });
    return () => sequence.stop();
  }, [active, draw, chipPop]);
  const dashOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [WEIGHT_CURVE_LENGTH, 0],
  });
  return (
    <View>
      <View style={[styles.miniRow, styles.miniBetween]}>
        <Text style={styles.miniName}>Weight</Text>
        <View style={[styles.miniPill, { backgroundColor: "#FBEAF6" }]}>
          <Text style={[styles.miniPillText, { color: "#A8327D" }]}>−12 lb</Text>
        </View>
      </View>
      <Svg viewBox="0 0 300 80" style={styles.weightSvg}>
        <AnimatedPath
          d="M0 18 C60 22 120 34 180 48 C230 58 270 62 300 64"
          fill="none"
          stroke="#E25CC4"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${WEIGHT_CURVE_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <Animated.View
        style={[
          styles.miniPill,
          styles.musclePill,
          { opacity: chipPop, transform: [{ scale: chipPop }] },
        ]}
      >
        <Text style={[styles.miniPillText, { color: "#1E8E40" }]}>Muscle protected</Text>
      </Animated.View>
    </View>
  );
}

/** The next-dose card: countdown, week letters, a pulsing due-day dot. */
function NextDose({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <View>
      <Text style={styles.miniSec}>NEXT DOSE</Text>
      <Text style={styles.miniBig}>3d 9h</Text>
      <Text style={styles.miniLab}>Sat · 8:00 PM</Text>
      <View style={styles.week}>
        {days.map((d, i) => (
          <View key={`${d}${i}`} style={styles.weekDay}>
            <Text style={[styles.weekLetter, i === 2 && { color: convo.ink }]}>{d}</Text>
            {i === 5 ? (
              <Animated.View
                style={[
                  styles.dueDot,
                  {
                    transform: [
                      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) },
                    ],
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
                  },
                ]}
              />
            ) : (
              <View style={styles.dueDotSpacer} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The side-effect pattern chips, staggering in when the slide is active. */
function SymptomChips({ active }: { active: boolean }) {
  const chips = [
    { label: "Nausea · mild", tone: "neutral" as const },
    { label: "Day 2", tone: "neutral" as const },
    { label: "Eased by day 4", tone: "good" as const },
  ];
  return (
    <View>
      <Text style={styles.miniName}>This week</Text>
      <View style={styles.chipRow}>
        {chips.map((chip, i) => (
          <StaggerIn key={chip.label} active={active} index={i}>
            <View style={[styles.symptomChip, chip.tone === "good" && styles.symptomChipGood]}>
              <Text
                style={[
                  styles.symptomChipText,
                  chip.tone === "good" && { color: "#1E8E40" },
                ]}
              >
                {chip.label}
              </Text>
            </View>
          </StaggerIn>
        ))}
      </View>
    </View>
  );
}

function StaggerIn({
  active,
  index,
  children,
}: {
  active: boolean;
  index: number;
  children: React.ReactNode;
}) {
  const rise = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return undefined;
    started.current = true;
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 340,
      delay: 200 + index * 240,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, index, rise]);
  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

interface SlideSpec {
  key: string;
  caption: string;
  render(active: boolean): React.ReactNode;
}

const SLIDES: SlideSpec[] = [
  {
    key: "dose",
    caption: "Never wonder when\nyour next shot is",
    render: (active) => <NextDose active={active} />,
  },
  {
    key: "level",
    caption: "See the medicine working\nin your body, every day",
    render: (active) => (
      <View>
        <View style={[styles.miniRow, styles.miniBetween]}>
          <Text style={[styles.miniName, { color: convo.primary }]}>Medication Level</Text>
          <View style={styles.miniState}>
            <Text style={styles.miniStateText}>Steady</Text>
          </View>
        </View>
        <Text style={[styles.miniBig, { color: convo.primary }]}>
          1.42<Text style={styles.miniUnit}> mg</Text>
        </Text>
        <Text style={styles.miniLab}>In your body right now</Text>
        <LevelCurve active={active} />
        <View style={[styles.miniRow, styles.miniBetween]}>
          <Text style={styles.miniLab}>Peak 2.1 mg</Text>
          <Text style={styles.miniLab}>Trough 0.9 mg</Text>
        </View>
      </View>
    ),
  },
  {
    key: "weight",
    caption: "Watch the scale drop —\nwithout losing your muscle",
    render: (active) => <WeightTrend active={active} />,
  },
  {
    key: "symptoms",
    caption: "Notice patterns in\nhow you feel",
    render: (active) => <SymptomChips active={active} />,
  },
];

export interface TrialCarouselScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

export function TrialCarouselScreen({ progress, onBack, onContinue }: TrialCarouselScreenProps) {
  const { width } = useWindowDimensions();
  const pageWidth = width - 56; // body padding 28 each side
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const peekSpring = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 460,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);

  const onSnap = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (next === page) return;
    setPage(next);
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    // Pep ducks and pops back up over the new card.
    peekSpring.setValue(0.4);
    Animated.spring(peekSpring, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ConvoGround />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ConvoProgressHeader progress={progress} onBack={onBack} />
        <Animated.View
          style={[
            styles.body,
            {
              opacity: entrance,
              transform: [
                { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          <Text style={styles.hero}>Here&apos;s what you&apos;re{"\n"}getting free</Text>

          <View style={styles.carouselWrap}>
            {/* Pep peeks over the card rim — present, never competing. */}
            <Animated.View
              style={[
                styles.peek,
                {
                  transform: [
                    {
                      translateY: peekSpring.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Mascot pose="peek" size={30} />
            </Animated.View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={pageWidth}
              decelerationRate="fast"
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: false,
              })}
              scrollEventThrottle={16}
              onMomentumScrollEnd={onSnap}
            >
              {SLIDES.map((slide, i) => (
                <View key={slide.key} style={[styles.slide, { width: pageWidth }]}>
                  <View style={styles.miniDevice}>
                    <View style={styles.miniCard}>{slide.render(page === i)}</View>
                  </View>
                  <Text style={styles.caption}>{slide.caption}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.dots}>
            {SLIDES.map((slide, i) => {
              const dotWidth = scrollX.interpolate({
                inputRange: [(i - 1) * pageWidth, i * pageWidth, (i + 1) * pageWidth],
                outputRange: [6, 16, 6],
                extrapolate: "clamp",
              });
              const dotOpacity = scrollX.interpolate({
                inputRange: [(i - 1) * pageWidth, i * pageWidth, (i + 1) * pageWidth],
                outputRange: [0.25, 1, 0.25],
                extrapolate: "clamp",
              });
              return (
                <Animated.View
                  key={slide.key}
                  style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
                />
              );
            })}
          </View>

          <View style={styles.footer}>
            <ConvoButton label="See my free offer" variant="solid" onPress={onContinue} />
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 30 },
  hero: {
    fontFamily: typography.fonts.heavy,
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.6,
    color: convo.ink,
    textAlign: "center",
    marginTop: 8,
  },
  carouselWrap: { marginTop: 26, position: "relative" },
  peek: { position: "absolute", right: 10, top: -25, zIndex: 2 },
  slide: { alignItems: "stretch", paddingHorizontal: 2 },
  miniDevice: {
    borderWidth: 5,
    borderColor: "#0A0A0E",
    borderRadius: 26,
    backgroundColor: "#FAFAFB",
    padding: 12,
    shadowColor: "#141028",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    shadowOpacity: 0.18,
    elevation: 5,
  },
  miniCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: "rgba(14,14,18,0.08)",
    minHeight: 172,
    justifyContent: "center",
  },
  caption: {
    fontFamily: typography.fonts.heavy,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.2,
    color: convo.ink,
    textAlign: "center",
    marginTop: 15,
  },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 16 },
  dot: { height: 6, borderRadius: 99, backgroundColor: convo.ink },
  footer: { marginTop: "auto" },
  // mini app idioms (ported from the shipped Home/Track card scale)
  miniRow: { flexDirection: "row", alignItems: "center" },
  miniBetween: { justifyContent: "space-between" },
  miniName: { fontFamily: typography.fonts.bold, fontSize: 13, color: convo.ink },
  miniSec: {
    fontFamily: typography.fonts.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: "rgba(23,20,31,0.4)",
  },
  miniBig: {
    fontFamily: typography.fonts.heavy,
    fontSize: 27,
    letterSpacing: -0.7,
    color: convo.ink,
    marginTop: 7,
  },
  miniUnit: { fontFamily: typography.fonts.bold, fontSize: 13, color: convo.soft },
  miniLab: { fontFamily: typography.fonts.medium, fontSize: 10.5, color: convo.soft, marginTop: 4 },
  miniState: {
    backgroundColor: "#F3F4F7",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  miniStateText: { fontFamily: typography.fonts.semiBold, fontSize: 10, color: convo.soft },
  miniPill: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  miniPillText: { fontFamily: typography.fonts.bold, fontSize: 10.5 },
  musclePill: { backgroundColor: "#E8F8EE", marginTop: 8 },
  levelSvg: { width: "100%", height: 64, marginTop: 8 },
  weightSvg: { width: "100%", height: 52, marginTop: 10 },
  week: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(14,14,18,0.08)",
  },
  weekDay: { alignItems: "center", gap: 4 },
  weekLetter: { fontFamily: typography.fonts.semiBold, fontSize: 10, color: "rgba(23,20,31,0.4)" },
  dueDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: convo.primary },
  dueDotSpacer: { width: 6, height: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  symptomChip: {
    borderWidth: 1,
    borderColor: "rgba(14,14,18,0.1)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  symptomChipGood: { borderColor: "rgba(52,199,89,0.4)" },
  symptomChipText: { fontFamily: typography.fonts.semiBold, fontSize: 11.5, color: convo.ink },
});
