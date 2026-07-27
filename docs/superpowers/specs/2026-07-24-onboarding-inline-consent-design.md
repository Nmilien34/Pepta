# Onboarding Inline Consent Design

## Goal

Reduce early-onboarding friction by removing the dedicated privacy-consent
screen. The first Welcome CTA becomes the consent moment without weakening
access to Pepta's Terms or Privacy Policy.

## Approaches considered

1. **Inline consent on the Welcome screen (selected).** Put linked consent copy
   immediately below the first `I'm ready` CTA and advance directly to Meet
   Pep. This removes a tap while keeping the agreement next to the action that
   starts onboarding.
2. Keep a shortened privacy screen. This preserves the current interruption
   and therefore does not achieve the friction-reduction goal.
3. Rely only on the existing consent copy at sign-in. This removes the early
   interruption, but the agreement appears much later than the action that
   begins onboarding.

## User experience

- The first screen keeps its current message and `I'm ready` CTA.
- Directly beneath the CTA, show:
  `By continuing, you agree to Pepta's Terms and Privacy Policy.`
- `Terms` and `Privacy Policy` are independently tappable, accessible links
  opening the existing configured legal URLs.
- The returning-user `Sign in` action remains below the consent copy.
- Tapping `I'm ready` advances directly from Welcome to Meet Pep.
- Back navigation from Meet Pep returns directly to Welcome.
- The dedicated privacy screen is no longer part of the funnel or its progress
  calculation.

## Architecture

- Extract the existing linked legal copy from the sign-in screen into one
  focused, reusable presentation component.
- Render that component on both Welcome and Sign In so wording, destinations,
  accessibility roles, and URL error handling cannot drift.
- Remove `privacy` from the ordered onboarding step contract and from the
  navigator's screen map.
- Keep the old `PrivacyScreen` source out of production imports; remove it and
  its obsolete screen-specific test once replacement coverage exists.

## Saved-draft compatibility

An installed build may have persisted an in-progress draft whose current step
is `privacy`. Draft parsing will migrate that legacy step to `meetPep`. Other
known steps and stored answers remain unchanged. Unknown or malformed drafts
retain the existing safe fallback behavior.

## Consent semantics

No backend consent record is removed because the current privacy screen does
not persist a distinct consent artifact; its acceptance handler only advances
the local onboarding state. The new copy makes the same agreement explicit at
the first continuation action.

## Testing

- Flow test: Welcome's next step is Meet Pep, Meet Pep's previous step is
  Welcome, `privacy` is absent, and progress values use the shorter funnel.
- Draft test: a legacy `privacy` draft resumes at Meet Pep while preserving
  answers.
- Component test: both legal labels render as links and open the configured
  Terms and Privacy URLs.
- Welcome test: the inline legal component is present with the first CTA.
- Run focused onboarding/auth tests, frontend typechecking, and the frontend
  test suite.

