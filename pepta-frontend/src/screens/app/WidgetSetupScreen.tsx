import React, { useEffect } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Card, ProgressBar } from "../../components";
import { Icon } from "../../components/Icon";
import { usePeptaData } from "../../context/PeptaDataContext";
import { useTheme } from "../../theme";

const WIDGET_STEPS = [
  "Long-press an empty area on the Home Screen.",
  "Tap the plus button in the top corner.",
  "Search for Pepta, then choose a widget size.",
  "Tap Add Widget and place it where you want it.",
] as const;

export function WidgetSetupScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { home, progress, refreshHome, refreshProgress } = usePeptaData();

  useEffect(() => {
    if (!home) void refreshHome();
    if (!progress) void refreshProgress();
  }, [home, progress, refreshHome, refreshProgress]);

  const proteinTarget = home?.profile?.dailyProteinTargetGrams ?? 0;
  const waterTarget = home?.profile?.dailyWaterTargetOz ?? 0;
  const proteinCurrent = home?.todayProteinGrams ?? 0;
  const waterCurrent = home?.todayWaterOz ?? 0;
  const proteinPct = proteinTarget
    ? Math.min(1, proteinCurrent / proteinTarget)
    : 0;
  const waterPct = waterTarget ? Math.min(1, waterCurrent / waterTarget) : 0;
  const weight = home?.latestWeight;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 30,
          }}
        >
          <DetailHeader title="Widgets" onBack={() => navigation.goBack()} />

          <LinearGradient
            colors={["#F3EFFF", "#FBF4FF"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              {
                marginTop: theme.spacing.lg,
                borderRadius: theme.sizes.card.borderRadius,
                padding: 18,
                borderWidth: 0.5,
                borderColor: "#E7DEFB",
              },
              theme.shadows.card,
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  backgroundColor: theme.colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name="layout-grid-add"
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontWeight: "900" }}>
                  Pepta widgets
                </AppText>
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={{ marginTop: 4, lineHeight: 18 }}
                >
                  Quick glance cards for protein, water, dose timing, and weight
                  progress.
                </AppText>
              </View>
            </View>
          </LinearGradient>

          <Card style={{ marginTop: 12 }}>
            <AppText variant="sectionHeader" color="textTertiary">
              WIDGET PREVIEW
            </AppText>
            <WidgetPreviewRow
              icon="food-drumstick"
              color={theme.colors.protein}
              label="Protein"
              value={
                proteinTarget
                  ? `${Math.round(proteinCurrent)} / ${proteinTarget}g`
                  : "Log meals to start"
              }
              pct={proteinPct}
            />
            <WidgetPreviewRow
              icon="water"
              color={theme.colors.water}
              label="Water"
              value={
                waterTarget
                  ? `${Math.round(waterCurrent)} / ${waterTarget} oz`
                  : "Add water to start"
              }
              pct={waterPct}
            />
            <WidgetPreviewRow
              icon="needle"
              color={theme.colors.primary}
              label="Next dose"
              value={
                home?.nextDose
                  ? formatWidgetDate(home.nextDose.nextDoseAt)
                  : "No upcoming dose"
              }
            />
            <WidgetPreviewRow
              icon="scale"
              color={theme.colors.weight}
              label="Weight"
              value={
                weight ? `${weight.value}${weight.unit}` : "No weight logged"
              }
              last
            />
          </Card>

          <Card style={{ marginTop: 12 }}>
            <AppText variant="sectionHeader" color="textTertiary">
              ADD ON IOS
            </AppText>
            {WIDGET_STEPS.map((step, index) => (
              <StepRow
                key={step}
                index={index + 1}
                text={step}
                last={index === WIDGET_STEPS.length - 1}
              />
            ))}
          </Card>

          <Card style={{ marginTop: 12, backgroundColor: "#FFF7EE" }} flat>
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Icon
                name="information-circle-outline"
                size={21}
                color={theme.colors.protein}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontWeight: "800" }}>
                  Native widget target required
                </AppText>
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={{ marginTop: 4, lineHeight: 18 }}
                >
                  iOS will list Pepta here after the WidgetKit extension is
                  included in the native build.
                </AppText>
              </View>
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
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

function WidgetPreviewRow({
  icon,
  color,
  label,
  value,
  pct,
  last,
}: {
  icon: string;
  color: string;
  label: string;
  value: string;
  pct?: number;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 11,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={18} color={color} />
        </View>
        <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: "800" }}>
          {label}
        </AppText>
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ fontWeight: "800" }}
        >
          {value}
        </AppText>
      </View>
      {typeof pct === "number" ? (
        <View style={{ marginTop: 9 }}>
          <ProgressBar pct={pct} color={color} height={6} />
        </View>
      ) : null}
    </View>
  );
}

function StepRow({
  index,
  text,
  last,
}: {
  index: number;
  text: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#EFEBFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText
          variant="caption"
          color="primary"
          style={{ fontWeight: "900" }}
        >
          {index}
        </AppText>
      </View>
      <AppText
        variant="bodyStrong"
        color="textSecondary"
        style={{ flex: 1, lineHeight: 20, fontWeight: "700" }}
      >
        {text}
      </AppText>
    </View>
  );
}

function formatWidgetDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
