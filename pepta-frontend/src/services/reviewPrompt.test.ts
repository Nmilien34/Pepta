import { describe, expect, it, vi } from 'vitest';
import {
  maybeRequestReview,
  reviewAskDecision,
  REVIEW_WORTHY_MILESTONES,
  type RequestReviewDeps,
} from './reviewPrompt';

const deps = (over: Partial<RequestReviewDeps> = {}): RequestReviewDeps => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  requestReview: vi.fn().mockResolvedValue(undefined),
  hasAsked: vi.fn().mockResolvedValue(false),
  markAsked: vi.fn().mockResolvedValue(undefined),
  // Open by default: these cases exercise the ACCOUNT-side decision, and the
  // device-local gate has its own suite (reviewPrompt.gate.test.ts).
  gate: vi.fn().mockResolvedValue('ask'),
  ...over,
});

describe('reviewAskDecision', () => {
  it('asks on an earned milestone', () => {
    for (const key of ['streak_3', 'streak_7', 'streak_30']) {
      expect(reviewAskDecision({ milestoneKey: key, alreadyAsked: false, available: true }))
        .toBe('ask');
    }
  });

  it('rides the 3-day streak, because most installs never reach day 7', () => {
    expect(REVIEW_WORTHY_MILESTONES).toContain('streak_3');
  });

  it('never asks twice on one install', () => {
    expect(reviewAskDecision({ milestoneKey: 'streak_30', alreadyAsked: true, available: true }))
      .toBe('already-asked');
  });

  it('does not ask when no milestone fired', () => {
    expect(reviewAskDecision({ milestoneKey: null, alreadyAsked: false, available: true }))
      .toBe('no-milestone');
  });

  it('refuses the day-one checklist milestone', () => {
    // setup_unlocked fires for finishing setup. Nothing has been proven yet,
    // and this is the exact mistake the removed `rateApp` turn made.
    expect(reviewAskDecision({ milestoneKey: 'setup_unlocked', alreadyAsked: false, available: true }))
      .toBe('milestone-not-earned');
    expect(REVIEW_WORTHY_MILESTONES).not.toContain('setup_unlocked');
  });

  it('does not ask when the native sheet is unavailable', () => {
    expect(reviewAskDecision({ milestoneKey: 'streak_7', alreadyAsked: false, available: false }))
      .toBe('unavailable');
  });
});

describe('maybeRequestReview', () => {
  it('requests the sheet and burns the ask', async () => {
    const d = deps();
    await expect(maybeRequestReview('streak_7', d)).resolves.toBe('ask');
    expect(d.markAsked).toHaveBeenCalledOnce();
    expect(d.requestReview).toHaveBeenCalledOnce();
  });

  it('marks BEFORE requesting, so a thrown sheet still spends the ask', async () => {
    const order: string[] = [];
    const d = deps({
      markAsked: vi.fn().mockImplementation(async () => { order.push('mark'); }),
      requestReview: vi.fn().mockImplementation(async () => {
        order.push('request');
        throw new Error('nope');
      }),
    });
    await expect(maybeRequestReview('streak_30', d)).resolves.toBe('ask');
    expect(order).toEqual(['mark', 'request']);
  });

  it('touches no storage when nothing fired', async () => {
    const d = deps();
    await expect(maybeRequestReview(null, d)).resolves.toBe('no-milestone');
    expect(d.hasAsked).not.toHaveBeenCalled();
    expect(d.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('touches no storage for an unearned milestone', async () => {
    const d = deps();
    await expect(maybeRequestReview('setup_unlocked', d)).resolves.toBe('milestone-not-earned');
    expect(d.hasAsked).not.toHaveBeenCalled();
  });

  it('never shows the sheet twice', async () => {
    const d = deps({ hasAsked: vi.fn().mockResolvedValue(true) });
    await expect(maybeRequestReview('streak_7', d)).resolves.toBe('already-asked');
    expect(d.requestReview).not.toHaveBeenCalled();
  });

  it('declines rather than guessing when storage throws', async () => {
    const d = deps({ hasAsked: vi.fn().mockRejectedValue(new Error('disk')) });
    await expect(maybeRequestReview('streak_7', d)).resolves.toBe('unavailable');
    expect(d.requestReview).not.toHaveBeenCalled();
  });

  it('declines when the native module throws on availability', async () => {
    const d = deps({ isAvailableAsync: vi.fn().mockRejectedValue(new Error('native')) });
    await expect(maybeRequestReview('streak_7', d)).resolves.toBe('unavailable');
    expect(d.requestReview).not.toHaveBeenCalled();
  });
});
