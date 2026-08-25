// Onboarding — the commitment pact. The last thing before the wall.
//
// SELF-DIRECTED, NOT BRAND-DIRECTED. Wellspoken's version reads "I trust
// Wellspoken to guide me". In a medication-adjacent app that is the wrong
// instrument — asking someone to pledge loyalty to software next to a decision
// about their body. The user commits to THEMSELVES here.
//
// WHAT THEY ACTUALLY WANT (Nick, 2026-08-24). The first draft opened "I'm not
// doing this to be smaller" — which denies the goal they came with. They DO
// want to lose the weight. The worry underneath is different and more
// specific: what is this drug doing to me, and is it working? That is the
// app's own promise, so the pact is about SEEING it work rather than guessing.
//
// IT HAS TO BE USEFUL, NOT JUST FELT (Nick, 2026-08-24). Draft three read
// "I've started things before. This time I want to see it happening." That is
// a mood. It was written to imply rather than state — a fair instinct after
// draft two repeated the previous screen's headline verbatim — but implying
// cost it every concrete thing, and a promise with nothing in it is not a
// promise.
//
// What it names now is what the app actually tracks: protein, water, doses.
// That is the point of a pact this early — it is not decoration, it primes
// the three behaviours every later screen will ask about, in the user's own
// voice, before anything has been asked of them.
//
// "not a motivation thing" is the load-bearing half. Motivation arrives and
// leaves; commitment is a decision you already made. Someone who has fallen
// off before reads that as "the thing that went wrong is fixable", which is
// kinder and more useful than anything about how they felt.
//
// "I owe it to myself" is Nick's phrasing, kept deliberately: a self-directed
// obligation, with the app named nowhere.
//
// THE EYEBROW IS NOT A PREAMBLE. It read "BEFORE ANY QUESTIONS" — but the
// screen immediately before this one opens "One thing before we start.", so
// the two stacked into a second delay for something already delayed, and the
// honest reaction to that is "just get on with it."
//
// "A PROMISE TO MYSELF" postpones nothing and, being first person, matches
// the body and the "— me, today" signature: the whole card is in the user's
// voice, so its label should be too. It is also the answer to the only
// question the eyebrow needs to settle — what am I looking at.
//
// WHY A HOLD AND NOT A TAP. Every other yes in this flow is a tap, and taps
// are cheap by design — the micro-commitment ladder depends on it. This one
// should not be. Effort is what turns assent into commitment, and a second of
// deliberate pressure is the smallest honest amount of it. See HoldToCommit
// for the cancel-on-release rule, and utils/heartbeat for why the haptic is a
// pulse rather than a ramp.
//
// THE WORDS ARE THE POINT. "Not to be smaller" names the thing the whole app
// is arguing against, in the user's own voice, one screen before they are
// asked to pay for the argument.

import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConvoProgressHeader } from '../../components';
import { HoldToCommit } from '../../components/HoldToCommit';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';

export interface CommitmentScreenProps {
  progress: number;
  onBack?(): void;
  onSigned(): void;
}

export function CommitmentScreen({ progress, onBack, onSigned }: CommitmentScreenProps) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ConvoProgressHeader progress={progress} onBack={onBack} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.pact}>
            <Text style={styles.eyebrow}>A PROMISE TO MYSELF</Text>
            <Text style={styles.words}>
              Progress is a commitment thing, not a motivation thing.{'\n\n'}
              I owe it to myself to stay consistent. Protein, water, every dose. And to log it,
              even on the days I’d rather not.{'\n\n'}
              That’s what gets me there.
            </Text>
            <Text style={styles.signature}>— me, today</Text>
          </View>

          {/* THE INSTRUCTION CANNOT LIVE ONLY UNDER THE RING (2026-08-25).
              HoldToCommit's own label sits BELOW the ring, which is exactly
              where the thumb goes — so the one person who most needs to be
              told how to sign covers the telling with their hand the moment
              they reach for it. This sits at the end of the reading path,
              before the control, where it is read rather than reached over.

              Outside the pact deliberately: everything above the signature is
              what the user is promising, in their own voice. "Hold the ring"
              is the app talking, so it goes after "— me, today" and is styled
              as guidance, not as another clause of the promise. */}
          <Text style={styles.cue}>Hold the ring below to seal it.</Text>

          <View style={styles.hold}>
            <HoldToCommit label="Hold if you’re in" onComplete={onSigned} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  // flexGrow, not flex: the pact card + the hold ring exceed a small screen at
  // large Dynamic Type, and with flex-basis 0 the ring's `marginTop: 'auto'`
  // collapses and lays it out BELOW the viewport with nothing scrollable —
  // the user cannot sign and cannot advance, one step from the paywall.
  body: { flexGrow: 1, paddingHorizontal: 28 },
  pact: {
    marginTop: 14,
    backgroundColor: convo.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(23,20,31,0.10)',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  eyebrow: {
    fontFamily: typography.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.9,
    color: convo.faint,
    marginBottom: 13,
  },
  words: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 16.5,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: convo.ink,
  },
  signature: {
    fontFamily: typography.fonts.medium,
    fontSize: 12.5,
    color: convo.faint,
    marginTop: 18,
  },
  cue: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: convo.soft,
    marginTop: 26,
  },
  hold: { marginTop: 'auto', paddingBottom: 30, alignItems: 'center' },
});
