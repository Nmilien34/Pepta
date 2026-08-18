// Authenticated app shell: a bottom-tab navigator (Home / Track / Progress /
// Account) with the custom TabBar + center quick-log FAB. The QuickLog + MealLog
// sheets live in LogSheetsProvider so the FAB and the Home checklist share them.

import React from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme";
import { LogSheetsProvider, useLogSheets } from "../context/LogSheetsContext";
import { PepChatProvider } from "../context/PepChatContext";
import { PepCompanion } from "../components/PepCompanion";
import { TabBar } from "./TabBar";
import { HomeScreen } from "../screens/app/HomeScreen";
import { TrackScreen } from "../screens/app/TrackScreen";
import { ProgressScreen } from "../screens/app/ProgressScreen";
import { AccountScreen } from "../screens/app/AccountScreen";
import { AccountDetailsScreen } from "../screens/app/AccountDetailsScreen";
import { AccountFAQScreen } from "../screens/app/AccountFAQScreen";
import { SourcesScreen } from "../screens/app/SourcesScreen";
import { DoseSettingsScreen } from "../screens/app/DoseSettingsScreen";
import { CycleSetupScreen } from "../screens/app/CycleSetupScreen";
import { MixCalculatorScreen } from "../screens/app/MixCalculatorScreen";
import { LibraryScreen } from "../screens/app/LibraryScreen";
import { NutrientWaysScreen } from "../screens/app/NutrientWaysScreen";
import { LibraryEntryScreen } from "../screens/app/LibraryEntryScreen";
import { FoodHistoryScreen } from "../screens/app/FoodHistoryScreen";
import { WeightDetailScreen } from "../screens/app/WeightDetailScreen";
import { WidgetSetupScreen } from "../screens/app/WidgetSetupScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export function MainTabs() {
  return (
    <LogSheetsProvider>
      {/* Chat provider wraps the whole stack (not just Tabs) so detail screens
          like the peptide library can open Ask Pep too. */}
      <PepChatProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="DoseSettings" component={DoseSettingsScreen} />
        <Stack.Screen name="CycleSetup" component={CycleSetupScreen} />
        <Stack.Screen name="MixCalculator" component={MixCalculatorScreen} />
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="LibraryEntry" component={LibraryEntryScreen} />
        <Stack.Screen name="NutrientWays" component={NutrientWaysScreen} />
        <Stack.Screen name="FoodHistory" component={FoodHistoryScreen} />
        <Stack.Screen name="WeightDetail" component={WeightDetailScreen} />
        <Stack.Screen name="WidgetSetup" component={WidgetSetupScreen} />
        <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
        <Stack.Screen name="AccountFAQ" component={AccountFAQScreen} />
        <Stack.Screen name="Sources" component={SourcesScreen} />
      </Stack.Navigator>
      </PepChatProvider>
    </LogSheetsProvider>
  );
}

function Tabs() {
  const theme = useTheme();
  const { openQuickLog } = useLogSheets();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.colors.bg },
        }}
        tabBar={(props) => (
          <TabBar {...props} onQuickLog={() => openQuickLog()} />
        )}
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
