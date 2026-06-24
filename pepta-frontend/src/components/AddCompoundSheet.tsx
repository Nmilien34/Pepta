// AddCompoundSheet — "Add a medication" from the Track tab. Search the local
// catalog, pick a med + dose, and POST /compounds. Refreshes Home + Track so the
// new compound (and its medication-level tracking) appears immediately.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from "./Icon";
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { Chip } from './onboarding/Chip';
import { SearchField } from './SearchField';
import { usePeptaData } from '../context/PeptaDataContext';
import { MEDICATION_CATALOG, searchMedications, type MedicationOption } from '../data/medicationCatalog';
import { buildCompoundInput, todayDateOnly } from '../screens/app/addCompound';

export interface AddCompoundSheetProps {
  visible: boolean;
  onClose(): void;
}

export function AddCompoundSheet({ visible, onClose }: AddCompoundSheetProps) {
  const theme = useTheme();
  const { addCompound } = usePeptaData();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MedicationOption | null>(null);
  const [dose, setDose] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelected(null);
      setDose(null);
      setSaving(false);
      setFailed(false);
    }
  }, [visible]);

  const results = searchMedications(MEDICATION_CATALOG, query).slice(0, 6);

  const pick = (m: MedicationOption) => {
    Haptics.selectionAsync().catch(() => undefined);
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

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        {selected ? (
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText variant="cardTitle" style={{ fontSize: 17 }}>
            Add a medication
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {selected ? 'Set your dose and save.' : 'Search and pick your medication.'}
          </AppText>
        </View>
      </View>

      {!selected ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search medications" autoFocus />
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
        </View>
      ) : (
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
                {selected.subtitle} · half-life {selected.halfLifeDays}d
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
      )}
    </BottomSheet>
  );
}
