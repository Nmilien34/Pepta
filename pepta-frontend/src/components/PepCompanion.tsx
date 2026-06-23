// PepCompanion — a floating Pep above the tab bar (bottom-right) that pops small,
// contextual notes: walks new users through setup, nudges the next action to hit
// their goals, and celebrates wins. Tap Pep to hear the next note. Notes come from
// the pure companionNotes engine (local today; an OpenAI /coach endpoint can feed
// the same shape later — key stays server-side).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Mascot } from './Mascot';
import { Float } from './Float';
import { usePeptaData } from '../context/PeptaDataContext';
import { useLogSheets } from '../context/LogSheetsContext';
import { api } from '../services/api';
import { buildCompanionNotes, type CompanionNote } from '../screens/app/companionNotes';

export function PepCompanion() {
  const theme = useTheme();
  const { home } = usePeptaData();
  const { openQuickLog, openMeal } = useLogSheets();

  const [aiNotes, setAiNotes] = useState<CompanionNote[]>([]);
  const fetchedAi = useRef(false);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const autoShown = useRef(false);
  const bubble = useRef(new Animated.Value(0)).current;

  // Fetch AI notes once (pending /coach → falls back to local on 404/error).
  useEffect(() => {
    if (home && !fetchedAi.current) {
      fetchedAi.current = true;
      api.getCoachNotes().then(setAiNotes).catch(() => undefined);
    }
  }, [home]);

  // Merge AI notes ahead of the local ones, deduped by id.
  const notes = useMemo(() => {
    const local = home ? buildCompanionNotes(home) : [];
    const merged: CompanionNote[] = [];
    const seen = new Set<string>();
    for (const n of [...aiNotes, ...local]) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        merged.push(n);
      }
    }
    return merged;
  }, [home, aiNotes]);

  // Greet once, shortly after home data lands.
  useEffect(() => {
    if (home && notes.length > 0 && !autoShown.current) {
      autoShown.current = true;
      const id = setTimeout(() => {
        setIndex(0);
        setOpen(true);
      }, 900);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [home, notes.length]);

  useEffect(() => {
    Animated.spring(bubble, { toValue: open ? 1 : 0, useNativeDriver: true, bounciness: 8, speed: 14 }).start();
  }, [open, bubble]);

  if (!home || notes.length === 0) return null;
  const note = notes[Math.min(index, notes.length - 1)]!;

  const tapPep = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (!open) {
      setOpen(true);
      return;
    }
    if (index + 1 < notes.length) setIndex(index + 1);
    else {
      setOpen(false);
      setIndex(0);
    }
  };

  const runCta = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setOpen(false);
    if (note.action === 'meal') openMeal();
    else if (note.action) openQuickLog(note.action);
  };

  const bubbleAnim = {
    opacity: bubble,
    transform: [
      { scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      { translateY: bubble.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: 100, alignItems: 'flex-end' }}>
      {open ? (
        <Animated.View
          style={[
            { maxWidth: 252, marginBottom: 10, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 0.5, borderColor: theme.colors.border, paddingVertical: 12, paddingHorizontal: 13 },
            theme.shadows.card,
            bubbleAnim,
          ]}
        >
          <Pressable onPress={() => setOpen(false)} hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}>
            <Ionicons name="close" size={14} color={theme.colors.textTertiary} />
          </Pressable>
          <AppText variant="bodyStrong" style={{ fontWeight: '700', paddingRight: 12, lineHeight: 20 }}>
            {note.emoji ? `${note.emoji}  ` : ''}
            {note.text}
          </AppText>
          {note.action && note.cta ? (
            <Pressable onPress={runCta} style={{ marginTop: 11, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFEBFF', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 }}>
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                {note.cta}
              </AppText>
              <Ionicons name="arrow-forward" size={13} color={theme.colors.primary} />
            </Pressable>
          ) : null}
          {notes.length > 1 ? (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 8, fontSize: 10 }}>
              {note.tone === 'win' ? 'Tap Pep for what’s next' : 'Tap Pep for the next nudge'}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}

      <Pressable onPress={tapPep} accessibilityRole="button" accessibilityLabel="Pep — tips and next steps">
        <View style={[{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, theme.shadows.card]}>
          <Float>
            <Mascot pose="idle" size={44} />
          </Float>
        </View>
        {!open ? (
          <View style={{ position: 'absolute', top: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.surface }} />
        ) : null}
      </Pressable>
    </View>
  );
}
