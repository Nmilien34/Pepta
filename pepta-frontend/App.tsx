import React, { useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppFonts, useTheme } from './src/theme';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { PeptaDataProvider } from './src/context/PeptaDataContext';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { SignInScreen } from './src/screens/auth/SignInScreen';
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

// Unauthenticated phase: Welcome (splash/hero) → Sign in (Apple/Google).
// A successful sign-in flips auth.isAuthenticated and AppShell advances.
function AuthNavigator() {
  const [step, setStep] = useState<'welcome' | 'signin'>('welcome');
  if (step === 'signin') {
    return <SignInScreen onBack={() => setStep('welcome')} />;
  }
  return <WelcomeScreen onContinue={() => setStep('signin')} />;
}

function AppShell() {
  const auth = useAuth();
  const theme = useTheme();

  if (auth.isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }

  if (!auth.isAuthenticated) {
    return <AuthNavigator />;
  }

  if (!auth.user?.onboardingComplete) {
    return <OnboardingNavigator />;
  }

  return (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  );
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
