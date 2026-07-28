// Local store for the companion name, so the user's choice is never lost to a
// backend that has not shipped the field yet.
//
// The problem this solves: the profile schema is .strict(), so a backend
// predating `companionName` rejects the write. Without this, someone who names
// their companion "Sushi" during that window sees "Pep" forever — the name is
// silently dropped and they are never asked again.
//
// So the name is written HERE first and displayed from here until the server
// confirms it. A pending value is retried whenever the app has a profile, and
// cleared once the server echoes it back. The user never sees the wrong name,
// and nothing is lost if the deploy order goes the other way.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Versioned so a future rename can invalidate cleanly. */
export const COMPANION_NAME_KEY = 'pepta:companion-name.v1';

export interface StoredCompanionName {
  name: string;
  /** False until the server has accepted it. */
  synced: boolean;
}

export function parseStoredCompanionName(raw: string | null): StoredCompanionName | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredCompanionName).name === 'string' &&
      (parsed as StoredCompanionName).name.trim().length > 0
    ) {
      const value = parsed as StoredCompanionName;
      return { name: value.name.trim(), synced: value.synced === true };
    }
  } catch {
    // A corrupt blob reads as "nothing stored" rather than throwing — the
    // worst case is falling back to the default name.
  }
  return null;
}

export async function readCompanionName(): Promise<StoredCompanionName | null> {
  try {
    return parseStoredCompanionName(await AsyncStorage.getItem(COMPANION_NAME_KEY));
  } catch {
    return null;
  }
}

export async function writeCompanionName(name: string, synced: boolean): Promise<void> {
  try {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      await AsyncStorage.removeItem(COMPANION_NAME_KEY);
      return;
    }
    await AsyncStorage.setItem(
      COMPANION_NAME_KEY,
      JSON.stringify({ name: trimmed, synced } satisfies StoredCompanionName),
    );
  } catch {
    // Best-effort: an unwritable store means the name lives only for this
    // session, which is still better than losing the choice outright.
  }
}

export async function clearCompanionName(): Promise<void> {
  try {
    await AsyncStorage.removeItem(COMPANION_NAME_KEY);
  } catch {
    // ignored
  }
}
