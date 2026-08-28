// The trial timeline — "Your 3 free days start now".
//
// RESTORED, NOT WRITTEN. `buildTrialTimeline()` and `freeStartHeadline()` have
// been in paywallTimeline.ts since v1, fully tested, imported by nothing but
// their own test file: v2 compressed the hero timeline into a looping one-slot
// pill above the CTA. That pill shows each of the three facts about a third of
// the time, so the charge date is off screen at the moment someone is deciding.
// This screen puts them back where they can be read at once, and the pill comes
// out of the wall.
//
// It replaces `trialCarousel`, which showed invented demo numbers (1.42 mg,
// −12 lb) on the screen immediately before the wall.
//
// WHY IT EARNS A SCREEN. Naming the charge date and promising the reminder is
// what removes the "silently billed" fear, which is the dominant objection to
// a free trial. That reasoning is paywallTimeline.ts's own header, written when
// the rows were first derived.
//
// TRIAL-GATED like the rest of the warm-up: the control arm of expa9f87848e1
// has no trial, so rather than promise free days its wall will not deliver,
// the screen skips itself to the paywall — same contract as TrialOfferScreen.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { ConvoButton, ConvoScreen } from '../../components';
import { LivingMascot } from '../../components/LivingMascot';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';
import { useAuth } from '../../context/AuthContext';
import { revenueCat } from '../../services/revenueCat';
import { dailyEquivalent, freeTrialOf, priceStringOf } from './paywallPricing';
import {
  buildTrialTimeline,
  freeStartHeadline,
  type TrialLike,
  type TrialTimelineRow,
} from './paywallTimeline';

export interface TrialTimelineScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
  /** No trial on the live offering (control arm / error): skip to the wall. */
  onSkipToWall(): void;
}

const ICON: Record<TrialTimelineRow['key'], React.ReactNode> = {
  today: (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Rect x={4} y={10.5} width={16} height={11} rx={3} fill="none" stroke="#fff" strokeWidth={2.2} />
      <Path d="M8 10.5V7a4 4 0 0 1 8 0" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  ),
  reminder: (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path
        d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"
        fill="none"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  ),
  charge: (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Rect x={3.5} y={5} width={17} height={16} rx={3} fill="none" stroke="#fff" strokeWidth={2.2} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  ),
};

