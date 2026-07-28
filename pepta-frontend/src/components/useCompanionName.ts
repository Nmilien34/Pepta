// The one place a screen asks "what is the companion called?".
//
// Reads the profile the app already has in memory, so it needs no extra fetch
// and updates everywhere the moment the profile refreshes. Every user-visible
// string that used to hardcode "Pep" should call this instead — including
// push-notification copy composed on the client.

import { usePeptaData } from '../context/PeptaDataContext';
import { resolveCompanionName } from '../utils/companion';

/** The companion's display name, or "Pep" when the user never chose one. */
export function useCompanionName(): string {
  const { home } = usePeptaData();
  return resolveCompanionName(home?.profile?.companionName);
}
