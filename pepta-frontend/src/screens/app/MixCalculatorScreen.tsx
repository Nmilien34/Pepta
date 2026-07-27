// Mix calculator — one LIVE screen (design-lab frame): the three inputs are
// editable in place (tap a purple value → number pad; syringe is the inline
// segmented control), the water suggestion is adjustable with steppers, and
// everything below recomputes on every change. Pure unit conversion of the
// user's own numbers — nothing here recommends a dose. The advisory note only
// appears for FDA-labeled compounds (doseRanges), advises, and routes to the
// prescriber; research peptides get no invented range and no warning.

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { SegmentedToggle } from '../../components/onboarding/SegmentedToggle';
import { usePeptaData } from '../../context/PeptaDataContext';
import { api } from '../../services/api';
import { useTheme } from '../../theme';
import {
  computeMix,
  WATER_MAX_ML,
  WATER_MIN_ML,
  WATER_STEP_ML,
  type SyringeSize,
} from '../../utils/reconstitution';
import { doseAdvisory } from '../../data/doseRanges';

const SYRINGES: ReadonlyArray<{ label: string; value: SyringeSize }> = [
  { label: '0.3 mL · 30u', value: 30 },
  { label: '0.5 mL · 50u', value: 50 },
  { label: '1 mL · 100u', value: 100 },
];

function defaultDoseMcg(plannedDose: number | null | undefined, unit: string | undefined): number {
  if (!plannedDose || plannedDose <= 0) return 250;
  if (unit === 'mg') return plannedDose * 1000;
  if (unit === 'mcg') return plannedDose;
  return 250;
}

