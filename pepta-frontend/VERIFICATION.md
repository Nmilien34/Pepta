# Session replay masking — human verification

**Session replay ships OFF.** It records nothing until someone completes this
checklist and then explicitly enables it. Events, `identify` and `reset` are
fully live and unaffected — only recording is gated.

This is a GLP-1 medication app. A replay that shows a dose, a weight or a
medication name is a medical record. Automated tests can prove the masking
*prop* is present; only a real replay proves the *pixels* are redacted. That is
what this checklist is for.

---

## Why it is off

`enableSessionReplay` is driven by `EXPO_PUBLIC_POSTHOG_SESSION_REPLAY`, which
is unset. With it false the native recorder never initialises, so there is no
recorder to mis-sample — a stronger guarantee than `sampleRate: 0`, which still
boots one. The sample rate is 0 as well, so flipping only one of the two still
records nothing.

---

## 1. Build with replay temporarily on

In `pepta-frontend/.env`:

```
EXPO_PUBLIC_POSTHOG_SESSION_REPLAY=true
```

Then build to a device or TestFlight as normal. **Do not commit this change.**

Confirm before continuing: PostHog → Project Settings → **Record user sessions**
must be enabled, or the SDK records nothing regardless of app config and this
whole pass is a false negative.

## 2. Exercise every masked surface

Walk each of these and let real values render:

- [ ] **Home** — dose card, next-shot timing, medication level
- [ ] **Track** — dose history rows, log a dose through the quick-log sheet
- [ ] **Progress** — weight chart and any trend numbers
- [ ] **Weight detail** — open a weight entry
- [ ] **Dose settings** — dose amount, unit, schedule
- [ ] **Mix calculator** — concentration and units drawn
- [ ] **Medication level card** — tap into the curve
- [ ] **Shot detail sheet** — open a logged shot
- [ ] **Schedule / dose-time / timing sheets**
- [ ] **Add compound sheet** — type a compound name
- [ ] **Library entry** — open a medication entry
- [ ] **Cycle setup**, **Widget setup**, **Activity log**

Use *recognisable* values — a distinctive weight like `227.4`, a compound name
you can search for. If it leaks, you want to spot it instantly.

## 3. Wait for the replay

PostHog → **Session Replay**. Allow a few minutes; recordings arrive behind
events. Find the session by the `build_number` you just installed.

## 4. Confirm and screenshot

For every surface in step 2:

- [ ] Every dose, weight, medication and compound renders as a **masked block**,
      not as text
- [ ] Screenshot each one

Keep the screenshots. Apple sometimes probes health apps on data collection at
review, and these are the evidence.

**Check the edges specifically** — masking is inherited from a container, so
anything rendering *outside* it is the likely leak:

- [ ] Navigation headers and screen titles
- [ ] Toasts, alerts, and confirmation banners after logging a dose
- [ ] Chart tooltips and axis labels drawn in SVG
- [ ] Anything in a Modal — modals render in a **separate native hierarchy**,
      so a parent's mask does not reach them

## 5. If anything leaks

Do not enable replay. Add the leaking container to `MASKED_SURFACES` in
`src/components/MaskedHealthValue.test.tsx` and spread `MASK_PROPS` onto it
(or pass `panelProps={MASK_PROPS}` for a `BottomSheet`). Then repeat from step 2.

## 6. Only then, enable it

Set `EXPO_PUBLIC_POSTHOG_SESSION_REPLAY=true` in the **production** environment
and ship it in a build whose masking you verified above.

Enabling replay adds **no new privacy-label data types** — recordings are Usage
Data, which the label already declares. Masking is a mitigation, not a category.
See the `posthog-privacy-label` note.

---

## What automation already covers

`src/components/MaskedHealthValue.test.tsx`:

- The literal `ph-no-capture` matches what the pinned iOS pod greps for
  (`PostHog/Replay/UIView+Util.swift`)
- `collapsable: false`, so RN cannot flatten the view and silently un-mask it
- `importantForAccessibility: "no"`, so VoiceOver still reads the real value
- A registry of all 19 masked surfaces, asserting **usage** rather than the
  imported identifier — the weaker check passes on a leftover import
- No surface masks a `BottomSheet` with a bare spread, which type-checks and
  does nothing

None of that proves a pixel is redacted. Step 4 does.
