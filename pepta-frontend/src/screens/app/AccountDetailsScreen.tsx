import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Card, EditableAvatar } from "../../components";
import { BottomSheet } from "../../components/BottomSheet";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { usePeptaData } from "../../context/PeptaDataContext";
import { api } from "../../services/api";
import { useTheme } from "../../theme";
import { displayName } from "./accountView";

type ProviderName = "apple" | "google";

export function AccountDetailsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { user, logout, updateCachedUser } = useAuth();
  const { home, refreshHome } = usePeptaData();
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!home) void refreshHome();
  }, [home, refreshHome]);

  const currentName = displayName(user);
  const compound = home?.activeCompounds[0] ?? null;
  const medicationValue = compound
    ? [
        compound.plannedDose
          ? `${compound.plannedDose} ${compound.doseUnit}`
          : compound.doseUnit,
        home?.nextDose?.nextDoseAt
          ? `next ${formatShortDateTime(home.nextDose.nextDoseAt)}`
          : "active",
      ].join(" · ")
    : "No active medication";

  const openNameEditor = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setNameDraft(currentName === "You" ? "" : currentName);
    setNameError(null);
    setNameEditorOpen(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      return;
    }
    if (trimmed === currentName) {
      setNameEditorOpen(false);
      return;
    }

    setSavingName(true);
    setNameError(null);
    try {
      const updated = await api.updateAccount({ displayName: trimmed });
      updateCachedUser(updated);
      setNameEditorOpen(false);
    } catch {
      setNameError("Couldn’t save your name. Try again in a moment.");
    } finally {
      setSavingName(false);
    }
  };

  const confirmDeleteAccount = () => {
    Haptics.selectionAsync().catch(() => undefined);
    Alert.alert(
      "Delete account?",
      "This permanently deletes your Pepta account, logs, scans, photos, and profile data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => void deleteAccount(),
        },
      ],
    );
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteAccount();
      logout();
    } catch {
      Alert.alert(
        "Couldn’t delete account",
        "Check your connection and try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 34,
          }}
        >
          <DetailHeader title="Account" onBack={() => navigation.goBack()} />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginTop: theme.spacing.lg,
              paddingHorizontal: 4,
            }}
          >
            <EditableAvatar size={62} />
            <View style={{ flex: 1 }}>
              <AppText variant="screenTitle" style={{ fontSize: 25 }}>
                {currentName}
              </AppText>
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 3 }}
              >
                {user?.email ?? "No email connected"}
              </AppText>
              <AppText
                variant="caption"
                color="primary"
                style={{ marginTop: 4, fontWeight: "800" }}
              >
                Tap photo to change
              </AppText>
            </View>
          </View>

          <Section
            title="Profile"
            rows={[
              {
                icon: "person-circle",
                iconBg: "#EFEBFF",
                iconColor: theme.colors.primary,
                label: "Name",
                value: currentName,
                onPress: openNameEditor,
              },
              {
                icon: "document-text-outline",
                iconBg: "#F1EFE8",
                iconColor: "#5F5E5A",
                label: "Email",
                value: user?.email ?? "Not connected",
              },
            ]}
          />

          <Section
            title="Medication"
            rows={[
              {
                icon: "needle",
                iconBg: "#FFF1E7",
                iconColor: theme.colors.protein,
                label: compound?.name ?? "Medication",
                value: medicationValue,
              },
            ]}
          />

          <Section
            title="Membership"
            rows={[
              {
                icon: "sparkles",
                iconBg: "#EFEBFF",
                iconColor: theme.colors.primary,
                label: "Plan",
                value: planLabel(user?.entitlement.status),
              },
              {
                icon: "calendar-outline",
                iconBg: "#E7F4FF",
                iconColor: "#1E7FCC",
                label: "Joined",
                value: user?.createdAt
                  ? formatJoinedDate(user.createdAt)
                  : "Unknown",
              },
            ]}
          />

          <Section
            title="Sign-in"
            rows={providerRows(user?.authProviders ?? [])}
          />

          <Section
            title="Danger zone"
            rows={[
              {
                icon: "flag-2",
                iconBg: "#FCEBEB",
                iconColor: theme.colors.danger,
                label: "Delete account",
                value: deleting ? "Deleting..." : undefined,
                onPress: confirmDeleteAccount,
                danger: true,
              },
            ]}
          />
          <AppText
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ marginTop: 12, lineHeight: 18, paddingHorizontal: 12 }}
          >
            Deleting your account removes your Pepta profile, logs, scans, and
            uploaded photos. This cannot be undone.
          </AppText>
        </ScrollView>
      </SafeAreaView>

      <NameEditorSheet
        visible={nameEditorOpen}
        value={nameDraft}
        saving={savingName}
        error={nameError}
        onChange={(value) => {
          setNameDraft(value);
          if (nameError) setNameError(null);
        }}
        onClose={() => {
          if (!savingName) setNameEditorOpen(false);
        }}
        onSave={() => void saveName()}
      />
    </View>
  );
}

