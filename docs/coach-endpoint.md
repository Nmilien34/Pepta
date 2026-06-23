# `GET /coach` — AI companion notes (backend spec for Codex)

Powers the floating **Pep companion** in the app. The frontend already consumes this
exact shape (`api.getCoachNotes()` in `pepta-frontend/src/services/api.ts`) and merges
the result ahead of its local notes — so when this endpoint goes live, the AI notes
light up with **no app change**. Until it exists, the call 404s and Pep falls back to
the local note engine (`companionNotes.ts`). Build it to degrade the same way: on any
OpenAI error, return `{ notes: [] }`.

## Contract

`GET /coach` — auth required (`requireAuth`). No request body; the server derives all
context from the authenticated user.

**Response** (the standard `{ data }` envelope):

```jsonc
{
  "data": {
    "notes": [
      {
        "id": "string",                 // stable per note (e.g. "ai-protein-1")
        "text": "string",               // the note, <= ~90 chars, sentence case
        "emoji": "🍗",                  // optional, one leading emoji
        "cta": "Log a meal",            // optional; required if `action` is set
        "action": "dose|meal|water|weight", // optional; deep-links the app to that log flow
        "tone": "nudge" | "win"         // "nudge" = action to take, "win" = celebrate
      }
    ]
  }
}
```

`action` MUST be one of `dose | meal | water | weight` (these map to the app's log
sheets). Omit `action`/`cta` for pure encouragement (`tone: "win"`). Return **1–3**
notes, most important first.

## Implementation

1. **Gather context** for the user (same data `/home` already computes): profile
   (goal weight, pace, `targetWeeklyLossPercent`, biggest worry), today's
   protein/calories/fiber/water vs. their targets, medication level + next dose,
   `setupProgress` (is the user still onboarding?), streak, and a few recent logs.
2. **Prompt OpenAI** (e.g. `gpt-4o-mini`) with JSON / structured-output mode bound to
   the schema above. System prompt essentials:
   - "You are **Pep**, a friendly GLP-1 **tracker helper** — not a coach."
   - Every note is **either an action the user can take in the app, or a real win to
     celebrate**. Never give advice/opinions.
   - **Hard safety rule:** never advise changing, increasing, or skipping a dose;
     never give medical or clinical guidance. Stick to logging nudges + encouragement.
   - Keep each note ≤ ~90 chars, warm, lightly playful, sentence case.
   - Prefer the user's biggest lever (usually protein for muscle retention).
3. **Key stays server-side** — `OPENAI_API_KEY` from the backend env. Never expose it
   to the client (the app cannot and must not call OpenAI directly).
4. **Cost control** — cache per user for ~1–6h (the app fetches once per session), or
   rate-limit. The notes don't need to be real-time.
5. **Fallback** — on timeout / OpenAI error / safety filter, return `{ notes: [] }`
   (200). The app then shows its deterministic local notes; nothing breaks.

## Notes
- The deterministic local engine (`companionNotes.ts`) is the reference for tone,
  priority, and the kinds of nudges that work — mirror its voice.
- If you later want the app to *blend* AI + local notes differently (e.g. AI only),
  that's a frontend tweak in `PepCompanion.tsx`; the contract above stays stable.
