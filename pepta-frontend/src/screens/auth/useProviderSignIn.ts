// The Google/Apple sign-in machinery, extracted from SignInScreen so the
// merged reveal+auth onboarding turn runs the EXACT same logic — config,
// dev bridge, error copy and all — instead of a second implementation that
// would drift. Both callers render their own buttons; this owns the state.

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "../../config";
import { useAuth } from "../../context/AuthContext";
import { runAppleSignIn, shouldRenderAppleSignIn } from "./appleSignIn";
import { runGoogleSignIn } from "./googleSignIn";

export type SignInBusy = "google" | "apple" | "demo" | null;

export function useProviderSignIn() {
  const auth = useAuth();
  const [busy, setBusy] = useState<SignInBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const showApple = shouldRenderAppleSignIn(Platform.OS);

  useEffect(() => {
    // Native Google config. The web client ID must match the backend audience.
    GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      scopes: ["profile", "email"],
      offlineAccess: false,
    });
  }, []);

  const handleApple = useCallback(async () => {
    if (busy) return;
    setBusy("apple");
    setError(null);
    void Haptics.selectionAsync();
    try {
      await runAppleSignIn({
        requestCredential: () =>
          AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          }),
        signInWithApple: auth.signInWithApple,
      });
    } catch {
      // Dev bridge: the backend is deferred, so a failed sign-in drops into a
      // local session to keep the flow traversable. Remove when auth is live.
      if (__DEV__) {
        auth.devSignIn();
        return;
      }
      setError("We couldn’t sign you in with Apple. Please try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, auth]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    setBusy("google");
    setError(null);
    void Haptics.selectionAsync();
    try {
      await runGoogleSignIn({
        hasPlayServices: () => GoogleSignin.hasPlayServices(),
        signIn: () => GoogleSignin.signIn(),
        signInWithGoogle: auth.signInWithGoogle,
      });
    } catch {
      if (__DEV__) {
        auth.devSignIn();
        return;
      }
      setError("We couldn’t sign you in with Google. Please try again.");
    } finally {
      setBusy(null);
    }
  }, [busy, auth]);

  return { busy, setBusy, error, setError, showApple, handleApple, handleGoogle };
}
