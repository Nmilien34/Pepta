// Authenticated app shell: a bottom-tab navigator (Home / Track / Progress /
// Account) with the custom TabBar + center quick-log FAB. The QuickLog + MealLog
// sheets live in LogSheetsProvider so the FAB and the Home checklist share them.

import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { LogSheetsProvider, useLogSheets } from '../context/LogSheetsContext';
import { PepCompanion } from '../components/PepCompanion';
import { TabBar } from './TabBar';
import { HomeScreen } from '../screens/app/HomeScreen';
import { TrackScreen } from '../screens/app/TrackScreen';
import { ProgressScreen } from '../screens/app/ProgressScreen';
import { AccountScreen } from '../screens/app/AccountScreen';
import { DoseSettingsScreen } from '../screens/app/DoseSettingsScreen';
import { FoodHistoryScreen } from '../screens/app/FoodHistoryScreen';
import { WeightDetailScreen } from '../screens/app/WeightDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export function MainTabs() {
  return (
    <LogSheetsProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="DoseSettings" component={DoseSettingsScreen} />
        <Stack.Screen name="FoodHistory" component={FoodHistoryScreen} />
        <Stack.Screen name="WeightDetail" component={WeightDetailScreen} />
      </Stack.Navigator>
    </LogSheetsProvider>
  );
}

function Tabs() {
  const theme = useTheme();
  const { openQuickLog } = useLogSheets();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.bg } }}
        tabBar={(props) => <TabBar {...props} onQuickLog={() => openQuickLog()} />}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Track" component={TrackScreen} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Account" component={AccountScreen} />
      </Tab.Navigator>
      <PepCompanion />
    </View>
  );
}
