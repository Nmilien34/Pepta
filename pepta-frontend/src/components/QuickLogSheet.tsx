// QuickLogSheet — the center-FAB destination. An animated bottom sheet that
// slides up over a fading backdrop, offering a 6-card chooser then a compact
// entry form per log type. Every save posts to the real route and refreshes the
// affected screens. No fakery — drafts → typed inputs via quickLog builders.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { Icon } from "./Icon";
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './onboarding/Chip';
import { ProgressBar } from './ProgressBar';
import { RulerPicker } from './RulerPicker';
import { SegmentedToggle } from './onboarding/SegmentedToggle';
import { cmToInches, inchesToCm, kgToLb, lbToKg } from '../utils/units';
import { usePeptaData } from '../context/PeptaDataContext';
import { api } from '../services/api';
import { sideEffectTypeLabel, siteLabel, usedSites, type InjectionSite } from '../screens/app/trackView';
import { BodyMap } from './BodyMap';
import { AddCompoundSheet } from './AddCompoundSheet';
import { measurementLabel } from '../screens/app/progressView';
import {
  defaultDoseDraft,
  isActivityValid,
  isDoseValid,
  toActivityInput,
  toDoseInput,
  toMeasurementInput,
  toSideEffectInput,
  toWeightInput,
  type DoseDraft,
  type MeasurementType,
  type SideEffectType,
  type WeightUnit,
} from '../screens/app/quickLog';

const OFFSCREEN = 600;
const SIDE_EFFECTS: SideEffectType[] = ['nausea', 'constipation', 'fatigue', 'headache', 'reflux', 'hair_loss', 'bloating', 'sulfur_burps'];
const MEASUREMENTS: MeasurementType[] = ['waist', 'hips', 'chest', 'arm', 'thigh', 'neck'];
const WATER_OZ = [8, 12, 16, 20];
const PROTEIN_G = [10, 20, 30, 40];

export type QuickLogMode = 'chooser' | 'dose' | 'weight' | 'protein' | 'water' | 'sideEffect' | 'measurement' | 'activity';
type Mode = QuickLogMode;

export interface QuickLogSheetProps {
  visible: boolean;
  onClose(): void;
  onMeal(): void;
  onDismissed?: () => void;
  // Open straight to a specific entry form (used by the getting-started checklist).
  initialMode?: QuickLogMode;
}

