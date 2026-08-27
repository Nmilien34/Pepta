/**
 * The single data-health slot on Home.
 *
 * The server decides WHICH card (detector priority, real records); this decides
 * how it looks and how it gets resolved. At most one card, and once the user
 * acts the channel goes quiet until the next app session — the next problem
 * surfaces on a later visit rather than sliding up as the next chore.
 *
 * This is maintenance, not engagement. No modals, no badges, no re-asking.
 */

import { MASK_PROPS } from "./MaskedHealthValue";
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { DataHealthCard as DataHealthCardPayload } from '@pepta/shared';
import { AppText } from './AppText';
import { Card } from './Card';
import { Reveal } from './Reveal';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { DoseTimeSheet } from './DoseTimeSheet';
import { AddCompoundSheet } from './AddCompoundSheet';
import { useTheme } from '../theme';
import { usePeptaData } from '../context/PeptaDataContext';
import { api } from '../services/api';
import {
  dataHealthCopy,
  describeDuplicateCandidate,
  suggestedKeeper,
} from '../screens/app/dataHealth';

/**
 * ONE ASK PER SESSION, module-level on purpose: it must survive Home
 * unmounting as the user moves between tabs, and reset on app restart. Set when
 * the user ACTS, so a card they scrolled past is still there when they scroll
 * back — it is the resolving that ends the conversation, not the seeing.
 */
let askedThisSession = false;
/** Session cache so tab-switching doesn't re-hit the endpoint. */
let cachedCard: DataHealthCardPayload | null | undefined;

export function resetDataHealthSession(): void {
  askedThisSession = false;
  cachedCard = undefined;
}

export function DataHealthCardView() {
  const theme = useTheme();
  const { refreshHome, refreshTrack } = usePeptaData();
  const [card, setCard] = useState<DataHealthCardPayload | null>(
    cachedCard ?? null,
  );
  const [resolving, setResolving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (askedThisSession || cachedCard !== undefined) return;
    let cancelled = false;
    void api
      .getDataHealthCard()
      .then((next) => {
        cachedCard = next;
        if (!cancelled) setCard(next);
      })
      // Silence on failure. A maintenance prompt is never worth an error state.
      .catch(() => {
        cachedCard = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = async () => {
    askedThisSession = true;
    cachedCard = null;
    setCard(null);
    setSheetOpen(false);
    await Promise.all([refreshHome(), refreshTrack()]).catch(() => undefined);
  };

  const dismiss = () => {
    if (!card) return;
    Haptics.selectionAsync().catch(() => undefined);
    askedThisSession = true;
    cachedCard = null;
    const key = card.key;
    setCard(null);
    // Persisted behind the hide. A failed POST costs one more ask on a future
    // launch, which beats a button that appears to do nothing.
    void api.dismissNudge(key).catch(() => undefined);
  };

  if (!card) return null;
  const copy = dataHealthCopy(card);

  return (
    <>
      {/* Reveal and margin live inside: this renders null for nearly everyone,
          and an outer wrapper would leave a gap behind. */}
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
                {copy.title}
              </AppText>
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 6, lineHeight: 18 }}
              >
                {copy.body}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setSheetOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={copy.confirm}
                  style={({ pressed }) => ({
                    backgroundColor: theme.colors.textPrimary,
                    borderRadius: theme.radii.pill,
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <AppText
                    variant="caption"
                    style={{ color: theme.colors.surface, fontWeight: '800' }}
                  >
                    {copy.confirm}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={dismiss}
                  accessibilityRole="button"
                  accessibilityLabel={copy.dismiss}
                  style={({ pressed }) => ({
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                    {copy.dismiss}
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </Card>
      </Reveal>

      {card.detector === 'unidentified-medication' ? (
        <AddCompoundSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onDismissed={() => {
            if (!sheetOpen) void finish();
          }}
          renameCompoundId={card.compoundId}
        />
      ) : null}

      {card.detector === 'missing-dose-time' ? (
        <DoseTimeSheet
          visible={sheetOpen}
          compoundName={card.compoundName}
          busy={resolving}
          onClose={() => setSheetOpen(false)}
          onPick={async (time) => {
            setResolving(true);
            try {
              await api.updateSchedule(card.scheduleId, { timesOfDay: [time] });
              await finish();
            } finally {
              setResolving(false);
            }
          }}
        />
      ) : null}

      {card.detector === 'duplicate-compounds' ? (
        <DuplicateChooserSheet
          visible={sheetOpen}
          candidates={card.candidates}
          busy={resolving}
          onClose={() => setSheetOpen(false)}
          onKeepBoth={dismiss}
          onMerge={async (keepCompoundId) => {
            setResolving(true);
            try {
              await api.mergeCompounds({
                keepCompoundId,
                mergeCompoundIds: card.candidates
                  .map((candidate) => candidate.compoundId)
                  .filter((id) => id !== keepCompoundId),
              });
              await finish();
            } finally {
              setResolving(false);
            }
          }}
        />
      ) : null}
    </>
  );
}


function DuplicateChooserSheet({
  visible,
  candidates,
  busy,
  onClose,
  onMerge,
  onKeepBoth,
}: {
  visible: boolean;
  candidates: {
    compoundId: string;
    name: string;
    plannedDose: number | null;
    doseUnit: string;
    scheduleSummary: string | null;
    doseCount: number;
    createdAt: string;
  }[];
  busy: boolean;
  onClose(): void;
  onMerge(keepCompoundId: string): void;
  onKeepBoth(): void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelected(suggestedKeeper(candidates));
  }, [visible, candidates]);

  return (
    <BottomSheet panelProps={MASK_PROPS} visible={visible} onClose={onClose} avoidKeyboard={false} scrollable>
      <AppText variant="cardTitle" style={{ fontSize: 17 }}>
        Which one do you use?
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
        We'll move every logged dose onto the one you keep. Nothing is deleted
        from your history.
      </AppText>

      <View style={{ marginTop: 14, gap: 10 }}>
        {candidates.map((candidate) => {
          const isSelected = candidate.compoundId === selected;
          return (
            <Pressable
              key={candidate.compoundId}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setSelected(candidate.compoundId);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                padding: 13,
                borderRadius: theme.radii.md,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? theme.colors.textPrimary : theme.colors.border,
                backgroundColor: isSelected ? theme.colors.surfaceAlt : 'transparent',
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                  {candidate.name}
                </AppText>
                <AppText variant="caption" color="textSecondary" style={{ marginTop: 3 }}>
                  {describeDuplicateCandidate(candidate)}
                </AppText>
              </View>
              {isSelected ? (
                <Icon name="checkmark" size={18} color={theme.colors.textPrimary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16, gap: 10 }}>
        <Button
          label="Merge into this one"
          loading={busy}
          onPress={() => {
            if (!selected || busy) return;
            onMerge(selected);
          }}
        />
        <Pressable
          onPress={onKeepBoth}
          accessibilityRole="button"
          accessibilityLabel="Keep both"
          style={({ pressed }) => ({ paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="caption" color="textSecondary" align="center" style={{ fontWeight: '700' }}>
            Keep both — I'm running them separately
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
