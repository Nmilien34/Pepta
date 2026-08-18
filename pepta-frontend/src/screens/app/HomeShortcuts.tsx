// The Home shortcuts grid — four photo tiles, 2×2, no section title.
//
// PHOTOS, NOT ICONS. An icon of a leaf and an icon of a drop are the same
// grey glyph at a glance; a photo of an avocado is recognised before it is
// read. That was the whole point of the iteration — and why the tiles carry no
// section header: four photographs do not need a label saying "shortcuts".
//
// These are doors, not demands. Nothing here asks for input; each one opens a
// surface the user might want.

import React from 'react';
import { Image, Pressable, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '../../components';
import { useTheme } from '../../theme';

export interface Shortcut {
  key: string;
  label: string;
  photo: ImageSourcePropType;
  onPress(): void;
}

function Tile({ shortcut }: { shortcut: Shortcut }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        shortcut.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={shortcut.label}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.72 : 1 })}
    >
      <Card style={{ padding: 11, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
          <Image source={shortcut.photo} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        </View>
        <AppText variant="cardTitle" style={{ fontSize: 13, minWidth: 0 }} numberOfLines={1}>
          {shortcut.label}
        </AppText>
      </Card>
    </Pressable>
  );
}

/**
 * Rows of two. An odd count leaves the last tile half-width rather than
 * stretching it, so the grid still reads as a grid while a destination is
 * missing.
 */
export function HomeShortcuts({ shortcuts }: { shortcuts: readonly Shortcut[] }) {
  const theme = useTheme();
  const rows: Shortcut[][] = [];
  for (let i = 0; i < shortcuts.length; i += 2) rows.push(shortcuts.slice(i, i + 2));

  return (
    <View style={{ gap: 10 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
          {row.map((s) => (
            <Tile key={s.key} shortcut={s} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}
