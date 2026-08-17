// The primary action pane — the app's one "glass" button.
//
// Used on the funnel's three purple moments: Get started (welcome), See my
// free offer (trial offer), and the paywall CTA. They are deliberately the
// same object: by the third one, tapping it is a familiar action rather than
// a new decision.
//
// WHAT MAKES IT READ AS GLASS. Four layers, and the fill is the least of them:
//   1. a RIM — a gradient border, bright white at the top-left fading through
//      nothing to purple at the bottom-right. Painted full-bleed with the fill
//      inset by its width, because a uniform borderColor cannot hold a
//      gradient and a flat line reads as a painted stripe.
//   2. the FILL — 90%/88% over a deep purple, so the ground tints it.
//   3. a SHEEN — a diagonal band of light across the top-left. This is most of
//      what says "reflective surface"; without it the pane looks solid.
//   4. a soft FLOOR — a blurred inner shadow along the bottom. A flat dark
//      band here is the single thing that makes it look like a painted pill.
//
// The one property NOT reproduced is the backdrop blur: expo-blur is not in
// the binary, and over an opaque ground it contributes almost nothing next to
// the rim and the sheen.

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { convo } from './onboarding/convoTokens';
import { typography } from '../theme/typography';

export interface GlassButtonProps {
  label: string;
  onPress(): void;
  disabled?: boolean;
  /** Screen readers; falls back to the label. */
  accessibilityLabel?: string;
  /** Top margin, since callers space it differently. */
  marginTop?: number;
}

export function GlassButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  marginTop = 0,
}: GlassButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.root,
        { marginTop },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {/* 1 · rim */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.85)',
          'rgba(255,255,255,0.20)',
          'rgba(255,255,255,0.06)',
          'rgba(70,44,170,0.50)',
        ]}
        locations={[0, 0.42, 0.66, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.inner}>
        {/* 2 · fill */}
        <LinearGradient
          colors={['rgba(108,80,240,0.90)', 'rgba(76,48,196,0.88)']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 4 · floor */}
        <LinearGradient
          colors={['rgba(46,26,120,0)', 'rgba(46,26,120,0.42)']}
          style={styles.floor}
          pointerEvents="none"
        />
        {/* 3 · sheen */}
        <View pointerEvents="none" style={styles.sheenWrap}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View pointerEvents="none" style={styles.topEdge} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#462CAA',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
  // Inset by the rim's width, so the gradient behind reads as a border.
  inner: {
    ...StyleSheet.absoluteFillObject,
    margin: 1.2,
    borderRadius: 26.8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 },
  // left -14%, width 58%, height 260%, rotate 22deg — the design's ::after.
  sheenWrap: {
    position: 'absolute',
    left: '-14%',
    top: '-120%',
    width: '58%',
    height: '260%',
    transform: [{ rotate: '22deg' }],
  },
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  label: {
    fontFamily: typography.fonts.bold,
    fontSize: 16.5,
    letterSpacing: -0.17,
    color: convo.onPrimary,
  },
});
