# Pepta Foundation Design

**Goal:** Build the Pepta monorepo foundation so backend, shared contracts, and the Expo handoff scaffold can grow from the Leanient architecture without touching sibling projects.

**Approved Direction:** Pepta is the only writable project. Leanient is the primary reference for workspace layout, shared Zod contracts, Express service layering, auth, env validation, middleware, logging, deterministic math, S3, RevenueCat, and tests. Carbon-Foster is a secondary reference only.

## Scope

This first build pass creates the workspace, shared package, backend foundation, deterministic pure libraries, route/middleware scaffolding, and a compiling frontend shell. It does not attempt polished React Native screens, visual design, or production deployment.

## Architecture

The repo is an npm workspace with three packages: `@pepta/shared`, `@pepta/backend`, and `@pepta/frontend`. Shared owns Zod schemas and exported TypeScript types. Backend imports shared schemas for request validation and response contracts. Frontend imports shared response types through a typed API service, but stays skeletal for the next UI agent.

Backend follows Leanient's layering:

- `src/app.ts`: Express app factory for tests.
- `src/index.ts`: database connection, listen, scheduler lifecycle.
- `src/config/env.ts`: dotenv plus Zod validation.
- `src/middleware`: auth, request logging, body validation, error envelope.
- `src/models`: Mongoose documents with `userId` plus datetime indexes on logs.
- `src/routes`: thin route modules that validate input and call services.
- `src/services`: persistence/orchestration and integration boundaries.
- `src/lib`: pure deterministic math and date helpers, unit-tested in isolation.

## Core Rules

All computed numbers are deterministic. OpenAI may generate prose around already-computed signals, but it never invents medication levels, targets, retention scores, diagnostics, or detector values.

Aggregate read endpoints (`/home`, `/track`, `/progress`) should use `Promise.allSettled` so partial data can render with section errors instead of failing the whole response.

Auth uses Google and Apple identity tokens, then Pepta issues its own JWT. Apple Sign-In is optional at boot and returns a 503 route error when env vars are missing.

## Testing

The first mandatory tests cover deterministic libraries:

- pharmacokinetics: exponential half-life accumulation and next-dose countdown.
- nutrition: Mifflin-St Jeor calorie/protein targets with GLP-1 retention tuning.
- muscle retention: score weighting and driver outputs.
- insight detectors: deterministic signals with no AI dependency.
- dates: UTC Monday week ranges and cycle-day math.

Route integration tests should cover the app factory, auth-protected routes, health, onboarding, medication level, log creation, and RevenueCat webhook behavior as service depth is added.

## Handoff

The frontend scaffold includes contexts, a typed API service, empty screen/component directories, an empty theme token file, a state-machine `App.tsx`, and `FRONTEND_HANDOFF.md` mapping endpoints to shared response types.

## Non-Goals

- No real `.env` secrets.
- No commits or pushes.
- No React Native screen design.
- No sibling project edits.
