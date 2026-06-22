// Custom bottom tab bar (mirrors Leanient's react-navigation tabBar pattern, but
// Pepta visuals): white bar + hairline, 4 tabs with a center gradient squircle
// FAB that opens quick-log. Active = brand purple, inactive = tertiary. Haptic on
// every press; safe-area aware.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { AppText } from '../components';

const ICONS: Record<string, (focused: boolean, color: string) => React.ReactNode> = {
  Home: (f, c) => <Ionicons name={f ? 'home' : 'home-outline'} size={23} color={c} />,
  Track: (_f, c) => <MaterialCommunityIcons name="needle" size={23} color={c} />,
  Progress: (f, c) => <Ionicons name={f ? 'stats-chart' : 'stats-chart-outline'} size={22} color={c} />,
  Account: (f, c) => <Ionicons name={f ? 'person-circle' : 'person-circle-outline'} size={25} color={c} />,
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
        alignItems: 'flex-start',
        backgroundColor: theme.colors.surface,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.border,
        paddingTop: 11,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 18,
      }}
    >
      {routes.slice(0, 2).map(renderTab)}
      <View style={{ width: 60, alignItems: 'center' }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onQuickLog();
          }}
          accessibilityRole="button"
          accessibilityLabel="Log something"
          style={{ marginTop: -10 }}
        >
          <LinearGradient
            colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: theme.colors.surface },
              theme.shadows.floating,
            ]}
          >
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
      {routes.slice(2).map(renderTab)}
    </View>
  );
}
