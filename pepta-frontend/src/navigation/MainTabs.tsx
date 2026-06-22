// Authenticated app shell: a bottom-tab navigator (Home / Track / Progress /
// Account) with the custom TabBar + center quick-log FAB.

import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme';
import { QuickLogSheet, MealLogSheet } from '../components';
import { TabBar } from './TabBar';
import { HomeScreen } from '../screens/app/HomeScreen';
import { TrackScreen } from '../screens/app/TrackScreen';
import { ProgressScreen } from '../screens/app/ProgressScreen';
import { AccountScreen } from '../screens/app/AccountScreen';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  const theme = useTheme();
  const [logOpen, setLogOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.bg } }}
        tabBar={(props) => <TabBar {...props} onQuickLog={() => setLogOpen(true)} />}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Track" component={TrackScreen} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Account" component={AccountScreen} />
      </Tab.Navigator>
      <QuickLogSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onMeal={() => {
          setLogOpen(false);
          setMealOpen(true);
        }}
      />
      <MealLogSheet visible={mealOpen} onClose={() => setMealOpen(false)} />
    </>
  );
}
