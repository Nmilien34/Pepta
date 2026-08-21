// Ask Pep — the full-screen chat, owned by a provider so ANY screen can open
// it (same pattern as LogSheetsContext owning the log sheets). PepCompanion's
// floating bubble opens it when its notes run out; the peptide library opens
// it seeded with a question about the entry you're reading.
//
// A seed PRE-FILLS the composer rather than auto-sending: the user can edit
// it, and — importantly — nothing leaves the device until they hit send, so
// the AI-consent gate still fires on a real user action.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
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
import { AppText } from '../components/AppText';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { useTheme } from '../theme';
import { api } from '../services/api';
import { hasAIDataSharingConsent, saveAIDataSharingConsent } from '../services/aiConsent';

const PEP_CHAT_GREETING =
  "I'm Pep. Ask me about your levels, protein, meals, weight trend, or what to log next.";

// Tracker questions first (that's what Pepta is), then a compound question now
// that the library exists.
const PEP_CHAT_SUGGESTIONS = [
  'What should I focus on today?',
  'How are my medication levels looking?',
  'What can I eat to hit my protein?',
  'Why did my weight trend change?',
];

interface PepChatContextValue {
  /** Open the chat. `seed` pre-fills the composer (never auto-sends). */
  askPep(seed?: string): void;
  chatOpen: boolean;
}

const PepChatContext = createContext<PepChatContextValue | undefined>(undefined);

export function PepChatProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<PepChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!chatOpen) return undefined;
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(id);
  }, [chatOpen, chatMessages.length, chatPending, consentPrompt]);

  const askPep = (seed?: string) => {
    setChatError(null);
    if (seed) setChatInput(seed);
    setChatOpen(true);
  };

  const closePepChat = () => {
    setChatOpen(false);
    setChatInput('');
    setChatError(null);
    setChatPending(false);
    setConsentPrompt(false);
    setPendingQuestion(null);
  };

  /** Sends a transcript exactly as given — it is already what Pep should see. */
  const sendChat = async (messages: PepChatMessage[]) => {
    setChatMessages(messages);
    setChatInput('');
    setChatPending(true);
    setChatError(null);
    try {
      const response = await api.coachChat(messages);
      const pepMessage: PepChatMessage = { role: 'pep', text: response.reply };
      setChatMessages([...messages, pepMessage].slice(-16));
    } catch {
      setChatError("Pep couldn't answer right now. Try again in a moment.");
    } finally {
      setChatPending(false);
    }
  };

  const sendConsentedChat = async (question: string) => {
    const userMessage: PepChatMessage = { role: 'user', text: question };
    await sendChat([...chatMessages, userMessage].slice(-16));
  };

  /**
   * Retry after a failed answer.
   *
   * The question is ALREADY in the transcript — it is added before the request
   * goes out, and a failure leaves it there. Re-sending it through the normal
   * path appended it a second time, so the user saw their own question twice
   * (three times after a second retry) and the model was asked to answer a
   * conversation that repeated itself.
   */
  const retryChatReply = () => {
    if (chatPending) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role !== 'user') return;
    Haptics.selectionAsync().catch(() => undefined);
    void sendChat(chatMessages);
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

  const chatTopInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 0);
  const chatBottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 22 : 0);

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

  const value = useMemo<PepChatContextValue>(() => ({ askPep, chatOpen }), [chatOpen]);

  return (
    <PepChatContext.Provider value={value}>
      {children}

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
                    <Pressable
                      onPress={retryChatReply}
                      accessibilityRole="button"
                      accessibilityLabel="Retry"
                      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
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
    </PepChatContext.Provider>
  );
}

export function usePepChat(): PepChatContextValue {
  const value = useContext(PepChatContext);
  if (!value) throw new Error('usePepChat must be used within PepChatProvider');
  return value;
}