export function QuickLogSheet({ visible, onClose, onMeal, onDismissed, initialMode }: QuickLogSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { home, homeLoading, track, refreshHome, refreshTrack, refreshProgress, bumpProtein, bumpWater, addDoseLog, addWeightLog, addMeasurement, addSideEffectLog } = usePeptaData();
  const [render, setRender] = useState(visible);
  const [mode, setMode] = useState<Mode>('chooser');

  // form state
  const [dose, setDose] = useState<DoseDraft | null>(null);
  const [weight, setWeight] = useState(180);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [protein, setProtein] = useState(30);
  const [water, setWater] = useState(8);
  const [seTypes, setSeTypes] = useState<SideEffectType[]>([]);
  const [severity, setSeverity] = useState(2);
  const [measureType, setMeasureType] = useState<MeasurementType>('waist');
  const [measureValue, setMeasureValue] = useState(34);
  const [measureUnit, setMeasureUnit] = useState('in');
  const [seNote, setSeNote] = useState('');
  const [measureNote, setMeasureNote] = useState('');
  const [activity, setActivity] = useState({ steps: '', workoutMinutes: '', resistance: false });
  const [doseOffsetH, setDoseOffsetH] = useState(0); // hours before now for the shot time
  const [addMedicationOpen, setAddMedicationOpen] = useState(false);

  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(OFFSCREEN)).current;
  const sheetMaxHeight = Math.round(window.height * 0.88) + insets.bottom;

  useEffect(() => {
    if (visible) {
      setRender(true);
      setMode(initialMode ?? 'chooser');
      if (initialMode === 'dose') setDose(defaultDoseDraft(home, track));
      setSeTypes([]);
      setSeNote('');
      setMeasureNote('');
      setActivity({ steps: '', workoutMinutes: '', resistance: false });
      setDoseOffsetH(0);
      setAddMedicationOpen(false);
      const wu = home?.profile?.weightUnit ?? 'lb';
      setWeightUnit(wu);
      setWeight(home?.latestWeight?.value ?? (wu === 'kg' ? 80 : 180));
      const mu = home?.profile?.heightUnit === 'cm' ? 'cm' : 'in';
      setMeasureUnit(mu);
      setMeasureValue(mu === 'cm' ? 86 : 34);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }),
      ]).start();
    } else if (render) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: OFFSCREEN, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setRender(false);
        onDismissed?.();
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || mode !== 'dose' || dose) return;
    const nextDose = defaultDoseDraft(home, track);
    if (nextDose) {
      setDose(nextDose);
      return;
    }
    void refreshHome();
  }, [visible, mode, dose, home, track, refreshHome]);

  const close = () => onClose();

  // Optimistic commit: apply the local update + close instantly, then POST in the
  // background and reconcile (refresh) on settle. A failed POST re-fetches server
  // truth, which drops the temp row.
  const commit = (apply: () => void, serverCall: () => Promise<unknown>, refresh: () => Promise<void>) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    apply();
    close();
    serverCall()
      .then(() => refresh())
      .catch(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        return refresh();
      })
      .catch(() => undefined);
  };

  const now = () => new Date().toISOString();
  const refreshHomeTrack = () => Promise.all([refreshHome(), refreshTrack()]).then(() => undefined);
  const refreshHomeProgress = () => Promise.all([refreshHome(), refreshProgress()]).then(() => undefined);

  const onSave = () => {
    const ts = now();
    if (mode === 'dose' && isDoseValid(dose)) {
      const doseTs = new Date(Date.now() - doseOffsetH * 3_600_000).toISOString();
      const input = toDoseInput(dose, doseTs);
      commit(() => addDoseLog(input), () => api.createDoseLog(input), refreshHomeTrack);
    } else if (mode === 'weight') {
      const input = toWeightInput(weight, weightUnit, ts);
      commit(() => addWeightLog(input), () => api.createWeightLog(input), refreshHomeProgress);
    } else if (mode === 'protein') {
      // bumpProtein is already optimistic + persists its own POST.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      bumpProtein(protein);
      close();
    } else if (mode === 'water') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      bumpWater(water);
      close();
    } else if (mode === 'sideEffect') {
      const input = toSideEffectInput(seTypes, severity, ts, seNote.trim() || undefined);
      commit(() => addSideEffectLog(input), () => api.createSideEffectLog(input), refreshTrack);
    } else if (mode === 'measurement') {
      const input = toMeasurementInput(measureType, measureValue, measureUnit, ts, measureNote.trim() || undefined);
      commit(() => addMeasurement(input), () => api.createMeasurement(input), refreshProgress);
    } else if (mode === 'activity') {
      const draft = { steps: Number(activity.steps) || 0, workoutMinutes: Number(activity.workoutMinutes) || 0, resistanceTraining: activity.resistance };
      if (!isActivityValid(draft)) return;
      const input = toActivityInput(draft, ts);
      // Activity has no read surface yet, so there's nothing to optimistically
      // update — just POST and reconcile Home (where step targets live).
      commit(() => undefined, () => api.createActivityLog(input), refreshHome);
    }
  };

  // One-tap shot from the chooser: log the default dose without opening the form.
  const quickShot = defaultDoseDraft(home, track);
  const logQuickShot = () => {
    if (!isDoseValid(quickShot)) return;
    const input = toDoseInput(quickShot, now());
    commit(() => addDoseLog(input), () => api.createDoseLog(input), refreshHomeTrack);
  };

  const openMode = (next: Mode) => {
    Haptics.selectionAsync().catch(() => undefined);
    if (next === 'dose') setDose(defaultDoseDraft(home, track));
    setMode(next);
  };

  const back = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setMode('chooser');
  };

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.45)', opacity: backdrop }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', left: 0, right: 0, bottom: -insets.bottom }}
      >
        <Animated.View
          style={{
            transform: [{ translateY: slide }],
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: sheetMaxHeight,
          }}
        >
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '100%' }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 }}>
            <View style={{ width: 38, height: 5, borderRadius: 999, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 }} />

            {/* header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {mode !== 'chooser' ? (
                <Pressable onPress={back} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="chevron-back" size={18} color={theme.colors.textPrimary} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <AppText variant="cardTitle" style={{ fontSize: 17 }}>
                  {HEADINGS[mode].title}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {HEADINGS[mode].sub}
                </AppText>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>
              {mode === 'chooser' ? (
                <Chooser theme={theme} dose={defaultDoseDraft(home, track)} latestWeight={home?.latestWeight ?? null} onPick={openMode} onMeal={onMeal} />
              ) : null}

              {mode === 'dose' ? (
                <DoseForm
                  theme={theme}
                  dose={dose}
                  setDose={setDose}
                  compounds={home?.activeCompounds ?? []}
                  loading={homeLoading}
                  used={usedSites(track?.doseLogs ?? [])}
                  offsetH={doseOffsetH}
                  setOffsetH={setDoseOffsetH}
                  onAddMedication={() => setAddMedicationOpen(true)}
                />
              ) : null}

              {mode === 'weight' ? (
                <WeightForm
                  theme={theme}
                  value={weight}
                  onChange={setWeight}
                  unit={weightUnit}
                  onUnit={(next) => {
                    if (next === weightUnit) return;
                    Haptics.selectionAsync().catch(() => undefined);
                    setWeight((w) => Math.round((next === 'kg' ? lbToKg(w) : kgToLb(w)) * 10) / 10);
                    setWeightUnit(next);
                  }}
                />
              ) : null}

              {mode === 'protein' ? (
                <QuickAmount options={PROTEIN_G} value={protein} onChange={setProtein} unit="g" color={theme.colors.protein} />
              ) : null}

              {mode === 'water' ? (
                <QuickAmount options={WATER_OZ} value={water} onChange={setWater} unit="oz" color={theme.colors.water} />
              ) : null}

              {mode === 'sideEffect' ? (
                <SideEffectForm
                  theme={theme}
                  selected={seTypes}
                  onToggle={(t) => setSeTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                  severity={severity}
                  onSeverity={setSeverity}
                  note={seNote}
                  onNote={setSeNote}
                />
              ) : null}

              {mode === 'measurement' ? (
                <MeasurementForm
                  theme={theme}
                  type={measureType}
                  onType={setMeasureType}
                  value={measureValue}
                  onStep={(delta) => setMeasureValue((v) => Math.max(0, Math.round((v + delta) * 10) / 10))}
                  unit={measureUnit}
                  onUnit={(next) => {
                    if (next === measureUnit) return;
                    Haptics.selectionAsync().catch(() => undefined);
                    setMeasureValue((v) => Math.round((next === 'cm' ? inchesToCm(v) : cmToInches(v)) * 10) / 10);
                    setMeasureUnit(next);
                  }}
                  note={measureNote}
                  onNote={setMeasureNote}
                />
              ) : null}

              {mode === 'activity' ? (
                <ActivityForm theme={theme} activity={activity} setActivity={setActivity} />
              ) : null}
            </ScrollView>

            {/* footer CTA */}
            {mode === 'chooser' && isDoseValid(quickShot) ? (
              <View style={{ marginTop: 14 }}>
                <Button label="Log a shot · 1 tap" leading={<Icon name="needle" size={17} color={theme.colors.onPrimary} />} onPress={logQuickShot} />
              </View>
            ) : null}
            {mode !== 'chooser' ? (
              <View style={{ marginTop: 14 }}>
                {mode === 'weight' ? (
                  <SheetSaveButton label={CTA[mode]} disabled={!canSave(mode, { dose, weight, seTypes, measureValue, activity })} onPress={onSave} />
                ) : (
                  <Button label={CTA[mode]} disabled={!canSave(mode, { dose, weight, seTypes, measureValue, activity })} onPress={onSave} />
                )}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
      <AddCompoundSheet
        visible={addMedicationOpen}
        onClose={() => {
          setAddMedicationOpen(false);
          void refreshHome();
        }}
      />
    </Modal>
  );
}