function Row({
  row,
  last,
  perDay,
  billed,
}: {
  row: TrialTimelineRow;
  last: boolean;
  /** Per-day equivalent of the year, or null when it will not resolve. */
  perDay?: string | null;
  /** The BILLED annual amount. Must lead — see the 3.1.2(c) note below. */
  billed?: string | null;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.gutter}>
        <View style={styles.node}>{ICON[row.key]}</View>
        {/* The connector stops at the last node — a rail running past the
            final beat reads as an unfinished list. */}
        {last ? null : <View style={styles.rail} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.day}>{row.day.toUpperCase()}</Text>
        <Text style={styles.title}>{row.title}</Text>
        <Text style={styles.sub}>{row.sub}</Text>
        {/* THE PRICE ANCHOR, FOLDED IN (2026-08-25). It used to be its own
            screen between here and the wall, which made four monetization
            screens in a row. One sentence is not a destination — and this row
            is the only line before the paywall that raises money at all, so
            the reframe belongs where the question gets asked. Silent when the
            year will not price: the standalone screen self-skipped rather
            than show a number it had to guess, and that rule survives it. */}
        {/* 3.1.2(c), rejected 2026-08-28. This line used to read "16¢ a day,
            billed yearly" — a CALCULATED price on the only pre-paywall screen
            that mentions money at all, with no billed amount anywhere on it.
            The billed total now leads and carries the emphasis; the per-day
            figure follows in parentheses as an equivalence. */}
        {row.key === 'charge' && billed ? (
          <Text style={styles.anchor}>
            {billed} a year
            {perDay ? <Text style={styles.anchorAside}> (about {perDay} a day)</Text> : null}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function TrialTimelineScreen({
  progress,
  onBack,
  onContinue,
  onSkipToWall,
}: TrialTimelineScreenProps) {
  const auth = useAuth();
  const [trial, setTrial] = useState<TrialLike | null>(null);
  const [perDay, setPerDay] = useState<string | null>(null);
  const [billed, setBilled] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const userId = auth.user?.id;
    if (!userId) {
      onSkipToWall();
      return undefined;
    }
    revenueCat
      .getPaywallPackages(userId)
      .then((packages) => {
        if (!mounted) return;
        // Same package-agnostic rule as TrialOfferScreen: announce the
        // PRESELECTED plan's trial so the dates match the wall they land on.
        const yearlyTrial = packages?.trial.yearly.eligible ? freeTrialOf(packages.yearly) : null;
        const resolved =
          yearlyTrial ?? (packages?.trial.monthly.eligible ? freeTrialOf(packages.monthly) : null);
        // THE ANCHOR FOLLOWS THE PACKAGE THAT SUPPLIED THE DATES. freeTrialOf
        // returns null for any package with no zero-price intro, and the
        // experiment's treatment offering carries that intro on MONTHLY — so
        // falling through is a mainline path, not an edge case. Pricing the
        // YEAR under monthly dates puts a date and a billing period from two
        // different plans in the same row, one screen before purchase.
        setPerDay(yearlyTrial ? dailyEquivalent(packages?.yearly) : null);
        setBilled(yearlyTrial ? priceStringOf(packages?.yearly) : null);
        if (resolved) setTrial(resolved);
        else onSkipToWall();
      })
      .catch(() => {
        if (mounted) onSkipToWall();
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  // Nothing renders until the real offer is known: every date on this screen
  // is derived from it, and a placeholder timeline would be a guess about
  // when someone gets charged.
  if (!trial) return <View style={styles.blank} />;

  const rows = buildTrialTimeline(trial, new Date());

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      question={freeStartHeadline(trial)}
      footer={
        <View>
          <View style={styles.noPay}>
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d="M4 12.5l5.5 5.5L20 6.5"
                fill="none"
                stroke="#1E8449"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.noPayText}>No payment due now</Text>
          </View>
          <ConvoButton label="Continue" onPress={onContinue} />
        </View>
      }
    >
      <View style={styles.list}>
        {rows.map((row, i) => (
          <Row key={row.key} row={row} last={i === rows.length - 1} perDay={perDay} billed={billed} />
        ))}
      </View>
      <View style={styles.pepRow}>
        <LivingMascot pose="idle" size={44} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>I&rsquo;ll be the one who reminds you.</Text>
        </View>
      </View>
    </ConvoScreen>
  );
}

const NODE = 34;

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: convo.ground },
  list: { marginTop: 26 },
  row: { flexDirection: 'row', gap: 14 },
  gutter: { alignItems: 'center', width: NODE },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    backgroundColor: convo.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Flush to the node it leaves, 2px shy of the one it reaches — a gap at the
  // top detaches the rail from its own bubble and the chain stops reading as
  // continuous.
  rail: { flex: 1, width: 2.5, borderRadius: 2, backgroundColor: '#EFE9FF', marginBottom: 2 },
  body: { flex: 1, paddingBottom: 22 },
  day: {
    fontFamily: typography.fonts.bold,
    fontSize: 10.5,
    letterSpacing: 0.7,
    color: convo.primary,
  },
  title: {
    fontFamily: typography.fonts.heavy,
    fontSize: 16,
    letterSpacing: -0.3,
    color: convo.ink,
    marginTop: 2,
  },
  anchorAside: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 11.5,
    color: convo.soft,
  },
  anchor: {
    fontFamily: typography.fonts.bold,
    fontSize: 12.5,
    lineHeight: 18,
    color: convo.primary,
    marginTop: 4,
  },
  sub: {
    fontFamily: typography.fonts.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: convo.soft,
    marginTop: 3,
  },
  pepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 26 },
  bubble: {
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    maxWidth: 215,
  },
  bubbleText: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 13.5,
    lineHeight: 19,
    color: convo.ink,
  },
  noPay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 11,
  },
  noPayText: { fontFamily: typography.fonts.bold, fontSize: 12.5, color: '#1E8449' },
});
