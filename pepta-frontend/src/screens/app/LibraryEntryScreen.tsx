// Library entry detail. The differentiator lives here: an evidence tier with
// a plain-language explanation, an honest evidence note, the community
// protocol block (explicitly labeled as practice, not advice), safety and
// regulatory status, and real sources. Actions: track this compound (prefills
// Add medication), open the mix calculator (reconstituted compounds), and
// open source links.

import { MASK_PROPS } from "../../components/MaskedHealthValue";
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../../components';
import { AddCompoundSheet } from '../../components/AddCompoundSheet';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import {
  CATEGORY_META,
  entryById,
  EVIDENCE_META,
  GOAL_META,
  type LibrarySource,
} from '../../data/peptideLibrary';
import { askPepPrompt, trackedEntryIds } from './libraryView';
import { EvidencePill } from './LibraryScreen';
import { usePepChat } from '../../context/PepChatContext';
import { useCompanionName } from '../../components/useCompanionName';

type LibraryEntryRoute = RouteProp<{ LibraryEntry: { entryId: string } }, 'LibraryEntry'>;

export function LibraryEntryScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<LibraryEntryRoute>();
  const { home } = usePeptaData();
  // A library entry can describe a reconstituted peptide, but an all-oral user
  // has nothing to mix — the CTA goes away rather than opening vial math.
  const hasInjectable =
    (home?.activeCompounds ?? []).length === 0 ||
    (home?.activeCompounds ?? []).some((c) => c.route !== 'oral');
  const { askPep } = usePepChat();
  const companionName = useCompanionName();
  const [addOpen, setAddOpen] = useState(false);

  const entry = entryById(route.params?.entryId ?? '');
  const tracked = useMemo(
    () =>
      entry
        ? trackedEntryIds((home?.activeCompounds ?? []).map((c) => c.name)).has(entry.id)
        : false,
    [entry, home?.activeCompounds],
  );

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <SafeAreaView edges={['top']} style={{ flex: 1, padding: 16 }}>
          <BackRow onPress={() => navigation.goBack()} title="Not found" />
          <AppText variant="body" color="textSecondary" style={{ marginTop: 16 }}>
            That library entry isn’t available.
          </AppText>
        </SafeAreaView>
      </View>
    );
  }

  const meta = CATEGORY_META[entry.category];
  const evidence = EVIDENCE_META[entry.evidence];
  const approved = entry.evidence === 'fda_approved';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView {...MASK_PROPS}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          <BackRow onPress={() => navigation.goBack()} title={entry.name} />

          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            “{entry.epithet}”
            {entry.aka?.length ? ` · also ${entry.aka.join(', ')}` : ''}
          </AppText>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <EvidencePill level={entry.evidence} />
            {tracked ? (
              <Chip label="YOU TRACK THIS" bg="#EFEBFF" fg={theme.colors.primary} />
            ) : null}
            {entry.goals.map((goal) => (
              <Chip key={goal} label={GOAL_META[goal].toUpperCase()} bg={meta.tint} fg={meta.fg} />
            ))}
          </View>

          {/* evidence tier, explained in plain language */}
          <Card style={{ marginTop: 12, backgroundColor: theme.colors.surfaceAlt }} flat>
            <AppText variant="caption" color="textSecondary" style={{ lineHeight: 18 }}>
              {evidence.blurb}
            </AppText>
          </Card>

          <Section title="What it is">
            <AppText variant="body" color="textSecondary" style={{ lineHeight: 21 }}>
              {entry.about}
            </AppText>
          </Section>

          <Section title="Where the evidence stands">
            <AppText variant="body" color="textSecondary" style={{ lineHeight: 21 }}>
              {entry.evidenceNote}
            </AppText>
          </Section>

          {entry.protocol ? (
            <Section
              // Approved drugs carry an authoritative label schedule — calling
              // that "community practice" would misrepresent it, and vice
              // versa. The framing follows the evidence tier.
              title={approved ? 'Label dosing' : 'Community protocol'}
              icon={approved ? 'document-text-outline' : 'users'}
              footnote={
                approved
                  ? 'From the FDA prescribing information. Your prescriber sets your actual dose.'
                  : 'What users commonly log — community practice, not medical advice or a recommendation.'
              }
            >
              {entry.protocol.dose ? (
                <FactRow
                  label={approved ? 'Label dose' : 'Typical dose logged'}
                  value={entry.protocol.dose}
                />
              ) : null}
              {entry.protocol.timing ? <FactRow label="Timing" value={entry.protocol.timing} /> : null}
              {entry.protocol.cycle ? <FactRow label="Cycle" value={entry.protocol.cycle} /> : null}
              {entry.protocol.route ? <FactRow label="Route" value={entry.protocol.route} last /> : null}
            </Section>
          ) : null}

          {entry.safety ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 9,
                backgroundColor: '#FFF8EA',
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 13,
                marginTop: 12,
                alignItems: 'flex-start',
              }}
            >
              <Icon name="warning" size={15} color={theme.colors.warning} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={{ color: '#8A6300', fontWeight: '800' }}>
                  Safety
                </AppText>
                <AppText variant="caption" style={{ color: '#8A6300', lineHeight: 17, marginTop: 2 }}>
                  {entry.safety}
                </AppText>
              </View>
            </View>
          ) : null}

          {entry.regulatory ? (
            <Section title="Status" icon="flag">
              <AppText variant="caption" color="textSecondary" style={{ lineHeight: 18 }}>
                {entry.regulatory}
              </AppText>
            </Section>
          ) : null}

          <Section title="Sources">
            {entry.sources.map((source, index) => (
              <SourceRow
                key={source.title}
                source={source}
                last={index === entry.sources.length - 1}
              />
            ))}
          </Section>

          <View style={{ marginTop: theme.spacing.lg, gap: 10, marginBottom: 26 }}>
            {/* Library (sourced facts) → Pep (conversation), seeded with this
                entry's own framing including its evidence tier. */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                askPep(askPepPrompt(entry));
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ask ${companionName} about ${entry.name}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 50,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Icon name="sparkles" size={17} color={theme.colors.primary} />
              <AppText variant="bodyStrong" color="primary" style={{ fontWeight: '700' }}>
                Ask {companionName} about {entry.name}
              </AppText>
            </Pressable>
            <Button
              label={tracked ? 'Already in your compounds' : 'Track this peptide'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setAddOpen(true);
              }}
              disabled={tracked}
              fullWidth
            />
            {entry.reconstituted && hasInjectable ? (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  navigation.navigate('MixCalculator');
                }}
                accessibilityRole="button"
                accessibilityLabel="Open the mix calculator"
                hitSlop={8}
                style={{ alignSelf: 'center', paddingVertical: 6 }}
              >
                <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                  Open the mix calculator
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <AddCompoundSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        initialQuery={entry.name}
      />
    </View>
  );
}