type Theme = ReturnType<typeof useTheme>;

const HEADINGS: Record<Mode, { title: string; sub: string }> = {
  chooser: { title: 'Log something', sub: 'Smart defaults — most logs are one tap.' },
  dose: { title: 'Log a shot', sub: 'Confirm the details and save.' },
  weight: { title: 'Log weight', sub: "Today's weigh-in." },
  protein: { title: 'Log protein', sub: 'Add to today’s total.' },
  water: { title: 'Log water', sub: 'Add to today’s total.' },
  sideEffect: { title: 'How are you feeling?', sub: 'What you’re feeling, and how strong.' },
  measurement: { title: 'Log measurement', sub: 'Track inches alongside the scale.' },
  activity: { title: 'Log activity', sub: 'Steps, a workout, or resistance training.' },
};

const CTA: Record<Mode, string> = {
  chooser: '',
  dose: 'Log shot',
  weight: 'Save weight',
  protein: 'Add protein',
  water: 'Add water',
  sideEffect: 'Save',
  measurement: 'Save measurement',
  activity: 'Save activity',
};

interface ActivityState {
  steps: string;
  workoutMinutes: string;
  resistance: boolean;
}

function canSave(
  mode: Mode,
  s: { dose: DoseDraft | null; weight: number; seTypes: SideEffectType[]; measureValue: number; activity: ActivityState },
): boolean {
  if (mode === 'dose') return isDoseValid(s.dose);
  if (mode === 'weight') return s.weight > 0;
  if (mode === 'sideEffect') return s.seTypes.length > 0;
  if (mode === 'measurement') return s.measureValue > 0;
  if (mode === 'activity') return Number(s.activity.steps) > 0 || Number(s.activity.workoutMinutes) > 0 || s.activity.resistance;
  return true; // protein/water always have a selected amount
}

