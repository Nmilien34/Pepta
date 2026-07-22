import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppFonts, useTheme } from './src/theme';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import { AccessProvider } from './src/context/AccessContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { PeptaDataProvider } from './src/context/PeptaDataContext';
import { AccessGate } from './src/components/AccessGate';
import { attLaunchPrompt } from './src/services/attPrompt';

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

export default function App() {
  // ATT must be requested at launch, not behind sign-in — App Review installs
  // fresh, never authenticates, and must still see the dialog (2.1 rejection).
  React.useEffect(() => {
    attLaunchPrompt.start();
  }, []);

  // Routing lives in AccessGate (access-state switch) fed by AccessContext —
  // App.tsx only assembles providers, per the access design doc.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <FontGate>
              <AuthProvider>
                <AccessProvider>
                  <PeptaDataProvider>
                    <OnboardingProvider>
                      <AccessGate />
                    </OnboardingProvider>
                  </PeptaDataProvider>
                </AccessProvider>
              </AuthProvider>
            </FontGate>
          </ThemeProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
