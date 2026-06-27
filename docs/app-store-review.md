# App Store review — demo account

Pepta signs in with **Apple** and **Google** only, so App Store reviewers can't
use normal credentials. We ship a review-only demo login (App Store Review
Guideline 2.1a), exactly like Leanient: a **"Reviewer sign-in"** link on the
sign-in screen opens a small form, and `POST /auth/demo` returns a session for a
pre-seeded account with weeks of realistic data.

## Demo credentials

| Field        | Value              |
| ------------ | ------------------ |
| **Email**    | `review@pepta.app` |
| **Password** | `PeptaReview2026!` |

> The password can be overridden in the backend via the `REVIEW_DEMO_PASSWORD`
> env var. If you change it, update both App Store Connect and this file.

## Paste this into App Store Connect → App Review Information → Notes

```
Pepta uses Sign in with Apple and Google only. For review, tap "Reviewer sign-in"
at the bottom of the sign-in screen and use:

  Email:    review@pepta.app
  Password: PeptaReview2026!

This opens a pre-populated demo account so you can try every feature:
- Home: today's macros (protein, fiber, water), medication level, streak.
- Track (+ button → Log a shot): dose history, the injection-site map that
  auto-rotates, and the medication-level curve.
- Log a meal (+ button): scan a photo or describe it by voice; the app reads the
  macros, then Confirm & log.
- Progress: weight trend, "to goal" ring, BMI, and the weekly muscle-protection
  read.
- Account: units, dose units, notifications, export, and sign out.

Pepta is a tracking + education companion for people on GLP-1 medications
(Ozempic, Wegovy, Mounjaro, Zepbound). It does not prescribe, dose, or give
medical advice. No real medication is dispensed.
```

Fill in **Sign-In required: Yes**, and put the email/password in the dedicated
**User Name / Password** fields too (App Store Connect has both a credentials box
and a Notes box — use both).

## Before you submit (one-time per environment)

The demo account only exists after the backend is deployed and the seed has run
against the **production** database.

1. **Deploy the backend** so `POST /auth/demo` exists on Render
   (commit + push `pepta-backend` + `shared`; Render auto-deploys `main`).
2. **Seed the demo data** against production. Open the **pepta-backend Shell** on
   Render (it already has `MONGODB_URI`) and run:
   ```
   npm run seed:demo
   ```
   or, from the repo with the prod URI exported:
   ```
   MONGODB_URI="<prod uri>" npx tsx pepta-backend/src/scripts/seedDemoUser.ts
   ```
   It prints the credentials and what it created. Re-running is idempotent
   (it wipes the demo account's logs and recreates them).
3. **Build/submit the app** — the "Reviewer sign-in" link calls the deployed
   `/auth/demo`. (`EXPO_PUBLIC_API_BASE_URL` must point at the Render backend.)

## What the seed creates

`pepta-backend/src/scripts/seedDemoUser.ts` builds, for `review@pepta.app`:

- An onboarded profile (male, 38, 6'0", 196 → 175 lb goal, steady pace) with an
  **active entitlement** so premium features are unlocked.
- A **Tirzepatide** compound (5 mg weekly, Sunday) via the real onboarding path,
  so all derived targets (calories, protein, fiber, water, steps) are computed.
- **11 weekly weigh-ins** trending 213 → 196 lb.
- **10 weekly doses** across rotating injection sites + the medication-level curve.
- **4 meals**, plus water / protein / fiber logs for today.
- **3 body measurements** and **1 early, mild side effect** (resolved).
