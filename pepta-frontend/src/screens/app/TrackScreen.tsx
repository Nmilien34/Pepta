// Track tab — the medication hub. Reads compounds + medication level from /home
// and dose logs from /track (the injection map + dose history). Pull-to-refresh,
// staggered entrance, mascot empty states. Renders whatever loaded (partial).

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { AddCompoundSheet, AppText, BodyMap, Button, Card, Mascot, ProgressRing, Reveal, ScreenHeader, SectionErrorBanner } from '../../components';
import { usePeptaData } from '../../context/PeptaDataContext';
import { formatCountdown } from './homeView';
import {
  compoundIconName,
  compoundStatusLabel,
  formatDoseAmount,
  formatDoseRelative,
  formatNextDoseAt,
  siteLabel,
  sideEffectSummary,
  sortDoses,
  sortSideEffects,
  suggestNextSite,
  usedSites,
} from './trackView';

type TabsNav = NavigationProp<Record<'Home' | 'Track' | 'Progress' | 'Account', undefined>>;

const RANGES = ['7d', '30d', '90d', '1y'];

export function TrackScreen() {
  const theme = useTheme();
  const navigation = useNavigation<TabsNav>();
  const data = usePeptaData();
  const { home, track, homeLoading, trackLoading, homeError, trackError, trackRefreshing, refreshHome, refreshTrack } =
    data;
  const [addOpen, setAddOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const doseHistoryY = useRef(0);

  useEffect(() => {
    if (!home) void refreshHome();
    if (!track) void refreshTrack();
  }, [home, track, refreshHome, refreshTrack]);

  const refreshAll = () => Promise.all([refreshHome(), refreshTrack()]).then(() => undefined);

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

  const ml = home?.medicationLevels[0] ?? null;
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

          {/* next dose */}
          <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
            {ml ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                    Next dose
                  </AppText>
                  <AppText variant="statBig" style={{ marginTop: 8 }}>
                    {formatCountdown(nextDoseHours) ?? '—'}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                    {home?.nextDose?.nextDoseAt
                      ? `${nextDoseName ? `${nextDoseName} · ` : ''}${formatNextDoseAt(home.nextDose.nextDoseAt)}`
                      : nextDoseName || 'No dose scheduled'}
                  </AppText>
                </View>
                <ProgressRing size={74} pct={levelPct} color={theme.colors.primary}>
                  <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    {Math.round(levelPct * 100)}%
                  </AppText>
                </ProgressRing>
              </Card>
            ) : (
              <EmptyCard line="Tap + to log your first shot — I’ll track your next dose." />
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
          {ml && ml.curve.length > 1 ? (
            <Reveal delay={300} style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="chart-line" size={18} color={theme.colors.primary} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    Medication level
                  </AppText>
                </View>
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

      <AddCompoundSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}

function LevelChart({ levels, color }: { levels: number[]; color: string }) {
  const W = 300;
  const H = 78;
  const max = Math.max(...levels, 1);
  const path = levels
    .map((v, i) => {
      const x = (i / (levels.length - 1)) * W;
      const y = H - (v / max) * (H - 12) - 6;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = W;
  const lastY = H - (levels[levels.length - 1]! / max) * (H - 12) - 6;
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 78, marginTop: 12 }}>
      <Path d={`${path} L${W} ${H} L0 ${H} Z`} fill={color} opacity={0.1} />
      <Path d={path} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lastX} cy={lastY} r={4.5} fill={color} />
    </Svg>
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

function EmptyCard({ line }: { line: string }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], gap: theme.spacing.md }}>
      <Mascot pose="idle" size={80} />
      <AppText variant="bodyStrong" color="textSecondary" align="center">
        {line}
      </AppText>
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
