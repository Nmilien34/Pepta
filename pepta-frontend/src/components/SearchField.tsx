// SearchField — a themed search input (icon + text + clear). Reused by the
// medication picker and, later, meal search.

import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export interface SearchFieldProps {
  value: string;
  onChangeText(text: string): void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchField({ value, onChangeText, placeholder = 'Search', autoFocus }: SearchFieldProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        height: 48,
        paddingHorizontal: theme.spacing.md,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        style={[
          theme.typography.body,
          { flex: 1, color: theme.colors.textPrimary, paddingVertical: 0 },
        ]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={theme.sizes.hitSlop} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}
