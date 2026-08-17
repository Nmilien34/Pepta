// Pure: turns the live trial duration into a date the user owns something
// until. No RN imports, so it unit-tests in plain Node — same split as
// paywallTimeline / revealPacing.

/**
 * "3 days" is a term; "through Saturday" is something you have until a date.
 * Parses the live duration label rather than assuming a length, because the
 * offering decides it — and falls back to the label itself if the shape is
 * ever something we do not recognise.
 */
export function trialEndLabel(trialLabel: string, now: Date): string {
  const days = Number(/^(\d+)\s*day/i.exec(trialLabel)?.[1]);
  if (!Number.isFinite(days) || days <= 0) return trialLabel;
  const end = new Date(now.getTime() + days * 86_400_000);
  // Inside a week a weekday is concrete and needs no year; past that a date is
  // clearer than "next next Tuesday".
  return days <= 6
    ? end.toLocaleDateString(undefined, { weekday: 'long' })
    : end.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}
