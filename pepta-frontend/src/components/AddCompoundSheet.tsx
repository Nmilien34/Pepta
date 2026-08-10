// AddCompoundSheet — "Add a medication" from the Track tab. Search the local
// catalog, pick a med + dose, and POST /compounds. Refreshes Home + Track so the
// new compound (and its medication-level tracking) appears immediately.
//
// CUSTOM ENTRY (2026-08-07): anything not in the 12-item catalog — an oral
// daily like Foundayo, an unlisted peptide — gets a real form (name, route,
// dose, frequency, optional half-life) instead of the old dead end. Picking
// the catalog's "Something else" row opens the same form, so no compound is
// ever created literally named "Something else" with an invented injection
// identity. The schedule is created in the same save.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Icon } from "./Icon";
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { Chip } from './onboarding/Chip';
import { SearchField } from './SearchField';
import { usePeptaData } from '../context/PeptaDataContext';
import { api } from '../services/api';
import { searchMedications, type MedicationOption } from '../data/medicationCatalog';
import { currentMedicationCatalog } from '../services/medicationCatalogStore';
import {
  buildCompoundInput,
  buildCustomCompoundInput,
  buildCustomScheduleInput,
  isCustomCompoundValid,
  parseDecimalInput,
  todayDateOnly,
  type CustomCompoundDraft,
} from '../screens/app/addCompound';

const EMPTY_CUSTOM: CustomCompoundDraft = {
  name: '',
  route: null,
  amount: null,
  unit: 'mg',
  frequency: null,
  timeOfDay: '09:00',
  halfLifeDays: null,
};

const TIME_CHIPS: { label: string; value: string }[] = [
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '9:00 PM', value: '21:00' },
];

export interface AddCompoundSheetProps {
  visible: boolean;
  onClose(): void;
  /** Prefills the search (library's "Track this peptide" passes the name). */
  initialQuery?: string;
  /** Shows the "Browse the library" link. Omit when opened FROM the library. */
  onBrowseLibrary?: () => void;
  /** Fires after the sheet has fully animated out (safe hand-off point). */
  onDismissed?: () => void;
}

