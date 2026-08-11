/**
 * Home nudge: "you're tracking something called 'Something else' — what is it?"
 *
 * Opens AddCompoundSheet in RENAME mode, which PATCHes the existing compound
 * rather than creating one, so the user's dose logs, schedule and cycle stay
 * attached to the same id. Once renamed the compound stops matching and this
 * disappears on its own — no extra state to clear.
 *
 * The dismissal list is fetched LAZILY: the candidate check runs against data
 * Home already has, and only a user who actually owns an unidentified compound
 * ever costs a request. That is nearly nobody.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { CompoundResponse, DoseLogResponse } from '@pepta/shared';
import { AppText } from './AppText';
import { Card } from './Card';
import { Reveal } from './Reveal';
import { Icon } from './Icon';
import { AddCompoundSheet } from './AddCompoundSheet';
import { useTheme } from '../theme';
import { api } from '../services/api';
import {
  IDENTIFY_MEDICATION_COPY,
  identifyMedicationCandidate,
} from '../screens/app/identifyMedicationNudge';

export function IdentifyMedicationNudge({
  compounds,
  doseLogs,
}: {
  compounds: Pick<CompoundResponse, 'id' | 'name'>[];
  doseLogs: Pick<DoseLogResponse, 'compoundId' | 'deletedAt'>[];
}) {
  const theme = useTheme();
  const [dismissedKeys, setDismissedKeys] = useState<readonly string[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Dismissal-blind first pass. Cheap, local, and the gate on the network call.
  const local = useMemo(
    () => identifyMedicationCandidate({ compounds, doseLogs, dismissedKeys: [] }),
    [compounds, doseLogs],
  );

  useEffect(() => {
    if (!local || dismissedKeys != null) return;
    let cancelled = false;
    void api
      .listDismissedNudges()
      .then((keys) => {
        if (!cancelled) setDismissedKeys(keys);
      })
      // FAIL CLOSED. If we can't read the dismissal list we assume this one was
      // dismissed: re-asking someone who already said "Not now" is worse than
      // waiting for the next launch to ask someone who never saw it.
      .catch(() => {
        if (!cancelled) setDismissedKeys([local.nudgeKey]);
      });
    return () => {
      cancelled = true;
    };
  }, [local, dismissedKeys]);

  const candidate =
    dismissedKeys == null
      ? null
      : identifyMedicationCandidate({ compounds, doseLogs, dismissedKeys });

  const dismiss = () => {
    if (!candidate) return;
    Haptics.selectionAsync().catch(() => undefined);
    // Hide immediately; persist behind it. A failed POST costs one more ask on
    // a future launch, which is strictly better than a card that ignores taps.
    setDismissedKeys([...(dismissedKeys ?? []), candidate.nudgeKey]);
    void api.dismissNudge(candidate.nudgeKey).catch(() => undefined);
  };

  if (!candidate) return null;

  return (
    <>
      {/* Reveal and the margin live INSIDE the component: it returns null for
          almost every user, and an outer wrapper would leave a gap behind. */}
      <Reveal delay={90} style={{ marginTop: 12 }}>
      <Card style={{ backgroundColor: '#FFF4E8', borderWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              backgroundColor: '#FFE2C2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="help-circle" size={19} color="#9A5B12" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="cardTitle" style={{ fontSize: 15, lineHeight: 20 }}>
              {IDENTIFY_MEDICATION_COPY.headline}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: 6, lineHeight: 18 }}>
              {IDENTIFY_MEDICATION_COPY.body(candidate.doseCount)}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setSheetOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={IDENTIFY_MEDICATION_COPY.confirm}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.textPrimary,
                  borderRadius: theme.radii.pill,
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText variant="caption" style={{ color: theme.colors.surface, fontWeight: '800' }}>
                  {IDENTIFY_MEDICATION_COPY.confirm}
                </AppText>
              </Pressable>
              <Pressable
                onPress={dismiss}
                accessibilityRole="button"
                accessibilityLabel={IDENTIFY_MEDICATION_COPY.dismiss}
                style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                  {IDENTIFY_MEDICATION_COPY.dismiss}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Card>
      </Reveal>
      <AddCompoundSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        renameCompoundId={candidate.compoundId}
      />
    </>
  );
}
