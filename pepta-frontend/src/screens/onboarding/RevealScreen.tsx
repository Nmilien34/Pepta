// Onboarding screen 24 — Personalized plan reveal. The payoff: confetti, Pep
// celebrating, the projected timeline curve, and the daily-target cards. All
// numbers are derived live from the user's answers (previewTargets / projectGoal)
// — a plan/targets celebration, never a score or verdict.

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';
import { AppText, Button, Card, Confetti, Mascot, OnboardingScaffold } from '../../components';
import { formatShortDate } from '../../utils/dateParts';
import type { GoalProjection } from '../../utils/goalProjection';
import type { PlanTargets } from '../../utils/planPreview';

export interface RevealScreenProps {
  progress: number;
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  targets: PlanTargets;
  projection: GoalProjection;
  support: string;
  onContinue(): void;
}

export function RevealScreen({
  progress,
  startWeight,
  goalWeight,
  unit,
  targets,
  projection,
  support,
  onContinue,
}: RevealScreenProps) {
  const theme = useTheme();
  const dateChip = projection.estimatedDate ? formatShortDate(projection.estimatedDate) : '—';

  const stats: { label: string; value: string; color?: string }[] = [
    { label: 'Protein', value: `${targets.proteinG}g`, color: theme.colors.protein },
    { label: 'Calories', value: `${targets.calories}` },
    { label: 'Water', value: `${targets.waterOz}oz`, color: theme.colors.water },
    { label: 'Fiber', value: `${targets.fiberG}g`, color: theme.colors.fiber },
    { label: 'Steps', value: `${targets.steps.toLocaleString()}` },
  ];

  return (
    <OnboardingScaffold
      progress={progress}
      showBack={false}
      tintColor="#F1ECFF"
      footer={<Button label="Get started" onPress={onContinue} />}
    >
      <View style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
          <Confetti height={210} />
        </View>

        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Mascot pose="wave" size={132} />
          <AppText variant="screenTitle" align="center">
            Your plan is ready!
          </AppText>
          <AppText variant="caption" color="textSecondary" align="center">
            {support}
          </AppText>
        </View>

        <Card style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="sectionHeader" color="textTertiary">
              Projected timeline
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#FBEAF6',
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: theme.radii.pill,
              }}
            >
              <Ionicons name="flag" size={12} color="#A8327D" />
              <AppText variant="caption" style={{ color: '#A8327D', fontWeight: '700' }}>
                {dateChip}
              </AppText>
            </View>
          </View>
          <Svg viewBox="0 0 300 64" style={{ width: '100%', height: 56, marginTop: theme.spacing.sm }}>
            <Defs>
              <LinearGradient id="reveal" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor={theme.colors.weight} stopOpacity={0.18} />
                <Stop offset="1" stopColor={theme.colors.weight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d="M0 12 C80 16 150 36 300 56 L300 64 L0 64 Z" fill="url(#reveal)" />
            <Path d="M0 12 C80 16 150 36 300 56" fill="none" stroke={theme.colors.weight} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={2} cy={12} r={4.5} fill={theme.colors.weight} />
            <Circle cx={298} cy={56} r={4.5} fill={theme.colors.weight} />
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color="textSecondary">
              {startWeight} → <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>{goalWeight} {unit}</AppText>
            </AppText>
            <AppText variant="caption" color="textSecondary">
              Today → {dateChip}
            </AppText>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: theme.spacing.md }}>
          {stats.map((s) => (
            <View key={s.label} style={{ flexBasis: '31%', flexGrow: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, padding: 12 }}>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                {s.label}
              </AppText>
              <AppText variant="statMedium" style={{ fontSize: 19, marginTop: 6, color: s.color ?? theme.colors.textPrimary }}>
                {s.value}
              </AppText>
            </View>
          ))}
          <View style={{ flexBasis: '31%', flexGrow: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
          </View>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
