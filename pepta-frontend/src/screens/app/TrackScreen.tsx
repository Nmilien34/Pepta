// Track tab — the medication hub. Reads compounds + medication level from /home
// and dose logs from /track (the injection map + dose history). Pull-to-refresh,
// staggered entrance, mascot empty states. Renders whatever loaded (partial).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { AddCompoundSheet, AppText, BodyMap, Button, Card, Mascot, ProgressRing, Reveal, MedicationLevelCard, ScreenHeader, SectionErrorBanner, ShotDetailSheet } from '../../components';
import { WeekStrip } from '../../components/WeekStrip';
import { ScheduleSheet } from '../../components/ScheduleSheet';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { formatCountdown } from './homeView';
import { activeCycleOf, cyclePillFor, isLastDoseOfCycle, patternOf, shortDateOnly, todayCycleStatus, weekStrip } from './scheduleView';
import {
  compoundIconName,
  compoundStatusLabel,
  formatDoseRelative,
  formatNextDoseAt,
  siteLabel,
  sideEffectSummary,
  sortSideEffects,
  suggestNextSite,
  usedSites,
} from './trackView';
import {
  buildActivityFeed,
  entryTime,
  type ActivityDay,
  type ActivityKind,
} from './activityFeed';
import { buildShotWindow } from './shotDetail';
import { useLevelRange } from './useLevelRange';
import { doseNoun, globalDoseNoun, resolveLevelView } from './levelSuppression';

/**
 * Depth of the expanded "Your log". Comfortably past /track's own 30-day
 * lookback, so "See all" really does mean every log in the payload rather than
 * a second, quieter cap the user cannot see.
 */
const FEED_MAX_DAYS = 60;

