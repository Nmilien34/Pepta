// Onboarding — Medication (T4). A live-filtered, single-select catalog list
// inside the conversation turn. Tapping a row speaks it: haptic tap + a short
// beat, then auto-advance (no Continue). The chosen item's route drives later
// gating (oral hides injection turns; ambiguous meds get the route question).

import React, { useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from '../../components/Icon';
import { AppText, ConvoScreen, OptionCard, SearchField } from '../../components';
import { MEDICATION_CATALOG, searchMedications, type MedicationOption } from '../../data/medicationCatalog';

export interface MedicationPickerScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value?: MedicationOption;
  onAnswer(item: MedicationOption): void;
}

export function MedicationPickerScreen({ progress, onBack, context, value, onAnswer }: MedicationPickerScreenProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MedicationOption | undefined>(value);
  const advanced = useRef(false);
  const results = useMemo(() => searchMedications(MEDICATION_CATALOG, query), [query]);

  const handlePick = (item: MedicationOption) => {
    if (advanced.current) return;
    advanced.current = true;
    setPicked(item);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 220);
    }
    // A brief beat so the selection state lands before the turn advances.
    setTimeout(() => onAnswer(item), 420);
  };

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Which medication?"
    >
      <View style={{ marginTop: 22 }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search medications" />
      </View>
      <View style={{ gap: 9, marginTop: 14 }}>
        {results.map((item) => (
          <OptionCard
            key={item.id}
            title={item.name}
            subtitle={item.subtitle}
            icon={<MedIcon item={item} />}
            selected={picked?.id === item.id}
            onPress={() => handlePick(item)}
          />
        ))}
      </View>
    </ConvoScreen>
  );
}

function MedIcon({ item }: { item: MedicationOption }) {
  if (item.kind === 'brand' && item.initial) {
    return (
      <AppText variant="statMedium" style={{ fontSize: 18, color: item.tintColor }}>
        {item.initial}
      </AppText>
    );
  }
  const name: 'pill' | 'flask-outline' | 'dots-horizontal' =
    item.kind === 'oral' ? 'pill' : item.kind === 'compound' ? 'flask-outline' : 'dots-horizontal';
  return <Icon name={name} size={22} color={item.tintColor} />;
}
