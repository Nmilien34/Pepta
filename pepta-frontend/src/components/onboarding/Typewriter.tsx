// The app's voice: text types itself at reading speed (~32ms/char), each burst
// of characters landing with a soft haptic tick, a purple caret riding the
// line. The building block of every conversation turn. Ported from Leanient's
// proven engine; Pepta renders it on the light ground with the primary caret.

import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, type StyleProp, type TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { convo } from "./convoTokens";

interface TypewriterProps {
  text: string;
  /** Ms per character. 32ms tracks reading speed. */
  speed?: number;
  /** Thinking beat before the first character. */
  delay?: number;
  /** False renders the full line instantly (back-nav, dim recaps). */
  animate?: boolean;
  /** Gate for sequenced lines: typing holds until this flips true. */
  start?: boolean;
  /** Ticks per character burst; dim recap lines type silently. */
  haptic?: boolean;
  style?: StyleProp<TextStyle>;
  /** Show the caret while typing. */
  caret?: boolean;
  caretColor?: string;
  onDone?: () => void;
}

const HAPTIC_EVERY = 3; // one tick per few characters keeps the buzz soft

export function Typewriter({
  text,
  speed = 32,
  delay = 350,
  animate = true,
  start = true,
  haptic = true,
  style,
  caret = true,
  caretColor = convo.primary,
  onDone,
}: TypewriterProps) {
  const [count, setCount] = useState(animate ? 0 : text.length);
  const [done, setDone] = useState(!animate);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!animate) {
      doneRef.current?.();
      return;
    }
    if (!start) return;
    setCount(0);
    setDone(false);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const kickoff = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setCount(i);
        if (
          haptic &&
          Platform.OS !== "web" &&
          i % HAPTIC_EVERY === 0 &&
          text[i - 1] !== " "
        ) {
          void Haptics.selectionAsync();
        }
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          setDone(true);
          doneRef.current?.();
        }
      }, speed);
    }, delay);
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay, animate, start, haptic]);

  return (
    <Text style={style}>
      {text.slice(0, count)}
      {caret && !done ? <Text style={{ color: caretColor }}>▍</Text> : null}
    </Text>
  );
}
