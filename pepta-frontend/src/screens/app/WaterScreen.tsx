// Water — the hydration screen (design-lab "Water · log & hydration").
//
// A SCREEN, NOT A MODAL, and reached by tapping the glass on Home rather than
// by hunting the stepper. The stepper on the Home card is for the ±8 oz you
// already know you drank; this is for everything else — a different vessel, a
// bottle with electrolytes in it, an amount you want to type.
//
// The order answers two questions in the order people ask them: how much
// (Quick add, by vessel) and then what (Hydration examples, by electrolyte).
// On a GLP-1 the second one matters more than it looks: appetite loss takes
// sodium and potassium out along with the food, and plain water alone is
// often the thing that is not working.
//
// Everything here writes through the same bumpWater the Home stepper uses, so
// a tap on this screen and a tap on Home are the same log.

import React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Card, WaterCup } from '../../components';
import { Icon } from '../../components/Icon';
import { VesselIcon } from '../../components/VesselIcon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { buildHomeView } from './homeView';
import { DRINK_PHOTOS } from './nutrientPhotos';
import { HYDRATION_EXAMPLES, goalLine, ouncesLabel, quickAddVessels } from './hydration';

const STEP_OZ = 8;

export function WaterScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { home, bumpWater } = usePeptaData();
  const { openQuickLog } = useLogSheets();

  const stat = home ? buildHomeView(home).water : null;
  const current = stat?.current ?? 0;
  const target = stat?.target ?? null;

  const add = (oz: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    bumpWater(oz);
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
          {/* Chevron then title — the design carries no droplet here, and the
              glass right below already says what the screen is about. */}
          <AppText variant="screenTitle">Water</AppText>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* The glass, and the ±8 that is already on Home. */}
          <View style={{ paddingHorizontal: 20 }}>
            <Card style={{ marginTop: 12, alignItems: 'center' }}>
              <WaterCup value={current} target={target} color={theme.colors.water} size={132} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <StepButton icon="remove" onPress={() => add(-STEP_OZ)} label={`Remove ${STEP_OZ} ounces`} />
                <AppText variant="cardTitle" style={{ fontSize: 15, minWidth: 62, textAlign: 'center' }}>
                  {ouncesLabel(STEP_OZ)}
                </AppText>
                <StepButton icon="add" onPress={() => add(STEP_OZ)} label={`Add ${STEP_OZ} ounces`} />
              </View>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 8 }}>
                {goalLine(target)}
              </AppText>
            </Card>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 16 }}>
            <AppText variant="cardTitle" style={{ fontSize: 15 }}>Quick add</AppText>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>swipe for more</AppText>
          </View>

          {/* Vessels, small to large. Tap the one in your hand. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            {quickAddVessels(target, current).map((vessel) => (
              <Pressable
                key={vessel.key}
                onPress={() => {
                  if (vessel.ounces == null) {
                    // "Type it" — the existing water sheet already takes an
                    // arbitrary amount, so this opens that rather than growing
                    // a second numeric entry.
                    Haptics.selectionAsync().catch(() => undefined);
                    openQuickLog('water');
                    return;
                  }
                  add(vessel.ounces);
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  vessel.ounces == null ? 'Type a custom amount' : `${vessel.name}, add ${vessel.ounces} ounces`
                }
                style={({ pressed }) => ({
                  width: 70,
                  alignItems: 'center',
                  gap: 6,
                  paddingTop: 11,
                  paddingBottom: 9,
                  paddingHorizontal: 4,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.62 : 1,
                })}
              >
                <VesselIcon vessel={vessel.icon} water={theme.colors.water} />
                <AppText variant="caption" style={{ fontSize: 11.5, fontWeight: '800' }}>
                  {vessel.label}
                </AppText>
                <AppText variant="caption" color="textTertiary" align="center" style={{ fontSize: 9, lineHeight: 10.5 }}>
                  {vessel.name}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ paddingHorizontal: 20 }}>
            <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
              Hydration examples
            </AppText>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 15 }}>
              Electrolytes count too — sodium and potassium are the ones people run low on.
            </AppText>

            <Card style={{ marginTop: 10, paddingVertical: 0 }}>
              {HYDRATION_EXAMPLES.map((drink, i, all) => (
                <Pressable
                  key={drink.key}
                  onPress={() => add(drink.ounces)}
                  accessibilityRole="button"
                  accessibilityLabel={`${drink.brand}, ${drink.volume}. ${drink.fact}. Adds ${drink.ounces} ounces`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    borderBottomWidth: i === all.length - 1 ? 0 : 0.5,
                    borderBottomColor: theme.colors.border,
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  {/* White behind the photo: these are packshots cut out on
                      white, and the warm card would show as a halo. */}
                  <View style={{ width: 50, height: 50, borderRadius: 15, overflow: 'hidden', backgroundColor: '#fff' }}>
                    <Image source={DRINK_PHOTOS[drink.key]} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="cardTitle" style={{ fontSize: 14.5 }} numberOfLines={1}>
                      {drink.brand}
                    </AppText>
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                      {drink.name}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 9, marginTop: 5 }}>
                      <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.water }}>
                        {drink.volume}
                      </AppText>
                      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                        {drink.fact}
                      </AppText>
                    </View>
                  </View>
                  <Icon name="add" size={17} color={theme.colors.water} stroke={2.5} />
                </Pressable>
              ))}
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StepButton({ icon, onPress, label }: { icon: string; onPress(): void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: theme.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} size={17} color={theme.colors.water} stroke={2.6} />
    </Pressable>
  );
}