interface DetailRow {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}

function DetailHeader({ title, onBack }: { title: string; onBack(): void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 44,
      }}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onBack();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name="chevron-back"
          size={25}
          color={theme.colors.textSecondary}
          stroke={2.4}
        />
      </Pressable>
      <AppText variant="screenTitle" style={{ fontSize: 24 }}>
        {title}
      </AppText>
      <View style={{ width: 38 }} />
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: DetailRow[] }) {
  return (
    <View style={{ marginTop: 20 }}>
      <AppText
        variant="sectionHeader"
        color="textTertiary"
        style={{ paddingLeft: 6, marginBottom: 8, textTransform: "uppercase" }}
      >
        {title}
      </AppText>
      <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
        {rows.map((row, index) => (
          <DetailSettingRow
            key={`${title}-${row.label}`}
            row={row}
            last={index === rows.length - 1}
          />
        ))}
      </Card>
    </View>
  );
}

function DetailSettingRow({ row, last }: { row: DetailRow; last: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={!row.onPress}
      onPress={() => {
        if (!row.onPress) return;
        Haptics.selectionAsync().catch(() => undefined);
        row.onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
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
        <Icon name={row.icon} size={16} color={row.iconColor} />
      </View>
      <AppText
        variant="bodyStrong"
        style={{
          flex: 1,
          fontWeight: "700",
          color: row.danger ? theme.colors.danger : theme.colors.textPrimary,
        }}
      >
        {row.label}
      </AppText>
      {row.value ? (
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ maxWidth: 190, textAlign: "right", fontWeight: "700" }}
        >
          {row.value}
        </AppText>
      ) : null}
      {row.onPress ? (
        <Icon
          name="chevron-forward"
          size={16}
          color={theme.colors.textTertiary}
          style={{ marginLeft: 2 }}
        />
      ) : null}
    </Pressable>
  );
}

function NameEditorSheet({
  visible,
  value,
  saving,
  error,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  saving: boolean;
  error: string | null;
  onChange(value: string): void;
  onClose(): void;
  onSave(): void;
}) {
  const theme = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} height="46%" scrollable>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="cardTitle" style={{ fontSize: 18 }}>
            Edit name
          </AppText>
          <AppText
            variant="caption"
            color="textSecondary"
            style={{ marginTop: 3 }}
          >
            This appears across Pepta.
          </AppText>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close name editor"
          hitSlop={8}
          disabled={saving}
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

      <TextInput
        accessibilityLabel="Display name"
        value={value}
        onChangeText={onChange}
        editable={!saving}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={120}
        returnKeyType="done"
        onSubmitEditing={onSave}
        placeholder="Your name"
        placeholderTextColor={theme.colors.textTertiary}
        style={{
          minHeight: 54,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: theme.colors.textPrimary,
          paddingHorizontal: 14,
          fontSize: 17,
          fontWeight: "700",
        }}
      />
      {error ? (
        <AppText
          variant="caption"
          style={{ color: theme.colors.danger, marginTop: 8 }}
        >
          {error}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onSave();
        }}
        accessibilityRole="button"
        accessibilityLabel="Save name"
        disabled={saving}
        style={({ pressed }) => ({
          marginTop: 18,
          minHeight: 54,
          borderRadius: 18,
          backgroundColor: theme.colors.primary,
          alignItems: "center",
          justifyContent: "center",
          opacity: saving || pressed ? 0.72 : 1,
        })}
      >
        <AppText
          variant="bodyStrong"
          style={{ color: "#fff", fontWeight: "900" }}
        >
          {saving ? "Saving…" : "Save"}
        </AppText>
      </Pressable>
    </BottomSheet>
  );
}

function providerRows(
  providers: Array<{ provider: ProviderName; linkedAt: string }>,
): DetailRow[] {
  const rows: DetailRow[] = providers.map((provider) => ({
    icon: provider.provider === "apple" ? "logo-apple" : "logo-google",
    iconBg: provider.provider === "apple" ? "#F1EFE8" : "#E7F4FF",
    iconColor: provider.provider === "apple" ? "#111" : "#1E7FCC",
    label: provider.provider === "apple" ? "Apple" : "Google",
    value: `Linked ${formatShortDate(provider.linkedAt)}`,
  }));

  return rows.length
    ? rows
    : [
        {
          icon: "shield-check",
          iconBg: "#F1EFE8",
          iconColor: "#5F5E5A",
          label: "Sign-in",
          value: "No linked providers",
        },
      ];
}

function planLabel(status: string | undefined): string {
  switch (status) {
    case "trialing":
      return "Pepta Plus";
    case "active":
      return "Pepta Plus";
    case "active_canceled":
      return "Pepta Plus · ends soon";
    case "past_due":
      return "Payment past due";
    case "canceled":
      return "Canceled";
    case "refunded":
      return "Refunded";
    case "free":
    default:
      return "Free plan";
  }
}

function formatJoinedDate(iso: string): string {
  return `Joined ${formatDate(iso)}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "not scheduled";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
