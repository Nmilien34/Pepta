# Pepta Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working Pepta monorepo foundation with shared contracts, backend scaffolding, deterministic tests, and a frontend handoff shell.

**Architecture:** Follow Leanient's npm workspace and backend layering, adapting names/contracts for Pepta. Keep computed data in pure tested libs and reserve AI integrations for prose generation services.

**Tech Stack:** Node 20, TypeScript strict, npm workspaces, Zod, Express 5, Mongoose, Vitest, Supertest, Expo React Native.

---

### Task 1: Workspace Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `eslint.config.mjs`

- [ ] Add root npm workspaces for `shared`, `pepta-backend`, and `pepta-frontend`.
- [ ] Add build/typecheck/test scripts that run packages in dependency order.
- [ ] Document local env, Render commands, and quality commands.

### Task 2: Shared Contracts

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/constants/index.ts`
- Create: `shared/src/schemas/index.ts`
- Create: `shared/src/types/index.ts`
- Create: `shared/src/utils/index.ts`

- [ ] Define constants and enum schemas for auth, profile, medication, logs, cycles, insights, photos, research, subscriptions, and API errors.
- [ ] Split request/input schemas from response schemas.
- [ ] Export derived TypeScript types from every public schema.

### Task 3: Backend Foundation

**Files:**
- Create: `pepta-backend/package.json`
- Create: `pepta-backend/tsconfig.json`
- Create: `pepta-backend/vitest.config.ts`
- Create: `pepta-backend/src/app.ts`
- Create: `pepta-backend/src/index.ts`
- Create: `pepta-backend/src/config/env.ts`
- Create: `pepta-backend/src/db/mongo.ts`
- Create: `pepta-backend/src/lib/errors.ts`
- Create: `pepta-backend/src/lib/logger.ts`
- Create: `pepta-backend/src/lib/responses.ts`
- Create: `pepta-backend/src/lib/async-handler.ts`
- Create: `pepta-backend/src/middleware/*.ts`
- Create: `pepta-backend/src/auth/*.ts`
- Create: `pepta-backend/src/routes/*.ts`

- [ ] Add app factory, health route, CORS, helmet, JSON limits, request logging, auth middleware, validation middleware, and central error middleware.
- [ ] Add JWT, Google, and Apple verification modules with graceful Apple 503 behavior.

### Task 4: Deterministic Libraries

**Files:**
- Create: `pepta-backend/src/lib/pharmacokinetics.ts`
- Create: `pepta-backend/src/lib/nutrition.ts`
- Create: `pepta-backend/src/lib/muscle-retention.ts`
- Create: `pepta-backend/src/lib/insight-detectors.ts`
- Create: `pepta-backend/src/lib/dates.ts`
- Create: matching tests in `pepta-backend/src/tests/lib/`

- [ ] Write failing Vitest tests first.
- [ ] Implement only enough deterministic logic to satisfy tests.
- [ ] Keep all AI-facing prose out of these libs.

### Task 5: Models And Services

**Files:**
- Create: Mongoose models in `pepta-backend/src/models/`
- Create: service modules in `pepta-backend/src/services/`

- [ ] Add user, profile, compounds/catalog, logs, cycles, schedules, progress photos, insights, weekly retention, research, and subscription event models.
- [ ] Add service skeletons that serialize documents to shared response schemas.
- [ ] Add idempotent seed scripts for medication catalog, workout catalog, and research library.

### Task 6: Frontend Scaffold

**Files:**
- Create: `pepta-frontend/package.json`
- Create: `pepta-frontend/tsconfig.json`
- Create: `pepta-frontend/app.json`
- Create: `pepta-frontend/App.tsx`
- Create: `pepta-frontend/src/context/*.tsx`
- Create: `pepta-frontend/src/services/api.ts`
- Create: `pepta-frontend/src/theme/theme.ts`
- Create: `pepta-frontend/.env.example`
- Create: `FRONTEND_HANDOFF.md`

- [ ] Add a minimal provider-wrapped app state machine.
- [ ] Add typed API methods mapped to backend endpoints.
- [ ] Leave screen/component directories empty for the UI agent.

### Task 7: Verification

- [ ] Run `npm install`.
- [ ] Run `npm run build -w @pepta/shared`.
- [ ] Run `npm run typecheck -ws --if-present`.
- [ ] Run `npm run test -ws --if-present`.
- [ ] Run `npm run build -ws --if-present`.
