// "Yours" — the block at the foot of the examples screens.
//
// The lists above are Pepta's suggestions; this is the door to the user's own.
// It carries a live count rather than a fixed label, because "3 saved · what
// you actually eat" is an invitation once it is true and a lie before it is.

import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';

export interface YoursBlockProps {
  onFavourites: () => void;
  /** Omitted on the water screen — recipes are food. */
  onRecipes?: () => void;
  /** How many are saved on the side this screen belongs to. */
  saved: number;
  /** "eat" or "drink" — completes "what you actually …". */
  noun: string;
}

export function YoursBlock({ onFavourites, onRecipes, saved, noun }: YoursBlockProps) {
  const theme = useTheme();
  return (
    <>
      <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 18 }}>
        Yours
      </AppText>
      <Card style={{ marginTop: 10, paddingVertical: 0 }}>
        {onRecipes ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onRecipes();
            }}
            accessibilityRole="button"
            accessibilityLabel="Build a recipe"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 0.5,
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
              <Icon name="restaurant" size={19} color={theme.colors.primary} stroke={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="cardTitle" style={{ fontSize: 14 }}>
                Build a recipe
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                Combine foods once, log it in a tap after
              </AppText>
            </View>
            <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} stroke={2.2} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onFavourites();
          }}
          accessibilityRole="button"
          accessibilityLabel="Favourites"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
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
            <Icon name="star" size={19} color={theme.colors.warning} stroke={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="cardTitle" style={{ fontSize: 14 }}>
              Favourites
            </AppText>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
              {saved > 0
                ? `${saved} saved · what you actually ${noun}`
                : `Star anything to keep it here`}
            </AppText>
          </View>
          <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} stroke={2.2} />
        </Pressable>
      </Card>
    </>
  );
}
