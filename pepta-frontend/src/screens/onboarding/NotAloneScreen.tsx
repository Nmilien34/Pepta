// Onboarding — step 2 · the gift. "You are not doing this alone", the 1-in-8
// stat, and the faces.
//
// This used to be the welcome screen's payload. When the carousel took over
// screen 1 (2026-08-17) the reassurance did not die with it — it became its
// own turn, which is where it belonged: the old screen was carrying the brand,
// the promise, the stat, the consent line AND the sign-in link, and the stat
// was the part hidden behind 2.14s of typing.
//
// As a turn it now gets a back chevron and gives before it asks — the user has
// tapped Get started and receives something before the first question.
//
// GIVE, NEVER GATE. There is no input here. The only action is forward, and
// the copy never implies the user owes anything for the fact.
//
// VOICE. The line that does the work is "most of them quietly" — it names why
// the number does not match the feeling. A user starting a GLP-1 often has not
// told anyone, so "millions are on this road with you" reads as a statistic
// they cannot see. Explaining the gap is what makes the fact land as comfort
// rather than trivia. "Hi." went with the carousel: they have already arrived.

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CitedStat, ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';

export interface NotAloneScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

// Abstract initials, not testimonials — nobody is quoted and nothing is
// attributed. They exist to make "millions" feel like people rather than a
// number, and they are deliberately not photographs of invented users.
const FACES = [
  { initial: 'M', tone: '#EAD9C4' },
  { initial: 'J', tone: '#D4E3D2' },
  { initial: 'R', tone: '#DCD2EE' },
  { initial: 'T', tone: '#CFE0EA' },
  { initial: 'S', tone: '#EADFD0' },
];

export function NotAloneScreen({ progress, onBack, onContinue }: NotAloneScreenProps) {
  const [typed, setTyped] = useState(false);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context="One thing before we start."
      question="You’re not the only one doing this."
      onTyped={() => setTyped(true)}
      footer={<ConvoButton label="Let’s go" onPress={onContinue} />}
    >
      {typed ? (
        <View style={styles.stat}>
          {/* Both figures come from the same KFF poll: 12% of US adults have
              ever used a GLP-1 (the 1 in 8), 6% currently (~15M of ~258M
              adults). The citation covers the faces line too. */}
          <CitedStat
            land
            value="1 in 8"
            line="American adults has taken a GLP-1. Most of them quietly, which is exactly why it can feel like just you."
            cite="KFF Health Tracking Poll, May 2024"
          />
          <View style={styles.faces}>
            {FACES.map((face, i) => (
              <View
                key={face.initial}
                style={[styles.face, { backgroundColor: face.tone, marginLeft: i === 0 ? 0 : -8 }]}
              >
                <Text style={styles.faceText}>{face.initial}</Text>
              </View>
            ))}
            <Text style={styles.facesMore}>15 million+ right now</Text>
          </View>
        </View>
      ) : null}
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  stat: { paddingTop: 44 },
  faces: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  face: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    // Ringed in the ground colour so the overlap reads as depth, not borders.
    borderColor: convo.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: { fontFamily: typography.fonts.bold, fontSize: 12, color: convo.ink },
  facesMore: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 12.5,
    color: convo.soft,
    marginLeft: 10,
  },
});
