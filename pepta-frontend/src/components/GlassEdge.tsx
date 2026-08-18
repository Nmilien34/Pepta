// The glass rim, as a wrapper.
//
// Sibling of GlassButton: same idea, no fill. A masked gradient border that
// runs bright white at the top-left, through nothing, to a faint dark line at
// the bottom-right — so the edge reads as light catching a surface rather than
// a stroke drawn around a box. A uniform borderColor cannot express that, and
// a flat 1px line is exactly what makes a card look like a rectangle.
//
// Used on the two soft cards on Home (Your plan, Pep's read) and the streak
// chip in the header. Those sit flat on the ground with no fill of their own,
// so the rim is doing all the work — this is the LOOK of glass rather than its
// physics, which is the honest thing to build without expo-blur in the binary.
//
// The rim is painted full-bleed and the content inset by its width, the same
// construction GlassButton uses.

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface GlassEdgeProps {
  children: React.ReactNode;
  /** Must match the content's radius, or the rim corners will not line up. */
  radius: number;
  /** Fill behind the content. Transparent shows the ground. */
  backgroundColor?: string;
  /** Rim thickness. 1.2 reads as an edge; above ~2 it reads as a border. */
  width?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function GlassEdge({
  children,
  radius,
  backgroundColor = 'transparent',
  width = 1.2,
  style,
  contentStyle,
}: GlassEdgeProps) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.95)',
          'rgba(255,255,255,0.35)',
          'rgba(23,20,31,0.05)',
          'rgba(23,20,31,0.11)',
        ]}
        locations={[0, 0.4, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          {
            margin: width,
            borderRadius: Math.max(0, radius - width),
            backgroundColor,
            overflow: 'hidden',
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
