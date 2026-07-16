import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppFonts, useTheme } from './src/theme';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { PeptaDataProvider } from './src/context/PeptaDataContext';
import { OnboardingNavigator } from './src/screens/onboarding/OnboardingNavigator';
import { MainTabs } from './src/navigation/MainTabs';

// Holds the first paint until the Hanken faces are ready, so text never flashes
// in the system fallback. Renders a themed blank background meanwhile.
function FontGate({ children }: { children: React.ReactNode }) {
  const fontsLoaded = useAppFonts();
  const theme = useTheme();
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  return <>{children}</>;
}

function AppShell() {
  const auth = useAuth();
  const theme = useTheme();

  if (auth.isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }

  // Signed in AND onboarded → the app. Everyone else — brand-new visitors and
  // users who signed in partway — runs the onboarding funnel, which now owns the
  // welcome hook and the sign-in step. Auth moved late (right before the paywall),
  // so newcomers are pulled straight into the questions before being asked to
  // commit an account.
  if (auth.isAuthenticated && auth.user?.onboardingComplete) {
    return (
      <NavigationContainer>
        <MainTabs />
      </NavigationContainer>
    );
  }

  return <OnboardingNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <FontGate>
              <AuthProvider>
                <PeptaDataProvider>
                  <OnboardingProvider>
                    <AppShell />
                  </OnboardingProvider>
                </PeptaDataProvider>
              </AuthProvider>
            </FontGate>
          </ThemeProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
