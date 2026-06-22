// Onboarding screen 22 — Rating / social proof. Tasteful testimonial cards. The
// native App Store review prompt is deferred; Continue advances.

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { AppText, Button, Card, OnboardingScaffold } from '../../components';

export interface RatingScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

interface Testimonial {
  quote: string;
  attribution: string;
}

const TESTIMONIALS: Testimonial[] = [
  { quote: 'Finally something that tracks my levels and keeps my protein on point.', attribution: 'Dana, down 28 lb' },
  { quote: 'The injection map alone is worth it. So calm to use.', attribution: 'Marcus, week 14' },
];

function Stars({ size = 13 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Ionicons key={i} name="star" size={size} color="#F5A623" />
      ))}
    </View>
  );
}

export function RatingScreen({ progress, onBack, onContinue }: RatingScreenProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle" align="center">
        Loved by people{'\n'}on the journey
      </AppText>
      <View style={{ alignItems: 'center', gap: 6, marginTop: theme.spacing.md }}>
        <Stars size={20} />
        <AppText variant="caption" color="textSecondary">
          4.9 · 12,000+ ratings
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        {TESTIMONIALS.map((t) => (
          <Card key={t.attribution}>
            <Stars />
            <AppText variant="bodyStrong" color="textPrimary" style={{ marginTop: theme.spacing.sm }}>
              “{t.quote}”
            </AppText>
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
              — {t.attribution}
            </AppText>
          </Card>
        ))}
      </View>
    </OnboardingScaffold>
  );
}
