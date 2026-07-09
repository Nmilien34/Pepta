// Account tab — profile, subscription, and settings. Reads the auth User
// (display name + entitlement) and the profile/home (units, dose unit, journey
// day, current compound). Rows are real where wired (Terms/Privacy → Linking,
// Sign out → confirm + logout); the rest are inert until their detail screens
// exist (so they don't pretend to do something).

import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { Icon } from "../../components/Icon";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { AppText, Card, Reveal, UserAvatar } from "../../components";
import { BottomSheet } from "../../components/BottomSheet";
import { useAuth } from "../../context/AuthContext";
import { usePeptaData } from "../../context/PeptaDataContext";
import { PRIVACY_URL, TERMS_URL } from "../../config";
import { api } from "../../services/api";
import type {
  UserProfileResponse,
  UserProfileSettingsPatch,
} from "@pepta/shared";
import {
  displayName,
  doseUnitLabel,
  entitlementView,
  profileSubtitle,
  unitsLabel,
} from "./accountView";
import { ReminderSettingsScreen } from "./ReminderSettingsScreen";
import { PaywallScreen } from "../onboarding/PaywallScreen";
import {
  buildPeptaReportExportPayload,
  buildPeptaReportExportShareContent,
} from "./reportExport";

const SUPPORT_EMAIL = "dev@boltzman.ai";
const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const DOSE_UNIT_OPTIONS = ["mg", "mcg", "ml", "units"] as const;
type SettingsSheet = "units" | "doseUnit" | null;
type AccountNavigationParamList = {
  AccountDetails: undefined;
  AccountFAQ: undefined;
  WidgetSetup: undefined;
  Sources: undefined;
};

interface Row {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: string;
  badge?: { text: string; color: string; bg: string };
  onPress?: () => void;
  chevron?: boolean;
}

