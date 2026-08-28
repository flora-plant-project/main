# Flora — project guide

Monorepo (pnpm). apps/mobile = Expo RN app (BUILT FIRST, runs on a mock client
by default; EXPO_PUBLIC_API_MODE=live switches it to the API).
apps/api = Express modular monolith on Prisma + Postgres.
services/workers = scheduled jobs (Lambda-shaped). Handlers are plain async
functions over an injected store, so the scheduled path and `pnpm -F @flora/workers
sweep` run the same code. DB access is the API's shared Prisma client, imported
from the `api` workspace package.
packages/shared = zod schemas + ApiResponse helpers + the demo seed dataset.
infra = AWS CDK.

## The client contract
One suite — apps/mobile/src/api/__contract__/client.contract.test.js — defines
how a Flora client behaves, and BOTH clients run it: the mock under jest, the
live client against a real API and database (`pnpm test:live`). It asserts exact
seeded ids and counts, which is why the seed lives in packages/shared and why
mock and API must answer identically. Change one client's behaviour and you
change the other, or the suite fails. That is the point.

## Language rule — read this first
- JavaScript ONLY. ES modules ("type": "module"). NO TypeScript: no .ts files,
  no tsconfig, no type-only packages. Do not scaffold TS even if a template defaults to it.
- Safety comes from: zod validation at every boundary + JSDoc @typedef for shared
  shapes (ApiResponse, RecognitionResult, SpeciesDto) + strict ESLint. Add JSDoc on
  exported functions in packages/shared and module service files.

## Conventions
- Every API response uses ApiResponse from @flora/shared: ok(data) / fail(code, message).
- API module layout: apps/api/src/modules/<name>/{routes.js, service.js, validators.js,
  __tests__/}. Routes stay thin; logic in service.js.
- Mobile screens NEVER call fetch directly — only the client interface in
  apps/mobile/src/api/ (mockClient or liveClient, chosen by EXPO_PUBLIC_API_MODE).
- Validate at the edge with zod. Schemas shared with mobile live in @flora/shared.
- DB access only through the shared Prisma client (apps/api/src/db.js).
- Photos are stored by KEY, never by URL. Rows hold `uploads/<year>/<uuid>.<ext>`;
  views expand keys to URLs at read time via the storage driver (apps/api/src/storage,
  lib/media.js), so no hostname is ever persisted. Clients upload with
  `uploads.upload(...)` and pass the key on. Local disk is the default driver — S3
  only when FLORA_S3_BUCKET is set.
- AWS SDK v3 only. Unit tests mock AWS with aws-sdk-client-mock and never hit real AWS
  or external APIs — use JSON fixtures in test/fixtures/.
- New env vars go in .env.example AND the table in infra/README.md, same commit.

## Commands
pnpm i · pnpm -F mobile start · pnpm -F mobile test · pnpm -F api dev · pnpm -F api test
pnpm lint · pnpm test (all packages) · pnpm test:live (contract vs the real API)
docker compose up -d db · pnpm -F api db:migrate · db:deploy · db:seed · db:reset
Seeding is destructive by design — it truncates the demo tables and rewrites them.

## Done means
lint + tests green, .env.example updated, one scoped commit (feat(mobile): ...).
