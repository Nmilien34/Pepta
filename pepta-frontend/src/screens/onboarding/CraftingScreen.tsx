// Onboarding screen 23 — "Crafting your plan" loader. A real animated count-up
// ring with Pep in the center, and a personalized checklist that ticks off in
// sync with progress. Auto-advances to the reveal when it completes.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { Icon } from "../../components/Icon";
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../theme';
import { AppText, Mascot, OnboardingScaffold } from '../../components';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const R = 44;
const C = 2 * Math.PI * R;
const DURATION = 3200;

export interface CraftingScreenProps {
  progress: number;
  steps: string[];
  onDone(): void;
}

export function CraftingScreen({ progress, steps, onDone }: CraftingScreenProps) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const [checked, setChecked] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      setPct(Math.round(value * 100));
      setChecked(Math.min(steps.length, Math.floor(value * steps.length)));
    });
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: false, // animating strokeDashoffset + listener
    });
    animation.start(({ finished }) => {
      if (finished && !doneRef.current) {
        doneRef.current = true;
        setChecked(steps.length);
        setTimeout(onDone, 500);
      }
    });
    return () => {
      anim.removeListener(id);
      animation.stop();
    };
  }, [anim, steps.length, onDone]);

  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [C, 0] });

  return (
    <OnboardingScaffold progress={progress} showBack={false}>
      <View style={{ alignItems: 'center', marginTop: theme.spacing['2xl'] }}>
        <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={150} height={150} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
            <Circle cx={50} cy={50} r={R} fill="none" stroke="#EFEFF2" strokeWidth={8} />
            <AnimatedCircle
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={dashoffset}
              transform="rotate(-90 50 50)"
            />
          </Svg>
          <Mascot pose="idle" size={66} />
        </View>
        <AppText variant="statBig" style={{ marginTop: theme.spacing.lg }}>
          {pct}%
        </AppText>
        <AppText variant="obTitle" align="center" style={{ marginTop: theme.spacing.xs }}>
          Crafting your plan…
        </AppText>
      </View>

      <View style={{ marginTop: theme.spacing['2xl'], gap: theme.spacing.md }}>
        {steps.map((step, i) => {
          const isDone = i < checked;
          const isActive = i === checked;
          return (
            <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDone ? '#E8F8EE' : theme.colors.surfaceAlt,
                }}
              >
                {isDone ? (
                  <Icon name="checkmark" size={14} color={theme.colors.fiber} />
                ) : isActive ? (
                  <ActivityIndicator size="small" color={theme.colors.textTertiary} />
                ) : null}
              </View>
              <AppText
                variant="bodyStrong"
                color={isDone || isActive ? 'textPrimary' : 'textTertiary'}
                style={{ flex: 1, fontWeight: '600' }}
              >
                {step}
              </AppText>
            </View>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}