export function AccountScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NavigationProp<AccountNavigationParamList>>();
  const { user, logout } = useAuth();
  const { home, track, progress, refreshHome } = usePeptaData();
  const [settingsSheet, setSettingsSheet] = useState<SettingsSheet>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [profilePatch, setProfilePatch] = useState<UserProfileSettingsPatch>(
    {},
  );

  useEffect(() => {
    if (!home) void refreshHome();
  }, [home, refreshHome]);

  const profile = home?.profile ?? null;
  const effectiveProfile: UserProfileResponse | null = profile
    ? { ...profile, ...profilePatch }
    : null;
  const ent = entitlementView(user);
  const currentDisplayName = displayName(user);

  useEffect(() => {
    setProfilePatch({});
  }, [
    profile?.weightUnit,
    profile?.heightUnit,
    profile?.goalWeightUnit,
    profile?.doseUnitPreference,
  ]);

  const confirmSignOut = () => {
    Haptics.selectionAsync().catch(() => undefined);
    Alert.alert(
      "Sign out?",
      "You can sign back in anytime with Apple or Google.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: logout },
      ],
    );
  };

  const openUrl = (url: string) => () => {
    Linking.openURL(url).catch(() => undefined);
  };

  const comingSoon = (title: string, message: string) => () => {
    Haptics.selectionAsync().catch(() => undefined);
    Alert.alert(title, message);
  };

  const openMail = (subject: string) => () => {
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`,
    ).catch(() => Alert.alert("No mail app", `Reach us at ${SUPPORT_EMAIL}.`));
  };

  const openAppSettings = () => {
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openSettings().catch(() => undefined);
  };

  const handleSubscriptionPress = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (ent.premium) {
      Linking.openURL(APPLE_SUBSCRIPTIONS_URL).catch(() => undefined);
      return;
    }
    setPaywallOpen(true);
  };

  const exportReport = async () => {
    try {
      const [freshHome, freshTrack, freshProgress] = await Promise.allSettled([
        api.getHome(),
        api.getTrack(),
        api.getProgress(),
      ]);
      const payload = buildPeptaReportExportPayload({
        home: freshHome.status === "fulfilled" ? freshHome.value : home,
        track: freshTrack.status === "fulfilled" ? freshTrack.value : track,
        progress:
          freshProgress.status === "fulfilled" ? freshProgress.value : progress,
      });
      await Share.share(buildPeptaReportExportShareContent(payload));
    } catch {
      Alert.alert("Export could not start", "Try again in a moment.");
    }
  };

  const patchSettings = (patch: UserProfileSettingsPatch) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSettingsSheet(null);
    setProfilePatch((current) => ({ ...current, ...patch }));
    api
      .updateProfileSettings(patch)
      .then(() => refreshHome().catch(() => undefined))
      .catch(() => {
        setProfilePatch((current) => {
          const next = { ...current };
          (Object.keys(patch) as Array<keyof UserProfileSettingsPatch>).forEach(
            (key) => {
              delete next[key];
            },
          );
          return next;
        });
        Alert.alert("Couldn’t save", "Check your connection and try again.");
      });
  };

  const chooseUnits = () => setSettingsSheet("units");
  const chooseDoseUnit = () => setSettingsSheet("doseUnit");

  const openAccountDetails = () => {
    Haptics.selectionAsync().catch(() => undefined);
    navigation.navigate("AccountDetails");
  };

  const preferences: Row[] = [
    {
      icon: "resize",
      iconBg: "#F1EFE8",
      iconColor: "#5F5E5A",
      label: "Units",
      value: unitsLabel(effectiveProfile),
      onPress: chooseUnits,
      chevron: true,
    },
    {
      icon: "needle",
      iconBg: "#EFEBFF",
      iconColor: theme.colors.primary,
      label: "Dose units",
      value: doseUnitLabel(effectiveProfile),
      onPress: chooseDoseUnit,
      chevron: true,
    },
    {
      icon: "notifications",
      iconBg: "#FFF1E7",
      iconColor: "#C75B16",
      label: "Notifications",
      onPress: () => setRemindersOpen(true),
      chevron: true,
    },
    {
      icon: "heart",
      iconBg: "#FCEBEB",
      iconColor: "#D14343",
      label: "Apple Health",
      badge: {
        text: "Not connected",
        color: theme.colors.textSecondary,
        bg: theme.colors.surfaceAlt,
      },
      onPress: openAppSettings,
      chevron: true,
    },
    {
      icon: "language",
      iconBg: "#E7F4FF",
      iconColor: "#1E7FCC",
      label: "Language",
      value: "English",
      onPress: comingSoon(
        "Language",
        "Pepta is English-only for now — more languages are coming.",
      ),
      chevron: true,
    },
  ];
  const dataReports: Row[] = [
    {
      icon: "file-export",
      iconBg: "#E8F8EE",
      iconColor: "#1E8E40",
      label: "Export report",
      onPress: () => void exportReport(),
      chevron: true,
    },
    {
      icon: "layout-grid-add",
      iconBg: "#EFEBFF",
      iconColor: theme.colors.primary,
      label: "Add widgets",
      onPress: () => navigation.navigate("WidgetSetup"),
      chevron: true,
    },
  ];
  const support: Row[] = [
    {
      icon: "help-circle",
      iconBg: "#EFEBFF",
      iconColor: theme.colors.primary,
      label: "FAQ",
      onPress: () => navigation.navigate("AccountFAQ"),
      chevron: true,
    },
    {
      icon: "bulb",
      iconBg: "#FBEAF6",
      iconColor: "#A8327D",
      label: "Feature requests",
      onPress: openMail("Pepta feature request"),
      chevron: true,
    },
    {
      icon: "flag-2",
      iconBg: "#FFF6E5",
      iconColor: "#B5790B",
      label: "Report a problem",
      onPress: openMail("Pepta bug report"),
      chevron: true,
    },
    {
      icon: "help-circle",
      iconBg: "#F1EFE8",
      iconColor: "#5F5E5A",
      label: "Help",
      onPress: openMail("Pepta — I need help"),
      chevron: true,
    },
  ];
  const about: Row[] = [
    {
      icon: "document-text-outline",
      iconBg: "#EFEBFF",
      iconColor: theme.colors.primary,
      label: "Sources & citations",
      onPress: () => navigation.navigate("Sources"),
      chevron: true,
    },
    {
      icon: "document-text-outline",
      iconBg: "#F1EFE8",
      iconColor: "#5F5E5A",
      label: "Terms",
      onPress: openUrl(TERMS_URL),
      chevron: true,
    },
    {
      icon: "lock-closed-outline",
      iconBg: "#F1EFE8",
      iconColor: "#5F5E5A",
      label: "Privacy",
      onPress: openUrl(PRIVACY_URL),
      chevron: true,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="screenTitle" style={{ paddingTop: 4 }}>
            Account
          </AppText>

          {/* profile header */}
          <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
            <Pressable onPress={openAccountDetails}>
              {({ pressed }) => (
                <Card
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                    opacity: pressed ? 0.6 : 1,
                  }}
                >
                  <UserAvatar size={54} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="cardTitle" style={{ fontSize: 17 }}>
                      {currentDisplayName}
                    </AppText>
                    <AppText
                      variant="caption"
                      color="textSecondary"
                      style={{ marginTop: 4 }}
                    >
                      {profileSubtitle(
                        effectiveProfile,
                        user,
                        home,
                        new Date(),
                      )}
                    </AppText>
                  </View>
                  <Icon
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textTertiary}
                  />
                </Card>
              )}
            </Pressable>
          </Reveal>

          {/* subscription */}
          <Reveal delay={120} style={{ marginTop: 12 }}>
            <Pressable
              onPress={handleSubscriptionPress}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={["#F3EFFF", "#FBF4FF"] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: theme.sizes.card.borderRadius,
                    padding: 16,
                    borderWidth: 0.5,
                    borderColor: "#E7DEFB",
                  },
                  theme.shadows.card,
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    flex: 1,
                  }}
                >
                  <LinearGradient
                    colors={
                      [
                        theme.colors.primaryGradientStart,
                        theme.colors.primaryGradientEnd,
                      ] as const
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="sparkles" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                      {ent.title}
                    </AppText>
                    <AppText
                      variant="caption"
                      color="textSecondary"
                      style={{ marginTop: 2 }}
                    >
                      {ent.detail}
                    </AppText>
                  </View>
                </View>
                <AppText
                  variant="caption"
                  color="primary"
                  style={{ fontWeight: "800" }}
                >
                  {ent.cta}
                </AppText>
              </LinearGradient>
            </Pressable>
          </Reveal>

          <Section title="Preferences" delay={180} rows={preferences} />
          <Section title="Data & reports" delay={240} rows={dataReports} />
          <Section title="Support" delay={300} rows={support} />
          <Section title="About" delay={360} rows={about} />

          {/* sign out */}
          <Reveal delay={420} style={{ marginTop: 12 }}>
            <Pressable onPress={confirmSignOut}>
              <Card style={{ alignItems: "center", paddingVertical: 15 }}>
                <AppText
                  variant="bodyStrong"
                  style={{ fontWeight: "700", color: theme.colors.danger }}
                >
                  Sign out
                </AppText>
              </Card>
            </Pressable>
          </Reveal>

          <AppText
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ marginTop: 16 }}
          >
            Pepta · v1.0.0
          </AppText>
        </ScrollView>
        <Modal
          visible={paywallOpen}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setPaywallOpen(false)}
        >
          <PaywallScreen
            onComplete={() => {
              setPaywallOpen(false);
              void refreshHome();
            }}
          />
        </Modal>
      </SafeAreaView>
      <SettingsSelectorSheet
        visible={settingsSheet !== null}
        type={settingsSheet}
        currentUnits={unitsLabel(effectiveProfile)}
        currentDoseUnit={doseUnitLabel(effectiveProfile)}
        onClose={() => setSettingsSheet(null)}
        onUnits={(system) =>
          patchSettings(
            system === "metric"
              ? { weightUnit: "kg", heightUnit: "cm", goalWeightUnit: "kg" }
              : { weightUnit: "lb", heightUnit: "in", goalWeightUnit: "lb" },
          )
        }
        onDoseUnit={(doseUnitPreference) =>
          patchSettings({ doseUnitPreference })
        }
      />
      {remindersOpen ? (
        <ReminderSettingsScreen
          visible={remindersOpen}
          onClose={() => setRemindersOpen(false)}
        />
      ) : null}
    </View>
  );
}

function SettingsSelectorSheet({
  visible,
  type,
  currentUnits,
  currentDoseUnit,
  onClose,
  onUnits,
  onDoseUnit,
}: {
  visible: boolean;
  type: SettingsSheet;
  currentUnits: string;
  currentDoseUnit: string;
  onClose(): void;
  onUnits(system: "imperial" | "metric"): void;
  onDoseUnit(unit: (typeof DOSE_UNIT_OPTIONS)[number]): void;
}) {
  const theme = useTheme();
  const isUnits = type === "units";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={isUnits ? "48%" : "56%"}
      scrollable
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="cardTitle" style={{ fontSize: 18 }}>
            {isUnits ? "Units" : "Dose units"}
          </AppText>
          <AppText
            variant="caption"
            color="textSecondary"
            style={{ marginTop: 3 }}
          >
            {isUnits ? "Measurement system" : "Default dose display"}
          </AppText>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close settings selector"
          hitSlop={8}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="close" size={18} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {isUnits ? (
        <View style={{ gap: 10 }}>
          <SelectorOption
            label="Imperial (lb · in)"
            selected={currentUnits === "Imperial"}
            onPress={() => onUnits("imperial")}
          />
          <SelectorOption
            label="Metric (kg · cm)"
            selected={currentUnits === "Metric"}
            onPress={() => onUnits("metric")}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {DOSE_UNIT_OPTIONS.map((unit) => (
            <SelectorOption
              key={unit}
              label={unit}
              selected={currentDoseUnit === unit}
              onPress={() => onDoseUnit(unit)}
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

function SelectorOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        minHeight: 54,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: selected ? "#F3EFFF" : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? "#D9CBFF" : theme.colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: selected
            ? theme.colors.primary
            : theme.colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <Icon name="checkmark" size={15} color="#fff" /> : null}
      </View>
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: "800" }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Section({
  title,
  rows,
  delay,
}: {
  title: string;
  rows: Row[];
  delay: number;
}) {
  return (
    <Reveal delay={delay} style={{ marginTop: 20 }}>
      <AppText
        variant="sectionHeader"
        color="textTertiary"
        style={{ paddingLeft: 6, marginBottom: 8, textTransform: "uppercase" }}
      >
        {title}
      </AppText>
      <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
        {rows.map((row, i) => (
          <SettingRow key={row.label} row={row} last={i === rows.length - 1} />
        ))}
      </Card>
    </Reveal>
  );
}

function SettingRow({ row, last }: { row: Row; last: boolean }) {
  const theme = useTheme();
  const press = () => {
    if (!row.onPress) return;
    Haptics.selectionAsync().catch(() => undefined);
    row.onPress();
  };
  return (
    <Pressable
      onPress={press}
      disabled={!row.onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: row.iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={row.icon} size={16} color={row.iconColor as string} />
      </View>
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: "600" }}>
        {row.label}
      </AppText>
      {row.value ? (
        <AppText variant="caption" color="textSecondary">
          {row.value}
        </AppText>
      ) : null}
      {row.badge ? (
        <View
          style={{
            backgroundColor: row.badge.bg,
            paddingVertical: 3,
            paddingHorizontal: 9,
            borderRadius: theme.radii.pill,
          }}
        >
          <AppText
            variant="caption"
            style={{ color: row.badge.color, fontWeight: "700" }}
          >
            {row.badge.text}
          </AppText>
        </View>
      ) : null}
      {row.chevron ? (
        <Icon
          name="chevron-forward"
          size={16}
          color={theme.colors.textTertiary}
          style={{ marginLeft: 4 }}
        />
      ) : null}
    </Pressable>
  );
}
