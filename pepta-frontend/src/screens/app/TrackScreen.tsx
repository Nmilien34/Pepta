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
import { AddCompoundSheet, AppText, BodyMap, Button, Card, Mascot, ProgressRing, Reveal, ScreenHeader, SectionErrorBanner, TrendLineChart } from '../../components';
import { WeekStrip } from '../../components/WeekStrip';
import { ScheduleSheet } from '../../components/ScheduleSheet';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { formatCountdown } from './homeView';
import { activeCycleOf, cyclePillFor, isLastDoseOfCycle, patternOf, shortDateOnly, todayCycleStatus, weekStrip } from './scheduleView';
import {
  compoundIconName,
  compoundStatusLabel,
  formatDoseAmount,
  formatDoseRelative,
  formatNextDoseAt,
  siteLabel,
  sideEffectSummary,
  sideEffectTypeLabel,
  sortDoses,
  sortSideEffects,
  suggestNextSite,
  usedSites,
} from './trackView';
import {
  LEVEL_SUPPRESSION_COPY,
  resolveLevelView,
  type LevelSuppressionReason,
} from './levelSuppression';

const RANGES = ['7d', '30d', '90d', '1y'];

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
  const doses = sortDoses(track?.doseLogs ?? []);
  const sideEffects = sortSideEffects(track?.sideEffectLogs ?? []);
  const used = usedSites(track?.doseLogs ?? []);
  const next = suggestNextSite(track?.doseLogs ?? []);
  const compoundName = (id: string) => compounds.find((c) => c.id === id)?.name ?? 'Dose';
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
                line="Log your first shot — I’ll track your next dose."
                actionLabel="Log first shot"
                onAction={() => openQuickLog('dose')}
              />
            )}
          </Reveal>

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

          {/* injection sites */}
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

          {/* medication level chart */}
          {ml || compounds.length > 0 ? (
            <Reveal delay={300} style={{ marginTop: 12 }}>
              <Card>
                <MedicationLevelCardContent
                  ml={ml}
                  compoundName={ml?.compoundName ?? compounds[0]?.name ?? 'Medication'}
                  suppressed={levelSuppressed}
                  onLogDose={() => openQuickLog('dose')}
                  onOpenSettings={() => navigation.navigate('DoseSettings')}
                />
              </Card>
            </Reveal>
          ) : null}

          {/* dose history */}
          <View onLayout={(e) => { doseHistoryY.current = e.nativeEvent.layout.y; }}>
          <Reveal delay={360} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="history" size={18} color={theme.colors.textSecondary} />
                <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                  Dose history
                </AppText>
              </View>
              {doses.length > 0 ? (
                doses.slice(0, 8).map((d, i) => (
                  <View
                    key={d.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: i < Math.min(doses.length, 8) - 1 ? 0.5 : 0, borderBottomColor: theme.colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                        {compoundName(d.compoundId)} · {formatDoseAmount(d)}
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        {formatDoseRelative(d.datetime, new Date())}
                        {d.injectionSite ? ` · ${siteLabel(d.injectionSite)}` : ''}
                        {d.sideEffects && d.sideEffects.length > 0
                          ? ` · ${d.sideEffects.map(sideEffectTypeLabel).join(', ')}`
                          : ''}
                      </AppText>
                    </View>
                    <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  </View>
                ))
              ) : (
                <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
                  No shots logged yet.
                </AppText>
              )}
            </Card>
          </Reveal>
          </View>

          {/* mix calculator — visible front door (row card in the dose-history idiom) */}
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

// Medication-level curve — rendered by react-native-chart-kit via the shared
// TrendLineChart brand config. `levels` is the REAL pharmacokinetic curve from
// the /home response (ml.curve), never placeholder data.
function LevelChart({ levels, color }: { levels: number[]; color: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <TrendLineChart values={levels} color={color} height={96} fillOpacity={0.1} showLastDot />
    </View>
  );
}

function MedicationLevelCardContent({
  ml,
  compoundName,
  suppressed,
  onLogDose,
  onOpenSettings,
}: {
  ml: NonNullable<ReturnType<typeof usePeptaData>['home']>['medicationLevels'][number] | null;
  compoundName: string;
  /** Oral route or no half-life: the curve is suppressed, not pending. */
  suppressed: LevelSuppressionReason | null;
  onLogDose: () => void;
  onOpenSettings: () => void;
}) {
  const theme = useTheme();
  const hasCurve = !!ml && ml.curve.length > 1;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="chart-line" size={18} color={theme.colors.primary} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }}>
            Medication level
          </AppText>
        </View>
        {ml ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onOpenSettings();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: theme.colors.surfaceAlt,
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: theme.radii.pill,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
              {Math.round((ml.currentEstimate / Math.max(ml.peakEstimate, 1)) * 100)}%
            </AppText>
            <Icon name="chevron-forward" size={13} color={theme.colors.primary} stroke={2.3} />
          </Pressable>
        ) : null}
      </View>

      {hasCurve ? (
        <>
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, padding: 3, marginTop: theme.spacing.md }}>
            {RANGES.map((r, i) => (
              <View key={r} style={[{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill }, i === 0 ? { backgroundColor: theme.colors.surface } : null]}>
                <AppText variant="caption" color={i === 0 ? 'textPrimary' : 'textSecondary'} style={{ fontWeight: '700' }}>
                  {r}
                </AppText>
              </View>
            ))}
          </View>
          <LevelChart levels={ml.curve.map((p) => p.level)} color={theme.colors.primary} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <AppText variant="caption" color="textSecondary">
              Current {ml.currentEstimate}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              Peak {ml.peakEstimate} · Trough {ml.troughEstimate}
            </AppText>
          </View>
        </>
      ) : (
        <View style={{ marginTop: theme.spacing.md, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.card, padding: 14, gap: 10 }}>
          <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
            {compoundName}
          </AppText>
          <AppText variant="body" color="textSecondary">
            {suppressed
              ? LEVEL_SUPPRESSION_COPY[suppressed]
              : 'Log your first shot to start building your medication level curve.'}
          </AppText>
          {suppressed ? null : (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onLogDose();
            }}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: theme.radii.pill,
              backgroundColor: 'rgba(126, 87, 194, 0.08)',
              borderWidth: 0.5,
              borderColor: 'rgba(126, 87, 194, 0.16)',
              opacity: pressed ? 0.72 : 1,
            })}
            accessibilityRole="button"
          >
            <Icon name="add" size={14} color={theme.colors.primary} />
            <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
              Log shot
            </AppText>
          </Pressable>
          )}
        </View>
      )}
    </>
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
