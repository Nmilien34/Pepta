// Placeholder screens for the tabs not yet built (Track / Progress / Account).
// The design lab is the reference; these get implemented next, like Home.

import React from 'react';
import { View } from 'react-native';
import { AppText, Mascot, Screen } from '../../components';
import { useTheme } from '../../theme';

function TabPlaceholder({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Screen>
      <AppText variant="screenTitle">{title}</AppText>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
        <Mascot pose="idle" size={96} />
        <AppText variant="body" color="textSecondary">
          Coming soon
        </AppText>
      </View>
    </Screen>
  );
}

export function TrackScreen() {
  return <TabPlaceholder title="Track" />;
}
export function ProgressScreen() {
  return <TabPlaceholder title="Progress" />;
}
export function AccountScreen() {
  return <TabPlaceholder title="Account" />;
}
