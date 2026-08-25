// The price anchor — "16¢ a day".
//
// WHY IT EXISTS. The wall had no price framing of any kind: $59.99 arrived
// cold. Wellspoken anchors its year against twelve cappuccinos; ours is
// stronger and it is ours alone — this user is already paying for the
// medication, the appointments and the appetite, so the honest comparison is
// against effort they have already committed, not against coffee.
//
// NO HEADLINE, ON PURPOSE. Every other give-screen types a question first.
// Here the number IS the sentence: "16¢ a day" / "is what the year costs",
// broken across the rule. A question above it would be answering something
// nobody asked. That is why this is a bespoke shell rather than a ConvoScreen
// (whose `question` is required) — same shape TrialOfferScreen uses.
//
// THE NUMBER IS DERIVED. dailyEquivalent() reads the live annual product and
// floors, exactly like the per-month anchor. Nothing on this screen may be a
// baked-in "16" — the offer's price can change in App Store Connect without
// anyone touching this file, and a stale anchor is a false price claim.
//
// AND IT SELF-SKIPS. If the annual product will not resolve there is no
// anchor to draw, so the screen steps aside rather than showing a number it
// had to guess.

import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ConvoButton, ConvoProgressHeader } from '../../components';
import { CitedStat } from '../../components/onboarding/CitedStat';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';
import { useAuth } from '../../context/AuthContext';
import { revenueCat } from '../../services/revenueCat';
import { dailyEquivalent } from './paywallPricing';

export interface PriceAnchorScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
  /** No resolvable annual price: skip rather than invent an anchor. */
  onSkip(): void;
}

export function PriceAnchorScreen({ progress, onBack, onContinue, onSkip }: PriceAnchorScreenProps) {
  const [perDay, setPerDay] = useState<string | null>(null);

  const auth = useAuth();
  useEffect(() => {
    let mounted = true;
    const userId = auth.user?.id;
    if (!userId) {
      onSkip();
      return undefined;
    }
    revenueCat
      .getPaywallPackages(userId)
      .then((packages) => {
        if (!mounted) return;
        const daily = dailyEquivalent(packages?.yearly);
        if (daily) setPerDay(daily);
        else onSkip();
      })
      .catch(() => {
        if (mounted) onSkip();
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ConvoProgressHeader progress={progress} onBack={onBack} />
        {perDay ? (
          <View style={styles.body}>
            <View style={styles.anchor}>
              <Text style={styles.big}>
                {perDay}
                <Text style={styles.per}>a day</Text>
              </Text>
              <View style={styles.rule} />
              <Text style={styles.line}>
                is what the year costs. You&rsquo;re already doing the hard part. The
                injections, the appointments, the food noise.
              </Text>
            </View>

            {/* The stat this app already cites, doing the second half of the
                job: the anchor says the price is small, this says what the
                small price is actually protecting. */}
            <CitedStat
              style={styles.stat}
              value="39%"
              line="of the weight you lose can be lean mass if nobody is watching for it. That is the part this protects."
              cite="STEP-1 & SURMOUNT-1 body-composition analyses"
              land
            />

            <View style={styles.footer}>
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
              <ConvoButton label="See my free offer" onPress={onContinue} />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 28, paddingBottom: 30 },
  anchor: { marginTop: 30 },
  big: {
    fontFamily: typography.fonts.heavy,
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -2,
    color: convo.ink,
  },
  per: {
    fontFamily: typography.fonts.bold,
    fontSize: 17,
    letterSpacing: -0.2,
    color: convo.faint,
    // 7, not a space character. A space at 17pt is ~4-5px and the gap between
    // a 56pt numeral and its unit is load-bearing — too tight and "16¢a day"
    // reads as one token.
    marginLeft: 7,
  },
  rule: {
    width: 38,
    height: 3,
    borderRadius: 2,
    backgroundColor: convo.primary,
    marginTop: 15,
    marginBottom: 13,
  },
  line: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 14.5,
    lineHeight: 21,
    color: convo.soft,
  },
  stat: { marginTop: 26 },
  footer: { marginTop: 'auto' },
  noPay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 11,
  },
  noPayText: { fontFamily: typography.fonts.bold, fontSize: 12.5, color: '#1E8449' },
});
