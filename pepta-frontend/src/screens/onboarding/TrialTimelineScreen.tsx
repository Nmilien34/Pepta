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
import { freeTrialOf } from './paywallPricing';
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

function Row({ row, last }: { row: TrialTimelineRow; last: boolean }) {
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
        const resolved =
          (packages?.trial.yearly.eligible ? freeTrialOf(packages.yearly) : null) ??
          (packages?.trial.monthly.eligible ? freeTrialOf(packages.monthly) : null);
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
          <Row key={row.key} row={row} last={i === rows.length - 1} />
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
