# Pepta

Pepta is the GLP-1 and peptide companion app focused on dose tracking, medication levels, protein, hydration, side effects, progress, and muscle and facial-structure retention.

This repo follows Leanient's architecture: shared Zod contracts first, Express backend second, Expo frontend scaffold third. AI may write prose, but deterministic backend logic owns every number.

## Structure

| Folder | Purpose |
| --- | --- |
| `shared/` | `@pepta/shared` Zod schemas, constants, utilities, and derived types |
| `pepta-backend/` | Express 5 + TypeScript API for Render |
| `pepta-frontend/` | Expo React Native skeleton for the next UI agent |

## Prerequisites

- Node.js 20 or newer
- npm
- MongoDB Atlas or local MongoDB
- Google OAuth client ID
- Optional Apple Sign-In identifiers
- AWS S3 bucket for private media
- RevenueCat project for subscriptions
- OpenAI API key for meal scanning and generated prose

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

The root dev script builds `shared/`, then starts:

- `shared`: TypeScript watch build
- `pepta-backend`: `tsx watch src/index.ts`
- `pepta-frontend`: Expo dev server

## Quality Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Backend Env

Copy `.env.example` into `pepta-backend/.env` for local API work. Do not commit real secrets.

Required production variables:

- `NODE_ENV`
- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `GOOGLE_CLIENT_ID`
- `FRONTEND_ORIGIN`
- `AWS_REGION`
- `AWS_S3_BUCKET_NAME`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`

Optional Apple variables:

- `APPLE_TEAM_ID`
- `APPLE_CLIENT_ID=ai.boltzman.pepta`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY_BASE64`

## Render

Build:

```bash
npm install --include=dev && npm run build -w @pepta/shared && npm run build -w @pepta/backend
```

Start:

```bash
npm start -w @pepta/backend
```

Health check:

```text
/healthz
```

## API Response Shape

Success responses use:

```json
{ "data": {} }
```

Errors use:

```json
{ "error": { "code": "ERROR_CODE", "message": "Readable message", "details": {} } }
```
