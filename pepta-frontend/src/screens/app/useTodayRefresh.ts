// Keeping the Water / Protein / Fiber screens honest about today.
//
// Both read the cached home. That cache is updated optimistically the moment
// the user logs something HERE, so their own taps are always reflected — but a
// log made on another device, or a day that rolled over while the app sat in
// the background, would leave the screen quietly stale.
//
// Two ways in:
//   · pull to refresh — the explicit ask, same as Home.
//   · on focus — so arriving at the screen shows current numbers.
//
// THE FOCUS REFRESH WAITS FOR PENDING LOGS. refreshHome replaces the cache
// with the server's answer, and the server does not yet know about a log
// sitting in the offline queue. Refreshing on top of one would make the
// user's own entry visibly disappear and then reappear minutes later when the
// queue drains. Pull-to-refresh is exempt: that is the user asking for the
// server's truth, and Home has always behaved that way.

import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { usePeptaData } from '../../context/PeptaDataContext';

export interface TodayRefresh {
  refreshing: boolean;
  onRefresh: () => void;
}

export function useTodayRefresh(): TodayRefresh {
  const { home, homeRefreshing, refreshHome, pendingLogs } = usePeptaData();

  // Read through a ref so the focus callback's identity never changes.
  // useFocusEffect runs its CLEANUP on any dependency change, not only on
  // blur, so a callback that depended on these values had its "once per visit"
  // guard reset by any unrelated re-render — a second hook on the screen
  // hydrating from storage was enough to make it refetch twice.
  const live = useRef({ home, pendingLogs, refreshHome });
  live.current = { home, pendingLogs, refreshHome };
  const refreshedThisVisit = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const current = live.current;
      // No cache at all is handled by the screen's own loading branch.
      if (current.home && !refreshedThisVisit.current && current.pendingLogs === 0) {
        refreshedThisVisit.current = true;
        void current.refreshHome();
      }
      return () => {
        refreshedThisVisit.current = false;
      };
    }, []),
  );

  const onRefresh = useCallback(() => {
    void refreshHome();
  }, [refreshHome]);

  return { refreshing: homeRefreshing, onRefresh };
}
