// CountUp — an AppText whose number animates from 0 to `value` on mount, and
// tweens between values on change. Used for the hero stats (medication level,
// protein) so numbers feel alive rather than snapping in.

import React, { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { AppText, type AppTextProps } from './AppText';

export interface CountUpProps extends Omit<AppTextProps, 'children'> {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}

export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 700, ...textProps }: CountUpProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    const animation = Animated.timing(anim, { toValue: value, duration, useNativeDriver: false });
    animation.start();
    return () => {
      anim.removeListener(id);
      animation.stop();
    };
  }, [anim, value, duration]);

  return <AppText {...textProps}>{format(display)}</AppText>;
}