function Chooser({ theme, dose, latestWeight, onPick, onMeal }: { theme: Theme; dose: DoseDraft | null; latestWeight: { value: number; unit: string } | null; onPick: (m: Mode) => void; onMeal: () => void }) {
  const cards: { key: string; icon: React.ReactNode; label: string; hint: string; action: () => void }[] = [
    { key: 'dose', icon: <Icon name="needle" size={22} color={theme.colors.primary} />, label: 'Log a shot', hint: dose ? `${dose.compoundName} · ${dose.amount} ${dose.unit}` : 'Add a medication', action: () => onPick('dose') },
    { key: 'weight', icon: <Icon name="scale" size={22} color={theme.colors.weight} />, label: 'Log weight', hint: latestWeight ? `${latestWeight.value} ${latestWeight.unit} ±` : 'Today’s weigh-in', action: () => onPick('weight') },
    { key: 'meal', icon: <Icon name="nutrition" size={22} color={theme.colors.protein} />, label: 'Log meal', hint: 'Scan · Search · Voice', action: onMeal },
    { key: 'water', icon: <Icon name="water" size={22} color={theme.colors.water} />, label: 'Water', hint: '+8 oz', action: () => onPick('water') },
    { key: 'activity', icon: <Icon name="dumbbell" size={22} color={theme.colors.fiber} />, label: 'Activity', hint: 'Steps · workout', action: () => onPick('activity') },
    { key: 'sideEffect', icon: <Icon name="sad-outline" size={22} color={theme.colors.warning} />, label: 'Side effects', hint: 'How you feel', action: () => onPick('sideEffect') },
    { key: 'protein', icon: <Icon name="food-drumstick" size={22} color={theme.colors.protein} />, label: 'Protein', hint: 'Add grams', action: () => onPick('protein') },
    { key: 'measurement', icon: <Icon name="resize" size={22} color={theme.colors.weight} />, label: 'Measurement', hint: 'Waist, hips…', action: () => onPick('measurement') },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 }}>
      {cards.map((c) => (
        <Pressable
          key={c.key}
          onPress={c.action}
          style={({ pressed }) => ({ width: '48.5%', marginBottom: 11, padding: 14, borderRadius: theme.radii.card, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1, ...theme.shadows.card })}
        >
          {c.icon}
          <AppText variant="bodyStrong" style={{ fontWeight: '700', marginTop: 10 }}>
            {c.label}
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            {c.hint}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

interface DoseCompound {
  id: string;
  name: string;
  doseUnit: DoseDraft['unit'];
  plannedDose?: number;
}

const TIME_PRESETS: { label: string; h: number }[] = [
  { label: 'Now', h: 0 },
  { label: '1h ago', h: 1 },
  { label: '2h ago', h: 2 },
  { label: '3h ago', h: 3 },
];

function clockLabel(d: Date): string {
  const h12 = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

function DoseForm({
  theme,
  dose,
  setDose,
  compounds,
  loading,
  used,
  offsetH,
  setOffsetH,
  onAddMedication,
}: {
  theme: Theme;
  dose: DoseDraft | null;
  setDose: (d: DoseDraft) => void;
  compounds: DoseCompound[];
  loading: boolean;
  used: Set<InjectionSite>;
  offsetH: number;
  setOffsetH: (n: number) => void;
  onAddMedication: () => void;
}) {
  if (!dose) {
    return (
      <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
        <Icon name="needle" size={28} color={theme.colors.textTertiary} />
        <AppText variant="bodyStrong" align="center" style={{ fontWeight: '800' }}>
          {loading ? 'Checking your medication setup…' : 'Set up your medication to log shots'}
        </AppText>
        <AppText variant="caption" color="textSecondary" align="center" style={{ maxWidth: 280, lineHeight: 18 }}>
          {loading
            ? 'Pepta is looking for the medication you added during onboarding.'
            : 'If onboarding did not finish saving it, add it here once and your shot log will be ready.'}
        </AppText>
        {!loading ? (
          <View style={{ width: 220, marginTop: 6 }}>
            <Button
              label="Add medication"
              leading={<Icon name="needle" size={17} color={theme.colors.onPrimary} />}
              onPress={onAddMedication}
            />
          </View>
        ) : null}
      </View>
    );
  }
  const step = (delta: number) => () => {
    Haptics.selectionAsync().catch(() => undefined);
    setDose({ ...dose, amount: Math.max(0, Math.round((dose.amount + delta) * 100) / 100) });
  };
  const shotTime = new Date(Date.now() - offsetH * 3_600_000);

  return (
    <View style={{ marginTop: 14 }}>
      {/* compound — selectable when there's more than one */}
      {compounds.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          {compounds.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === dose.compoundId}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setDose({ ...dose, compoundId: c.id, compoundName: c.name, unit: c.doseUnit, amount: c.plannedDose ?? dose.amount });
              }}
            />
          ))}
        </View>
      ) : (
        <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
          {dose.compoundName}
        </AppText>
      )}

      {/* amount stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginVertical: 16 }}>
        <RoundBtn theme={theme} icon="remove" onPress={step(-0.5)} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, minWidth: 110, justifyContent: 'center' }}>
          <AppText variant="statBig" color="primary">
            {dose.amount}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {dose.unit}
          </AppText>
        </View>
        <RoundBtn theme={theme} icon="add" onPress={step(0.5)} />
      </View>

      {/* injection site — tap a dot to change */}
      <View style={{ borderRadius: theme.radii.card, backgroundColor: theme.colors.surfaceAlt, paddingVertical: 12 }}>
        <BodyMap used={used} next={dose.site} size={128} onSelect={(site) => { Haptics.selectionAsync().catch(() => undefined); setDose({ ...dose, site }); }} />
        <AppText variant="caption" color="textSecondary" align="center" style={{ marginTop: 6 }}>
          <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>
            {siteLabel(dose.site)}
          </AppText>{' '}
          · auto-rotated
        </AppText>
      </View>

      {/* time */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 8 }}>
        <Icon name="time-outline" size={15} color={theme.colors.textSecondary} />
        <AppText variant="caption" color="textSecondary">
          Today · {clockLabel(shotTime)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TIME_PRESETS.map((p) => (
          <Chip key={p.label} label={p.label} selected={p.h === offsetH} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setOffsetH(p.h); }} />
        ))}
      </View>
    </View>
  );
}

