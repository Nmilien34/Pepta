import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native";
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { RecipeResponse } from "@pepta/shared";
import { AppText, Card } from "../../components";
import { Icon } from "../../components/Icon";
import { useLogSheets } from "../../context/LogSheetsContext";
import { api } from "../../services/api";
import { useTheme } from "../../theme";
import { recipeAsMealSeed, recipeTotals } from "./recipes";

export type RecipeDetailParams = { recipeId: string };

export function RecipeDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route =
    useRoute<RouteProp<{ RecipeDetail: RecipeDetailParams }, "RecipeDetail">>();
  const { openMeal } = useLogSheets();
  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const recipeId = route.params?.recipeId;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setRecipe(null);
    setPhotoFailed(false);
    if (!recipeId) {
      setLoading(false);
      setFailed(true);
      return () => {
        alive = false;
      };
    }
    api
      .getRecipe(recipeId)
      .then((value) => {
        if (alive) setRecipe(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [recipeId]);

  const totals = recipe ? recipeTotals(recipe.ingredients) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 6,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon
              name="chevron-back"
              size={25}
              color={theme.colors.textSecondary}
              stroke={2.4}
            />
          </Pressable>
          <AppText variant="screenTitle">Recipe</AppText>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : recipe && totals ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: insets.bottom + 28,
            }}
          >
            {recipe.photoUrl && !photoFailed ? (
              <View
                style={{
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  overflow: "hidden",
                  ...theme.shadows.card,
                }}
              >
                <Image
                  accessibilityLabel={`${recipe.name} photo`}
                  source={{ uri: recipe.photoUrl }}
                  resizeMode="cover"
                  onError={() => setPhotoFailed(true)}
                  style={{ width: "100%", aspectRatio: 4 / 3 }}
                />
              </View>
            ) : null}

            <View style={{ marginTop: recipe.photoUrl && !photoFailed ? 16 : 6 }}>
              <AppText variant="screenTitle" style={{ fontSize: 24, lineHeight: 29 }}>
                {recipe.name}
              </AppText>
              <AppText
                variant="caption"
                color="textTertiary"
                style={{ fontSize: 10.5, marginTop: 4 }}
              >
                {recipe.ingredients.length} ingredient
                {recipe.ingredients.length === 1 ? "" : "s"}
              </AppText>
            </View>

            <Card style={{ marginTop: 14 }}>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                Per recipe
              </AppText>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 7 }}>
                <AppText
                  variant="cardTitle"
                  style={{ fontSize: 16, color: theme.colors.protein }}
                >
                  {totals.protein} g protein
                </AppText>
                <AppText variant="cardTitle" style={{ fontSize: 16 }}>
                  {totals.calories} cal
                </AppText>
              </View>
              {totals.fiber > 0 ? (
                <AppText
                  variant="caption"
                  style={{
                    fontWeight: "700",
                    color: theme.colors.fiber,
                    marginTop: 5,
                  }}
                >
                  {totals.fiber} g fiber
                </AppText>
              ) : null}
            </Card>

            <Card style={{ marginTop: 12, paddingVertical: 0 }}>
              {recipe.ingredients.map((ingredient, index) => (
                <View
                  key={`${ingredient.name}-${index}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    borderBottomWidth:
                      index === recipe.ingredients.length - 1 ? 0 : 0.5,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="cardTitle" style={{ fontSize: 14 }}>
                      {ingredient.name}
                    </AppText>
                    {ingredient.amount ? (
                      <AppText
                        variant="caption"
                        color="textTertiary"
                        style={{ fontSize: 10.5, marginTop: 1 }}
                      >
                        {ingredient.amount}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                    {Math.round(ingredient.protein)}g · {Math.round(ingredient.calories)} cal
                  </AppText>
                </View>
              ))}
            </Card>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                openMeal(recipeAsMealSeed(recipe));
              }}
              accessibilityRole="button"
              accessibilityLabel={`Log ${recipe.name}`}
              style={({ pressed }) => ({
                marginTop: 14,
                minHeight: 48,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <AppText variant="bodyStrong" style={{ color: theme.colors.surface }}>
                Log recipe
              </AppText>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <AppText variant="caption" color="textSecondary">
              {failed ? "Recipe could not be loaded." : "Recipe not found."}
            </AppText>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
