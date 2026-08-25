// Onboarding — sex + birthday on ONE turn (merged 2026-08-25 from the former
// `sexGender` (T12) and `birthday` (T13) steps).
//
// WHY THEY MERGED. Both existed for the same reason and said so separately:
// "Sex is only used to estimate your calorie needs" and "Age tunes your
// calorie and protein targets." Two screens apologising for the same thing,
// back to back, in the flow's thinnest stretch — Act 3 ran eight asks against
// a single give. One screen, two fields, one justification.
//
// AND IT REPAIRS A BROKEN INVARIANT. The flow guarantees no more than 4 asks
// between payoffs, but that was only ever measured on the dosing path. An
// exploring user skips the whole medication block, which put nameCompanion →
// goalType → sexGender → birthday → heightWeight in an unbroken run of FIVE.
// Merging the middle two is what brings that back to 4. See the run-length
// test, which now walks the exploring path too.
//
// THE PICK HOLDS, IT DOES NOT ADVANCE. As its own screen, sex auto-advanced on
// tap. Here it has to stay selected while the wheel is used, so this runs
// ConvoScreen in `multi` mode with a single-element `values` array — the
// shipped selected-chip treatment, driven as a single-select. Continue is
// gated on the pick so neither field can be skipped silently; the wheel needs
// no such gate because it always holds a valid date.

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConvoButton, ConvoScreen, DateWheel, type ConvoOption } from '../../components';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';
import { ageLabel } from '../../utils/age';
import type { DateParts } from '../../utils/dateParts';

/**
 * The schema only carries profile.sex (male|female); the 4-way identity lives
 * in navigator state. Kept here, with the screen that asks for it, exactly as
 * it lived on SexGenderScreen before the merge.
 */
export type GenderIdentity = 'woman' | 'man' | 'nonbinary' | 'prefer_not_to_say';

const OPTIONS: ConvoOption<GenderIdentity>[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Non-binary', value: 'nonbinary' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

export interface AboutYouScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  genderIdentity?: GenderIdentity;
  onGenderChange(value: GenderIdentity): void;
  birthday: DateParts;
  onBirthdayChange(parts: DateParts): void;
  onContinue(): void;
}

export function AboutYouScreen({
  progress,
  onBack,
  context,
  genderIdentity,
  onGenderChange,
  birthday,
  onBirthdayChange,
  onContinue,
}: AboutYouScreenProps) {
  // Capped at 13+, so no future-date clamp is needed — same range the
  // standalone birthday wheel used.
  const { minYear, maxYear } = useMemo(() => {
    const current = new Date().getFullYear();
    return { minYear: current - 100, maxYear: current - 13 };
  }, []);

  const age = ageLabel(birthday);

  return (
    <ConvoScreen<GenderIdentity>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Two things that change the math"
      questionAccent
      sub="Sex and age tune your calorie and protein targets. That is all they are used for."
      multi
      options={OPTIONS}
      values={genderIdentity ? [genderIdentity] : []}
      // Single-select: re-tapping the chosen chip keeps it rather than
      // clearing it. A cleared sex would silently disable Continue with the
      // cause off screen, and there is no "none" answer to fall back to.
      onToggle={(value) => onGenderChange(value)}
      footer={
        <ConvoButton label="Continue" onPress={onContinue} disabled={!genderIdentity} />
      }
    >
      {/* THE WHEEL NEEDS ITS OWN NAME (2026-08-25). Merging the birthday screen
          in cost it its question — "When were you born?" — and the combined
          headline cannot carry both fields, so a first-time user met an
          unlabelled date wheel and had to infer it from the sub-line, which is
          already busy justifying the ask.

          The right half is the part that earns its place: every other turn in
          this flow answers back, so the derived age updates as the wheel turns
          rather than sitting there as a static form label. It also makes a
          mis-scrolled year self-evident — "126 years old" is impossible to
          miss where a stray date is easy to skim past. */}
      <View style={styles.eyebrow}>
        <Text style={styles.eyebrowLabel}>DATE OF BIRTH</Text>
        {age ? <Text style={styles.age}>{age}</Text> : null}
      </View>
      <View style={styles.rule} />

      <View style={{ flexGrow: 1, justifyContent: 'center' }}>
        <DateWheel
          value={birthday}
          onChange={onBirthdayChange}
          minYear={minYear}
          maxYear={maxYear}
        />
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  eyebrowLabel: {
    fontFamily: typography.fonts.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: convo.faint,
  },
  age: {
    fontFamily: typography.fonts.heavy,
    fontSize: 11.5,
    color: convo.primary,
  },
  rule: {
    height: 1,
    backgroundColor: convo.hairline,
    marginTop: 5,
  },
});
