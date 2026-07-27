// Peptide library — the reference surface, reached from Track (and from Add
// medication). Live search, goal chips, community stacks, and entries grouped
// by category with an evidence pill on every one. Content is local
// (data/peptideLibrary), so the whole screen works offline and instantly.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Card, SearchField } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import {
  CATEGORY_META,
  EVIDENCE_META,
  type LibraryEntry,
  type LibraryGoal,
  type LibraryStack,
} from '../../data/peptideLibrary';
import {
  buildLibraryView,
  GOAL_FILTERS,
  stackEntries,
  trackedEntryIds,
} from './libraryView';

// Evidence pill colors — green approved, blue trials, amber preclinical,
// neutral community. The tier is the point of the whole screen.
const EVIDENCE_STYLE: Record<string, { bg: string; fg: string }> = {
  fda_approved: { bg: '#E8F8EE', fg: '#1E8E40' },
  human_trials: { bg: '#E7F4FF', fg: '#1273C4' },
  preclinical: { bg: '#FFF8EA', fg: '#8A6300' },
  community: { bg: '#F2F3F5', fg: '#6B6B76' },
};

export function LibraryScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { home } = usePeptaData();
  const [query, setQuery] = useState('');
  const [goal, setGoal] = useState<LibraryGoal | 'all'>('all');

  const view = useMemo(() => buildLibraryView({ query, goal }), [query, goal]);
  const tracked = useMemo(
    () => trackedEntryIds((home?.activeCompounds ?? []).map((compound) => compound.name)),
    [home?.activeCompounds],
  );

  const openEntry = (entryId: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    navigation.navigate('LibraryEntry', { entryId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); navigation.goBack(); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
            </Pressable>
            <AppText variant="screenTitle" style={{ fontSize: 24 }}>
              Library
            </AppText>
          </View>

          <View style={{ marginTop: 12 }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search peptides & stacks"
            />
          </View>

          {/* goal chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingVertical: 12, paddingRight: 8 }}
          >
            {GOAL_FILTERS.map((filter) => {
              const selected = filter.value === goal;
              return (
                <Pressable
                  key={filter.value}
                  onPress={() => { Haptics.selectionAsync().catch(() => undefined); setGoal(filter.value); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Filter: ${filter.label}`}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: theme.radii.pill,
                    backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                  }}
                >
                  <AppText
                    variant="caption"
                    style={{
                      fontWeight: '700',
                      color: selected ? theme.colors.onPrimary : theme.colors.textSecondary,
                    }}
                  >
                    {filter.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* stacks */}
          {view.stacks.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                  Stacks
                </AppText>
                <AppText variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
                  community protocols
                </AppText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 8, paddingRight: 8 }}
              >
                {view.stacks.map((stack) => (
                  <StackCard
                    key={stack.id}
                    stack={stack}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      navigation.navigate('LibraryEntry', { entryId: stack.entryIds[0]! });
                    }}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* entries by category */}
          {view.sections.map((section) => {
            const meta = CATEGORY_META[section.category];
            return (
              <View key={section.category} style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <Icon name={meta.icon} size={14} color={meta.fg} />
                  <AppText
                    variant="sectionHeader"
                    style={{ textTransform: 'uppercase', color: meta.fg }}
                  >
                    {section.label}
                  </AppText>
                </View>
                <Card style={{ paddingVertical: 4 }}>
                  {section.entries.map((entry, index) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      tracked={tracked.has(entry.id)}
                      last={index === section.entries.length - 1}
                      onPress={() => openEntry(entry.id)}
                    />
                  ))}
                </Card>
              </View>
            );
          })}

          {view.total === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
              <Icon name="search" size={26} color={theme.colors.textTertiary} />
              <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                No matches
              </AppText>
              <AppText variant="caption" color="textSecondary" align="center" style={{ maxWidth: 250 }}>
                Try a different name, or clear the filter to see the whole library.
              </AppText>
              {(query.length > 0 || goal !== 'all') ? (
                <Pressable
                  onPress={() => { Haptics.selectionAsync().catch(() => undefined); setQuery(''); setGoal('all'); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search and filters"
                  style={{ marginTop: 4 }}
                >
                  <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    Clear filters
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <AppText
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ fontSize: 10.5, lineHeight: 15, marginTop: 20, paddingHorizontal: 8 }}
          >
            Reference information only — not medical advice, and nothing here is a
            recommendation to use any compound. Talk to your prescriber.
          </AppText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function EvidencePill({ level, small }: { level: LibraryEntry['evidence']; small?: boolean }) {
  const style = EVIDENCE_STYLE[level] ?? EVIDENCE_STYLE.community!;
  return (
    <View
      style={{
        backgroundColor: style.bg,
        paddingVertical: small ? 2 : 4,
        paddingHorizontal: small ? 7 : 10,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <AppText
        variant="caption"
        style={{ fontWeight: '800', fontSize: small ? 9 : 10, letterSpacing: 0.3, color: style.fg }}
      >
        {EVIDENCE_META[level].label}
      </AppText>
    </View>
  );
}

function EntryRow({
  entry,
  tracked,
  last,
  onPress,
}: {
  entry: LibraryEntry;
  tracked: boolean;
  last: boolean;
  onPress(): void;
}) {
  const theme = useTheme();
  const meta = CATEGORY_META[entry.category];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name} — ${entry.epithet}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: meta.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={meta.icon} size={18} color={meta.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
            {entry.name}
          </AppText>
          {tracked ? (
            <View
              style={{
                backgroundColor: '#EFEBFF',
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: 999,
              }}
            >
              <AppText variant="caption" style={{ fontSize: 9, fontWeight: '800', color: theme.colors.primary }}>
                YOU TRACK THIS
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={2}>
          “{entry.epithet}” · {entry.summary}
        </AppText>
        <View style={{ marginTop: 5 }}>
          <EvidencePill level={entry.evidence} small />
        </View>
      </View>
      <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

function StackCard({ stack, onPress }: { stack: LibraryStack; onPress(): void }) {
  const theme = useTheme();
  const entries = stackEntries(stack);
  const meta = CATEGORY_META[entries[0]?.category ?? 'healing'];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stack.name} stack`}
      style={({ pressed }) => ({ width: 178, opacity: pressed ? 0.75 : 1 })}
    >
      <Card style={{ paddingVertical: 13, paddingHorizontal: 14 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: meta.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="list" size={16} color={meta.fg} />
        </View>
        <AppText variant="bodyStrong" style={{ fontWeight: '700', marginTop: 8 }}>
          {stack.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }} numberOfLines={1}>
          {stack.tagline}
        </AppText>
        <View
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            alignSelf: 'flex-start',
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 999,
            marginTop: 8,
          }}
        >
          <AppText variant="caption" color="textSecondary" style={{ fontSize: 9, fontWeight: '800' }}>
            COMMUNITY
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}