export function TrackScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { openQuickLog } = useLogSheets();
  const data = usePeptaData();
  const { home, track, homeLoading, trackLoading, homeError, trackError, trackRefreshing, refreshHome, refreshTrack, schedules, cycles, refreshScheduling } =
    data;
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const doseHistoryY = useRef(0);
  const fetchedScheduling = useRef(false);
  const pendingCycleNav = useRef(false);
  const pendingLibraryNav = useRef(false);

  useEffect(() => {
    if (!home) void refreshHome();
    if (!track) void refreshTrack();
    if (!fetchedScheduling.current) {
      fetchedScheduling.current = true;
      void refreshScheduling();
    }
  }, [home, track, refreshHome, refreshTrack, refreshScheduling]);

  const refreshAll = () =>
    Promise.all([refreshHome(), refreshTrack(), refreshScheduling()]).then(() => undefined);

  // Cycle + strip derivations. `today` pins to the minute the data last moved
  // so the strip doesn't drift mid-session yet stays cheap to memoize.
  const cycle = useMemo(() => activeCycleOf(cycles), [cycles]);
  const pattern = useMemo(() => patternOf(cycle), [cycle]);
  const stripDays = useMemo(
    () => weekStrip(new Date(), schedules, track?.doseLogs ?? [], pattern),
    [schedules, track?.doseLogs, pattern],
  );
  const cyclePill = useMemo(() => cyclePillFor(pattern, new Date()), [pattern]);
  const cycleToday = useMemo(() => todayCycleStatus(pattern, new Date()), [pattern]);
  const resting = cycleToday?.phase === 'rest';
  // ABOVE EVERY EARLY RETURN — this screen has two. A hook placed after one
  // runs a different number of hooks once data lands, which is exactly what
  // blanked the app on entry in builds 20-22 (see HomeScreen.hooks.test.tsx).
  // Two windows, both built by buildActivityFeed — NOT one list sliced. The
  // collapsed view carries the dose guarantee (a weekly injector's last shot is
  // appended when three days of habit logs would have pushed it out), and
  // slicing the full list in the card would silently drop it.
  const activityDays = useMemo(() => buildActivityFeed({ track, home }), [track, home]);
  const allActivityDays = useMemo(
    () => buildActivityFeed({ track, home, maxDays: FEED_MAX_DAYS }),
    [track, home],
  );
  const [feedExpanded, setFeedExpanded] = useState(false);
  // ALSO above the early returns, for the same reason as the feed memos.
  const levelRange = useLevelRange();
  // Which shot's report is open, by dose id. Held here rather than in the card
  // so it survives the feed collapsing under it.
  const [openShotId, setOpenShotId] = useState<string | null>(null);
  const openShot = useMemo(
    () => (openShotId ? buildShotWindow({ doseId: openShotId, track, home }) : null),
    [openShotId, track, home],
  );

  if (!home && !track && (homeError || trackError)) {
    return (
      <Centered>
        <Mascot pose="idle" size={120} />
        <AppText variant="cardTitle" align="center" style={{ marginTop: theme.spacing.lg }}>
          Couldn’t load Track
        </AppText>
        <View style={{ marginTop: theme.spacing.xl, width: 200 }}>
          <Button label="Try again" onPress={refreshAll} loading={homeLoading || trackLoading} />
        </View>
      </Centered>
    );
  }

  if (!home && !track) {
    return (
      <Centered>
        <Mascot pose="idle" size={110} />
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
      </Centered>
    );
  }

  // Suppressed compounds (oral / no half-life) never supply a level: the
  // ring, the chart and the Current/Peak/Trough row all read this.
  const { level: ml, suppressed: levelSuppressed } = resolveLevelView(home);
  const compounds = home?.activeCompounds ?? [];
  const sideEffects = sortSideEffects(track?.sideEffectLogs ?? []);
  // Any injectable at all keeps the body map: a mixed user still rotates sites
  // for their injection, and hiding it would lose that. All-oral hides it.
  const hasInjectable = compounds.length === 0 || compounds.some((c) => c.route !== 'oral');
  const doseWord = globalDoseNoun(compounds);
  const used = usedSites(track?.doseLogs ?? []);
  const next = suggestNextSite(track?.doseLogs ?? []);
  const levelPct = ml && ml.peakEstimate > 0 ? Math.min(1, ml.currentEstimate / ml.peakEstimate) : 0;
  // Prefer the authoritative nextDose block; fall back to the level engine.
  const nextDoseHours = home?.nextDose?.hoursUntilNextDose ?? ml?.hoursUntilNextDose ?? null;
  const nextDoseName = home?.nextDose?.compoundName ?? ml?.compoundName ?? '';
  const sectionErrors = { ...(home?.sectionErrors ?? {}), ...(track?.sectionErrors ?? {}) };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={trackRefreshing} onRefresh={refreshAll} tintColor={theme.colors.primary} />}
        >
          <ScreenHeader title="Track" onAdjust={() => navigation.navigate('Account')} />

          <SectionErrorBanner errors={sectionErrors} style={{ marginTop: theme.spacing.md }} />

          {/* next dose — tap the card for the month sheet, the pill for cycle setup */}
          <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
            {ml ? (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => undefined); setScheduleOpen(true); }}
                accessibilityRole="button"
                accessibilityLabel="Open dose schedule"
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                          Next dose
                        </AppText>
                        {cyclePill ? (
                          <Pressable
                            onPress={() => { Haptics.selectionAsync().catch(() => undefined); navigation.navigate('CycleSetup'); }}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Edit cycle"
                            style={{
                              backgroundColor: cyclePill.phase === 'on' ? '#EFEBFF' : '#E8F8EE',
                              paddingVertical: 4,
                              paddingHorizontal: 10,
                              borderRadius: theme.radii.pill,
                            }}
                          >
                            <AppText
                              variant="caption"
                              style={{ fontWeight: '700', color: cyclePill.phase === 'on' ? theme.colors.primary : '#1E8E40' }}
                            >
                              {cyclePill.label}
                            </AppText>
                          </Pressable>
                        ) : null}
                      </View>
                      <AppText variant="statBig" style={{ marginTop: 8 }}>
                        {resting ? 'Resting' : formatCountdown(nextDoseHours) ?? '—'}
                      </AppText>
                      <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                        {resting
                          ? cycleToday?.nextPhaseStart
                            ? `Back on ${shortDateOnly(cycleToday.nextPhaseStart)} — reminders paused.`
                            : 'Cycle complete — nothing scheduled.'
                          : home?.nextDose?.nextDoseAt
                            ? `${nextDoseName ? `${nextDoseName} · ` : ''}${formatNextDoseAt(home.nextDose.nextDoseAt)}${
                                isLastDoseOfCycle(home.nextDose.nextDoseAt, schedules, pattern) ? ' · last of this cycle' : ''
                              }`
                            : nextDoseName || 'No dose scheduled'}
                      </AppText>
                    </View>
                    <ProgressRing size={74} pct={levelPct} color={theme.colors.primary}>
                      <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                        {Math.round(levelPct * 100)}%
                      </AppText>
                    </ProgressRing>
                  </View>
                  <WeekStrip days={stripDays} />
                </Card>
              </Pressable>
            ) : (
              <EmptyCard
                line={`Log your first ${doseWord} — I’ll track your next dose.`}
                actionLabel={`Log first ${doseWord}`}
                onAction={() => openQuickLog('dose')}
              />
            )}
          </Reveal>

          {/* Your log — slot 2, directly under the week strip. This used to be
              "Dose history" five cards down, showing doses only; someone who
              had just logged something scrolled past four cards to see it. */}
          <View onLayout={(e) => { doseHistoryY.current = e.nativeEvent.layout.y; }}>
            <Reveal delay={100} style={{ marginTop: 12 }}>
              <ActivityFeedCard
                days={feedExpanded ? allActivityDays : activityDays}
                canExpand={allActivityDays.length > activityDays.length}
                expanded={feedExpanded}
                onToggle={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setFeedExpanded((open) => !open);
                }}
                onOpenShot={setOpenShotId}
              />
            </Reveal>
          </View>

          {/* compounds */}
          <Reveal delay={140} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                  Compounds
                </AppText>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); setAddOpen(true); }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon name="add" size={13} color={theme.colors.primary} />
                  <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    Add
                  </AppText>
                </Pressable>
              </View>
              {compounds.length > 0 ? (
                compounds.map((c, i) => {
                  const peptide = c.drugClass === 'peptide';
                  const chipBg = peptide ? '#E1F5EE' : '#EFEBFF';
                  const chipFg = peptide ? '#0F6E56' : theme.colors.primary;
                  const active = c.status === 'active';
                  return (
                    <View
                      key={c.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i < compounds.length - 1 ? 0.5 : 0, borderBottomColor: theme.colors.border }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={compoundIconName(c)} size={18} color={chipFg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                          {c.name}
                        </AppText>
                        <AppText variant="caption" color="textSecondary">
                          {c.plannedDose ? `${c.plannedDose} ${c.doseUnit}` : c.doseUnit} · half-life {c.halfLifeDays}d
                        </AppText>
                      </View>
                      {active ? (
                        <View style={{ backgroundColor: '#E8F8EE', paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radii.pill }}>
                          <AppText variant="caption" style={{ color: '#1E8E40', fontWeight: '700' }}>
                            Active
                          </AppText>
                        </View>
                      ) : (
                        <AppText variant="caption" color="textTertiary" style={{ fontWeight: '600' }}>
                          {compoundStatusLabel(c.status)}
                        </AppText>
                      )}
                    </View>
                  );
                })
              ) : (
                <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
                  Add a medication to start tracking levels.
                </AppText>
              )}
            </Card>
          </Reveal>

          {/* medication level chart */}
          {ml || compounds.length > 0 ? (
            <Reveal delay={300} style={{ marginTop: 12 }}>
              <Card>
                <MedicationLevelCard
                  ml={ml}
                  range={levelRange}
                  compoundName={ml?.compoundName ?? compounds[0]?.name ?? 'Medication'}
                  doseTimes={(track?.doseLogs ?? [])
                    .filter((d) => d.deletedAt == null && (!ml || d.compoundId === ml.compoundId))
                    .map((d) => ({ datetime: d.datetime }))}
                  levelUnit={
                    compounds.find((c) => c.id === ml?.compoundId)?.doseUnit ??
                    compounds[0]?.doseUnit ??
                    'mg'
                  }
                  doseWord={doseNoun(
                    compounds.find((c) => c.id === ml?.compoundId)?.route ?? compounds[0]?.route,
                  )}
                  suppressed={levelSuppressed}
                  onLogDose={() => openQuickLog('dose')}
                  onOpenSettings={() => navigation.navigate('DoseSettings')}
                />
              </Card>
            </Reveal>
          ) : null}

          {/* Injection sites — hidden entirely for a user whose medications are
              all oral. Present unchanged the moment any compound is
              injectable, including a mixed user who still needs the map. */}
          {hasInjectable ? (
          <Reveal delay={220} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="current-location" size={18} color={theme.colors.primary} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    Injection sites
                  </AppText>
                </View>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); scrollRef.current?.scrollTo({ y: Math.max(0, doseHistoryY.current - 8), animated: true }); }} hitSlop={8}>
                  <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    History
                  </AppText>
                </Pressable>
              </View>
              <View style={{ marginTop: theme.spacing.md }}>
                <BodyMap used={used} next={next} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
                <Legend dotColor={theme.colors.primary} label="Used" />
                <Legend ring label={`Next: ${siteLabel(next)}`} />
              </View>
            </Card>
          </Reveal>
          ) : null}

          {/* Mix calculator — reconstitution is a vial-and-syringe task, so the
              front door is hidden entirely for an all-oral user. */}
          {hasInjectable ? (
          <Reveal delay={390} style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); navigation.navigate('MixCalculator'); }}
              accessibilityRole="button"
              accessibilityLabel="Open mix calculator"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card style={{ paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="flask" size={18} color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Mix calculator
                    </AppText>
                  </View>
                  <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </View>
              </Card>
            </Pressable>
          </Reveal>
          ) : null}

          {/* peptide library — visible front door (row card in the dose-history idiom) */}
          <Reveal delay={405} style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); navigation.navigate('Library'); }}
              accessibilityRole="button"
              accessibilityLabel="Open peptide library"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card style={{ paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="books" size={18} color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Peptide library
                    </AppText>
                  </View>
                  <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </View>
              </Card>
            </Pressable>
          </Reveal>

          {/* side effects */}
          <Reveal delay={420} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="alert-circle-outline" size={18} color={theme.colors.warning} />
                <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                  Side effects
                </AppText>
              </View>
              {sideEffects.length > 0 ? (
                sideEffects.slice(0, 6).map((s, i) => (
                  <View
                    key={s.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: i < Math.min(sideEffects.length, 6) - 1 ? 0.5 : 0, borderBottomColor: theme.colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                        {sideEffectSummary(s)}
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        {formatDoseRelative(s.datetime, new Date())}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </AppText>
                    </View>
                    <SeverityDots level={s.severity} />
                  </View>
                ))
              ) : (
                <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
                  None logged — feeling good. Log one from + if something comes up.
                </AppText>
              )}
            </Card>
          </Reveal>
        </ScrollView>
      </SafeAreaView>

      <ShotDetailSheet
        visible={openShotId !== null}
        shot={openShot}
        onClose={() => setOpenShotId(null)}
      />

      <AddCompoundSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onBrowseLibrary={() => {
          // Close first, navigate on dismiss — the sibling-Modal race.
          pendingLibraryNav.current = true;
          setAddOpen(false);
        }}
        onDismissed={() => {
          if (pendingLibraryNav.current) {
            pendingLibraryNav.current = false;
            navigation.navigate('Library');
          }
        }}
      />
      <ScheduleSheet
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onEditCycle={() => {
          // Close first, navigate from onDismissed — pushing a screen while
          // the Modal is mid-dismiss is the barcode-freeze race.
          pendingCycleNav.current = true;
          setScheduleOpen(false);
        }}
        onDismissed={() => {
          if (pendingCycleNav.current) {
            pendingCycleNav.current = false;
            navigation.navigate('CycleSetup');
          }
        }}
      />
    </View>
  );
}

// Medication-level curve. The data was always real — ml.curve is the
// pharmacokinetic series from /home — but until 2026-08-13 it was rendered as a
// bare shape: chart-kit with every axis, label and gridline disabled, fed
// curve.map(p => p.level) so each point's timestamp was discarded, no zero
// baseline, bezier smoothing over a step function, and the emphasised dot on
// the LAST sample — six days into the future — beside a caption reading
// "Current". MedicationLevelChart draws the same data with its time intact.
// "Your log" — every kind of log the user recorded, grouped by day. Replaces
// the doses-only "Dose history" that sat five cards down; see activityFeed.ts.
const ACTIVITY_ICON: Record<ActivityKind, { name: string; bg: string; fg: string }> = {
  dose: { name: 'needle', bg: '#EFEBFF', fg: '#6751E8' },
  weight: { name: 'scale', bg: '#F2F3F5', fg: '#52525B' },
  protein: { name: 'food-drumstick', bg: '#FFEDE0', fg: '#D2691E' },
  water: { name: 'water', bg: '#E3F2FF', fg: '#2A8FD8' },
  meal: { name: 'nutrition', bg: '#E8F8EE', fg: '#1E8E40' },
  sideEffect: { name: 'alert-circle-outline', bg: '#FFF4E5', fg: '#B87514' },
  activity: { name: 'pulse', bg: '#FFE9EC', fg: '#C2415A' },
  measurement: { name: 'chart-line', bg: '#F2F3F5', fg: '#52525B' },
};

function ActivityFeedCard({
  days,
  canExpand,
  expanded,
  onToggle,
  onOpenShot,
}: {
  days: ActivityDay[];
  canExpand: boolean;
  expanded: boolean;
  onToggle(): void;
  onOpenShot(doseId: string): void;
}) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Icon name="history" size={18} color={theme.colors.textSecondary} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }} numberOfLines={1}>
            Your log
          </AppText>
        </View>
        {/* Expands in place rather than pushing to a screen: everything it
            would show is already in this payload, and the card is two taps
            from the top of Track. Hidden when there is nothing more to see, so
            it never promises a longer history than the user has. */}
        {canExpand ? (
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexShrink: 0 })}
          >
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              {expanded ? 'Show less' : 'See all'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {days.length === 0 ? (
        <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
          Nothing logged yet.
        </AppText>
      ) : (
        days.map((day) => (
          <View key={day.date}>
            <AppText
              variant="sectionHeader"
              color="textTertiary"
              style={{ textTransform: 'uppercase', marginTop: theme.spacing.md }}
            >
              {day.label}
            </AppText>
            {day.entries.map((entry, index) => {
              const icon = ACTIVITY_ICON[entry.kind];
              // ONLY DOSES OPEN. Every other row is a single number with
              // nothing behind it; a chevron on all of them would promise
              // detail that does not exist.
              const opens = entry.kind === 'dose';
              const doseId = opens ? entry.id.replace(/^dose-/, '') : null;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    if (!doseId) return;
                    Haptics.selectionAsync().catch(() => undefined);
                    onOpenShot(doseId);
                  }}
                  disabled={!opens}
                  accessibilityRole={opens ? 'button' : undefined}
                  accessibilityLabel={opens ? `${entry.title} — see how this shot went` : undefined}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 11,
                    borderBottomWidth: index < day.entries.length - 1 ? 0.5 : 0,
                    borderBottomColor: theme.colors.border,
                    opacity: pressed && opens ? 0.6 : 1,
                  })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: icon.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={icon.name} size={16} color={icon.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                      {entry.title}
                    </AppText>
                    {entry.detail ? (
                      <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                        {entry.detail}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" color="textTertiary" style={{ fontWeight: '600' }}>
                    {entryTime(entry.datetime)}
                  </AppText>
                  {opens ? (
                    <Icon name="chevron-forward" size={14} color={theme.colors.textTertiary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </Card>
  );
}

function SeverityDots({ level }: { level: number }) {
  const theme = useTheme();
  // 1-2 mild (success), 3 moderate (warning), 4-5 strong (danger).
  const tint = level >= 4 ? theme.colors.danger : level === 3 ? theme.colors.warning : theme.colors.success;
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: n <= level ? tint : theme.colors.surfaceAlt }}
        />
      ))}
    </View>
  );
}

function Legend({ dotColor, ring, label }: { dotColor?: string; ring?: boolean; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 10,
          backgroundColor: dotColor ?? '#FFFFFF',
          borderWidth: ring ? 2 : 0,
          borderColor: theme.colors.primary,
        }}
      />
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

function EmptyCard({ line, actionLabel, onAction }: { line: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], gap: theme.spacing.md }}>
      <Mascot pose="idle" size={80} />
      <AppText variant="bodyStrong" color="textSecondary" align="center">
        {line}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onAction();
          }}
          style={({ pressed }) => ({
            marginTop: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 9,
            paddingHorizontal: 13,
            borderRadius: theme.radii.pill,
            backgroundColor: 'rgba(126, 87, 194, 0.08)',
            borderWidth: 0.5,
            borderColor: 'rgba(126, 87, 194, 0.16)',
            opacity: pressed ? 0.72 : 1,
          })}
          accessibilityRole="button"
        >
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="add" size={13} color={theme.colors.onPrimary} />
          </View>
          <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing['2xl'] }}>
        {children}
      </SafeAreaView>
    </View>
  );
}