export function MixCalculatorScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { home, refreshHome } = usePeptaData();
  const compound = home?.activeCompounds[0] ?? null;

  const [vialMg, setVialMg] = useState(10);
  const [syringeUnits, setSyringeUnits] = useState<SyringeSize>(50);
  const [doseMcg, setDoseMcg] = useState(() =>
    defaultDoseMcg(compound?.plannedDose, compound?.doseUnit),
  );
  // null = use the computed suggestion; a number = the user's own water amount.
  const [waterOverride, setWaterOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const mix = useMemo(
    () =>
      computeMix({
        vialMg,
        syringeUnits,
        doseMcg,
        ...(waterOverride != null ? { waterMl: waterOverride } : {}),
      }),
    [vialMg, syringeUnits, doseMcg, waterOverride],
  );

  const advisory = useMemo(
    () => (compound ? doseAdvisory(compound.name, doseMcg) : null),
    [compound, doseMcg],
  );

  const setInput = (apply: () => void) => {
    apply();
    setWaterOverride(null); // inputs changed — re-suggest the water amount
    setSaved(false);
  };

  const stepWater = (delta: number) => {
    if (!mix) return;
    Haptics.selectionAsync().catch(() => undefined);
    const next = Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, mix.waterMl + delta));
    setWaterOverride(next);
    setSaved(false);
  };

  const onSave = async () => {
    if (!compound || saving) return;
    setSaving(true);
    try {
      // Store in the compound's own unit family: whole mg stay mg, else mcg.
      const asMg = doseMcg >= 1000 && doseMcg % 1000 === 0;
      await api.updateCompound(compound.id, {
        plannedDose: asMg ? doseMcg / 1000 : doseMcg,
        doseUnit: asMg ? 'mg' : 'mcg',
      });
      await refreshHome().catch(() => undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setSaved(true);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const fillPct = mix ? Math.min(1, mix.unitsToDraw / syringeUnits) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* header — no Edit link: the whole screen is live */}
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
              Mix calculator
            </AppText>
          </View>

          {/* inputs */}
          <Card style={{ marginTop: theme.spacing.lg }}>
            <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Your inputs — tap to edit
            </AppText>

            <InputRow
              chipBg="#EFEBFF"
              chipFg={theme.colors.primary}
              icon="flask"
              label="Peptide in the vial"
            >
              <EditableNumber
                value={vialMg}
                suffix="mg"
                maxValue={1000}
                onCommit={(next) => setInput(() => setVialMg(next))}
              />
            </InputRow>

            <View style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#E7F4FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="needle" size={18} color="#1273C4" />
                </View>
                <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                  Syringe
                </AppText>
              </View>
              <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                <SegmentedToggle
                  compact
                  options={SYRINGES}
                  value={syringeUnits}
                  onChange={(value) => setInput(() => setSyringeUnits(value))}
                />
              </View>
            </View>

            <InputRow
              chipBg="#E1F5EE"
              chipFg="#0F6E56"
              icon="target-arrow"
              label="Dose you want"
              last
            >
              <EditableNumber
                value={doseMcg}
                suffix="mcg"
                maxValue={100_000}
                onCommit={(next) => setInput(() => setDoseMcg(next))}
              />
            </InputRow>
          </Card>

          {/* water + result */}
          <Card style={{ marginTop: 12 }}>
            <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Add to the vial
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <AppText variant="statBig">{mix ? mix.waterMl.toFixed(1) : '—'} mL</AppText>
                <AppText variant="caption" color="textSecondary">
                  BAC water
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <WaterBtn icon="remove" onPress={() => stepWater(-WATER_STEP_ML)} label="Less water" />
                <WaterBtn icon="add" onPress={() => stepWater(WATER_STEP_ML)} label="More water" />
              </View>
            </View>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
              {mix
                ? `${
                    mix.waterSuggested
                      ? 'Our suggestion for a clean draw — adjust if your prescriber said otherwise. '
                      : 'Your amount — more water means a larger, finer draw. '
                  }Makes ${mix.concentrationMgPerMl} mg/mL.`
                : 'Enter the vial and dose above to get your mix.'}
            </AppText>

            {mix ? (
              <View style={{ backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 }}>
                <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                  Then draw
                </AppText>
                <AppText variant="statBig" color="primary" style={{ marginTop: 6 }}>
                  {mix.unitsToDraw} units
                </AppText>
                <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                  to the{' '}
                  <AppText variant="caption" style={{ fontWeight: '800', color: theme.colors.textPrimary }}>
                    {mix.unitsToDraw}
                  </AppText>{' '}
                  mark on a {syringeUnits}-unit syringe = {doseMcg} mcg.
                </AppText>
                {/* syringe barrel (design SVG as Views): fill = the draw,
                    tick marks each 20% of capacity, plunger nub at the end */}
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <View
                      style={{
                        flex: 1,
                        height: 11,
                        borderRadius: 6,
                        backgroundColor: theme.colors.surface,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(fillPct * 100, mix.unitsToDraw > 0 ? 4 : 0)}%`,
                          height: '100%',
                          backgroundColor: theme.colors.primary,
                          borderRadius: 6,
                        }}
                      />
                      {[20, 40, 60, 80].map((pct) => (
                        <View
                          key={pct}
                          style={{
                            position: 'absolute',
                            left: `${pct}%`,
                            top: 2,
                            bottom: 2,
                            width: 1,
                            backgroundColor: theme.colors.border,
                          }}
                        />
                      ))}
                    </View>
                    <View style={{ width: 26, height: 6, borderRadius: 3, backgroundColor: '#DCDCE3' }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingRight: 28 }}>
                    <AppText variant="caption" color="primary" style={{ fontSize: 10, fontWeight: '800' }}>
                      {mix.unitsToDraw}u
                    </AppText>
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10, fontWeight: '700' }}>
                      {syringeUnits}u
                    </AppText>
                  </View>
                </View>
              </View>
            ) : null}

            {mix && !mix.fits ? (
              <AdvisoryNote
                text={`That draw is ${mix.unitsToDraw} units — it doesn’t fit a ${syringeUnits}u syringe. Use less water or a bigger syringe.`}
              />
            ) : null}
            {mix && mix.fits && !mix.readable ? (
              <AdvisoryNote text="Draws under 2 units are hard to read — use more water for a larger, more precise draw." />
            ) : null}
            {advisory && compound ? (
              <AdvisoryNote
                text={`${doseMcg} mcg sits ${advisory.direction} the labeled range for ${compound.name} (${advisory.range.label}). Confirm with your prescriber.`}
              />
            ) : null}
          </Card>

          <View style={{ marginTop: theme.spacing.lg, marginBottom: 30 }}>
            <Button
              label={saved ? 'Saved as your dose' : 'Save as my dose'}
              onPress={onSave}
              disabled={!compound || !mix || saved}
              loading={saving}
              fullWidth
            />
            {!compound ? (
              <AppText variant="caption" color="textSecondary" style={{ marginTop: 10, textAlign: 'center' }}>
                Add a medication on Track to save this dose to it.
              </AppText>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function InputRow({
  chipBg,
  chipFg,
  icon,
  label,
  last,
  children,
}: {
  chipBg: string;
  chipFg: string;
  icon: string;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={chipFg} />
      </View>
      <AppText variant="bodyStrong" style={{ fontWeight: '700', flex: 1 }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

// Tap-to-edit number: the design's dashed-underline purple value. Tapping
// swaps in a TextInput with the number pad; blur or return commits.
function EditableNumber({
  value,
  suffix,
  maxValue,
  onCommit,
}: {
  value: number;
  suffix: string;
  maxValue: number;
  onCommit(next: number): void;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= maxValue) {
      onCommit(parsed);
    }
  };

  if (editing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          selectTextOnFocus
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={{
            minWidth: 52,
            textAlign: 'right',
            fontSize: 15,
            fontWeight: '700',
            color: theme.colors.primary,
            borderBottomWidth: 1.5,
            borderBottomColor: theme.colors.primary,
            paddingVertical: 1,
          }}
        />
        <AppText variant="bodyStrong" style={{ fontWeight: '700', color: theme.colors.primary }}>
          {suffix}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        setDraft(String(value));
        setEditing(true);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${suffix} value, currently ${value}`}
    >
      <View style={{ borderBottomWidth: 1.5, borderBottomColor: 'rgba(124,92,252,0.4)', paddingBottom: 1 }}>
        <AppText variant="bodyStrong" style={{ fontWeight: '700', color: theme.colors.primary }}>
          {value} {suffix}
        </AppText>
      </View>
    </Pressable>
  );
}

// The hub `.sbtn` idiom (same as Cycle setup's stepper buttons): white round
// button, hairline border, soft shadow.
function WaterBtn({ icon, onPress, label }: { icon: string; onPress(): void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 30,
        height: 30,
        borderRadius: 999,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.soft,
      })}
    >
      <Icon name={icon} size={16} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

// Amber advisory (design #FFF8EA / #8A6300): advises and routes to the
// prescriber — never blocks, never recommends.
function AdvisoryNote({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 9,
        backgroundColor: '#FFF8EA',
        borderRadius: 14,
        paddingVertical: 11,
        paddingHorizontal: 12,
        marginTop: 12,
        alignItems: 'flex-start',
      }}
    >
      <Icon name="warning" size={15} color={theme.colors.warning} style={{ marginTop: 1 }} />
      <AppText variant="caption" style={{ color: '#8A6300', flex: 1, lineHeight: 17 }}>
        {text}
      </AppText>
    </View>
  );
}
