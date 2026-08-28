// The imperative half of Apple Health sync. healthDay.ts decides WHAT to
// write; this module owns WHEN and HOW — permissions, reading HealthKit,
// throttling, and landing the result through the same API the manual sheet
// uses.
//
// Two hard rules:
//
//   IT NEVER THROWS INTO THE APP. Sync is a background convenience; a
//   HealthKit hiccup must not take a screen down. Failures are logged and
//   the next trigger retries.
//
//   IT NEVER WRITES TO HEALTH. Read-only permissions, no update purpose
//   string in the plist. Pepta's records are Pepta's; the user's Health
//   store is theirs.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type AppleHealthKitModule from 'react-native-health';
import { api } from './api';
import {
  healthSyncDecision,
  type ActivityRowLike,
  type HealthSnapshot,
} from './healthDay';
import { localDay } from '../screens/app/activityFeed';

const ENABLED_KEY = 'pepta.healthSync.enabled';
const LAST_SYNC_KEY = 'pepta.healthSync.lastSyncAt';
/** Foreground events cluster; one sync per this window is plenty. */
const THROTTLE_MS = 10 * 60 * 1000;

/** Strength-typed workouts flip the resistance marker. */
const STRENGTH_ACTIVITIES = new Set([
  'TraditionalStrengthTraining',
  'FunctionalStrengthTraining',
]);

// LAZY-LOADED, and only here. react-native-health is a native module; an
// import at module scope drags it into every file that touches the data
// context, which kills node test suites with "Unexpected token 'typeof'" —
// the exact trap the .ts/.tsx split exists to avoid. Nothing outside these
// functions may reference the library.
type AppleHealthKit = typeof AppleHealthKitModule;
async function healthKit(): Promise<AppleHealthKit> {
  const mod = await import('react-native-health');
  return (mod.default ?? mod) as AppleHealthKit;
}

function permissionsFor(kit: AppleHealthKit) {
  return {
    permissions: {
      read: [
        kit.Constants.Permissions.Steps,
        kit.Constants.Permissions.StepCount,
        kit.Constants.Permissions.Workout,
      ],
      write: [],
    },
  };
}

export async function isHealthSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export type HealthAvailability = 'available' | 'unavailable';

/**
 * Does HealthKit exist on this device at all?
 *
 * 2.1(a), rejected 2026-08-28 on an iPad: nothing ever asked. iPadOS does not
 * support HealthKit, so the enable path reached into a native module that had
 * never initialised and THREW — and AccountScreen fired the handler as
 * `void toggleHealthSync()`, which discards the promise. A resolved `false`
 * would have shown an alert; a throw showed nothing, which is precisely the
 * "not responsive" the reviewer reported.
 *
 * NEVER REJECTS. Every failure — callback error, missing module, a throw on
 * property access — resolves to 'unavailable', because the entire point is
 * that a caller can render a definite state instead of dying.
 */
export async function healthAvailability(): Promise<HealthAvailability> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    const kit = await healthKit();
    if (typeof kit?.isAvailable !== 'function') return 'unavailable';
    return await new Promise<HealthAvailability>((resolve) => {
      try {
        kit.isAvailable((error: unknown, result: boolean) => {
          resolve(error || !result ? 'unavailable' : 'available');
        });
      } catch {
        resolve('unavailable');
      }
    });
  } catch {
    return 'unavailable';
  }
}

/**
 * Turn sync on (prompting for HealthKit access) or off.
 *
 * Disabling stops future syncs and nothing else: rows already written stay,
 * because they are real history the user watched accumulate — a toggle that
 * silently deleted a month of activity would be the worse surprise.
 */
export async function setHealthSyncEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await AsyncStorage.setItem(ENABLED_KEY, 'false');
    return true;
  }
  const granted = await initHealthKit();
  if (!granted) return false;
  await AsyncStorage.setItem(ENABLED_KEY, 'true');
  await AsyncStorage.removeItem(LAST_SYNC_KEY);
  return true;
}

