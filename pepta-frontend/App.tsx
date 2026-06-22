import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppFonts, useTheme } from './src/theme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { PeptaDataProvider } from './src/context/PeptaDataContext';
import { WelcomeScreen } from './src/screens/auth/WelcomeScreen';
import { SignInScreen } from './src/screens/auth/SignInScreen';
import { OnboardingNavigator } from './src/screens/onboarding/OnboardingNavigator';

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
    <View>
      <Text>Main</Text>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
