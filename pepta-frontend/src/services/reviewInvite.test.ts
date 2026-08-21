// The two review surfaces, and the line between them.
//
// Pepta asks for a review in two places, and they must never use the same
// mechanism:
//
//   the BUTTON (WelcomeInScreen, post-purchase) → App Store composer deep link
//   the EARNED moment (PepCompanion, streak_3)  → StoreReview.requestReview()
//
// requestReview() is rationed by iOS at three per user per 365 days, and it can
// resolve without showing anything. Behind a button that is a dead control, and
// Apple's guidance is to keep the system prompt off any call to action. It also
// used to be called straight from WelcomeInScreen, bypassing reviewPrompt's
// one-ask-per-install bookkeeping — so the onboarding tap spent one of the
// three off the books and the earned ask later fired believing it was first.
//
// These tests pin that separation. If the onboarding screen ever reaches for
// the system prompt again, the last test here fails.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WRITE_REVIEW_URL } from './appUpdate';

const ONBOARDING_DIR = join(__dirname, '..', 'screens', 'onboarding');

/**
 * Source with comments removed. These tests assert on what the file DOES, and
 * WelcomeInScreen's header explains at length what it no longer does — a naive
 * substring match reads that explanation as the offence it warns about.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('WRITE_REVIEW_URL', () => {
  it('opens the review composer, not just the product page', () => {
    // Without action=write-review this lands on the listing and the user has
    // to go hunting for the ratings section.
    expect(WRITE_REVIEW_URL).toContain('?action=write-review');
  });

  it('starts https so openAppStore will accept it', () => {
    // openAppStore falls back to the plain store URL for anything that is not
    // https — a scheme slip here would silently drop the write-review action.
    expect(WRITE_REVIEW_URL.startsWith('https://')).toBe(true);
  });

  it('points at Pepta', () => {
    expect(WRITE_REVIEW_URL).toContain('id6784368155');
  });

  it('survives the itms-apps rewrite openAppStore performs', () => {
    const itms = WRITE_REVIEW_URL.replace(/^https:\/\//, 'itms-apps://');

    expect(itms).toBe('itms-apps://apps.apple.com/app/id6784368155?action=write-review');
  });
});

describe('onboarding never spends the rationed system prompt', () => {
  it('no onboarding screen imports expo-store-review', () => {
    // The standing rule (see onboardingFlow.ts): the ask belongs to an earned
    // moment inside the app, never to the funnel. A user who has not opened
    // the tracker once is the reason this app has a single rating.
    const offenders = readdirSync(ONBOARDING_DIR)
      .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
      .filter((file) =>
        codeOnly(readFileSync(join(ONBOARDING_DIR, file), 'utf8')).includes('expo-store-review'),
      );

    expect(offenders).toEqual([]);
  });

  it('the welcome-in button goes through the App Store opener', () => {
    const source = codeOnly(readFileSync(join(ONBOARDING_DIR, 'WelcomeInScreen.tsx'), 'utf8'));

    expect(source).toContain('openAppStore(WRITE_REVIEW_URL)');
    expect(source).not.toContain('requestReview');
  });
});