async function initHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  // Ask before reaching in. permissionsFor() dereferences kit.Constants,
  // which throws on a device where the native module never loaded.
  if ((await healthAvailability()) !== 'available') return false;
  const kit = await healthKit();
  return new Promise((resolve) => {
    kit.initHealthKit(permissionsFor(kit), (error) => {
      if (error) {
        console.warn('[health] HealthKit init failed.', error);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function stepsToday(now: Date): Promise<number> {
  const kit = await healthKit();
  return new Promise((resolve) => {
    kit.getStepCount(
      { date: now.toISOString(), includeManuallyAdded: true },
      (error, result: { value?: number }) => {
        if (error) {
          console.warn('[health] Could not read steps.', error);
          resolve(0);
          return;
        }
        resolve(Math.max(0, Math.round(result?.value ?? 0)));
      },
    );
  });
}

interface WorkoutSample {
  duration?: number;
  activityName?: string;
  start?: string;
  end?: string;
}

async function workoutsToday(now: Date): Promise<{ minutes: number; hadStrength: boolean }> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const kit = await healthKit();
  return new Promise((resolve) => {
    kit.getAnchoredWorkouts(
      { startDate: start.toISOString(), endDate: end.toISOString() },
      (error, result: { data?: WorkoutSample[] }) => {
        if (error) {
          console.warn('[health] Could not read workouts.', error);
          resolve({ minutes: 0, hadStrength: false });
          return;
        }
        const samples = result?.data ?? [];
        let seconds = 0;
        let hadStrength = false;
        for (const sample of samples) {
          seconds += sample.duration ?? 0;
          if (sample.activityName && STRENGTH_ACTIVITIES.has(sample.activityName)) {
            hadStrength = true;
          }
        }
        resolve({ minutes: Math.round(seconds / 60), hadStrength });
      },
    );
  });
}

export async function readTodaySnapshot(now = new Date()): Promise<HealthSnapshot> {
  const [steps, workouts] = await Promise.all([stepsToday(now), workoutsToday(now)]);
  return { steps, workoutMinutes: workouts.minutes, hadStrength: workouts.hadStrength };
}

export interface HealthSyncDeps {
  /** Current activity rows, freshest the app holds. */
  getRows(): readonly ActivityRowLike[];
  /** Called after a write lands, so screens refetch truth. */
  onWrote(): void;
  now?: Date;
  /** Injection points for tests. */
  readSnapshot?: (now: Date) => Promise<HealthSnapshot>;
  isEnabled?: () => Promise<boolean>;
}

/**
 * One throttled sync pass. Safe to call from any trigger — app foreground,
 * screen mount — as often as they like.
 */
export async function maybeSyncHealth(deps: HealthSyncDeps): Promise<void> {
  try {
    if (Platform.OS !== 'ios') return;
    const enabled = await (deps.isEnabled ?? isHealthSyncEnabled)();
    if (!enabled) return;

    const now = deps.now ?? new Date();
    const last = Number((await AsyncStorage.getItem(LAST_SYNC_KEY)) ?? 0);
    if (Number.isFinite(last) && now.getTime() - last < THROTTLE_MS) return;
    // Claim the window BEFORE the reads: two triggers racing both passing the
    // throttle is how duplicate creates happen. The idempotency key below is
    // the second lock on that door.
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime()));

    const snapshot = await (deps.readSnapshot ?? readTodaySnapshot)(now);
    const decision = healthSyncDecision(snapshot, deps.getRows(), now);
    if (decision.kind === 'none') return;

    if (decision.kind === 'create') {
      await api.createActivityLog({
        ...decision.payload,
        // One create per local day can ever succeed, even across devices —
        // the server rejects a reused key. A rejected create means another
        // sync won the race; refetch and the next pass updates that row.
        idempotencyKey: `health-${localDay(now.toISOString())}`,
      });
    } else {
      await api.patchActivityLog(decision.id, decision.payload);
    }
    deps.onWrote();
  } catch (error) {
    // Including the idempotency 409: losing the race is a success condition.
    console.warn('[health] Sync pass failed; will retry on the next trigger.', error);
    deps.onWrote();
  }
}