function BackRow({ onPress, title }: { onPress(): void; title: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
      </Pressable>
      <AppText variant="screenTitle" style={{ fontSize: 24, flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
    </View>
  );
}

function Section({
  title,
  icon,
  footnote,
  children,
}: {
  title: string;
  icon?: string;
  footnote?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon ? <Icon name={icon} size={14} color={theme.colors.textTertiary} /> : null}
        <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
          {title}
        </AppText>
      </View>
      <View style={{ marginTop: 8 }}>{children}</View>
      {footnote ? (
        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, lineHeight: 15, marginTop: 8 }}>
          {footnote}
        </AppText>
      ) : null}
    </Card>
  );
}

function FactRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 9,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
      }}
    >
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText
        variant="caption"
        style={{ fontWeight: '700', flex: 1.4, textAlign: 'right', color: theme.colors.textPrimary }}
      >
        {value}
      </AppText>
    </View>
  );
}

function SourceRow({ source, last }: { source: LibrarySource; last: boolean }) {
  const theme = useTheme();
  const openable = Boolean(source.url);
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ fontWeight: '700', fontSize: 13 }}>
          {source.title}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>
          {source.detail}
        </AppText>
      </View>
      {openable ? <Icon name="arrow-forward" size={15} color={theme.colors.textTertiary} /> : null}
    </View>
  );

  if (!openable) return body;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        Linking.openURL(source.url!).catch(() => undefined);
      }}
      accessibilityRole="link"
      accessibilityLabel={`Open source: ${source.title}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  );
}

function Chip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 }}>
      <AppText variant="caption" style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.3, color: fg }}>
        {label}
      </AppText>
    </View>
  );
}