const WEIGHT_UNITS: { label: string; value: WeightUnit }[] = [
  { label: 'lb', value: 'lb' },
  { label: 'kg', value: 'kg' },
];

// Big number + haptic/tick RulerPicker + unit toggle — matches the lab "Log weight"
// sheet. The RulerPicker handles the haptic + tick sound on each notch.
function WeightForm({ theme, value, onChange, unit, onUnit }: { theme: Theme; value: number; onChange: (v: number) => void; unit: WeightUnit; onUnit: (u: WeightUnit) => void }) {
  const min = unit === 'kg' ? 32 : 70;
  const max = unit === 'kg' ? 320 : 700;
  const progressMin = unit === 'kg' ? 45 : 100;
  const progressMax = unit === 'kg' ? 180 : 400;
  const pct = Math.max(0, Math.min(1, (value - progressMin) / (progressMax - progressMin)));
  return (
    <View style={{ marginTop: 18, alignItems: 'center', gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: 64 }}>
        <AppText style={{ fontWeight: '800', fontSize: 52, lineHeight: 60, letterSpacing: -1, color: theme.colors.textPrimary }}>
          {value.toFixed(1)}
        </AppText>
        <AppText variant="cardTitle" color="textSecondary" style={{ lineHeight: 28, paddingBottom: 8 }}>
          {unit}
        </AppText>
      </View>
      <View style={{ width: '82%', gap: 6 }}>
        <ProgressBar pct={pct} color={theme.colors.weight} trackColor="rgba(226,92,196,0.11)" height={5} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
            {progressMin} {unit}
          </AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
            {progressMax} {unit}
          </AppText>
        </View>
      </View>
      <RulerPicker key={unit} value={value} onChange={onChange} min={min} max={max} />
      <SegmentedToggle options={WEIGHT_UNITS} value={unit} onChange={onUnit} />
    </View>
  );
}

function SheetSaveButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.34)',
        opacity: disabled ? 0.5 : pressed ? 0.86 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        overflow: 'hidden',
      })}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 1,
          left: 1,
          right: 1,
          height: 24,
          borderTopLeftRadius: 17,
          borderTopRightRadius: 17,
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
      />
      <AppText variant="button" style={{ color: theme.colors.onPrimary, fontWeight: '800' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function QuickAmount({ options, value, onChange, unit, color }: { options: number[]; value: number; onChange: (n: number) => void; unit: string; color: string }) {
  return (
    <View style={{ marginTop: 18, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingTop: 4, minHeight: 54 }}>
        <AppText variant="statBig" style={{ color, fontSize: 40, lineHeight: 48 }}>
          +{value}
        </AppText>
        <AppText variant="cardTitle" color="textSecondary" style={{ lineHeight: 28, paddingBottom: 6 }}>
          {unit}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {options.map((o) => (
          <Chip key={o} label={`+${o}`} selected={o === value} onPress={() => { Haptics.selectionAsync().catch(() => undefined); onChange(o); }} />
        ))}
      </View>
    </View>
  );
}

function SideEffectForm({ theme, selected, onToggle, severity, onSeverity, note, onNote }: { theme: Theme; selected: SideEffectType[]; onToggle: (t: SideEffectType) => void; severity: number; onSeverity: (n: number) => void; note: string; onNote: (v: string) => void }) {
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SIDE_EFFECTS.map((t) => (
          <Chip key={t} label={sideEffectTypeLabel(t)} selected={selected.includes(t)} onPress={() => onToggle(t)} multi />
        ))}
      </View>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 18, marginBottom: 8 }}>
        How strong? (1 mild · 5 strong)
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= severity;
          const tint = severity >= 4 ? theme.colors.danger : severity === 3 ? theme.colors.warning : theme.colors.success;
          return (
            <Pressable
              key={n}
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); onSeverity(n); }}
              style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? tint : theme.colors.surfaceAlt }}
            >
              <AppText variant="bodyStrong" style={{ fontWeight: '800', color: active ? '#fff' : theme.colors.textSecondary }}>
                {n}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <NoteField theme={theme} value={note} onChange={onNote} />
    </View>
  );
}

