/**
 * The demo account used only for App Store review (guideline 2.1a). A reviewer
 * taps "Reviewer sign-in" on the sign-in screen and lands on a pre-seeded account
 * with weeks of realistic data. Seed it with `npm run seed:demo`; the login is
 * handled by `signInWithReviewAccount`. The password can be overridden via the
 * REVIEW_DEMO_PASSWORD env var; the default lets review work out of the box.
 * This is a read-only-style demo, not a real user.
 */
export const DEMO_ACCOUNT = {
  email: "review@pepta.app",
  password: process.env.REVIEW_DEMO_PASSWORD ?? "PeptaReview2026!",
  displayName: "App Reviewer",
};
