// The dose-time picker. Shared by the data-health "missing dose time" card and
// the schedule settings row, so the capability is reachable without waiting for
// a card to appear — and both write the same schedule field.

import { MASK_PROPS } from "./MaskedHealthValue";
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Chip } from './onboarding/Chip';

const TIME_CHIPS: { label: string; value: string }[] = [
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '9:00 PM', value: '21:00' },
];

export function DoseTimeSheet({
  visible,
  compoundName,
  selected,
  busy,
  onClose,
  onPick,
}: {
  visible: boolean;
  compoundName: string;
  /** Current stored time, so the row round-trips rather than always looking unset. */
  selected?: string | null;
  busy: boolean;
  onClose(): void;
  onPick(time: string): void;
}) {
  return (
    <BottomSheet panelProps={MASK_PROPS} visible={visible} onClose={onClose} avoidKeyboard={false}>
      <AppText variant="cardTitle" style={{ fontSize: 17 }}>
        When do you take {compoundName}?
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
        You can change this any time in the medication's timing settings.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {TIME_CHIPS.map((chip) => (
          <Chip
            key={chip.value}
            label={chip.label}
            selected={selected === chip.value}
            onPress={() => {
              if (busy) return;
              Haptics.selectionAsync().catch(() => undefined);
              onPick(chip.value);
            }}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
