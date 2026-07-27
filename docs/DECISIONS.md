# Architecture Decision Records

This document captures every significant design decision made during the build
of the Fintech Payment Processing API. Each entry answers three questions:
1. What problem does this solve?
2. What was traded away to get it?
3. What breaks if you change it?

---

## ADR-001: Fastify over Express

**Decision:** Use Fastify as the HTTP framework.

**Problem solved:** Express requires separate libraries for schema validation,
response serialization, and OpenAPI generation — all maintained independently.
Contract drift between validation logic and API docs is a real maintenance burden.

**Trade-off:** Smaller ecosystem than Express. Fastify's plugin system has a
steeper learning curve. Some Express middleware is incompatible.

**What breaks if changed:** Removing Fastify removes schema-first validation.
You lose automatic Swagger generation and must maintain a separate OpenAPI spec.
Response serialization performance also degrades.

---

## ADR-002: Monorepo with npm workspaces

**Decision:** Single repo, three packages — `apps/api`, `apps/worker`,
`packages/shared`. No Turborepo or Nx.

**Problem solved:** The API (producer) and worker (consumer) need to share
queue definitions, domain types, and service logic without copy-pasting or
publishing to npm.

**Trade-off:** No incremental build caching (Turborepo would add this).
All packages build together. Acceptable for a two-service project.

**What breaks if changed:** Moving to separate repos requires publishing
`@fintech/shared` to npm or using `npm link`. Queue name and payload type
drift becomes possible — the silent failure mode we explicitly designed against.

---

## ADR-003: Raw SQL with `pg` over an ORM

**Decision:** Write raw SQL using the `pg` driver directly.

**Problem solved:** Financial systems require explicit `BEGIN/COMMIT/ROLLBACK`
control. ORMs abstract this away. Payment creation must atomically insert the
payment record and webhook delivery records — partial writes are unacceptable.

**Trade-off:** No auto-generated queries. Schema changes require manual
migration files. More SQL to write upfront.

**What breaks if changed:** An ORM's transaction API may not support the
pattern of enqueuing BullMQ jobs after a successful commit. The explicit
client checkout/release pattern would need to be re-implemented.

---

## ADR-004: PostgreSQL for payment state

**Decision:** PostgreSQL with ACID transactions for all payment and webhook data.

**Problem solved:** A payment is a state machine. The operations that create
one — deducting a balance, creating a record, crediting a merchant, queuing
a webhook — must all succeed or all fail. Partial writes mean money disappears.

**Trade-off:** Horizontal write scaling is harder than with MongoDB.
Schema changes require migrations. Acceptable trade-off — correctness
is non-negotiable for financial data.

**What breaks if changed:** Switching to MongoDB loses row-level locking,
foreign key constraints, and the `UNIQUE` index on `idempotency_key` that
prevents duplicate payments at the DB level. Race condition protection moves
into application code where bugs cause financial loss.

---

## ADR-005: Redis for idempotency keys

**Decision:** Redis `SET NX EX` for hot-path idempotency checks, not PostgreSQL.

**Problem solved:** Every payment request checks the idempotency key before
processing. Under load, this lookup consumes DB connections needed for actual
payment transactions.

**Trade-off:** Redis is an additional infrastructure dependency. If Redis goes
down, idempotency checks fail open (fall through to DB unique constraint as
the safety net).

**What breaks if changed:** Using PostgreSQL for idempotency adds a disk-backed
roundtrip to every payment request before any business logic runs. Under load,
this starves the connection pool. The `UNIQUE` index on `idempotency_key` is
still the source of truth — Redis is a fast-path optimisation, not the
correctness guarantee.

---

## ADR-006: Shared queue definition in `packages/shared`

**Decision:** BullMQ queue name, options, and job payload type defined once
in `packages/shared`, imported by both API and worker.

**Problem solved:** If the API and worker each define the queue independently,
a rename or payload shape change in one doesn't propagate to the other.
Jobs pile up in a queue no worker is listening to — silent failure.

**Trade-off:** Both services must be redeployed when queue config changes.
Acceptable — queue config changes should be intentional and coordinated.

**What breaks if changed:** Independent definitions mean TypeScript can't
catch payload mismatches across service boundaries. The bug surfaces at
runtime when the worker can't process a job, not at compile time.

---

## ADR-007: Enqueue webhook jobs after DB commit, not inside the transaction

**Decision:** BullMQ jobs are enqueued after `COMMIT`, not inside the
`BEGIN/COMMIT` block.

**Problem solved:** If the job is enqueued inside the transaction and the
transaction rolls back, the job is already in Redis. The worker attempts
delivery of a webhook for a payment that doesn't exist in the DB.

**Trade-off:** There is a window between `COMMIT` and enqueue where a crash
means the job is never queued. Recovery requires a sweep of `webhook_deliveries`
records with `status = 'pending'` and `attempt_count = 0`. This is the
standard at-least-once delivery trade-off.

**What breaks if changed:** Moving enqueue inside the transaction creates
phantom deliveries for rolled-back payments. Receiving servers get webhook
events for payments that don't exist — data integrity violation.

---

## ADR-008: Webhook payload signed with HMAC-SHA256

**Decision:** Each registered webhook gets a unique random secret. The worker
signs every payload with `HMAC-SHA256` using that secret and sends the
signature in the `X-Webhook-Signature: sha256=<hex>` header.

