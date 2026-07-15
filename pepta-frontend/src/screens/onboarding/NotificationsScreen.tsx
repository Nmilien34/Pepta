// Onboarding — Notifications (T23). A single Continue that flows STRAIGHT into
// the iOS permission prompt — no skip chip, no pre-permission choice (App
// Review 5.1.1(iv)); declining lives in the system dialog itself.

import React, { useState } from 'react';
import { ConvoButton, ConvoScreen } from '../../components';

export interface NotificationsScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  /** e.g. "Sundays around 8 PM." */
  sub?: string;
  onAllow?(): Promise<void> | void;
  onContinue(): void;
}

export function NotificationsScreen({ progress, onBack, context, sub, onAllow, onContinue }: NotificationsScreenProps) {
  const [busy, setBusy] = useState(false);

  const handleAllow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAllow?.();
    } finally {
      setBusy(false);
      onContinue();
    }
  };

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Want shot-day pings?"
      sub={sub ?? 'Dose, water and protein reminders — only when they help.'}
      footer={<ConvoButton label="Continue" disabled={busy} onPress={handleAllow} />}
    />
  );
}