export function AddCompoundSheet({ visible, onClose, initialQuery, onBrowseLibrary, onDismissed }: AddCompoundSheetProps) {
  const theme = useTheme();
  const { addCompound } = usePeptaData();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MedicationOption | null>(null);
  const [dose, setDose] = useState<number | null>(null);
  const [custom, setCustom] = useState<CustomCompoundDraft | null>(null);
  // RAW text for the two numeric fields — the inputs render these, never the
  // parsed number, or every in-progress keystroke ("2.", "0") gets erased.
  const [amountText, setAmountText] = useState('');
  const [halfLifeText, setHalfLifeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery ?? '');
      setSelected(null);
      setDose(null);
      setCustom(null);
      setAmountText('');
      setHalfLifeText('');
      setSaving(false);
      setFailed(false);
    }
  }, [visible, initialQuery]);

  const results = searchMedications(currentMedicationCatalog(), query).slice(0, 6);

  const openCustom = () => {
    Haptics.selectionAsync().catch(() => undefined);
    // A no-match search is almost always the medication's name — carry it in.
    setCustom({ ...EMPTY_CUSTOM, name: query.trim() });
    setAmountText('');
    setHalfLifeText('');
    setFailed(false);
  };

  const pick = (m: MedicationOption) => {
    Haptics.selectionAsync().catch(() => undefined);
    // "Something else" is not a medication — it's the doorway to the form.
    if (m.id === 'other') {
      openCustom();
      return;
    }
    setSelected(m);
    setDose(m.commonDoses[0] ?? null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setFailed(false);
    try {
      await addCompound(buildCompoundInput(selected, dose, todayDateOnly(new Date())));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const saveCustom = async () => {
    if (!custom || !isCustomCompoundValid(custom)) return;
    setSaving(true);
    setFailed(false);
    try {
      const compound = await addCompound(buildCustomCompoundInput(custom, todayDateOnly(new Date())));
      // The schedule rides the same save. Best-effort: if it fails, the
      // compound still exists (that was every sheet-add before today) and
      // TimingSheet can set the cadence later — never block the save on it.
      await api.createSchedule(buildCustomScheduleInput(custom, compound.id)).catch(() => undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={onDismissed} avoidKeyboard={false} scrollable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        {selected || custom ? (
          <Pressable
            onPress={() => {
              setSelected(null);
              setCustom(null);
            }}
            hitSlop={8}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText variant="cardTitle" style={{ fontSize: 17 }}>
            {custom ? 'Add your own' : 'Add a medication'}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {custom
              ? 'The basics are enough — you can refine later.'
              : selected
                ? 'Set your dose and save.'
                : 'Search and pick your medication.'}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close medication picker"
          onPress={onClose}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" size={18} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {!selected && !custom ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search medications" autoFocus />
          {results.length === 0 && query.trim().length > 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 10, gap: 8 }}>
              <AppText variant="caption" color="textSecondary" align="center">
                “{query.trim()}” isn’t in our list yet.
              </AppText>
              <Button label={`Add “${query.trim()}” yourself`} onPress={openCustom} />
            </View>
          ) : null}
          {results.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => pick(m)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#EFEBFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={m.route === 'oral' ? 'pill' : 'needle'} size={18} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                  {m.name}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {m.subtitle}
                </AppText>
              </View>
              <Icon name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          ))}
          {/* Always-visible custom entry: the 12-item list can never cover
              every medication, so the way out is never hidden behind a
              failed search. */}
          <Pressable
            onPress={openCustom}
            accessibilityRole="button"
            accessibilityLabel="Add your own medication"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="add" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                Add your own
              </AppText>
              <AppText variant="caption" color="textSecondary">
                Not listed? Enter it yourself.
              </AppText>
            </View>
            <Icon name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </Pressable>
          {/* Second library front door: "what even is this compound?" happens
              right here. Omitted when the sheet was opened FROM the library. */}
          {onBrowseLibrary ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onBrowseLibrary();
              }}
              accessibilityRole="button"
              accessibilityLabel="Browse the peptide library"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="books" size={16} color={theme.colors.primary} />
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                Not sure? Browse the peptide library
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : custom ? (
        <View style={{ marginTop: 14, gap: 14 }}>
          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 6 }}>
              Name
            </AppText>
            <TextInput
              value={custom.name}
              onChangeText={(name) => setCustom({ ...custom, name })}
              placeholder="e.g. Foundayo"
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus={custom.name.length === 0}
              style={{
                borderWidth: 1.5,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 13,
                paddingVertical: 11,
                fontSize: 15,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surface,
              }}
            />
          </View>

          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 8 }}>
              How do you take it?
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Injection" selected={custom.route === 'injection'} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, route: 'injection' }); }} />
              <Chip label="Pill or oral" selected={custom.route === 'oral'} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, route: 'oral' }); }} />
            </View>
          </View>

          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 8 }}>
              Dose
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={amountText}
                onChangeText={(text) => {
                  setAmountText(text);
                  setCustom({ ...custom, amount: parseDecimalInput(text) });
                }}
                placeholder="0"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
                style={{
                  width: 88,
                  borderWidth: 1.5,
                  borderColor: theme.colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 11,
                  fontSize: 15,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.surface,
                }}
              />
              {(['mg', 'mcg', 'ml', 'units'] as const).map((unit) => (
                <Chip key={unit} label={unit} selected={custom.unit === unit} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, unit }); }} />
              ))}
            </View>
          </View>

          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 8 }}>
              How often?
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Daily" selected={custom.frequency === 'daily'} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, frequency: 'daily' }); }} />
              <Chip label="Weekly" selected={custom.frequency === 'weekly'} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, frequency: 'weekly' }); }} />
              <Chip label="Every 2 weeks" selected={custom.frequency === 'biweekly'} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, frequency: 'biweekly' }); }} />
            </View>
          </View>

          {custom.frequency === 'daily' ? (
            <View>
              <AppText variant="caption" color="textSecondary" style={{ marginBottom: 8 }}>
                What time do you usually take it?
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TIME_CHIPS.map((t) => (
                  <Chip key={t.value} label={t.label} selected={custom.timeOfDay === t.value} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setCustom({ ...custom, timeOfDay: t.value }); }} />
                ))}
              </View>
            </View>
          ) : null}

          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 6 }}>
              Half-life in days — optional
            </AppText>
            <TextInput
              value={halfLifeText}
              onChangeText={(text) => {
                setHalfLifeText(text);
                setCustom({ ...custom, halfLifeDays: parseDecimalInput(text) });
              }}
              placeholder="Not sure? Skip this."
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              style={{
                borderWidth: 1.5,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 13,
                paddingVertical: 11,
                fontSize: 15,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surface,
              }}
            />
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 6, fontSize: 11 }}>
              Skipping it just means no level curve for this medication — everything else works.
            </AppText>
          </View>

          {failed ? (
            <AppText variant="caption" color="danger" align="center">
              Couldn’t add that medication. Please try again.
            </AppText>
          ) : null}

          {saving ? (
            <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <Button label="Add medication" onPress={saveCustom} disabled={!isCustomCompoundValid(custom)} />
          )}
        </View>
      ) : selected ? (
        <View style={{ marginTop: 14, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFEBFF', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={selected.route === 'oral' ? 'pill' : 'needle'} size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                {selected.name}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {selected.subtitle}{selected.halfLifeDays != null ? ` · half-life ${selected.halfLifeDays}d` : ''}
              </AppText>
            </View>
          </View>

          <View>
            <AppText variant="caption" color="textSecondary" style={{ marginBottom: 8 }}>
              Dose ({selected.doseUnit})
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {selected.commonDoses.map((d) => (
                <Chip key={d} label={`${d} ${selected.doseUnit}`} selected={d === dose} onPress={() => { Haptics.selectionAsync().catch(() => undefined); setDose(d); }} />
              ))}
            </View>
          </View>

          {failed ? (
            <AppText variant="caption" color="danger" align="center">
              Couldn’t add that medication. Please try again.
            </AppText>
          ) : null}

          {saving ? (
            <View style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <Button label="Add medication" onPress={save} />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}
