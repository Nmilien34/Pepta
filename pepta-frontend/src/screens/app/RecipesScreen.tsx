// Recipes — your list (design-lab frame "Recipes · your list").
//
// A recipe is a combination you eat often, logged in one tap. No method, no
// steps: this is not a cookbook.
//
// LOGGING ONE WRITES THE SAME ENTRY A FRESH MEAL LOG WOULD. The design says so
// outright, and it is the reason Log goes through the meal sheet seeded with
// the recipe rather than writing some second kind of record — a recipe has to
// land in Today's Log looking like everything else.
//
// STARTERS ARE NOT YOURS UNTIL YOU SAVE THEM. They ship seeded so the screen
// is useful before anyone has saved anything, and saving one copies it, so a
// later correction to the shared row cannot rewrite a combination someone has
// already adjusted.
//
// Every figure here is summed from the ingredients — see recipes.ts.

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { RecipeResponse } from '@pepta/shared';
import { AppText, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { useRecipes } from './useRecipes';
import { ingredientSummary, recipeAsMealSeed, recipeTotals, savedLabel } from './recipes';

export function RecipesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { openMeal } = useLogSheets();
  const { recipes, starters, hydrated, saveAsMine, remove } = useRecipes();

  const logRecipe = (recipe: RecipeResponse) => {
    Haptics.selectionAsync().catch(() => undefined);
    openMeal(recipeAsMealSeed(recipe));
  };

  const keepStarter = (starter: RecipeResponse) => {
    Haptics.selectionAsync().catch(() => undefined);
    saveAsMine({ name: starter.name, ingredients: starter.ingredients });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
          </Pressable>
          <AppText variant="screenTitle">Recipes</AppText>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              navigation.navigate('NewRecipe');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="New recipe"
            style={({ pressed }) => ({ marginLeft: 'auto', opacity: pressed ? 0.6 : 1 })}
          >
            <AppText variant="caption" style={{ fontWeight: '800', fontSize: 13, color: theme.colors.primary }}>
              New
            </AppText>
          </Pressable>
        </View>

        {!hydrated ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <AppText variant="cardTitle" style={{ fontSize: 15 }}>Yours</AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                {savedLabel(recipes.length)}
              </AppText>
            </View>

            {recipes.length > 0 ? (
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                {recipes.map((recipe, i) => (
                  <RecipeRow
                    key={recipe.id}
                    recipe={recipe}
                    last={i === recipes.length - 1}
                    onOpen={() =>
                      navigation.navigate('RecipeDetail', {
                        recipeId: recipe.id,
                      })
                    }
                    action={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => undefined);
                            remove(recipe.id);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${recipe.name}`}
                          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                          <Icon name="trash" size={16} color={theme.colors.textTertiary} stroke={2.2} />
                        </Pressable>
                        <Pressable
                          onPress={() => logRecipe(recipe)}
                          accessibilityRole="button"
                          accessibilityLabel={`Log ${recipe.name}`}
                          style={({ pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 13,
                            borderRadius: theme.radii.pill,
                            backgroundColor: theme.colors.surfaceAlt,
                            opacity: pressed ? 0.68 : 1,
                          })}
                        >
                          <AppText variant="caption" style={{ fontWeight: '800', fontSize: 11.5 }}>
                            Log
                          </AppText>
                        </Pressable>
                      </View>
                    }
                  />
                ))}
              </Card>
            ) : (
              <Card style={{ marginTop: 10 }}>
                <AppText variant="caption" color="textSecondary" style={{ lineHeight: 17 }}>
                  Combine foods once and log it in a tap after. Start from one below, or build
                  your own with New.
                </AppText>
              </Card>
            )}

            <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 18 }}>
              Starters
            </AppText>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 15 }}>
              High-protein and quick. Open one, adjust the portions, save it as yours.
            </AppText>

            {starters.length > 0 ? (
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                {starters.map((starter, i) => (
                  <RecipeRow
                    key={starter.id}
                    recipe={starter}
                    last={i === starters.length - 1}
                    onOpen={() =>
                      navigation.navigate('RecipeDetail', {
                        recipeId: starter.id,
                      })
                    }
                    action={
                      <Pressable
                        onPress={() => keepStarter(starter)}
                        accessibilityRole="button"
                        accessibilityLabel={`Save ${starter.name} to your recipes`}
                        style={({ pressed }) => ({
                          paddingVertical: 6,
                          paddingHorizontal: 13,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.surfaceAlt,
                          opacity: pressed ? 0.68 : 1,
                        })}
                      >
                        <AppText variant="caption" style={{ fontWeight: '800', fontSize: 11.5 }}>
                          Save
                        </AppText>
                      </Pressable>
                    }
                  />
                ))}
              </Card>
            ) : (
              <Card style={{ marginTop: 10 }}>
                <AppText variant="caption" color="textSecondary" style={{ lineHeight: 17 }}>
                  Starters could not be loaded. Pull down on Home to reconnect, or build your
                  own with New.
                </AppText>
              </Card>
            )}

            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 14, lineHeight: 15 }}>
              Logging a recipe writes the same entry a fresh meal log would — it is a shortcut,
              not a different kind of record.
            </AppText>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function RecipeRow({
  recipe,
  last,
  action,
  onOpen,
}: {
  recipe: RecipeResponse;
  last: boolean;
  action: React.ReactNode;
  onOpen: () => void;
}) {
  const theme = useTheme();
  // Summed here, every render — never read from a stored field.
  const totals = recipeTotals(recipe.ingredients);
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
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          recipe.isStarter
            ? `Open ${recipe.name} starter`
            : `Open ${recipe.name}`
        }
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <AppText variant="cardTitle" style={{ fontSize: 14.5 }} numberOfLines={1}>
          {recipe.name}
        </AppText>
        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>
          {ingredientSummary(recipe.ingredients)}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
          <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.protein }}>
            {totals.protein} g protein
          </AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
            {totals.calories} cal
          </AppText>
          {totals.fiber > 0 ? (
            <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.fiber }}>
              {totals.fiber} g fiber
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {action}
    </View>
  );
}
