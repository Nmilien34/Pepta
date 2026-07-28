// PepCompanion - a floating Pep above the tab bar. It starts as small,
// contextual nudges; after the user has tapped through the current notes, Pep
// hands off to the full chat surface, which lives in PepChatProvider so any
// screen (e.g. the peptide library) can open it too.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { LivingMascot } from './LivingMascot';
import { useSpeechHaptic } from './useSpeechHaptic';
import { buildPepMood } from '../screens/app/pepMood';
import { resolveCompanionName } from '../utils/companion';
import { activeCycleOf, patternOf, todayCycleStatus } from '../screens/app/scheduleView';
import { usePeptaData } from '../context/PeptaDataContext';
import { useLogSheets } from '../context/LogSheetsContext';
import { usePepChat } from '../context/PepChatContext';
import { api } from '../services/api';
import { hasAIDataSharingConsent } from '../services/aiConsent';
import { buildCompanionNotes, type CompanionNote } from '../screens/app/companionNotes';

export function PepCompanion() {
  const theme = useTheme();
  const { home, cycles } = usePeptaData();
  const companionName = resolveCompanionName(home?.profile?.companionName);
  const { openQuickLog, openMeal } = useLogSheets();
  const { askPep } = usePepChat();

  const [aiNotes, setAiNotes] = useState<CompanionNote[]>([]);
  const fetchedAi = useRef(false);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const indexRef = useRef(index);
  const autoShown = useRef(false);
  const bubble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Fetch AI notes once (pending /coach -> falls back to local on 404/error).
  useEffect(() => {
    if (home && !fetchedAi.current) {
      fetchedAi.current = true;
      let active = true;
      hasAIDataSharingConsent()
        .then((consented) => {
          if (!consented || !active) return;
          api.getCoachNotes().then((notes) => {
            if (active) setAiNotes(notes);
          }).catch(() => undefined);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }
    return undefined;
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
        indexRef.current = 0;
        openRef.current = true;
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

  // Same cycle derivation Track uses, from the same shared context — so Pep
  // and the Track card can never disagree about whether today is a rest day.
  const restingToday = useMemo(() => {
    const pattern = patternOf(activeCycleOf(cycles));
    return todayCycleStatus(pattern, new Date())?.phase === 'rest';
  }, [cycles]);

  // Pep's face tracks the medication curve, not the user's compliance.
  const mood = useMemo(
    () => buildPepMood({ level: home?.medicationLevels?.[0] ?? null, resting: restingToday }),
    [home?.medicationLevels, restingToday],
  );

  // The companion's own haptic voice — fires when the spoken LINE changes.
  const spokenLine = open ? (notes[Math.min(index, notes.length - 1)]?.text ?? null) : null;
  useSpeechHaptic(spokenLine, open);

  if (!home || notes.length === 0) return null;
  const note = notes[Math.min(index, notes.length - 1)]!;

  const openPepChat = () => {
    openRef.current = false;
    setOpen(false);
    indexRef.current = 0;
    setIndex(0);
    askPep();
  };

  const tapPep = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (!openRef.current) {
      openRef.current = true;
      setOpen(true);
      return;
    }
    if (indexRef.current + 1 < notes.length) {
      const nextIndex = indexRef.current + 1;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      return;
    }
    openPepChat();
  };

  const runCta = () => {
    Haptics.selectionAsync().catch(() => undefined);
    openRef.current = false;
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
          <Pressable onPress={() => { openRef.current = false; setOpen(false); }} hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}>
            <Icon name="close" size={14} color={theme.colors.textTertiary} />
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
              <Icon name="arrow-forward" size={13} color={theme.colors.primary} />
            </Pressable>
          ) : null}
          {notes.length > 1 ? (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 8, fontSize: 10 }}>
              {index + 1 < notes.length ? 'Tap Pep for the next nudge' : 'Tap Pep to ask a follow-up'}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}

      <Pressable onPress={tapPep} accessibilityRole="button" accessibilityLabel={`${companionName} — tips and next steps`}>
        <View style={[{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 3 }, theme.shadows.card]}>
          <LivingMascot pose={mood.pose} size={42} bobSeconds={mood.bobSeconds} />
        </View>
        {!open ? (
          <View style={{ position: 'absolute', top: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.surface }} />
        ) : null}
      </Pressable>

    </View>
  );
}
