// The routing switch for access states. Pure decision → surface mapping; all
// resolution mechanics live in AccessContext. Held on the branded background
// until a decision (or bounded cache) exists, so nothing flashes.

import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAccess } from '../context/AccessContext';
import { useTheme } from '../theme';
import { MainTabs } from '../navigation/MainTabs';
import { OnboardingNavigator } from '../screens/onboarding/OnboardingNavigator';
import { PaywallScreen } from '../screens/onboarding/PaywallScreen';
import { AccessSetupScreen } from '../screens/access/AccessSetupScreen';

function Blank() {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
}

export function AccessGate() {
  const auth = useAuth();
  const access = useAccess();

  if (auth.isLoading) return <Blank />;

  // Unauthenticated → the funnel owns welcome + sign-in.
  if (!auth.isAuthenticated) return <OnboardingNavigator />;

  const decision = access.decision;
  const onboarded = auth.user?.onboardingComplete === true;

  // Authenticated but undecided: hold the first frame — never guess.
  if (!decision) return <Blank />;

  const shell = onboarded ? (
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>
  ) : (
    <OnboardingNavigator />
  );

  switch (decision.state) {
    case 'active':
      return shell;
    case 'provisioning':
      return (
        <AccessSetupScreen
          mode="provisioning"
          onRetry={() => void access.resolve()}
          onSignOut={auth.logout}
        />
      );
    case 'identity_verification_required':
      return (
        <AccessSetupScreen
          mode="identity_verification"
          onRetry={() => void access.resolve()}
          onSignOut={auth.logout}
        />
      );
    case 'temporarily_unavailable':
      // Bounded offline: cached access opens the shell until validUntil;
      // without usable cache it is retry UX — never a paywall.
      if (decision.cachedAccess) return shell;
      return (
        <AccessSetupScreen
          mode="unavailable"
          onRetry={() => void access.resolve()}
          onSignOut={auth.logout}
        />
      );
    case 'inactive':
      // Positively resolved inactive. Returning users get the subscription
      // gate directly (no onboarding repeat); new users run the funnel,
      // which ends at the same hard paywall.
      if (onboarded) {
        return <PaywallScreen onComplete={() => access.resolve()} />;
      }
      return <OnboardingNavigator />;
    default:
      return <Blank />;
  }
}
