// PepCompanion - a floating Pep above the tab bar. It starts as small,
// contextual nudges; after the user has tapped through the current notes, Pep
// opens into a full chat surface grounded in the user's Pepta data.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PepChatMessage } from '@pepta/shared';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Mascot } from './Mascot';
import { Float } from './Float';
import { usePeptaData } from '../context/PeptaDataContext';
import { useLogSheets } from '../context/LogSheetsContext';
import { api } from '../services/api';
import { hasAIDataSharingConsent, saveAIDataSharingConsent } from '../services/aiConsent';
import { buildCompanionNotes, type CompanionNote } from '../screens/app/companionNotes';

const PEP_CHAT_GREETING =
  "I'm Pep. Ask me about your levels, protein, meals, weight trend, or what to log next.";

const PEP_CHAT_SUGGESTIONS = [
  'What should I focus on today?',
  'How are my medication levels looking?',
  'What can I eat to hit my protein?',
  'Why did my weight trend change?',
];

export function PepCompanion() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { home } = usePeptaData();
  const { openQuickLog, openMeal } = useLogSheets();

  const [aiNotes, setAiNotes] = useState<CompanionNote[]>([]);
  const fetchedAi = useRef(false);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<PepChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
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

  useEffect(() => {
    if (!chatOpen) return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(id);
  }, [chatOpen, chatMessages.length, chatPending, consentPrompt]);

  if (!home || notes.length === 0) return null;
  const note = notes[Math.min(index, notes.length - 1)]!;
  const chatTopInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 0);
  const chatBottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 22 : 0);

  const openPepChat = () => {
    openRef.current = false;
    setOpen(false);
    setChatOpen(true);
    setChatError(null);
  };

  const closePepChat = () => {
    setChatOpen(false);
    setChatInput('');
    setChatError(null);
    setChatPending(false);
    setConsentPrompt(false);
    setPendingQuestion(null);
    indexRef.current = 0;
    setIndex(0);
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

  const sendConsentedChat = async (question: string) => {
    const userMessage: PepChatMessage = { role: 'user', text: question };
    const nextMessages: PepChatMessage[] = [...chatMessages, userMessage].slice(-16);
    setChatMessages(nextMessages);
    setChatInput('');
    setChatPending(true);
    setChatError(null);
    try {
      const response = await api.coachChat(nextMessages);
      const pepMessage: PepChatMessage = { role: 'pep', text: response.reply };
      setChatMessages([...nextMessages, pepMessage].slice(-16));
    } catch {
      setChatError("Pep couldn't answer right now. Try again in a moment.");
    } finally {
      setChatPending(false);
    }
  };

  const requestChatReply = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || chatPending) return;
    Haptics.selectionAsync().catch(() => undefined);
    const consented = await hasAIDataSharingConsent().catch(() => false);
    if (!consented) {
      setPendingQuestion(question);
      setConsentPrompt(true);
      setChatError(null);
      return;
    }
    await sendConsentedChat(question);
  };

  const continueWithAIChat = async () => {
    const question = pendingQuestion;
    await saveAIDataSharingConsent();
    setConsentPrompt(false);
    setPendingQuestion(null);
    if (question) await sendConsentedChat(question);
  };

  const bubbleAnim = {
    opacity: bubble,
    transform: [
      { scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      { translateY: bubble.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  };

  const renderChatBubble = (message: PepChatMessage, position: number) => {
    const fromUser = message.role === 'user';
    return (
      <View
        key={`${message.role}-${position}-${message.text}`}
        style={{
          alignSelf: fromUser ? 'flex-end' : 'flex-start',
          maxWidth: '84%',
          backgroundColor: fromUser ? theme.colors.primary : theme.colors.surface,
          borderColor: fromUser ? theme.colors.primary : theme.colors.border,
          borderWidth: 0.5,
          borderRadius: 18,
          borderBottomRightRadius: fromUser ? 6 : 18,
          borderBottomLeftRadius: fromUser ? 18 : 6,
          paddingVertical: 11,
          paddingHorizontal: 13,
          marginBottom: 10,
        }}
      >
        <AppText variant="body" color={fromUser ? 'onPrimary' : 'textPrimary'} style={{ lineHeight: 20 }}>
          {message.text}
        </AppText>
      </View>
    );
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

      <Pressable onPress={tapPep} accessibilityRole="button" accessibilityLabel="Pep — tips and next steps">
        <View style={[{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 3 }, theme.shadows.card]}>
          <Float amplitude={3} duration={3200}>
            <Mascot pose="idle" size={42} />
          </Float>
        </View>
        {!open ? (
          <View style={{ position: 'absolute', top: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.surface }} />
        ) : null}
      </Pressable>

      <Modal visible={chatOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={closePepChat}>
        <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: chatTopInset + 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Mascot pose="idle" size={30} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontWeight: '800', fontSize: 18 }}>
                  Ask Pep
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  GLP-1 tracker coach
                </AppText>
              </View>
              <Pressable onPress={closePepChat} accessibilityRole="button" accessibilityLabel="Close Ask Pep" hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={19} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 20 }}
              style={{ flex: 1 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, marginBottom: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 0.5, borderColor: theme.colors.border }}>
                  <Mascot pose="idle" size={24} />
                </View>
                <View style={{ maxWidth: '82%', backgroundColor: theme.colors.surface, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 0.5, borderColor: theme.colors.border, paddingVertical: 11, paddingHorizontal: 13 }}>
                  <AppText variant="body" style={{ lineHeight: 20 }}>
                    {PEP_CHAT_GREETING}
                  </AppText>
                </View>
              </View>

              {chatMessages.map(renderChatBubble)}

              {chatPending ? (
                <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <AppText variant="caption" color="textSecondary">
                    Pep is thinking
                  </AppText>
                </View>
              ) : null}

              {chatError ? (
                <View style={{ backgroundColor: '#FFF2F2', borderWidth: 0.5, borderColor: '#FFD1D1', borderRadius: 16, padding: 12, marginBottom: 12 }}>
                  <AppText variant="caption" color="danger" style={{ fontWeight: '700', marginBottom: 7 }}>
                    {chatError}
                  </AppText>
                  {chatMessages.length > 0 ? (
                    <Pressable onPress={() => requestChatReply(chatMessages[chatMessages.length - 1]?.text ?? '')} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="refresh" size={14} color={theme.colors.danger} />
                      <AppText variant="caption" color="danger" style={{ fontWeight: '700' }}>
                        Retry
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {chatMessages.length === 0 && !consentPrompt ? (
                <View style={{ marginTop: 8 }}>
                  <AppText variant="caption" color="textSecondary" uppercase style={{ fontWeight: '800', marginBottom: 9 }}>
                    Most asked
                  </AppText>
                  <View style={{ gap: 8 }}>
                    {PEP_CHAT_SUGGESTIONS.map((question) => (
                      <Pressable
                        key={question}
                        onPress={() => requestChatReply(question)}
                        style={{ minHeight: 44, borderRadius: 14, borderWidth: 0.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 }}
                      >
                        <Icon name="sparkles" size={16} color={theme.colors.primary} />
                        <AppText variant="bodyStrong" style={{ flex: 1, lineHeight: 19 }}>
                          {question}
                        </AppText>
                        <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {consentPrompt ? (
                <View style={{ marginTop: 10, borderRadius: 18, borderWidth: 0.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Icon name="shield-check" size={18} color={theme.colors.primary} />
                    <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                      AI chat uses OpenAI
                    </AppText>
                  </View>
                  <AppText variant="body" color="textSecondary" style={{ lineHeight: 20 }}>
                    Pepta will send your chat message and relevant tracker context to Pepta's backend and OpenAI to generate Pep's reply.
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 13 }}>
                    <Pressable onPress={() => { setConsentPrompt(false); setPendingQuestion(null); }} style={{ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <AppText variant="bodyStrong" color="textSecondary">
                        Not now
                      </AppText>
                    </Pressable>
                    <Pressable onPress={continueWithAIChat} style={{ flex: 1.25, minHeight: 44, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
                      <AppText variant="bodyStrong" color="onPrimary" align="center">
                        Continue with AI chat
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <AppText variant="caption" color="textTertiary" style={{ marginTop: 16, lineHeight: 17 }}>
                Pep can help explain your logs, but it does not provide medical advice. Ask your prescriber about dose changes, symptoms, or medication safety.
              </AppText>
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 12, paddingTop: 12, paddingBottom: chatBottomInset + 12, borderTopWidth: 0.5, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask Pep anything about your logs"
                placeholderTextColor={theme.colors.textTertiary}
                editable={!chatPending && !consentPrompt}
                multiline
                maxLength={600}
                returnKeyType="send"
                onSubmitEditing={() => requestChatReply(chatInput)}
                style={{ flex: 1, maxHeight: 104, minHeight: 44, borderRadius: 16, borderWidth: 0.5, borderColor: theme.colors.border, backgroundColor: theme.colors.bg, color: theme.colors.textPrimary, paddingHorizontal: 13, paddingVertical: 11, fontSize: 16, lineHeight: 20 }}
              />
              <Pressable
                onPress={() => requestChatReply(chatInput)}
                disabled={!chatInput.trim() || chatPending || consentPrompt}
                accessibilityRole="button"
                accessibilityLabel="Send Pep message"
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: !chatInput.trim() || chatPending || consentPrompt ? theme.colors.surfaceAlt : theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Icon name="arrow-forward" size={19} color={!chatInput.trim() || chatPending || consentPrompt ? theme.colors.textTertiary : theme.colors.onPrimary} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