function MeasurementForm({ theme, type, onType, value, onStep, unit, onUnit, note, onNote }: { theme: Theme; type: MeasurementType; onType: (t: MeasurementType) => void; value: number; onStep: (delta: number) => void; unit: string; onUnit: (u: string) => void; note: string; onNote: (v: string) => void }) {
  const step = (delta: number) => () => {
    Haptics.selectionAsync().catch(() => undefined);
    onStep(delta);
  };
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MEASUREMENTS.map((t) => (
          <Chip key={t} label={measurementLabel(t)} selected={t === type} onPress={() => { Haptics.selectionAsync().catch(() => undefined); onType(t); }} />
        ))}
      </View>
      <View style={{ marginTop: 18, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <RoundBtn theme={theme} icon="remove" onPress={step(-0.5)} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, minWidth: 120, justifyContent: 'center' }}>
            <AppText variant="statBig">{value.toFixed(1)}</AppText>
            <AppText variant="caption" color="textSecondary">
              {unit}
            </AppText>
          </View>
          <RoundBtn theme={theme} icon="add" onPress={step(0.5)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {['in', 'cm'].map((u) => (
            <Chip key={u} label={u} selected={u === unit} onPress={() => { Haptics.selectionAsync().catch(() => undefined); onUnit(u); }} />
          ))}
        </View>
      </View>
      <NoteField theme={theme} value={note} onChange={onNote} />
    </View>
  );
}

function NoteField({ theme, value, onChange }: { theme: Theme; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 50 }}>
      <Icon name="create-outline" size={16} color={theme.colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Add a note (optional)"
        placeholderTextColor={theme.colors.textTertiary}
        style={{ flex: 1, fontSize: 15, color: theme.colors.textPrimary }}
      />
    </View>
  );
}

function ActivityForm({ theme, activity, setActivity }: { theme: Theme; activity: ActivityState; setActivity: (a: ActivityState) => void }) {
  const num = (v: string) => v.replace(/[^0-9]/g, '');
  const row = (label: string, icon: React.ReactNode, value: string, onChange: (v: string) => void, placeholder: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, height: 56 }}>
      {icon}
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '600' }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(num(t))}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        keyboardType="number-pad"
        style={{ fontSize: 20, fontWeight: '800', color: theme.colors.textPrimary, minWidth: 70, textAlign: 'right' }}
      />
    </View>
  );
  return (
    <View style={{ marginTop: 16, gap: 11 }}>
      {row('Steps', <Icon name="walk" size={18} color={theme.colors.fiber} />, activity.steps, (v) => setActivity({ ...activity, steps: v }), '8000')}
      {row('Workout min', <Icon name="time-outline" size={18} color={theme.colors.water} />, activity.workoutMinutes, (v) => setActivity({ ...activity, workoutMinutes: v }), '30')}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          setActivity({ ...activity, resistance: !activity.resistance });
        }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, height: 56 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="weight-lifter" size={18} color={theme.colors.primary} />
          <AppText variant="bodyStrong" style={{ fontWeight: '600' }}>
            Resistance training
          </AppText>
        </View>
        <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: activity.resistance ? theme.colors.fiber : theme.colors.border, padding: 3, alignItems: activity.resistance ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
        </View>
      </Pressable>
    </View>
  );
}

function RoundBtn({ theme, icon, onPress }: { theme: Theme; icon: 'add' | 'remove'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={22} color={theme.colors.textPrimary} />
    </Pressable>
  );
}
