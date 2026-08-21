// Paywall — the proof carousel (design-lab "Paywall", 2026-08-17).
//
// Replaces three icon-and-sentence benefit rows. The argument is the same; the
// difference is that each slide is a REAL card from the app rather than an icon
// beside a claim. "Never do vial math again" is a promise; a card reading
// 25 units · 0.25 mL from a 10 mg/mL vial is the thing itself.
//
// MOTION. One 12s loop, five slides, ~2.4s dwell each, eased so it settles
// rather than snaps. The dots ride the SAME clock via staggered negative
// delays — animating them separately is how a carousel and its dots drift
// apart. After the fifth it rewinds rather than wrapping: seamless wrapping
// needs a duplicated leading slide, which is worth doing when this becomes
// swipeable and not before.
//
// Everything here is static copy and shapes. No figure on these cards is read
// from the user — a paywall showing someone their own numbers before they pay
// is a promise we have not earned yet.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Mascot } from '../../components/Mascot';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';
// The slide's whole claim is "we recognise your food" — so it shows the food.
import SCAN_PHOTO from '../../../assets/nutrients/chicken.jpg';

const SLIDE_W = 200;
const GAP = 10;
const STEP = SLIDE_W + GAP;
const SLIDE_H = 278;
/** Full cycle. Five slides at ~2.4s each. */
const LOOP_MS = 12_000;

export interface ProofSlide {
  key: string;
  title: string;
  sub: string;
  /** The card face — a shape from the app, not an illustration. */
  render(): React.ReactNode;
}

function Figure({ value, unit, tint }: { value: string; unit?: string; tint: string }) {
  return (
    <Text style={[styles.figure, { color: tint }]}>
      {value}
      {unit ? <Text style={styles.figureUnit}> {unit}</Text> : null}
    </Text>
  );
}

/** Bars standing in for the level chart — the shape, not a real curve. */
function Bars({ tint }: { tint: string }) {
  const heights = [14, 22, 18, 30, 24, 34, 44];
  return (
    <View style={styles.bars}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: h, backgroundColor: i === heights.length - 1 ? tint : `${tint}33` },
          ]}
        />
      ))}
    </View>
  );
}

export const PROOF_SLIDES: readonly ProofSlide[] = [
  {
    key: 'level',
    title: 'Know what’s still working',
    sub: 'Your live level between shots — covered, or in a trough.',
    render: () => (
      <>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>MEDICATION LEVEL</Text>
          <Text style={styles.pill}>Steady</Text>
        </View>
        <Figure value="1.42" unit="mg" tint={convo.primary} />
        <Bars tint={convo.primary} />
      </>
    ),
  },
  {
    key: 'vial',
    title: 'Never do vial math',
    sub: 'Exact units from your vial and dose. No spreadsheets.',
    render: () => (
      <>
        <Text style={styles.cardLabel}>YOUR 5 MG DOSE</Text>
        <Figure value="25" unit="units" tint="#0E0E12" />
        <Text style={styles.cardNote}>0.25 mL from a 10 mg/mL vial</Text>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: '38%' }]} />
        </View>
      </>
    ),
  },
  {
    key: 'scan',
    title: 'Snap a meal, get the numbers',
    sub: 'Protein and calories without typing a thing.',
    render: () => (
      <>
        {/* A REAL PHOTOGRAPH, in a row beside the name — frame:
            row gap:9 align:center, .im5 52x52 radius 12 object-fit cover.
            This shipped as a flat 74px grey block stacked above the text, on
            the one slide whose entire argument is "we recognise your food". */}
        <View style={styles.scanRow}>
          <Image source={SCAN_PHOTO} style={styles.scanThumb} resizeMode="cover" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, styles.scanName]}>Chicken breast</Text>
            <Text style={[styles.cardNote, styles.scanNote]}>4 oz · scanned</Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          <Text style={[styles.chip, styles.chipProtein]}>35 g protein</Text>
          <Text style={styles.chip}>185 cal</Text>
        </View>
      </>
    ),
  },
  {
    key: 'calendar',
    title: 'Your week, laid out',
    sub: 'Shot days, reminders and the dose that follows.',
    render: () => (
      <>
        <Text style={styles.cardLabel}>THIS WEEK</Text>
        <View style={styles.week}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <View key={i} style={[styles.day, i === 3 && styles.dayOn]}>
              <Text style={[styles.dayText, i === 3 && styles.dayTextOn]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardNote}>Next shot Thursday, 9:00 AM</Text>
      </>
    ),
  },
  {
    key: 'pep',
    title: 'Ask Pep anything',
    sub: 'Straight answers about your protocol, cited.',
    render: () => (
      <>
        {/* Pep himself, beside the label — frame: row gap:8 align:flex-start,
            then a column with the PEP eyebrow and the question. The card is
            called "Ask Pep anything" and shipped without Pep in it. */}
        <View style={styles.pepRow}>
          <Mascot size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardLabel}>PEP</Text>
            <Text style={[styles.cardTitle, styles.pepQuestion]}>Why does it get harder?</Text>
          </View>
        </View>
        <View style={styles.quote}>
          <Text style={styles.quoteText}>
            Your level climbs for the first weeks, then plateaus…
          </Text>
        </View>
      </>
    ),
  },
];

