// The update prompt surface. Mounted ONLY inside the post-onboarding app
// shell (AccessGate's MainTabs branch), which is what keeps it out of the
// onboarding funnel: mid-onboarding users never mount this, so the check
// naturally defers to whenever the shell first appears. Mounting there also
// sequences the fetch after AuthContext's RevenueCat configure() without
// blocking it — checkForUpdate fails open on every error, so this component
// can delay nothing and break nothing.
//
// Soft mode: dismissible, throttled to once per 72h (persisted in
// checkForUpdate/markSoftPromptShown). Hard mode: no "Later", no dismiss —
// dormant until the backend's PEPTA_FORCE_UPDATE env var arms it.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import {
  checkForUpdate,
  markSoftPromptShown,
  openAppStore,
  type UpdatePrompt,
} from '../services/appUpdate';
import { logUpdatePromptAction, logUpdatePromptShown } from '../services/funnelEvents';

export function AppUpdateGate() {
  const theme = useTheme();
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForUpdate().then((result) => {
      if (cancelled || !result) return;
      setPrompt(result);
      if (result.mode === 'soft') void markSoftPromptShown();
      logUpdatePromptShown({
        runningVersion: result.runningVersion,
        latestVersion: result.latestVersion,
        mode: result.mode,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!prompt) return null;
  const hard = prompt.mode === 'hard';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android back button: dismiss only in soft mode.
      onRequestClose={() => {
        if (!hard) {
          logUpdatePromptAction('later');
          setPrompt(null);
        }
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{prompt.title}</Text>
          <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
            {prompt.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Update"
            style={[styles.updateButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => {
              logUpdatePromptAction('update');
              void openAppStore(prompt.storeUrl);
              // Hard mode stays up: the app remains unusable until updated.
              if (!hard) setPrompt(null);
            }}
          >
            <Text style={[styles.updateLabel, { color: theme.colors.onPrimary }]}>Update</Text>
          </Pressable>
          {!hard ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Later"
              style={styles.laterButton}
              onPress={() => {
                logUpdatePromptAction('later');
                setPrompt(null);
              }}
            >
              <Text style={[styles.laterLabel, { color: theme.colors.textSecondary }]}>
                Later
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
  },
  title: {
    fontFamily: typography.fonts.bold,
    fontSize: 20,
    marginBottom: 8,
  },
  message: {
    fontFamily: typography.fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 20,
  },
  updateButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  updateLabel: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 16,
  },
  laterButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterLabel: {
    fontFamily: typography.fonts.medium,
    fontSize: 15,
  },
});
