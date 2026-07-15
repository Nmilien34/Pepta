import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Button, Card } from "../../components";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { usePeptaData } from "../../context/PeptaDataContext";
import { api } from "../../services/api";
import { useTheme } from "../../theme";
import {
  deriveReminderGroups,
  defaultReminderState,
  type ReminderIcon,
} from "./reminderSettings";
import {
  loadReminderState,
  saveReminderState,
  syncReminderNotifications,
  type ReminderPermissionStatus,
} from "../../services/reminderNotification.service";

const ICON_META: Record<ReminderIcon, { bg: string; color: string }> = {
  notifications: { bg: "#FFF1E7", color: "#C75B16" },
  needle: { bg: "#EFEBFF", color: "#6F4DFF" },
  nutrition: { bg: "#FCEBEB", color: "#C13F3F" },
  water: { bg: "#E7F4FF", color: "#1E7FCC" },
  scale: { bg: "#F1EFE8", color: "#5F5E5A" },
  "chart-line": { bg: "#E8F8EE", color: "#1E8E40" },
  images: { bg: "#FBEAF6", color: "#A8327D" },
  pulse: { bg: "#FFF6E5", color: "#B5790B" },
};

interface ReminderSettingsScreenProps {
  visible: boolean;
  onClose(): void;
}

export function ReminderSettingsScreen({ visible, onClose }: ReminderSettingsScreenProps) {
  const theme = useTheme();
  const { user, updateCachedUser } = useAuth();
  const { home, track, refreshHome, refreshTrack } = usePeptaData();
  const groups = useMemo(() => deriveReminderGroups({ home, track }), [home, track]);
  const [state, setState] = useState<Record<string, boolean>>(() => defaultReminderState(groups));
  const [permissionStatus, setPermissionStatus] = useState<ReminderPermissionStatus>("undetermined");
  const [aiPushCopyConsent, setAiPushCopyConsent] = useState(
    user?.notificationPreferences?.aiPushCopyConsent === true,
  );
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAiPushCopyConsent(user?.notificationPreferences?.aiPushCopyConsent === true);
  }, [user?.notificationPreferences?.aiPushCopyConsent, visible]);

  useEffect(() => {
    if (!visible) return;
    if (!home) void refreshHome();
    if (!track) void refreshTrack();
  }, [home, refreshHome, refreshTrack, track, visible]);

  const applyReminderState = useCallback(
    async (nextState: Record<string, boolean>, previousState?: Record<string, boolean>) => {
      setState(nextState);
      setSyncing(true);
      setError(null);
      try {
        await saveReminderState(nextState);
        const result = await syncReminderNotifications(groups, nextState);
        setPermissionStatus(result.permissionStatus);
      } catch {
        if (previousState) setState(previousState);
        setError("Couldn't update reminders right now.");
      } finally {
        setSyncing(false);
      }
    },
    [groups],
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;

    setSyncing(true);
    setError(null);
    loadReminderState(groups)
      .then(async (loaded) => {
        if (!active) return;
        setState(loaded);
        const result = await syncReminderNotifications(groups, loaded);
        if (!active) return;
        setPermissionStatus(result.permissionStatus);
      })
      .catch(() => {
        if (active) setError("Couldn't update reminders right now.");
      })
      .finally(() => {
        if (active) setSyncing(false);
      });

    return () => {
      active = false;
    };
  }, [groups, visible]);

  const hasScheduledReminderOn = groups.some((group) =>
    group.items.some((item) => item.schedule.kind !== "none" && state[item.id]),
  );
  const statusText =
    error ??
    (!hasScheduledReminderOn
      ? "All scheduled reminders are off."
      : permissionStatus === "denied"
        ? "Notifications are off in your phone settings."
        : syncing
          ? "Updating reminders..."
          : "Reminders are scheduled on this phone.");

  const toggle = (id: string, value: boolean) => {
    Haptics.selectionAsync().catch(() => undefined);
    void applyReminderState({ ...state, [id]: value }, state);
  };

  const toggleAiPushCopyConsent = (value: boolean) => {
    Haptics.selectionAsync().catch(() => undefined);
    const previous = aiPushCopyConsent;
    setAiPushCopyConsent(value);
    setAiConsentSaving(true);
    setError(null);
    api
      .updateNotificationPreferences({ aiPushCopyConsent: value })
      .then((notificationPreferences) => {
        if (user) {
          updateCachedUser({ ...user, notificationPreferences });
        }
      })
      .catch(() => {
        setAiPushCopyConsent(previous);
        setError("Couldn't update Pep's AI notification setting right now.");
      })
      .finally(() => setAiConsentSaving(false));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 48,
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close reminders"
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
            </Pressable>
            <AppText variant="screenTitle" style={{ fontSize: 24 }}>
              Reminders
            </AppText>
            <View style={{ width: 38 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Card style={{ backgroundColor: "#F3EFFF" }} flat>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 16,
                    backgroundColor: theme.colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {syncing ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Icon name="notifications" size={20} color={theme.colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                    {statusText}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 4, lineHeight: 17 }}>
                    Dose cycle, protein, hydration, weigh-in, and trend reminders stay local to this phone.
                  </AppText>
                </View>
              </View>
            </Card>

            <Card style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 16,
                    backgroundColor: "#E8F8EE",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {aiConsentSaving ? (
                    <ActivityIndicator color="#1E8E40" />
                  ) : (
                    <Icon name="sparkles" size={19} color="#1E8E40" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                    Personalized Pep push notes
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 4, lineHeight: 17 }}>
                    Let Pep use recent logs, dose timing, goals, and OpenAI to write smarter push wording.
                  </AppText>
                </View>
                <Switch
                  value={aiPushCopyConsent}
                  onValueChange={toggleAiPushCopyConsent}
                  disabled={aiConsentSaving || !user}
                  trackColor={{ false: theme.colors.surfaceAlt, true: "#BDECCD" }}
                  thumbColor={aiPushCopyConsent ? "#1E8E40" : "#FFFFFF"}
                  accessibilityLabel="Personalized Pep push notes"
                />
              </View>
            </Card>

            {groups.map((group) => (
              <View key={group.title} style={{ marginTop: 20 }}>
                <AppText
                  variant="sectionHeader"
                  color="textTertiary"
                  style={{ paddingLeft: 6, marginBottom: 8, textTransform: "uppercase" }}
                >
                  {group.title}
                </AppText>
                <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
                  {group.items.map((item, index) => {
                    const meta = ICON_META[item.icon];
                    return (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingVertical: 12,
                          borderBottomWidth: index === group.items.length - 1 ? 0 : 0.5,
                          borderBottomColor: theme.colors.border,
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            backgroundColor: meta.bg,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon name={item.icon} size={17} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                            {item.label}
                          </AppText>
                          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                            {item.subtitle}
                          </AppText>
                        </View>
                        <Switch
                          value={Boolean(state[item.id])}
                          onValueChange={(value) => toggle(item.id, value)}
                          disabled={syncing || item.schedule.kind === "none"}
                          trackColor={{ false: theme.colors.surfaceAlt, true: "#D9CBFF" }}
                          thumbColor={state[item.id] ? theme.colors.primary : "#FFFFFF"}
                          accessibilityLabel={item.label}
                        />
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))}

            <Button label="Done" onPress={onClose} style={{ marginTop: 22 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
