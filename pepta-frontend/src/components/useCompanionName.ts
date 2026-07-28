// The one place a screen asks "what is the companion called?".
//
// Resolution order — server, then the local pick, then the default:
//   1. profile.companionName — the server has it, so it is the truth.
//   2. the locally stored pick — the user chose it but the write has not
//      landed yet (a backend predating the field rejects it, since the
//      profile schema is .strict()). Showing the local value means they NEVER
//      see the wrong name while the deploy catches up.
//   3. "Pep".
//
// The hook also retries a pending write whenever a profile is present, and
// clears the local copy once the server echoes the name back — so this
// self-heals in whichever order client and backend ship.

import { useEffect, useRef, useState } from 'react';
import { usePeptaData } from '../context/PeptaDataContext';
import { resolveCompanionName } from '../utils/companion';
import {
  clearCompanionName,
  readCompanionName,
  writeCompanionName,
} from '../services/companionNameStore';
import { api } from '../services/api';

export function useCompanionName(): string {
  const { home } = usePeptaData();
  const serverName = home?.profile?.companionName;
  const [localName, setLocalName] = useState<string | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    let active = true;
    void readCompanionName().then((stored) => {
      if (active) setLocalName(stored?.name ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // The server agrees with us — drop the local copy, it has done its job.
    if (serverName && localName && serverName.trim() === localName) {
      void clearCompanionName();
      return;
    }
    if (!home || serverName || !localName || syncing.current) return;

    // A pick exists that the server does not have. Retry it — this is the
    // path that heals a name chosen before the backend shipped the field.
    syncing.current = true;
    void api
      .updateProfileSettings({ companionName: localName })
      .then(() => writeCompanionName(localName, true))
      .catch(() => undefined)
      .finally(() => {
        syncing.current = false;
      });
  }, [home, serverName, localName]);

  return resolveCompanionName(serverName ?? localName);
}