export function PaywallProofCarousel() {
  const drive = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(drive, {
        toValue: 1,
        duration: LOOP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drive]);

  // Dwell then advance, four times, then rewind — the design's keyframes.
  const translateX = drive.interpolate({
    inputRange: [0, 0.16, 0.2, 0.36, 0.4, 0.56, 0.6, 0.76, 0.8, 0.96, 1],
    outputRange: [0, 0, -STEP, -STEP, -STEP * 2, -STEP * 2, -STEP * 3, -STEP * 3, -STEP * 4, -STEP * 4, 0],
  });

  return (
    <View style={styles.root}>
      <View style={styles.viewport}>
        <Animated.View style={[styles.track2, { transform: [{ translateX }] }]}>
          {PROOF_SLIDES.map((slide) => (
            <View key={slide.key} style={styles.slide}>
              <View style={styles.shot}>{slide.render()}</View>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideSub}>{slide.sub}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <View style={styles.dots}>
        {PROOF_SLIDES.map((slide, i) => {
          // Same clock as the track: each dot is wide only during its dwell.
          const start = i * 0.2;
          const width = drive.interpolate({
            inputRange: [0, start, start + 0.02, start + 0.18, start + 0.2, 1].sort((a, b) => a - b),
            outputRange: i === 0 ? [16, 16, 16, 16, 5.5, 16] : [5.5, 5.5, 16, 16, 5.5, 5.5],
            extrapolate: 'clamp',
          });
          return <Animated.View key={slide.key} style={[styles.dot, { width }]} />;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 14 },
  viewport: { overflow: 'hidden' },
  track2: { flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  slide: {
    width: SLIDE_W,
    height: SLIDE_H,
    borderRadius: 18,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: 'rgba(14,14,18,0.08)',
    padding: 12,
    // Fixed height + a flexing face keeps every card's bottom on one line,
    // whether its caption runs to one line or two.
    flexDirection: 'column',
  },
  shot: {
    flex: 1,
    backgroundColor: convo.alt,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  slideTitle: {
    fontFamily: typography.fonts.bold,
    fontSize: 13.5,
    color: convo.ink,
    marginTop: 10,
  },
  slideSub: {
    fontFamily: typography.fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: convo.soft,
    marginTop: 3,
  },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: {
    fontFamily: typography.fonts.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: convo.faint,
  },
  cardTitle: { fontFamily: typography.fonts.bold, fontSize: 13, color: convo.ink, marginTop: 6 },
  cardNote: { fontFamily: typography.fonts.medium, fontSize: 10, color: convo.soft, marginTop: 4 },
  pill: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 9,
    color: convo.soft,
    backgroundColor: convo.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  figure: {
    fontFamily: typography.fonts.heavy,
    fontSize: 26,
    letterSpacing: -0.6,
    marginTop: 8,
  },
  figureUnit: { fontFamily: typography.fonts.bold, fontSize: 12 },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 10, height: 44 },
  bar: { width: 6, borderRadius: 3 },

  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(14,14,18,0.08)', marginTop: 12 },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: '#1E96EF' },

  scanRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  // The shared cardTitle stacks under a block (marginTop 6); in a centered row
  // that offsets the column off-axis. Frame: .nm 12, .lab 9.5 marginTop 1.
  scanName: { fontSize: 12, marginTop: 0 },
  scanNote: { fontSize: 9.5, marginTop: 1 },
  scanThumb: { width: 52, height: 52, borderRadius: 12 },
  pepRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  // Frame: .nm 11.5, line-height 1.3, marginTop 2 under the eyebrow.
  pepQuestion: { fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  chip: {
    fontFamily: typography.fonts.bold,
    fontSize: 9.5,
    color: convo.soft,
    backgroundColor: convo.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  chipProtein: { color: '#F0761F' },

  week: { flexDirection: 'row', gap: 4, marginTop: 10 },
  day: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 7,
    backgroundColor: convo.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: convo.primary },
  dayText: { fontFamily: typography.fonts.bold, fontSize: 9, color: convo.soft },
  dayTextOn: { color: convo.onPrimary },

  quote: {
    backgroundColor: convo.surface,
    borderRadius: 10,
    padding: 9,
    marginTop: 8,
  },
  quoteText: { fontFamily: typography.fonts.medium, fontSize: 10, lineHeight: 14, color: convo.soft },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot: { height: 5.5, borderRadius: 999, backgroundColor: convo.primary },
});
