// Sources & citations — the research behind Pepta's health information, with
// tappable links to each primary source (FDA labels and peer-reviewed trials).
// Required by App Store guideline 1.4.1: apps with medical information must
// cite their sources in a place users can easily find.

import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Card } from "../../components";
import { Icon } from "../../components/Icon";
import { useTheme } from "../../theme";

interface Source {
  label: string;
  url: string;
}

interface SourceSection {
  claim: string;
  body: string;
  sources: Source[];
}

const SECTIONS: SourceSection[] = [
  {
    claim: "Medication level estimate",
    body: "Pepta's medication-level card estimates how much of your dose is still active using each medication's published elimination half-life (about 7 days for semaglutide, about 5 days for tirzepatide). It is a model based on the prescribing information, not a blood measurement.",
    sources: [
      {
        label: "Ozempic (semaglutide) FDA prescribing information",
        url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2023/209637s020s021lbl.pdf",
      },
      {
        label: "Wegovy (semaglutide) prescribing information",
        url: "https://www.novo-pi.com/wegovy.pdf",
      },
      {
        label: "Mounjaro (tirzepatide) FDA prescribing information",
        url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/215866s000lbl.pdf",
      },
      {
        label: "Zepbound (tirzepatide) FDA prescribing information",
        url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/217806s003lbl.pdf",
      },
    ],
  },
  {
    claim: "Muscle loss on GLP-1 medications",
    body: "Clinical trials estimate that roughly 25% to 39% of the weight lost on GLP-1 medications can come from lean mass, not fat. Pepta's muscle-protection check is built on this research.",
    sources: [
      {
        label: "STEP-1 trial (New England Journal of Medicine)",
        url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2032183",
      },
      {
        label: "STEP-1 body-composition analysis (Endocrine Society)",
        url: "https://academic.oup.com/jes/article/5/Supplement_1/A16/6240360",
      },
      {
        label: "SURMOUNT-1 body composition (Diabetes, Obesity & Metabolism, 2025)",
        url: "https://dom-pubs.onlinelibrary.wiley.com/doi/10.1111/dom.16275",
      },
      {
        label: "Lean-mass changes on GLP-1s, review (Neeland, 2024)",
        url: "https://dom-pubs.onlinelibrary.wiley.com/doi/10.1111/dom.15728",
      },
    ],
  },
  {
    claim: "Protein and fiber targets",
    body: "Guidance for people on GLP-1 medications suggests roughly 1.2 to 1.6 grams of protein per kilogram of body weight per day, paired with resistance training, to help preserve muscle during weight loss. Pepta's protein target follows this range; fiber targets follow general dietary guidelines.",
    sources: [
      {
        label: "Protein guidance on GLP-1s (multi-society summary)",
        url: "https://www.clinicalnutritioncenter.com/research-updates/protein-glp1-muscle-preservation-denver",
      },
      {
        label: "Dietary Guidelines for Americans (fiber)",
        url: "https://www.dietaryguidelines.gov/",
      },
    ],
  },
  {
    claim: "BMI ranges",
    body: "The BMI card classifies your body mass index using the standard adult categories published by the CDC.",
    sources: [
      {
        label: "CDC — About Adult BMI",
        url: "https://www.cdc.gov/bmi/adult-calculator/index.html",
      },
    ],
  },
];

export function SourcesScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const openSource = (url: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(url).catch(() => undefined);
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
          <DetailHeader title="Sources" onBack={() => navigation.goBack()} />

          <AppText
            variant="body"
            color="textSecondary"
            style={{ marginTop: 14, lineHeight: 21, paddingHorizontal: 4 }}
          >
            The research behind Pepta's health information. Pepta is a tracker,
            not medical advice — for decisions about your medication, talk to
            your prescriber.
          </AppText>

          {SECTIONS.map((section) => (
            <View key={section.claim} style={{ marginTop: 20 }}>
              <AppText
                variant="sectionHeader"
                color="textTertiary"
                style={{
                  paddingLeft: 6,
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                {section.claim}
              </AppText>
              <Card style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
                <AppText
                  variant="body"
                  color="textSecondary"
                  style={{ lineHeight: 21 }}
                >
                  {section.body}
                </AppText>
                <View style={{ marginTop: 6 }}>
                  {section.sources.map((source, index) => (
                    <Pressable
                      key={source.url}
                      accessibilityRole="link"
                      accessibilityLabel={source.label}
                      onPress={() => openSource(source.url)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 11,
                        borderTopWidth: index === 0 ? 0 : 0.5,
                        borderTopColor: theme.colors.border,
                        opacity: pressed ? 0.65 : 1,
                      })}
                    >
                      <Icon
                        name="document-text-outline"
                        size={16}
                        color={theme.colors.primary}
                      />
                      <AppText
                        variant="bodyStrong"
                        color="primary"
                        style={{ flex: 1, fontWeight: "700", lineHeight: 20 }}
                      >
                        {source.label}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
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
