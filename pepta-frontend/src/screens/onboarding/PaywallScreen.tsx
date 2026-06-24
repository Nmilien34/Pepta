// Onboarding screen 25 — Paywall. Value-forward, with an interactive plan
// selector (yearly is the hero at 63% off). RevenueCat is DEFERRED: "Start free
// trial" is a safe stub that completes onboarding; the X also skips. Custom chrome
// (X + Restore) rather than the progress scaffold, matching the design lab.

import React, { useState } from 'react';
import { Pressable, ScrollView, StatusBar, View } from 'react-native';
import { Icon } from "../../components/Icon";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { AppText, Button, Mascot } from '../../components';

export interface PaywallScreenProps {
  onComplete(): void;
}

type Plan = 'yearly' | 'monthly';

const FEATURES = [
  'Medication level & curve',
  'Injection-site map',
  'Muscle-protection tracking',
  'Unlimited AI insights',
  'Meal scan & voice',
  'Apple Health & export',
];

export function PaywallScreen({ onComplete }: PaywallScreenProps) {
  const theme = useTheme();
  const [plan, setPlan] = useState<Plan>('yearly');

  const handleStart = () => {
    // TODO: present the RevenueCat purchase flow when the integration lands.
    onComplete();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
          <Pressable onPress={onComplete} hitSlop={theme.sizes.hitSlop} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable hitSlop={theme.sizes.hitSlop} accessibilityRole="button">
            <AppText variant="caption" color="textSecondary">
              Restore
            </AppText>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Mascot pose="idle" size={74} />
            <AppText variant="obTitle" align="center">
              Unlock the full tracker
            </AppText>
            <AppText variant="caption" color="textSecondary" align="center">
              Levels, muscle, meals, insights — everything Pepta does.
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 9, marginTop: theme.spacing.lg }}>
            {FEATURES.map((f) => (
              <View key={f} style={{ flexBasis: '50%', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Icon name="checkmark-circle" size={16} color={theme.colors.fiber} />
                <AppText variant="caption" color="textPrimary" style={{ flex: 1 }}>
                  {f}
                </AppText>
              </View>
            ))}
          </View>

          <View style={{ marginTop: theme.spacing.xl, gap: 10 }}>
            <PlanCard
              selected={plan === 'yearly'}
              onPress={() => setPlan('yearly')}
              title="Yearly"
              sub="$40.00/yr · just $0.11 a day"
              price="$3.33"
              per="/mo"
              badge="SAVE 63%"
            />
            <PlanCard
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              title="Monthly"
              sub="billed monthly"
              price="$9.00"
              per="/mo"
            />
          </View>
        </ScrollView>

        <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
          <Button label="Start 7-day free trial" onPress={handleStart} />
          <AppText variant="caption" color="textTertiary" align="center" style={{ fontSize: 10, marginTop: theme.spacing.sm }}>
            7 days free, then {plan === 'yearly' ? '$40/yr ($3.33/mo)' : '$9/mo'}. Cancel anytime · Terms & Privacy
          </AppText>
        </View>
      </SafeAreaView>
    </View>
  );
}

interface PlanCardProps {
  selected: boolean;
  onPress(): void;
  title: string;
  sub: string;
  price: string;
  per: string;
  badge?: string;
}

function PlanCard({ selected, onPress, title, sub, price, per, badge }: PlanCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        position: 'relative',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? '#F7F4FF' : theme.colors.surface,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {badge ? (
        <View style={{ position: 'absolute', top: -9, right: 14, backgroundColor: theme.colors.primary, paddingVertical: 3, paddingHorizontal: 9, borderRadius: theme.radii.pill }}>
          <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.4 }}>
            {badge}
          </AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={selected ? theme.colors.primary : theme.colors.textTertiary}
        />
        <View>
          <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
            {title}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {sub}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AppText variant="statMedium" style={{ fontSize: 20 }}>
          {price}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {per}
        </AppText>
      </View>
    </Pressable>
  );
}
