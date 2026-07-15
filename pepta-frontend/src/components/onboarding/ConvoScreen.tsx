// A conversation turn (onboarding v2.2): back chevron + hairline progress, the
// dim echo of the last answer typing fast and silent, the question typing at
// reading speed with haptic ticks, and answers that behave like speech — a
// tapped chip dissolves the others, glides in as the purple sent bubble, typing
// dots breathe, and the flow advances on its own. Ported from Leanient's engine
// onto Pepta's light ground.
//
// Three answer modes:
//   options + onAnswer            → auto-advance sent-message beat (single tap)
//   options + value/onSelect      → sticky single-select, Continue in footer
//                                    (precise inputs: dose, concentration)
//   options + multi + values/onToggle → multi-select chips, Continue in footer
// Wheels/pickers pass children + footer instead of options.

import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Icon } from "../Icon";
import { typography } from "../../theme/typography";
import { Typewriter } from "./Typewriter";
import { convo } from "./convoTokens";

// Whether a turn should play its entrance (type the lines, stagger the chips).
// The navigator flips `animate` to false when the user steps BACK to an
// already-seen turn, so returning renders instantly instead of re-typing —
// this is what wires up Typewriter's `animate` flag across the whole flow.
export const OnboardingMotionContext = createContext<{ animate: boolean }>({ animate: true });

// Light tactile confirmation on any action button press.
function tapHaptic() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export interface ConvoOption<T> {
  label: string;
  /** Optional second line; the chip stretches into a card row to hold it. */
  sub?: string;
  value: T;
  /**
   * In auto-advance mode, a holding option selects without advancing (via
   * onSelect) — for "Pick another day" / "Pick exact time" chips that reveal
   * a picker + Continue instead of speaking the answer.
   */
  holds?: boolean;
}

/** The conversation's action pill. Outlined by default; solid purple is reserved. */
export function ConvoButton({
  label,
  disabled,
  variant = "outline",
  onPress,
}: {
  label: string;
  disabled?: boolean;
  variant?: "outline" | "solid";
  onPress?: () => void;
}) {
  const solid = variant === "solid";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        tapHaptic();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        solid && styles.buttonSolid,
        disabled && styles.buttonDisabled,
        pressed && !disabled && (solid ? styles.buttonSolidPressed : styles.buttonPressed),
      ]}
    >
      <Text style={[styles.buttonText, solid && styles.buttonTextSolid, disabled && styles.buttonTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Soft purple washes on the white ground (the design's orbs). */
function Ground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.orb, { width: 230, height: 230, top: "-4%", right: -80, backgroundColor: convo.orbHi }]} />
      <View style={[styles.orb, { width: 180, height: 180, top: "46%", left: -70 }]} />
      <View style={[styles.orb, { width: 150, height: 150, bottom: "6%", right: "12%" }]} />
    </View>
  );
}

/** The app-is-typing bubble: three dots breathing in sequence. */
function TypingDots() {
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);
  const dot = (base: number) => ({
    opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [base, Math.min(1, base + 0.45)] }),
  });
  return (
    <View style={styles.typing}>
      <Animated.View style={[styles.typingDot, dot(0.55)]} />
      <Animated.View style={[styles.typingDot, dot(0.4)]} />
      <Animated.View style={[styles.typingDot, dot(0.25)]} />
    </View>
  );
}

interface ChipItemProps {
  label: string;
  sub?: string;
  index: number;
  revealed: boolean;
  animate: boolean;
  selected?: boolean;
  onPress: () => void;
}

