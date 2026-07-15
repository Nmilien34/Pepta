# Backend AI Push Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production backend push delivery for Pep companion nudges with explicit server-side AI personalization consent.

**Architecture:** Store Expo push tokens per user/device, store AI-push consent on the user, generate high-priority Pep push copy from a compact logged-data context, and send through Expo's backend push API. Local reminders remain as fallback; OpenAI is called only when the user opted into AI-personalized push copy.

**Tech Stack:** TypeScript, Express, Mongoose, Zod shared schemas, Expo Notifications, node-cron, OpenAI.

---

### Task 1: Shared Contracts

**Files:**
- Modify: `shared/src/schemas/index.ts`
- Modify: `shared/src/types/index.ts`
- Test: `shared/src/schemas/index.test.ts`

- [ ] Add push token registration request/response schemas.
- [ ] Add notification preference patch/response schemas.
- [ ] Export inferred shared types.
- [ ] Run `npm --prefix shared test -- src/schemas/index.test.ts`.

### Task 2: Backend Token And Consent Services

**Files:**
- Create: `pepta-backend/src/models/push-token.model.ts`
- Modify: `pepta-backend/src/models/user.model.ts`
- Modify: `pepta-backend/src/models/index.ts`
- Create: `pepta-backend/src/services/pushToken.service.ts`
- Modify: `pepta-backend/src/routes/me.routes.ts`
- Test: `pepta-backend/src/tests/services/pushToken.service.test.ts`

- [ ] Add `PushTokenModel` with `userId`, `token`, `platform`, `deviceId`, `appVersion`, `enabled`, and `lastSeenAt`.
- [ ] Add `notificationPreferences` to the user model with AI push consent timestamps.
- [ ] Implement token upsert and AI consent update services.
- [ ] Wire `/me/push-tokens` and `/me/notification-preferences`.
- [ ] Run `npm --prefix pepta-backend test -- src/tests/services/pushToken.service.test.ts`.

### Task 3: Pep Push Copy

**Files:**
- Create: `pepta-backend/src/services/pepPushCopy.service.ts`
- Test: `pepta-backend/src/tests/services/pepPushCopy.service.test.ts`

- [ ] Build compact context from `HomeResponse` and `TrackResponse`.
- [ ] Select only push-worthy priorities such as dose due, post-dose check-in, and major protein gaps.
- [ ] Generate AI copy only with server-side consent.
- [ ] Fall back to deterministic Pep copy when consent is absent or OpenAI fails.
- [ ] Run `npm --prefix pepta-backend test -- src/tests/services/pepPushCopy.service.test.ts`.

### Task 4: Delivery And Scheduler

**Files:**
- Create: `pepta-backend/src/models/pep-push-delivery.model.ts`
- Create: `pepta-backend/src/services/pushDelivery.service.ts`
- Create: `pepta-backend/src/services/pepPushScheduler.service.ts`
- Modify: `pepta-backend/src/config/env.ts`
- Modify: `pepta-backend/src/index.ts`
- Test: `pepta-backend/src/tests/services/pushDelivery.service.test.ts`
- Test: `pepta-backend/src/tests/services/pepPushScheduler.service.test.ts`

- [ ] Send remote notifications through Expo's push API.
- [ ] Skip invalid Expo tokens.
- [ ] Add duplicate protection by user, priority, and window key.
- [ ] Schedule high-priority push maintenance with node-cron outside tests.
- [ ] Run delivery and scheduler service tests.

### Task 5: Frontend Registration And Consent UI

**Files:**
- Modify: `pepta-frontend/src/services/api.ts`
- Modify: `pepta-frontend/src/services/reminderNotification.service.ts`
- Modify: `pepta-frontend/src/screens/app/ReminderSettingsScreen.tsx`
- Modify: `pepta-frontend/src/tests/setup.ts`
- Test: `pepta-frontend/src/services/api.test.ts`
- Test: `pepta-frontend/src/tests/services/reminderNotification.service.test.ts`

- [ ] Add API methods for push token registration and AI notification preferences.
- [ ] Register Expo push tokens with the backend after notification permission is granted.
- [ ] Add a separate AI-personalized Pep notification consent toggle with clear copy.
- [ ] Run frontend API and reminder notification tests.
