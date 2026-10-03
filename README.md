# Medication Adherence + Interaction Checker

Full-stack health tech app: tracks medication adherence, sends
scheduled reminders, and checks a user's medication list for known
or possible drug interactions against an openFDA-sourced catalog.

**Status: Live.** All three services deployed and independently
verified end-to-end - see [Deployment](#deployment) below.

- **Frontend:** https://medication-adherence-checker.vercel.app
- **API:** https://medtrack-api-wuad.onrender.com

## What it does

- Register, log in, and manage a personal medication list
- Track dose schedules and log doses taken/missed
- Get email reminders on schedule (BullMQ + Resend)
- Check any combination of medications for known or possible
  interactions - curated drug-pair data plus a text-scan fallback
  against an openFDA-seeded catalog
- Full adherence summary view

This is not medical advice. A disclaimer to that effect is shown
throughout the app.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces (`apps/api`, `apps/worker`, `apps/web`, `packages/shared`) |
| Backend | Node.js v20, TypeScript, Fastify |
| Database | PostgreSQL via Neon (separate `production`/`development` branches) |
| Auth | JWT access (15min, header) + httpOnly-cookie refresh (7day), bcrypt |
| Queue | BullMQ + Upstash Redis, environment-isolated via a `bull`/`bull-dev` key prefix |
| Email | Resend |
| Frontend | Next.js 16, React 19, Tailwind v4 |
| Deployment | Render (`medtrack-api`, `medtrack-worker`) + Vercel (`apps/web`) |

Every non-trivial architecture and infrastructure decision is logged
in [`docs/DECISIONS.md`](docs/DECISIONS.md) in a three-question
format: what problem it solves, what was traded away, what breaks if
you change it. The full build narrative - including real bugs hit
and how they were diagnosed - is in
[`docs/BUILD_LOG.md`](docs/BUILD_LOG.md).

## Deployment

All three services are deployed on free tiers and independently
verified live:

- **`medtrack-api`** (Render Web Service) - handles auth, medication
  CRUD, and interaction checking.
- **`medtrack-worker`** (Render Web Service, not a Background Worker
  - Render's free tier has no free Background Worker type, so this
  runs the BullMQ consumer behind a bare health-check HTTP endpoint
  instead) - processes scheduled reminders.
- **`apps/web`** (Vercel) - the Next.js frontend.

A full end-to-end smoke test (registration, medication CRUD,
interaction check) was verified live against the deployed stack via
an exported HAR file, confirming correct CORS behavior and working
cross-origin auth between the real Vercel and Render origins.

**Known limitations, current as of the last deploy:**
- No uptime pinger is configured yet for `medtrack-api`/
  `medtrack-worker`. Free-tier Render services spin down after
  inactivity, so a cold first request takes 30-60+ seconds, and
  scheduled reminders won't fire while the worker is asleep.
- Email delivery via Resend is sandbox-restricted to a verified
  testing address until a custom domain is verified.

## Local development

```bash
npm install
cp apps/api/.env.example apps/api/.env      # fill in DATABASE_URL, REDIS_URL, JWT secrets
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.local.example apps/web/.env.local

npm run build -w packages/shared
npm run dev -w apps/api
npm run dev -w apps/worker
npm run dev -w apps/web
```

Requires a Postgres instance (Neon recommended) and a Redis instance
(Upstash recommended). See `docs/DECISIONS.md` for why each of these
choices was made.
