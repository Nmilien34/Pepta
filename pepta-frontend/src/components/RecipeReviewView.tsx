// The review step between "the AI worked out what you ate" and "it is saved".
//
// WHY IT EXISTS. Composing takes a second or two, and without this the sheet
// closed immediately and the recipe appeared in the list later, already saved,
// with whatever the model guessed. The user never saw the portions they were
// agreeing to — and portions are the one thing the model is least sure about.
//
// THE TOTALS RECOMPUTE AS ROWS ARE REMOVED. That is the point of showing the
// parts: drop the thing the model invented and the figure moves. A total that
// stayed put while its ingredients changed would be the number the user acts
// on and the one that is wrong.
//
// Confidence is always stated, never only when it is bad — a caveat that
// appears sometimes reads as an error, one that is always there reads as a
// habit.

import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { RecipeIngredient } from '@pepta/shared';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { confidenceNote, recipeTotals } from '../screens/app/recipes';
import type { useTheme } from '../theme';

export interface RecipeReviewViewProps {
  theme: ReturnType<typeof useTheme>;
  name: string;
  onName(next: string): void;
  ingredients: readonly RecipeIngredient[];
  onRemove(index: number): void;
  confidence: number;
  saving: boolean;
  /** The last save was rejected — say so instead of closing as if it worked. */
  failed?: boolean;
  onSave(): void;
}

export function RecipeReviewView({
  theme,
  name,
  onName,
  ingredients,
  onRemove,
  confidence,
  saving,
  onSave,
  failed = false,
}: RecipeReviewViewProps) {
  const totals = recipeTotals(ingredients);

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
      <AppText variant="cardTitle" style={{ fontSize: 17 }}>
        Save as a recipe
      </AppText>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 4, lineHeight: 15 }}>
        {confidenceNote(confidence)}
      </AppText>

      <TextInput
        value={name}
        onChangeText={onName}
        accessibilityLabel="Recipe name"
        placeholder="Recipe name"
        placeholderTextColor={theme.colors.textTertiary}
        style={{
          marginTop: 12,
          paddingVertical: 11,
          paddingHorizontal: 13,
          borderRadius: 14,
          backgroundColor: theme.colors.surfaceAlt,
          color: theme.colors.textPrimary,
          fontSize: 15,
          fontWeight: '700',
        }}
      />

      <ScrollView style={{ maxHeight: 260, marginTop: 10 }} showsVerticalScrollIndicator={false}>
        {ingredients.map((item, i) => (
          <View
            key={`${item.name}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
              borderBottomWidth: i === ingredients.length - 1 ? 0 : 0.5,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="cardTitle" style={{ fontSize: 14 }} numberOfLines={1}>
                {item.name}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 3 }}>
                {item.amount ? (
                  <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                    {item.amount}
                  </AppText>
                ) : null}
                <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.protein }}>
                  {item.protein} g protein
                </AppText>
                <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                  {item.calories} cal
                </AppText>
              </View>
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onRemove(i);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="close" size={17} color={theme.colors.textTertiary} stroke={2.2} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Summed here, every render — see recipeTotals. */}
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
        }}
      >
        <AppText variant="cardTitle" style={{ fontSize: 14 }}>
          {totals.protein} g protein
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 13 }}>
          {totals.calories} cal
        </AppText>
        {totals.fiber > 0 ? (
          <AppText variant="caption" style={{ fontSize: 13, fontWeight: '700', color: theme.colors.fiber }}>
            {totals.fiber} g fiber
          </AppText>
        ) : null}
      </View>

      {/* A REJECTED SAVE SAYS SO. The sheet used to swallow the failure and
          close exactly as it does on success, so the only difference a user
          could see was a recipe missing from a list that does not refresh —
          i.e. none at all. The sheet stays open so the tap can be retried
          without re-describing the food. */}
      {failed ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radii.card,
            padding: 12,
          }}
        >
          <AppText variant="caption" style={{ color: theme.colors.danger, fontWeight: '700' }}>
            That didn’t save
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 3, lineHeight: 16 }}>
            Your recipe is still here — tap Save recipe to try again.
          </AppText>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Button
          label={saving ? 'Saving…' : failed ? 'Try again' : 'Save recipe'}
          disabled={saving || ingredients.length === 0 || name.trim().length === 0}
          onPress={onSave}
        />
      </View>
      {ingredients.length === 0 ? (
        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 8 }}>
          Nothing left to save — go back and try again.
        </AppText>
      ) : null}
    </View>
  );
}
