// A big, sourced statistic — the shared treatment for every real number that
// lands in the conversation (the welcome gift's 1-in-8, the company beat's ~15%,
// the fear-answered beat's 25–39%). Heavy numeral with a single purple accent
// stop, a supporting line, and its citation. One component so the look stays
// identical wherever a cited stat appears, and no screen re-implements it.

import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { typography } from '../../theme/typography';
import { convo } from './convoTokens';

// The number arrives and settles: a soft touch, then a firmer one. Deliberately
// NOT the success notification — a cited fact carries weight, but it is not an
// achievement, and celebrating it would overplay the moment.
const LAND_SETTLE_MS = 95;

export interface CitedStatProps {
  /** The headline figure, e.g. "1 in 8", "~15%", "25–39%". Omit when the point
   *  is reassurance with no honest number to cite — the line then leads. */
  value?: string;
  /** The supporting sentence under the figure (or the lead line when no value). */
  line: string;
  /** The source (real citations only — never invented). */
  cite?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Flip to true when the stat becomes the thing being read (typically once the
   * question above it has finished typing) to play the landing beat. Fires once.
   */
  land?: boolean;
}

export function CitedStat({ value, line, cite, style, land }: CitedStatProps) {
  const landed = useRef(false);

  useEffect(() => {
    if (!land || landed.current || Platform.OS === 'web') return;
    landed.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(
      () => undefined,
    );
    const id = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => undefined,
      );
    }, LAND_SETTLE_MS);
    return () => clearTimeout(id);
  }, [land]);

  return (
    <View style={style}>
      {value ? (
        <Text style={styles.num}>
          {value}
          <Text style={{ color: convo.primary }}>.</Text>
        </Text>
      ) : null}
      <Text style={value ? styles.line : styles.lineLead}>{line}</Text>
      {cite ? <Text style={styles.cite}>{cite}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  num: { fontFamily: typography.fonts.heavy, fontSize: 56, letterSpacing: -1.9, color: convo.ink },
  line: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 16,
    lineHeight: 23,
    color: convo.soft,
    marginTop: 10,
    maxWidth: 310,
  },
  // When there is no number, the reassurance line carries the beat.
  lineLead: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.3,
    color: convo.ink,
    maxWidth: 320,
  },
  cite: { fontFamily: typography.fonts.medium, fontSize: 12, color: convo.faint, marginTop: 10 },
});
