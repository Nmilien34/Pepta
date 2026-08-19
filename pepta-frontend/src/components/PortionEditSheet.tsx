// Changing a saved portion — the frame's "change the portion by holding the
// row".
//
// IT EDITS THE NUMBERS TOO, and that is the whole reason it is a sheet rather
// than an inline text field. Changing "6 oz" to "8 oz" while the protein stays
// at 54 g would make a favourite that logs the wrong figure every time it is
// tapped, quietly, on the one screen built for one-tap logging. The portion
// and its figures move together or not at all.
//
// Save stays disabled until the edit could actually be logged — a drink needs
// a volume, a food needs at least one figure.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText, Button } from './index';
import { useTheme } from '../theme';
import { isPortionEditValid, type Favourite, type PortionEdit } from '../screens/app/favourites';

export interface PortionEditSheetProps {
  favourite: Favourite | null;
  onCancel(): void;
  onSave(edit: PortionEdit): void;
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function PortionEditSheet({ favourite, onCancel, onSave }: PortionEditSheetProps) {
  const theme = useTheme();
  const [portion, setPortion] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [ounces, setOunces] = useState('');

  // Reloaded whenever a different row is held, or the sheet would open showing
  // the last favourite's numbers against this one's name.
  useEffect(() => {
    if (!favourite) return;
    setPortion(favourite.portion);
    setProtein(favourite.protein != null ? String(favourite.protein) : '');
    setCalories(favourite.calories != null ? String(favourite.calories) : '');
    setOunces(favourite.ounces != null ? String(favourite.ounces) : '');
  }, [favourite]);

  if (!favourite) return null;
  const isDrink = favourite.kind === 'drink';
  const edit: PortionEdit = {
    portion,
    protein: num(protein),
    calories: num(calories),
    ounces: num(ounces),
    fiber: favourite.fiber,
  };
  const valid = isPortionEditValid(favourite, edit);

  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    keyboard: 'default' | 'decimal-pad',
  ) => (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, fontWeight: '700' }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboard}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textTertiary}
        style={{
          marginTop: 5,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceAlt,
          color: theme.colors.textPrimary,
          fontSize: 14,
          fontWeight: '700',
        }}
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close portion editor"
        style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.35)', justifyContent: 'flex-end' }}
      >
        {/* Stops a tap inside the card from closing it. */}
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 20,
            paddingBottom: 30,
          }}
        >
          <AppText variant="cardTitle" style={{ fontSize: 17 }}>
            {favourite.name}
          </AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 4, lineHeight: 16 }}>
            Change the portion and what it logs. Both move together — a portion
            with someone else’s numbers would log the wrong thing every time.
          </AppText>

          <View style={{ marginTop: 14 }}>
            {field('Portion', portion, setPortion, 'default')}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            {isDrink
              ? field('Ounces', ounces, setOunces, 'decimal-pad')
              : field('Protein (g)', protein, setProtein, 'decimal-pad')}
            {field('Calories', calories, setCalories, 'decimal-pad')}
          </View>

          <View style={{ marginTop: 18 }}>
            <Button
              label="Save portion"
              disabled={!valid}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onSave(edit);
              }}
            />
          </View>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 12.5, fontWeight: '700' }}>
              Cancel
            </AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
