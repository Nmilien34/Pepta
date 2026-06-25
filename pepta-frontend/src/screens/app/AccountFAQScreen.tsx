import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Card } from "../../components";
import { Icon } from "../../components/Icon";
import { useTheme } from "../../theme";

interface FaqItem {
  q: string;
  a: string;
}

interface FaqGroup {
  label: string;
  items: FaqItem[];
}

const FAQ: FaqGroup[] = [
  {
    label: "THE BASICS",
    items: [
      {
        q: "Is Pepta medical advice?",
        a: "No. Pepta is a tracking and coaching companion for your GLP-1 or peptide journey. It helps organize logs, trends, reminders, and nutrition estimates. Medication decisions, dose changes, symptoms, and side effects belong with your clinician.",
      },
      {
        q: "What should I log first?",
        a: "Start with your medication, your first dose, one meal, water, and weight. Those signals unlock the core Home, Track, and Progress views and make the companion notes more useful.",
      },
      {
        q: "Why does Pepta ask for onboarding details?",
        a: "Onboarding builds your profile, preferred units, starting weight, goal, medication context, and daily targets. The backend stores those as your profile and uses them to calculate protein, fiber, water, and progress targets.",
      },
    ],
  },
  {
    label: "MEAL SCANS",
    items: [
      {
        q: "How does meal scanning work?",
        a: "Pepta uploads the photo, asks OpenAI to estimate the meal, then saves the structured result as a meal scan. You can use the result to log a meal with protein, calories, carbs, fat, fiber, and a short coach note.",
      },
      {
        q: "What happens to meal photos?",
        a: "Meal scan photos are uploaded to S3 so the backend can analyze and reference them. When an account is deleted, Pepta attempts to remove known meal-scan and meal-log photo objects from S3 before deleting the database records.",
      },
      {
        q: "Are meal scan numbers exact?",
        a: "No photo estimate is exact. Treat meal scans as a fast logging helper, especially for protein and calorie direction. You can still log manually when you need more control.",
      },
    ],
  },
  {
    label: "TRACKING",
    items: [
      {
        q: "Where do side effects go?",
        a: "Side effects are saved as dated logs on the Track screen. They are part of your medication journey and can be shown alongside meals, water, doses, and measurements.",
      },
      {
        q: "How does dose tracking help?",
        a: "Dose logs let Pepta estimate where you are in your medication cycle, show next-dose context, and make Track and Home feel anchored to your real schedule. Pepta does not recommend dose changes.",
      },
      {
        q: "What are progress photos for?",
        a: "Progress photos are stored separately from weight and measurements. They can help you compare visual progress over time, and uploaded photo records are deleted when your account is deleted.",
      },
    ],
  },
  {
    label: "AI AND DATA",
    items: [
      {
        q: "What does OpenAI do in Pepta?",
        a: "OpenAI is used for AI-powered features such as meal scan analysis, meal voice parsing, food intelligence, and companion-style notes. Your API key stays on the backend; the mobile app calls Pepta's API.",
      },
      {
        q: "What is saved in MongoDB?",
        a: "MongoDB stores your account, profile, compounds, schedules, dose logs, meal logs, water, protein, fiber, activity, side effects, measurements, insights, meal scans, retention summaries, and progress photo records.",
      },
      {
        q: "What is saved in S3?",
        a: "S3 is used for uploaded image files, especially meal scan photos and progress photos. MongoDB stores the S3 keys so Pepta can connect each upload back to your account.",
      },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      {
        q: "Can I export my data?",
        a: "Yes. The Export report row shares a JSON report with your latest home, track, and progress data. It is meant as a portable summary while the richer PDF-style report evolves.",
      },
      {
        q: "How do widgets work?",
        a: "The Add widgets screen shows the Pepta widget plan and iOS setup steps. Native widgets will appear on iOS after the WidgetKit extension is included in the native build.",
      },
      {
        q: "What happens if I delete my account?",
        a: "Pepta permanently deletes your account, profile, logs, medication records, scans, progress records, insights, and known uploaded image objects. This cannot be undone.",
      },
    ],
  },
];

export function AccountFAQScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const [open, setOpen] = useState<string | null>("THE BASICS-0");

  const toggle = (key: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setOpen((current) => (current === key ? null : key));
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
          <DetailHeader title="FAQ" onBack={() => navigation.goBack()} />

          <AppText
            variant="body"
            color="textSecondary"
            style={{ marginTop: 14, lineHeight: 21, paddingHorizontal: 4 }}
          >
            Practical answers about how Pepta tracks your medication journey,
            stores uploads, uses AI, and handles account data.
          </AppText>

          {FAQ.map((group) => (
            <View key={group.label} style={{ marginTop: 20 }}>
              <AppText
                variant="sectionHeader"
                color="textTertiary"
                style={{
                  paddingLeft: 6,
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                {group.label}
              </AppText>
              <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
                {group.items.map((item, index) => {
                  const key = `${group.label}-${index}`;
                  const expanded = open === key;
                  return (
                    <View
                      key={key}
                      style={{
                        borderTopWidth: index === 0 ? 0 : 0.5,
                        borderTopColor: theme.colors.border,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={item.q}
                        accessibilityState={{ expanded }}
                        onPress={() => toggle(key)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingVertical: 14,
                          opacity: pressed ? 0.65 : 1,
                        })}
                      >
                        <AppText
                          variant="bodyStrong"
                          style={{ flex: 1, fontWeight: "800", lineHeight: 21 }}
                        >
                          {item.q}
                        </AppText>
                        <Icon
                          name={expanded ? "chevron-down" : "chevron-forward"}
                          size={17}
                          color={theme.colors.textTertiary}
                        />
                      </Pressable>
                      {expanded ? (
                        <AppText
                          variant="body"
                          color="textSecondary"
                          style={{ lineHeight: 21, paddingBottom: 14 }}
                        >
                          {item.a}
                        </AppText>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
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
