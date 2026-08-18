// New recipe — start one (design-lab frame "Recipes · start one").
//
// "All three routes already exist in MealLogSheet (scan, voice, search).
// Nothing new has to be built to identify food — only to keep the result."
// So this screen does not identify anything: it hands off to the sheet that
// already can, in the mode the user picked.
//
// Keeping the result is the piece that is genuinely new, and it is the sheet's
// commit that has to do it — see LogSheetsContext.

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';

interface Route {
  key: 'scan' | 'voice' | 'search';
  icon: string;
  title: string;
  detail: string;
  example?: string;
}

const ROUTES: readonly Route[] = [
  { key: 'scan', icon: 'camera-outline', title: 'Scan the plate', detail: 'Point at your food or a label' },
  {
    key: 'voice',
    icon: 'mic',
    title: 'Say it or type it',
    detail: 'One sentence, however you say it',
    example: '“two eggs, oats and a scoop of whey”',
  },
  { key: 'search', icon: 'search', title: 'Search foods', detail: 'Add items one at a time' },
];

export function NewRecipeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { openMeal } = useLogSheets();

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
          <AppText variant="screenTitle">New recipe</AppText>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 10, lineHeight: 17 }}>
            Start any way you like — you can mix them.
          </AppText>

          <Card style={{ marginTop: 12, paddingVertical: 0 }}>
            {ROUTES.map((r, i) => (
              <Pressable
                key={r.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  // Back first, so dismissing the sheet returns to the list
                  // rather than to a chooser the user is done with.
                  navigation.goBack();
                  // The real feature, not the chooser: same camera, same
                  // model, same consent gate as logging a meal. Only the
                  // result differs — it is kept rather than logged.
                  openMeal(null, { keepAsRecipe: true, start: r.key });
                }}
                accessibilityRole="button"
                accessibilityLabel={r.title}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  borderBottomWidth: i === ROUTES.length - 1 ? 0 : 0.5,
                  borderBottomColor: theme.colors.border,
                  opacity: pressed ? 0.68 : 1,
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={r.icon} size={19} color={theme.colors.primary} stroke={2.2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="cardTitle" style={{ fontSize: 14 }}>
                    {r.title}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                    {r.detail}
                  </AppText>
                  {r.example ? (
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 3, fontStyle: 'italic' }}>
                      {r.example}
                    </AppText>
                  ) : null}
                </View>
                <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} stroke={2.2} />
              </Pressable>
            ))}
          </Card>

          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 14, lineHeight: 15 }}>
            These are the same three ways you already log a meal. A recipe just keeps the
            result, so the next one is a single tap.
          </AppText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