/** One answer chip, staggering into view once the question has finished typing. */
function ChipItem({ label, sub, index, revealed, animate, selected, onPress }: ChipItemProps) {
  const rise = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!revealed || !animate) return;
    Animated.timing(rise, {
      toValue: 1,
      duration: 300,
      delay: index * 70,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [revealed, index, rise, animate]);
  return (
    <Animated.View
      style={{
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={selected != null ? { selected } : undefined}
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          sub != null && styles.chipWide,
          selected && styles.chipSelected,
          pressed && styles.chipPressed,
        ]}
      >
        <Text style={styles.chipText}>{label}</Text>
        {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** How long the sent bubble + typing dots hold before the flow advances. */
const ACKNOWLEDGE_MS = 950;

// The hairline progress fill persists across turns (module-level, Leanient's
// trick) so it grows forward and shrinks back instead of resetting each mount.
const progressFill = new Animated.Value(0);

interface ConvoScreenProps<T> {
  /** 0..1 position in the funnel. */
  progress: number;
  onBack?: () => void;
  /** The app acknowledging the previous answer; dim, same type scale, above the question. */
  context?: string;
  question: string;
  /** Ends the typed question with the small purple accent square (one per screen). */
  questionAccent?: boolean;
  /** Reassurance line under the question, fades in once typing lands. */
  sub?: string;
  options?: ConvoOption<T>[];
  /** Tap = spoken answer: sent bubble + dots, then auto-advance. */
  onAnswer?: (value: T) => void;
  /** Sticky single-select (chips keep selection; Continue lives in footer). */
  value?: T;
  onSelect?: (value: T) => void;
  /** Multi-select mode (chips toggle; Continue lives in footer). */
  multi?: boolean;
  values?: T[];
  onToggle?: (value: T) => void;
  /** Custom body (wheels, panels); revealed after the question types. */
  children?: ReactNode;
  /** Pinned below the body (Continue for sticky/multi/wheel turns). */
  footer?: ReactNode;
  /** Fires once the question finishes typing (children choreography hook). */
  onTyped?: () => void;
}

export function ConvoScreen<T>({
  progress,
  onBack,
  context,
  question,
  questionAccent,
  sub,
  options,
  onAnswer,
  value,
  onSelect,
  multi,
  values,
  onToggle,
  children,
  footer,
  onTyped,
}: ConvoScreenProps<T>) {
  // Stepping BACK to a seen turn renders instantly (no re-typing); a fresh
  // forward arrival plays the full entrance.
  const { animate } = useContext(OnboardingMotionContext);
  // Nothing is pre-rendered: the echo types first (fast, silent), the question
  // types second with ticks, and only then does the answer area reveal.
  const [contextDone, setContextDone] = useState(!context || !animate);
  const [typed, setTyped] = useState(!animate);
  const [picked, setPicked] = useState<ConvoOption<T> | null>(null);
  const reveal = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const questionDim = useRef(new Animated.Value(1)).current;
  const sentPop = useRef(new Animated.Value(0)).current;
  const advanced = useRef(false);

  useEffect(() => {
    const animation = Animated.timing(progressFill, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false, // animating width
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const onTypedRef = useRef(onTyped);
  onTypedRef.current = onTyped;

  useEffect(() => {
    if (!typed) return;
    Animated.timing(reveal, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    onTypedRef.current?.();
  }, [typed, reveal]);

  // Haptic grammar: a warm tap the moment they speak, the success thump when
  // the sent bubble lands.
  const handlePick = (option: ConvoOption<T>) => {
    if (advanced.current) return;
    if (option.holds) {
      // Holding options switch the turn into picker mode instead of advancing.
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect?.(option.value);
      return;
    }
    advanced.current = true;
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 220);
    }
    setPicked(option);
    // The question steps back once answered; the answer glides in as a sent message.
    Animated.timing(questionDim, { toValue: 0.45, duration: 240, useNativeDriver: true }).start();
    Animated.spring(sentPop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    setTimeout(() => onAnswer?.(option.value), ACKNOWLEDGE_MS);
  };

  // Sticky/multi chips speak softly: a tap per toggle, no sent beat.
  const handleStickyPress = (option: ConvoOption<T>) => {
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (multi) onToggle?.(option.value);
    else onSelect?.(option.value);
  };

  const autoAdvance = onAnswer != null;
  const width = progressFill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <Ground />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack}>
              <Icon name="chevron-back" size={22} color={convo.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {context ? (
            <Typewriter
              text={context}
              speed={14}
              delay={120}
              animate={animate}
              caret={false}
              haptic={false}
              style={styles.context}
              onDone={() => setContextDone(true)}
            />
          ) : null}
          <Animated.View style={{ opacity: questionDim }}>
            <Text style={styles.question}>
              <Typewriter
                text={question}
                start={contextDone}
                delay={300}
                animate={animate}
                style={styles.question}
                onDone={() => setTyped(true)}
              />
              {questionAccent && typed ? <Text style={styles.accent}>{" ■"}</Text> : null}
            </Text>
          </Animated.View>
          {sub ? <Animated.Text style={[styles.sub, { opacity: reveal }]}>{sub}</Animated.Text> : null}

          {options && !picked ? (
            <View style={styles.chips}>
              {options.map((option, i) => (
                <ChipItem
                  key={option.label}
                  label={option.label}
                  sub={option.sub}
                  index={i}
                  revealed={typed}
                  animate={animate}
                  selected={
                    multi
                      ? values?.includes(option.value)
                      : value != null
                        ? value === option.value
                        : autoAdvance
                          ? undefined
                          : false
                  }
                  onPress={() => (autoAdvance ? handlePick(option) : handleStickyPress(option))}
                />
              ))}
            </View>
          ) : null}

          {picked ? (
            <View style={styles.answered}>
              <Animated.View
                style={[
                  styles.sent,
                  {
                    opacity: sentPop,
                    transform: [
                      { translateY: sentPop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                      { scale: sentPop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                    ],
                  },
                ]}
              >
                <Text style={styles.sentText}>{picked.label}</Text>
              </Animated.View>
              <TypingDots />
            </View>
          ) : null}

          {children ? <Animated.View style={{ opacity: reveal, flexGrow: 1 }}>{children}</Animated.View> : null}
        </ScrollView>

        {footer ? <Animated.View style={[styles.footer, { opacity: reveal }]}>{footer}</Animated.View> : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: convo.orb },
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
  track: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: convo.hairline },
  fill: { height: 3, borderRadius: 1.5, backgroundColor: convo.primary },
  body: { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 30, flexGrow: 1 },
  context: {
    fontFamily: typography.fonts.bold,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.75,
    color: convo.dim,
    marginBottom: 28,
  },
  question: {
    fontFamily: typography.fonts.heavy,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.8,
    color: convo.ink,
  },
  accent: { color: convo.primary, fontSize: 22 },
  sub: { fontFamily: typography.fonts.medium, fontSize: 14.5, lineHeight: 21, color: convo.soft, marginTop: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingTop: 26 },
  chip: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: convo.chipBorder,
    backgroundColor: convo.surface,
  },
  chipWide: { alignSelf: "stretch", flexGrow: 1, borderRadius: 18, paddingVertical: 14 },
  // Selection is neutral ink, never purple (the app's OptionCard convention).
  chipSelected: { borderColor: convo.ink },
  chipPressed: { backgroundColor: convo.pressFill },
  chipText: { fontFamily: typography.fonts.semiBold, fontSize: 15, color: convo.ink },
  chipSub: { fontFamily: typography.fonts.medium, fontSize: 12.5, lineHeight: 17, color: convo.soft, marginTop: 3 },
  button: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: convo.ctaBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSolid: { borderColor: convo.primary, backgroundColor: convo.primary },
  buttonPressed: { backgroundColor: convo.pressFill },
  buttonSolidPressed: { opacity: 0.88 },
  buttonDisabled: { borderColor: convo.hairline },
  buttonText: { fontFamily: typography.fonts.bold, fontSize: 16.5, letterSpacing: -0.17, color: convo.ink },
  buttonTextSolid: { color: convo.onPrimary },
  buttonTextDisabled: { color: convo.faint },
  answered: { alignItems: "flex-start", paddingTop: 26 },
  sent: {
    alignSelf: "flex-end",
    backgroundColor: convo.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderBottomRightRadius: 7,
    shadowColor: convo.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    shadowOpacity: 0.25,
    elevation: 4,
  },
  sentText: { fontFamily: typography.fonts.bold, fontSize: 16, color: convo.onPrimary },
  typing: {
    alignSelf: "flex-start",
    marginTop: 18,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 20,
    borderTopLeftRadius: 7,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: convo.soft },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
});

export default ConvoScreen;
