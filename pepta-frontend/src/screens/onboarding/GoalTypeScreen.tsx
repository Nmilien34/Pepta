// Onboarding — Goal type (T11). Single-select → profile.goalType (a real
// @pepta/shared field). A spoken answer: tap → sent bubble → auto-advance.
//
// "Something else" holds the turn open with a text field instead of advancing,
// the same mechanism as "Pick exact time" on the shot-time turn. What they type
// is kept verbatim as `goalNote`; it never feeds the nutrition maths, because a
// sentence cannot yield a protein multiplier or a calorie deficit. The
// computable goalType is derived from their start and goal weights two screens
// later — see goalIntent.ts.

import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { UserProfileInput } from '@pepta/shared';
import { ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';
import { normalizeGoalNote } from './goalIntent';

export type GoalType = UserProfileInput['goalType'];

/** Local to this screen: 'other' is a UI branch, never a stored goalType. */
type GoalChoice = GoalType | 'other';

export interface GoalAnswer {
  /** Absent when they wrote their own — derived from weights at payload time. */
  goalType?: GoalType;
  /** Their words, when they wrote their own. */
  goalNote?: string;
}

export interface GoalTypeScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: GoalAnswer): void;
}

/** Matches the schema cap so the field cannot accept what the API would reject. */
const GOAL_NOTE_MAX = 80;

export function GoalTypeScreen({ progress, onBack, context, onAnswer }: GoalTypeScreenProps) {
  const [holding, setHolding] = React.useState(false);
  const [note, setNote] = React.useState('');

  return (
    <ConvoScreen<GoalChoice>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What’s the goal?"
      options={[
        { label: 'Lose fat', sub: 'and keep the muscle', value: 'lose_fat' },
        { label: 'Build & recomp', sub: 'trade fat for lean mass', value: 'recomp' },
        { label: 'Maintain', sub: 'hold the line', value: 'maintain' },
        { label: 'Something else', sub: 'tell me in your words', value: 'other', holds: true },
      ]}
      value={holding ? 'other' : undefined}
      onSelect={() => setHolding(true)}
      onAnswer={(choice) => {
        if (choice !== 'other') onAnswer({ goalType: choice });
      }}
      footer={
        holding ? (
          // Continue stays live on an empty field: this is a flourish, never a
          // gate. Skipping it just means no note, and the plan is unaffected —
          // it was always going to be computed from their weights.
          <ConvoButton
            label="Continue"
            onPress={() => onAnswer({ goalNote: normalizeGoalNote(note) })}
          />
        ) : undefined
      }
    >
      {holding ? (
        <View style={styles.wrap}>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. get strong enough to hike again"
            placeholderTextColor={convo.faint}
            maxLength={GOAL_NOTE_MAX}
            autoFocus
            multiline
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Your goal, in your own words"
          />
        </View>
      ) : null}
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 22 },
  input: {
    borderWidth: 1,
    borderColor: convo.chipBorder,
    borderRadius: 16,
    backgroundColor: convo.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 88,
    textAlignVertical: 'top',
    fontFamily: typography.fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: convo.ink,
  },
});
