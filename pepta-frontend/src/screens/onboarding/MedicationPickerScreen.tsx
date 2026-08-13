// Onboarding — Medication (T4). A live-filtered, single-select catalog list
// inside the conversation turn. Tapping a row speaks it: haptic tap + a short
// beat, then auto-advance (no Continue). The chosen item's route drives later
// gating (oral hides injection turns; ambiguous meds get the route question).
//
// ROUTE FILTER (2026-08-13): a segmented All/Shots/Pills row narrows the browse
// list. Deliberately ON this screen rather than as a turn of its own — only the
// four routeAmbiguous entries reach the route question today, so a separate
// screen would have added a step for 11 of 15 medications to save them three
// rows. Here nobody pays a tap they did not want.
//
// SEARCH IGNORES THE FILTER. Typing a real medication's name finds it whatever
// the segment says, so the filter can never produce an empty result that reads
// as "we don't have your drug" and pushes someone into "Something else".

import React, { useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from '../../components/Icon';
import { AppText, ConvoScreen, OptionCard, SearchField } from '../../components';
import { SegmentedToggle } from '../../components/onboarding/SegmentedToggle';
import {
  filterMedicationsByRoute,
  searchMedications,
  type MedicationOption,
  type MedicationRouteFilter,
} from '../../data/medicationCatalog';
import { currentMedicationCatalog } from '../../services/medicationCatalogStore';

export interface MedicationPickerScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value?: MedicationOption;
  onAnswer(item: MedicationOption): void;
}

export function MedicationPickerScreen({ progress, onBack, context, value, onAnswer }: MedicationPickerScreenProps) {
  const [query, setQuery] = useState('');
  const [routeFilter, setRouteFilter] = useState<MedicationRouteFilter>('all');
  const [picked, setPicked] = useState<MedicationOption | undefined>(value);
  const advanced = useRef(false);
  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    const matched = searchMedications(currentMedicationCatalog(), query);
    // A live search is the user naming their medication outright; narrowing
    // that by a browse filter they set beforehand only hides the answer.
    return searching ? matched : filterMedicationsByRoute(matched, routeFilter);
  }, [query, routeFilter, searching]);

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
        <SegmentedToggle<MedicationRouteFilter>
          options={[
            { label: 'All', value: 'all' },
            { label: 'Shots', value: 'injection' },
            { label: 'Pills', value: 'oral' },
          ]}
          value={routeFilter}
          onChange={(next) => {
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            setRouteFilter(next);
          }}
        />
      </View>
      <View style={{ marginTop: 14 }}>
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
