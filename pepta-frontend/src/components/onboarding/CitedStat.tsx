// A big, sourced statistic — the shared treatment for every real number that
// lands in the conversation (the welcome gift's 1-in-8, the company beat's ~15%,
// the fear-answered beat's 25–39%). Heavy numeral with a single purple accent
// stop, a supporting line, and its citation. One component so the look stays
// identical wherever a cited stat appears, and no screen re-implements it.

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { typography } from '../../theme/typography';
import { convo } from './convoTokens';

export interface CitedStatProps {
  /** The headline figure, e.g. "1 in 8", "~15%", "25–39%". Omit when the point
   *  is reassurance with no honest number to cite — the line then leads. */
  value?: string;
  /** The supporting sentence under the figure (or the lead line when no value). */
  line: string;
  /** The source (real citations only — never invented). */
  cite?: string;
  style?: StyleProp<ViewStyle>;
}

export function CitedStat({ value, line, cite, style }: CitedStatProps) {
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
