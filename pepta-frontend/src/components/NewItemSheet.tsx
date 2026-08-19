// Adding an item the user typed — the "Add your own" row.
//
// THE KIND IS A CHOICE, NOT A GUESS. A drink's Log adds ounces to the water
// total and it draws as a vessel; a food's Log writes a meal and it draws as a
// tile. Inferring that from a name would put "protein shake" in the wrong tab
// and log it into the wrong number, so the user picks, and the fields change
// to match: a drink asks for a volume, a food asks for protein and calories.
//
// SAVE STAYS DISABLED UNTIL IT COULD ACTUALLY BE LOGGED, and says why rather
// than leaving a dead button — a drink with no volume adds nothing, a food
// with no figures records nothing.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText, Button } from './index';
import { useTheme } from '../theme';
import {
  isNewItemValid,
  newItemProblem,
  type FavouriteKind,
  type NewItemDraft,
} from '../screens/app/favourites';

export interface NewItemSheetProps {
  visible: boolean;
  /** Which tab it was opened from — the user can still change it. */
  initialKind: FavouriteKind;
  onCancel(): void;
  onSave(draft: NewItemDraft): void;
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function NewItemSheet({ visible, initialKind, onCancel, onSave }: NewItemSheetProps) {
  const theme = useTheme();
  const [kind, setKind] = useState<FavouriteKind>(initialKind);
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [ounces, setOunces] = useState('');

  // Cleared on every open, or the next item starts as a copy of the last.
  useEffect(() => {
    if (!visible) return;
    setKind(initialKind);
    setName('');
    setPortion('');
    setProtein('');
    setCalories('');
    setOunces('');
  }, [visible, initialKind]);

  if (!visible) return null;

  const draft: NewItemDraft = {
    kind,
    name,
    portion,
    ...(kind === 'drink'
      ? { ounces: num(ounces) }
      : { protein: num(protein), calories: num(calories) }),
  };
  const problem = newItemProblem(draft);

  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    keyboard: 'default' | 'decimal-pad',
    placeholder?: string,
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
        placeholder={placeholder}
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
        accessibilityLabel="Close the new item form"
        style={{ flex: 1, backgroundColor: 'rgba(14,14,18,0.35)', justifyContent: 'flex-end' }}
      >
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
          <AppText variant="cardTitle" style={{ fontSize: 17 }}>Add your own</AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 4, lineHeight: 16 }}>
            Anything the examples do not cover. What it is decides where it
            lands and what logging it does.
          </AppText>

          {/* Segmented, like the tabs — one control, one selection. */}
          <View
            style={{
              flexDirection: 'row',
              gap: 3,
              padding: 3,
              marginTop: 14,
              borderRadius: 14,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          >
            {(['food', 'drink'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setKind(k);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === k }}
                accessibilityLabel={k === 'food' ? 'It is a food' : 'It is a drink'}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 11,
                  alignItems: 'center',
                  backgroundColor: kind === k ? theme.colors.surface : 'transparent',
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <AppText
                  variant="caption"
                  style={{
                    fontSize: 12.5,
                    fontWeight: kind === k ? '800' : '700',
                    color: kind === k ? theme.colors.textPrimary : theme.colors.textTertiary,
                  }}
                >
                  {k === 'food' ? 'Food' : 'Drink'}
                </AppText>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 12 }}>{field('Name', name, setName, 'default', 'Desk bottle')}</View>
          <View style={{ marginTop: 12 }}>
            {field('How much one is', portion, setPortion, 'default', kind === 'drink' ? '21 oz' : '1 scoop, milk')}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            {kind === 'drink'
              ? field('Ounces', ounces, setOunces, 'decimal-pad')
              : field('Protein (g)', protein, setProtein, 'decimal-pad')}
            {kind === 'food' ? field('Calories', calories, setCalories, 'decimal-pad') : <View style={{ flex: 1 }} />}
          </View>

          {/* Says why, rather than leaving a dead button. */}
          {problem ? (
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 10 }}>
              {problem}
            </AppText>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Button
              label="Save it"
              disabled={!isNewItemValid(draft)}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onSave(draft);
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
