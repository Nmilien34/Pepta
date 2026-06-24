// Custom bottom tab bar (mirrors Leanient's react-navigation tabBar pattern, but
// Pepta visuals): white bar + hairline, 4 tabs with a centered square-ring plus
// button that opens quick-log. Active = brand purple, inactive = tertiary. Haptic on
// every press; safe-area aware.

import React from 'react';
import { Pressable, View } from 'react-native';
import IconHome2 from '@tabler/icons-react-native/IconHome2';
import IconVaccine from '@tabler/icons-react-native/IconVaccine';
import IconChartLine from '@tabler/icons-react-native/IconChartLine';
import IconUserCircle from '@tabler/icons-react-native/IconUserCircle';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { AppText } from '../components';

// Exact Tabler icons from the design lab (ti-home-2 / ti-vaccine / ti-chart-line /
// ti-user-circle). Focused = a slightly heavier stroke + brand purple.
const ICONS: Record<string, (focused: boolean, color: string) => React.ReactNode> = {
  Home: (f, c) => <IconHome2 size={24} color={c} strokeWidth={f ? 2.4 : 1.9} />,
  Track: (f, c) => <IconVaccine size={24} color={c} strokeWidth={f ? 2.4 : 1.9} />,
  Progress: (f, c) => <IconChartLine size={24} color={c} strokeWidth={f ? 2.4 : 1.9} />,
  Account: (f, c) => <IconUserCircle size={25} color={c} strokeWidth={f ? 2.4 : 1.9} />,
};

export interface TabBarProps extends BottomTabBarProps {
  onQuickLog(): void;
}

export function TabBar({ state, navigation, onQuickLog }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes;

  const renderTab = (route: (typeof routes)[number]) => {
    const index = routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const color = focused ? theme.colors.primary : theme.colors.textTertiary;
    const onPress = () => {
      Haptics.selectionAsync().catch(() => undefined);
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };
    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={route.name}
        style={{ flex: 1, alignItems: 'center', gap: 4, paddingTop: 2 }}
      >
        {ICONS[route.name]?.(focused, color)}
        <AppText variant="caption" color={color} style={{ fontSize: 10.5, fontWeight: '600' }}>
          {route.name}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.border,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 16,
      }}
    >
      {routes.slice(0, 2).map(renderTab)}
      <View style={{ width: 74, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onQuickLog();
          }}
          accessibilityRole="button"
          accessibilityLabel="Log something"
          style={({ pressed }) => ({
            width: 58,
            height: 58,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.52)',
            opacity: pressed ? 0.82 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              bottom: 4,
              left: 4,
              borderRadius: 15,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          />
          <CornerMark corner="topLeft" />
          <CornerMark corner="topRight" />
          <CornerMark corner="bottomLeft" />
          <CornerMark corner="bottomRight" />
          <LinearGradient
            colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}
          >
            <IconPlus size={24} color="#FFFFFF" strokeWidth={2.6} />
          </LinearGradient>
        </Pressable>
      </View>
      {routes.slice(2).map(renderTab)}
    </View>
  );
}

function CornerMark({ corner }: { corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) {
  const vertical = corner.includes('top') ? { top: 8 } : { bottom: 8 };
  const horizontal = corner.includes('Left') ? { left: 8 } : { right: 8 };
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        ...vertical,
        ...horizontal,
        borderColor: 'rgba(106,79,176,0.16)',
        borderTopWidth: corner.includes('top') ? 1 : 0,
        borderBottomWidth: corner.includes('bottom') ? 1 : 0,
        borderLeftWidth: corner.includes('Left') ? 1 : 0,
        borderRightWidth: corner.includes('Right') ? 1 : 0,
        borderTopLeftRadius: corner === 'topLeft' ? 5 : 0,
        borderTopRightRadius: corner === 'topRight' ? 5 : 0,
        borderBottomLeftRadius: corner === 'bottomLeft' ? 5 : 0,
        borderBottomRightRadius: corner === 'bottomRight' ? 5 : 0,
      }}
    />
  );
}
