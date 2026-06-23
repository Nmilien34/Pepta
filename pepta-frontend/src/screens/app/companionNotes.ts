// Pure note engine for the Pep companion — contextual, prioritized, action-first
// nudges derived from HomeResponse. Helper, not coach: every nudge points at a
// concrete log action or celebrates a real win. No RN imports → testable.
//
// SEAM FOR AI: these are deterministic, local notes. A future `getCoachNotes()`
// (backend /coach → OpenAI, key server-side) can return CompanionNote[]s in this
// exact shape and be merged/prepended — no UI change needed.

import type { HomeResponse } from '@pepta/shared';
import { buildHomeView } from './homeView';
import { buildGettingStarted, type LogAction } from './planView';

export interface CompanionNote {
  id: string;
  text: string;
  emoji?: string;
  cta?: string;
  action?: LogAction;
  tone: 'nudge' | 'win';
}

export function buildCompanionNotes(home: HomeResponse): CompanionNote[] {
  const notes: CompanionNote[] = [];
  const gs = buildGettingStarted(home);
  const view = buildHomeView(home);

  // 1. New user — walk through the next undone setup step (gamified to-do).
  if (gs.show) {
    const next = gs.tasks.find((t) => !t.done && t.action);
    if (next) {
      notes.push({ id: `setup-${next.key}`, text: `Next up — ${next.label.toLowerCase()}.`, emoji: '✨', cta: 'Let’s go', action: next.action ?? undefined, tone: 'nudge' });
    } else {
      notes.push({ id: 'setup-done', text: 'You finished setup — your full dashboard is unlocked!', emoji: '🎉', tone: 'win' });
    }
  }

  // 2. Protein — the muscle-keeping lever. Gap → nudge; hit → win.
  if (view.protein.target) {
    const gap = Math.round(view.protein.target - view.protein.current);
    if (gap > 0) {
      notes.push({ id: 'protein-gap', text: `You’re ${gap}g from today’s protein — a snack closes it.`, emoji: '🍗', cta: 'Log a meal', action: 'meal', tone: 'nudge' });
    } else {
      notes.push({ id: 'protein-win', text: 'Protein goal hit for today — that’s the muscle move.', emoji: '💪', tone: 'win' });
    }
  }

  // 3. Hydration.
  if (view.water.target && view.water.current < view.water.target) {
    notes.push({ id: 'water', text: 'Hydration check — want to add a glass?', emoji: '💧', cta: 'Add water', action: 'water', tone: 'nudge' });
  }

  // 4. Streak win.
  if (home.streakDays >= 2) {
    notes.push({ id: 'streak', text: `${home.streakDays}-day streak — keep it rolling.`, emoji: '🔥', tone: 'win' });
  }

  // 5. Real backend insight (already personalized by the engine).
  const insight = home.insights[0];
  if (insight) notes.push({ id: `insight-${insight.id}`, text: insight.headline, emoji: '💡', tone: 'nudge' });

  // Always have a friendly fallback.
  if (notes.length === 0) {
    notes.push({ id: 'hello', text: 'Looking good today — tap me whenever you need a nudge.', emoji: '👋', tone: 'win' });
  }
  return notes;
}