**Problem solved:** Without signing, any actor can POST fake webhook events
to a customer's endpoint. The customer has no way to verify the payload is
authentic.

**Trade-off:** Receiving servers must implement signature verification. This
adds integration complexity for consumers of the API.

**What breaks if changed:** Removing signing means customers can't distinguish
legitimate events from spoofed ones. This is a security regression — Paystack,
Stripe, and GitHub all sign webhook payloads for this reason.

---

## ADR-009: BullMQ exponential backoff, 5 attempts

**Decision:** Webhook delivery retries 5 times with exponential backoff
starting at 1 second (1s, 2s, 4s, 8s, 16s).

**Problem solved:** Transient failures (network blip, receiver temporarily
down) should not permanently fail delivery. Retrying with backoff gives the
receiver time to recover without hammering it.

**Trade-off:** Maximum delivery window is ~31 seconds. Some use cases require
longer retry windows (Paystack retries for 72 hours). Extending this requires
increasing `attempts` and adjusting the backoff delay.

**What breaks if changed:** Reducing attempts increases permanent failure rate
for transient errors. Removing backoff hammers failing receivers and risks
triggering their rate limiters (as observed with webhook.site in testing).

---

## ADR-010: fast-uri CVE deferral (GHSA-q3j6-qgpj-74h6)

**Date:** 2026-07-11
**Decision:** Defer upgrade to Fastify v5 until after core API is complete.

**Reason:** The fix requires `npm audit fix --force` which installs Fastify v5,
a breaking change. `@fastify/swagger` and `@fastify/swagger-ui` compatibility
with v5 needs verification. CVEs affect path traversal via percent-encoded
segments — low risk in a portfolio context with no public traffic.

**Revisit:** Before production deployment.

---

## ADR-011: Docker Compose for local dev only

**Decision:** PostgreSQL and Redis run in Docker containers locally.
Node processes run on the host, not in containers.

**Problem solved:** Eliminates "works on my machine" for infrastructure.
Every developer gets the same PostgreSQL version, same Redis version,
same schema state.

**Trade-off:** Production deployment uses managed services (Railway/Render),
not Docker Compose. Local and production environments differ at the
infrastructure layer — this is intentional for $0 budget constraint.

**What breaks if changed:** Running Node in Docker during development adds
volume mount complexity on Windows (path translation, file watch latency).
Not worth the overhead for a single-developer project.

---

## ADR-012: Railway build cache served a stale script despite correct committed source

**Status:** Resolved

**Context:**

A bug was found where `packages/shared`'s build step compiled TypeScript
via `tsc` but never copied the SQL migration files (`.sql`) into `dist/`.
Locally this never surfaced because `ts-node` ran directly against `src/`,
where the SQL files sit next to the source. In production, the compiled
`migrate.js` in `dist/` expected `dist/db/migrations` to exist — it didn't.

The fix was straightforward: change the `build` script in
`packages/shared/package.json` from `tsc` to `tsc && cp -r src/db/migrations
dist/db/migrations`.

The fix was committed and pushed to `main`. Over three separate Railway
deploys spanning two days, the build logs continued to echo the **old**
script (`> tsc`), and the runtime kept failing with:

```
Error: ENOENT: no such file or directory, scandir '.../dist/db/migrations'
```

This happened despite:
- `git show <commit>:packages/shared/package.json` confirming the fix was
  correctly committed on `main`
- `git rev-parse --short=8 HEAD` matching the pushed commit
- Railway reporting a "fetched snapshot" on every build attempt

**Decision:**

Rather than continuing to re-edit the file (which was already correct),
the build command itself was temporarily changed to:

```
cat packages/shared/package.json && npm run build:api
```

This is a diagnostic, not a fix — printing the file content Railway
actually had, immediately before running the build. The `cat` output
confirmed the file was correct all along. More importantly, changing the
literal text of the `RUN` instruction gave Docker/BuildKit a new cache key,
forcing it to actually re-execute the build step instead of reusing a
cached layer. On that build, the correct script (`tsc && cp -r ...`)
finally appeared in the log, and the deployment succeeded.

**Consequences:**

- No code change was the actual fix. The source was correct through all
  three failed attempts — the problem was Railway's build layer caching
  reusing a stale execution of the `RUN npm run build:api` step, not
  re-reading changed source underneath it.
- The precise root cause (why the `COPY . /app/.` layer wasn't invalidated
  by a genuine file content change) isn't confirmed. Suspected interaction
  between Nixpacks-generated Dockerfiles and BuildKit's `--mount=type=cache`
  layers, but this isn't diagnosable from application-level logs alone.
- **Working diagnostic pattern for future incidents:** if a build log's
  echoed script doesn't match the file's actual committed content, don't
  assume the commit is wrong — verify with `git show <sha>:<path>` first.
  If the commit is confirmed correct but the build still runs stale, mutate
  the build command's literal text (even a harmless prefix like `cat` or
  `echo`) to force a cache-key change, and check whether the correct script
  appears on the next build. This isolates "stale cache" from "wrong
  commit deployed" definitively, rather than guessing.
- If this recurs on a future deploy, escalate to Railway support with this
  ADR and the associated build logs as evidence, rather than re-debugging
  from scratch.
