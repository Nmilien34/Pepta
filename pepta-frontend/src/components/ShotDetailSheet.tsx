// "How did that shot go?" — the report for one dose.
//
// Reached by tapping a shot in Track's "Your log". The feed answers WHAT was
// recorded; this answers what happened in the window that shot covers: weight
// change, how the user ate, what side effects turned up, and the level curve
// for that interval. Every figure comes from shotDetail.ts, which reads the
// user's own records and models nothing.
//
// A missing number is shown as a dash with a reason, never as zero. "0 lb
// change" and "we only have one weigh-in" are different statements, and only
// one of them is true.

import { View } from 'react-native';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { MedicationLevelChart } from './MedicationLevelChart';
import { useTheme } from '../theme';
import { cadenceLabel, windowLabel, type ShotWindow } from '../screens/app/shotDetail';

export interface ShotDetailSheetProps {
  visible: boolean;
  shot: ShotWindow | null;
  onClose(): void;
}

export function ShotDetailSheet({ visible, shot, onClose }: ShotDetailSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable avoidKeyboard={false}>
      {shot ? (
        <View>
          <AppText variant="cardTitle" style={{ fontSize: 18 }}>
            {shot.compoundName} · {shot.amountLabel}
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
            {formatWhen(shot.datetime)}
          </AppText>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {shot.site ? <Tag icon="current-location" label={shot.site} /> : null}
            <Tag icon="time-outline" label={cadenceLabel(shot)} />
          </View>

          {shot.notes ? (
            <View
              style={{
                marginTop: 14,
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radii.card,
                padding: 12,
              }}
            >
              {/* Notes were collected on every dose and shown nowhere. */}
              <AppText variant="caption" color="textTertiary" style={{ fontWeight: '700' }}>
                YOUR NOTE
              </AppText>
              <AppText variant="body" style={{ marginTop: 5 }}>
                {shot.notes}
              </AppText>
            </View>
          ) : null}

          <AppText
            variant="sectionHeader"
            color="textTertiary"
            style={{ textTransform: 'uppercase', marginTop: 18 }}
          >
            {windowLabel(shot)} this shot
          </AppText>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Stat
              label="Weight"
              value={shot.weight ? formatDelta(shot.weight.delta, shot.weight.unit) : null}
              detail={
                shot.weight
                  ? `${shot.weight.from} → ${shot.weight.to}`
                  : 'one weigh-in'
              }
              tone={shot.weight && shot.weight.delta < 0 ? 'good' : 'plain'}
            />
            <Stat
              label="Calories"
              value={shot.avgCalories === null ? null : `${shot.avgCalories}`}
              detail={shot.avgCalories === null ? 'none logged' : 'avg/day'}
            />
            <Stat
              label="Protein"
              value={shot.avgProtein === null ? null : `${shot.avgProtein} g`}
              detail={shot.avgProtein === null ? 'none logged' : 'avg/day'}
            />
          </View>

          {shot.sideEffects.length > 0 ? (
            <View style={{ marginTop: 18 }}>
              <AppText
                variant="sectionHeader"
                color="textTertiary"
                style={{ textTransform: 'uppercase' }}
              >
                Side effects in this window
              </AppText>
              {shot.sideEffects.map((effect, index) => (
                <View
                  key={`${effect.datetime}-${effect.label}-${index}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: index < shot.sideEffects.length - 1 ? 0.5 : 0,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Icon name="sad-outline" size={16} color={theme.colors.textSecondary} />
                  <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '700' }}>
                    {effect.label}
                  </AppText>
                  {effect.severity ? (
                    <AppText variant="caption" color="textSecondary">
                      {effect.severity} of 5
                    </AppText>
                  ) : null}
                  <AppText variant="caption" color="textTertiary">
                    {formatDayOnly(effect.datetime)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {shot.taggedSideEffects.length > 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
              Tagged when you logged it: {shot.taggedSideEffects.join(', ')}
            </AppText>
          ) : null}

          {shot.curve.length > 0 ? (
            <View style={{ marginTop: 18 }}>
              <AppText
                variant="sectionHeader"
                color="textTertiary"
                style={{ textTransform: 'uppercase' }}
              >
                Your level across this window
              </AppText>
              {/* The same curve Track draws, sliced to this window — not a
                  second, client-side model of the pharmacokinetics. */}
              <MedicationLevelChart
                curve={shot.curve}
                doses={[{ datetime: shot.datetime }]}
                unit={shot.amountLabel.split(' ')[1] ?? 'mg'}
              />
            </View>
          ) : (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 18 }}>
              Level history isn't stored this far back, so there's no curve for this window.
            </AppText>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Tag({ icon, label }: { icon: string; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radii.pill,
        paddingVertical: 6,
        paddingHorizontal: 11,
      }}
    >
      <Icon name={icon} size={13} color={theme.colors.textSecondary} />
      <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = 'plain',
}: {
  label: string;
  /** Null renders a dash — a number we do not have is never printed as 0. */
  value: string | null;
  detail: string;
  tone?: 'good' | 'plain';
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radii.card,
        padding: 12,
      }}
    >
      <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
        {label}
      </AppText>
      <AppText
        variant="statMedium"
        style={{ fontSize: 19, marginTop: 6 }}
        color={value === null ? 'textTertiary' : tone === 'good' ? 'primary' : 'textPrimary'}
      >
        {value ?? '—'}
      </AppText>
      <AppText variant="caption" color="textTertiary" style={{ marginTop: 3, fontSize: 10.5 }} numberOfLines={1}>
        {detail}
      </AppText>
    </View>
  );
}

/** "−3.0 lb" / "+1.2 lb". The sign is the whole point, so it is never dropped. */
function formatDelta(delta: number, unit: string): string {
  const sign = delta < 0 ? '−' : delta > 0 ? '+' : '';
  return `${sign}${Math.abs(delta).toFixed(1)} ${unit}`;
}

function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function formatDayOnly(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(at);
  } catch {
    return iso.slice(5, 10);
  }
}
