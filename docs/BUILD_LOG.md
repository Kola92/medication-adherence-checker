# Project 3 — Medication Adherence & Interaction Checker: Build Log

## CHAT 1

---

### 0. Kickoff — reconciling stale docs

The chat opened with a correction: the uploaded `PROJECT_BRIEF.md` was stale (still listed Project 2 as "starting now" and Project 3 as Fraud Detection). The actual current state — confirmed from the prior session — was: Project 2 (Fintech Payment Processing API) complete and deployed on Railway with its article published, and Project 3 revised to **Medication Adherence + Interaction Checker**. The stale file was explicitly set aside in favor of current state.

**Locked from prior decisions before this chat began:**
- Node.js + Fastify (reusing BullMQ patterns from Project 2)
- PostgreSQL
- Next.js frontend — full-stack/interactive this time, not a read-only demo (contrast with Project 2)
- Email reminders via a free tier
- A curated interaction dataset covering ~30–50 common Nigerian chronic-illness drugs

### 1. Four open decisions, locked before any code

Per the project's standing rule ("no code before decisions are locked"), four architectural questions were raised and resolved. In each case Kola asked "what do you recommend" rather than picking blind, and got a reasoned recommendation:

**1. Interaction dataset sourcing → openFDA + manual curation.**
Problem: hand-curating from memory, or letting an LLM generate "plausible" interactions, is indefensible under interview questioning — a fabricated medical claim is a credibility kill for a health-adjacent app. openFDA has a free, no-key API with real drug label data. Decision: pull drug label interaction sections for the drug list, structure it, and cite the source in the dataset itself. Trade-off: more upfront work, and openFDA is a US database (coverage gaps for non-US-approved drugs), in exchange for defensibility.

**2. Email provider → Resend.**
Nodemailer + Gmail SMTP looks like a hobby project and Gmail throttles fast; SendGrid's free tier (100/day) is fine but clunkier to demo. Resend: clean API, 3k/mo free, modern DX — same tier of choice as picking Fastify over Express.

**3. Auth → roll-your-own JWT + bcrypt**, not Clerk/Supabase.
Stronger interview story (can walk through hashing cost factors, token expiry/refresh design) and this data is personal health data, which raises the bar for owning the reasoning. Trade-off: slower to ship than a vendor auth product.

**4. Deployment → Render**, not Railway again.
Diversifies the portfolio away from a Railway monoculture (a real interviewer-facing concern — "does this person only know one deploy path"). Render was already used in Project 1, so it's a known-low-risk platform, not a wildcard.

Each of these four was written into `docs/DECISIONS.md` immediately, in the three-question format (problem / traded away / breaks if changed) — this is a standing pattern used for every non-trivial decision throughout the project, not a one-off.

### 2. Architecture: data model, API surface, folder structure

Before any code, the full architecture was drafted and confirmed:

**Data model:**
- `users` — id, email (unique), password_hash, name, created_at
- `medications` — catalog seeded from openFDA: id, name, generic_name, common_dosage_notes, source_citation
- `user_medications` — a user's active regimen: id, user_id, medication_id, dosage, frequency, reminder_times[] (array of HH:MM), start_date, end_date, active
- `dose_logs` — id, user_medication_id, scheduled_for, taken_at, status (taken/missed/skipped)
- `interactions` — pairwise: id, medication_a_id, medication_b_id, severity, description, source_citation

**Why `interactions` is its own table, not a JSON blob on `medications`:** it needs to be queried bidirectionally (A+B and B+A) and eventually filtered by severity. A blob turns "check this regimen for conflicts" into a full app-side scan (O(n)); a join table keeps it an indexed lookup (O(log n)), and you can't index into a severity filter inside a JSON blob at all.

**API surface (`/api/v1`):**
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /medications?search=          -- catalog search/autocomplete
GET    /interactions/check?medIds=1,2,3   -- stateless, UNAUTHENTICATED by design
POST   /user-medications              -- add to regimen, runs interaction check server-side
GET    /user-medications
DELETE /user-medications/:id
POST   /dose-logs
GET    /dose-logs?from=&to=
GET    /adherence/summary
```

**Why `GET /interactions/check` is deliberately unauthenticated:** it's the portfolio's interactive public demo hook — visitors shouldn't need to register to try the core feature. Adherence tracking (personal data) stays behind auth. If it required auth, nobody could demo it, defeating the whole "full-stack, visibly interactive" portfolio strategy.

**Reminder delivery:** BullMQ repeatable jobs, one per `user_medications.reminder_times` entry, firing Resend on trigger — explicitly reusing the same producer/consumer shape as Project 2's webhook retry queue. Interview framing: "why BullMQ again" → because it's the same distributed-job pattern applied to a new domain, not a new pattern learned from scratch.

**Folder structure** (npm workspaces monorepo, same shape as Project 2):
```
apps/
  api/       -- Fastify
  worker/    -- BullMQ reminder worker
  web/       -- Next.js
packages/
  shared/    -- types, queue defs, dataset loader
docs/
  ARCHITECTURE.md
  DECISIONS.md
scripts/
  seed-dataset.js
```

Before scaffolding, one more call was confirmed: hold `apps/web` (Next.js) entirely until the API and dataset seed script are proven via Swagger/curl — backend-before-frontend is rule #1, not optional.

### 3. Monorepo scaffold — the npm workspaces ordering bug

First real bug of the project. Running `mkdir`, `git init`, and `npm init -y -w apps/api -w apps/worker -w packages/shared` in sequence produced:

```
npm error code ENOENT
npm error path .../medication-adherence-checker/package.json
```

**Diagnosis:** `npm init -w` doesn't create a workspace from nothing — it reads the *root* `package.json`'s `workspaces` array to know which paths are legitimate members, then drops a `package.json` into each one. With no root manifest, there's no lookup table, hence ENOENT. npm was refusing to guess intent, not malfunctioning.

**Fix:** write the root `package.json` (with `"workspaces": ["apps/*", "packages/*"]`) first, then rerun `npm init -y -w apps/api -w apps/worker -w packages/shared`. This produced three correctly-named workspace packages (`api`, `worker`, `shared`) with no collision against public registry package names (irrelevant since they're private, but worth checking for `shared` specifically, addressed later).

### 4. Dependencies and TypeScript config

Installed in workspace-scoped batches:
- Root/shared dev tooling: `typescript`, `@types/node` across `packages/shared`, `apps/api`, `apps/worker`
- `apps/api`: `fastify`, `@fastify/cors`, `pg`, `bcrypt`, `jsonwebtoken`, `dotenv` (+ matching `@types/*` and `tsx` as dev deps)
- `apps/worker`: `bullmq`, `ioredis`, `resend`, `dotenv` (+ `tsx`)
- `packages/shared`: `bullmq` (for shared queue type defs)

**Why `tsx` over `ts-node`:** faster dev-loop reload (esbuild under the hood), and it's what Project 2 used — consistency across monorepos means less context-switching when revisiting old repos for interview prep.

A root `tsconfig.base.json` was written with `target: ES2022`, `module: commonjs`, `moduleResolution: node`, `strict: true`, etc. — each workspace extends this rather than duplicating compiler options, so strict-mode or target changes happen in one place. (Note: later in the project, `moduleResolution` had to be revisited to `nodenext` because TypeScript 7.0.2 removed the plain `node` resolution mode — flagged explicitly as a "bit us once already" landmine in the later handoff summary.)

A `shared` naming-collision risk was flagged and checked: since `packages/shared`'s package name is the generic string `shared`, there's a theoretical risk npm resolves it against the public registry instead of the local workspace. Running `npm install shared@* -w apps/api -w apps/worker` and inspecting `apps/api/package.json` afterward confirmed it resolved to the **local** workspace package (the tell: `"up to date, audited 123 packages in 13s"` — no new package downloaded, which is what would happen if it had gone to the public registry). Lesson noted for future projects, not retrofitted here: prefix internal workspace package names (e.g. `@medadherence/shared`) to remove the ambiguity entirely.

### 5. Fastify entrypoint, and a security tangent that turned out benign

The first `apps/api/src/index.ts` was a `/health`-only Fastify app — same pattern as Project 1, proving the server boots before anything is layered on top. Three deliberate choices, each explained rather than just pasted:

- **`host: '0.0.0.0'`, not `'localhost'`** — `localhost` only binds inside a container; Render/Railway's proxy layer hits the container from outside and gets connection-refused. Skipping this works locally and 502s in production — a classic "an hour lost to what looks like a platform config problem."
- **`CORS_ORIGIN` from an env var**, defaulting to `http://localhost:3000` in dev — production needs the real Vercel URL, and locking this to env means changing it later is a dashboard edit, not a code change.
- **Fastify's built-in `logger: true`** (Pino under the hood) instead of adding Winston/Pino manually — a second logging library on top would be unexplainable duplicate complexity for zero benefit.

On first boot, the terminal printed an unusual line: `◇ injected env (2) from .env // tip: ⌁ auth for agents [www.vestauth.com]`. This did **not** look like standard `dotenv` output, and the domain `vestauth.com` was flagged immediately as a potential supply-chain risk — "a health/medical data app cannot have an unexplained network-facing string shipping in its dependency tree, full stop." This was treated as a genuine security investigation, not dismissed:

1. Checked the installed `dotenv` version and searched for the string across `node_modules` — hoisting (npm workspaces hoist shared deps to the *root* `node_modules`, not per-workspace) meant the first search came up empty in `apps/api/node_modules`, which itself was a small lesson repeated later.
2. Found the string in `node_modules/dotenv/lib/main.js` and `CHANGELOG.md` — confirmed it shipped in the real `dotenv@17.4.2` release, not something locally injected.
3. Inspected the actual code path: a static `TIPS` array, one entry of which self-promotes the maintainer's (`motdotla`) separate project via `console.log(TIPS[random])` on every boot — no network call, no env value read or transmitted.

**Verdict: PASS, benign.** Confirmed as the dotenv maintainer's own sponsor/self-promo rotation (same pattern as an earlier changelog entry thanking a sponsor, Tuple.app). The instinct to stop and verify rather than shrug it off was affirmed as the correct posture for a project about to hold health data, even though this particular instance was a dead end. (The tip messages can be silenced via a dotenv config option if they become annoying during `tsx watch` restarts.)

### 6. Migrations: node-pg-migrate, and a real vulnerability caught before it shipped

**Choice: `node-pg-migrate`** over (a) raw SQL files + a hand-rolled runner, or (b) a full ORM like Drizzle/Prisma.
- Problem it solves: repeatable, ordered, trackable schema changes without hand-running SQL against Neon's console.
- Traded away vs. raw SQL: a small dependency and its CLI conventions, in exchange for not reinventing a solved, boring problem (migration ordering isn't where "own your reasoning" adds value — auth and interaction-checking logic is).
- Traded away vs. an ORM: no type-safe query generation — routes still use hand-written SQL via `pg`, which is *intentional*: in an interview, "I wrote this query, here's why" beats "the ORM generated this."

Installing it (`npm install node-pg-migrate -w apps/api`) surfaced:
```
1 high severity vulnerability
```
This was **not** glossed over. `npm audit -w apps/api` was run before touching anything, revealing the vulnerability was in `find-my-way` (Fastify's internal router, a transitive dependency, not something installed directly) — a DDoS-via-HTTP/2 advisory. `npm audit fix -w apps/api` was run deliberately (not blindly), with an explicit check afterward that Fastify itself stayed pinned at `^5.10.0` (only the transitive sub-dependency got patched) and that the server still booted and `/health` still responded. All three confirmed clean — 0 vulnerabilities, no forced major-version bump.

**Deliberate scoping decision:** migration files are plain `.js` (CommonJS), not `.ts`. `node-pg-migrate`'s CLI runs standalone, outside the app's `tsx`/`tsc` pipeline — teaching it TypeScript would mean wiring a second, different execution path just for schema changes, for a class of file (simple, imperative, rarely reused) where the type-safety payoff doesn't justify the complexity.

**First migration — `users` table:**
```js
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('users', 'email');
};
```

Two decisions worth the explanation given, not just the code:
- **UUID primary keys with `gen_random_uuid()`**, not serial/auto-increment integers — sequential IDs leak information (user count, growth rate, enumerable `/users/1`, `/users/2`...). Trade-off: 16 bytes vs. 4–8 and slightly worse index locality, irrelevant at this scale. Locked early because retrofitting it after other tables have foreign keys pointing at `users.id` would be expensive.
- **`pgm.createIndex('users', 'email')` alongside `unique: true`** was flagged as *actually redundant* — a UNIQUE constraint auto-creates its own backing index on Postgres. It was run before the question of "keep or drop" was answered (Kola ran the command before replying), so rather than write a follow-up migration whose sole purpose was undoing a harmless mistake (which would itself be commit-history noise inviting a "why does this exist" question), the redundancy was documented honestly in `docs/DECISIONS.md` and left in place. This became the deliberate contrast case for the *next* migration's indexes (see refresh_tokens below), which are **not** redundant.

The migration ran clean against Neon (`gen_random_uuid()` worked natively — confirms Neon's Postgres has it built in, no `pgcrypto` extension needed). Rather than trust the migration tool's own echoed SQL, the actual live schema was queried directly via `information_schema.columns` and printed with `console.table` — all five columns confirmed present with correct types before committing.

### 7. Git hygiene incidents — the pattern that produced a standing rule

The first `git push` after the `users` migration was **rejected**:
```
! [rejected] main -> main (fetch first)
hint: Updates were rejected because the remote contains work that you do not have locally.
```
This required a pull/reconcile before pushing (full detail not preserved verbatim in this pass, but the resolution path was the standard `git pull` → resolve → `git push`).

Later in the session, a "commit remaining uncommitted auth infrastructure" incident occurred: the refresh_tokens migration, `apps/api/src/config.ts`, `apps/api/src/routes/auth.ts`, and refactored `db.ts`/`index.ts` had all been written and used, but **never actually committed** — a `git add` had scoped too narrowly earlier, leaving real working code sitting uncommitted for multiple turns. The commit message for the catch-up was explicit about the process failure, not just the fix:
> "Process note: same drift issue as the earlier catch-up commit — git add scoped too narrowly again. Running git status as a mandatory check after every feature block going forward, not just when surfaced by accident."

This is the origin of the standing rule (carried forward into the rest of the project and explicitly listed in the end-of-chat handoff): **run `git status` after every feature block, always confirm the exact working directory for every command, and never assume a `git add <files>` was scoped correctly** — verify before *and* after.

A **fresh-clone verification** discipline was also established here and repeated at every subsequent milestone: clone the repo fresh, `npm install`, `npm run build -w packages/shared`, and confirm it's self-contained — trusting a local working tree isn't the same as proving what's actually in the remote. One such verification attempt initially failed with `ENOSPC: no space left on device` while cloning into `/tmp` — diagnosed correctly as **not a code problem**: Git Bash's `/tmp` on this machine resolves to `C:\Users\USER\AppData\Local\Temp`, not the H: drive where the project's working rules say everything should live, and the C: drive was later confirmed to be at literal 100% capacity (0 bytes free). Re-run from `/h/DevProjects` succeeded cleanly (clean install, 0 vulnerabilities, `tsc` built `packages/shared` with no errors) — confirming the repo itself was fine and the failure was purely environmental.

### 8. Full auth system: schema, services, routes

**`refresh_tokens` migration**, designed and explained before being written:
```
id            uuid, primary key
user_id       uuid, references users(id), ON DELETE CASCADE
token_hash    varchar(255), not null   -- hashed, never store raw tokens
expires_at    timestamptz, not null
revoked_at    timestamptz, nullable    -- null = active, set = revoked
created_at    timestamptz, not null, default now()
```
- **`token_hash`, not raw tokens** — same principle as `password_hash`: if the DB is ever compromised, raw refresh tokens would let an attacker impersonate any logged-in user until expiry. Hashed tokens are useless without the original value.
- **`revoked_at` instead of deleting the row on logout** — deletion loses the audit trail (can't answer "was this token used after logout"). A nullable timestamp distinguishes never-existed / active / explicitly-revoked.
- **`ON DELETE CASCADE`** on the `user_id` FK — a deleted user's tokens shouldn't become orphaned rows.
- **Explicit indexes on `user_id` and `token_hash`** — unlike the `users.email` case, neither column has a UNIQUE constraint, so nothing else provides an implicit index; both are genuinely necessary for fast lookups (find all active sessions for a user; validate an incoming refresh token).

**Password hashing (`services/password.ts`):** bcrypt at **12 salt rounds**, not the library default of 10. Problem: 10 rounds is a weaker default against modern hardware; 12 costs ~4x the compute per attempt, meaningfully raising the cost of brute-force/credential-stuffing while adding an imperceptible ~250–300ms (vs. ~80ms) to a real user's login.

**Token generation (`services/tokens.ts`):**
- JWT access tokens (`signAccessToken`/`verifyAccessToken`), 15-minute expiry, signed with a dedicated `JWT_ACCESS_SECRET`.
- Refresh tokens are a `crypto.randomBytes(64)` hex string, hashed with **plain SHA-256**, not bcrypt. This was explicitly called out as a deliberate asymmetry, not an inconsistency: passwords are short, human-chosen, low-entropy — bcrypt's slowness is the entire point, making guessing expensive. A refresh token is already a 128-character cryptographically random string; there's nothing to "guess," so bcrypt's deliberate slowness buys nothing and would burn CPU on every validation (which happens more often than login).
- **Two separate JWT secrets** (access vs. refresh), not one reused — a leaked access secret (more exposed, used on every request) shouldn't also let an attacker forge refresh tokens.

**Auth service (`services/auth.ts`):** `registerUser`, `loginUser`, `refreshAccessToken`, `revokeRefreshToken`, plus a shared `issueTokens` helper. Design choices explained:
- A custom `AuthError` class carrying a `statusCode`, rather than throwing generic `Error` — route handlers need to distinguish 400/401/409 without duplicating that mapping logic at every call site.
- **Login and register return the identical message** `"Invalid email or password"` regardless of whether the email doesn't exist or the password is wrong — deliberate, to prevent account enumeration (a real privacy concern for a health app: confirming someone uses a medication-tracking service is itself sensitive).
- `revokeRefreshToken` updates `revoked_at` rather than deleting — consistent with the schema decision above.

**Routes (`routes/auth.ts`):** `POST /auth/register`, `/login`, `/refresh`, `/logout`, using **Fastify's built-in JSON-schema validation** (compiled ahead-of-time via `ajv`) rather than adding Zod on top — Zod would be a second, overlapping validation paradigm, unexplainable complexity for no real gain. `/auth/logout` always returns `204` regardless of whether the token was valid — same enumeration-prevention logic as login: a distinguishable "token not found" response would leak information about token validity to anyone probing the endpoint.

**Env setup landmine:** appending JWT secrets to `.env` via a `cat >> ... << 'EOF' ... $(openssl rand -hex 32) ... EOF` heredoc **failed silently** — a quoted `'EOF'` heredoc disables variable/command substitution, so `$(openssl rand -hex 32)` was written as a literal, unevaluated string rather than executed. The fix was to use `echo "KEY=$(openssl rand -hex 32)" >> file` instead (which does evaluate), but this meant the `.env` ended up with **duplicate keys** — two garbage literal-string lines followed by two real ones. Since `dotenv`'s last-key-wins behavior meant the app worked anyway, the file was still cleaned up properly rather than left in a confusing state holding real secrets.

**Config centralization (`config.ts`):** all env vars — port, CORS origin, `DATABASE_URL`, both JWT secrets, token expiries — were pulled into one object with a `requireEnv()` helper that throws immediately if a required var is missing. This replaced scattered `process.env.X` and duplicate `dotenv.config()` calls across `db.ts`, the auth service, and `index.ts`. Practical payoff explained directly: when Render deployment happens, this file *is* the checklist of exactly which environment variables need to be entered into Render's dashboard (Render, unlike a local `.env`, has no file — Kola briefly confused Neon-the-database-host with Render-the-compute-host at this point; the distinction was clarified: Neon holds the Postgres data, Render runs the Fastify process, which connects out to Neon over the network via `DATABASE_URL` — two separate providers, each doing one job, same multi-provider pattern as Project 1).

### 9. Auth latency investigation — a real performance bug, correctly diagnosed

The first `POST /auth/register` call returned successfully but with `responseTime: 7096.07ms` — over 7 seconds, wildly outside the expected ~250–300ms (bcrypt) plus one or two Neon round trips. This was **not** waved through. The working hypothesis (Neon cold start after inactivity — already documented as a known trade-off) was tested methodically rather than assumed:
- Call #2 (login, immediately after): dropped to ~2s.
- Call #3 (login again): held steady around 1–2s, **not** continuing to fall toward near-zero.

The steady-state (not-still-dropping) pattern ruled out a simple one-time cold start and pointed instead to **real, recurring network round-trip latency** between Lagos and Neon's `us-east-1` region — a cost that was already named as a known trade-off in `docs/DECISIONS.md` when Neon was chosen, but now had real measured numbers (~1.5–1.8s per round trip, steady-state) behind it rather than a guess.

Given the choice between (1) accepting and documenting the latency as-is, or (2) reducing round trips in the auth flow itself, Kola chose optimization. **Fix:** collapsed `registerUser`'s two-query sequence (`SELECT` existence check, then `INSERT`) into a single atomic `INSERT ... ON CONFLICT (email) DO NOTHING RETURNING ...`, checking `result.rows.length === 0` to detect a conflict — cutting one full round trip per registration and, as a side effect, closing a **race-condition window** that the original check-then-insert pattern had (two concurrent registrations for the same email could both pass the existence check before either inserted).

### 10. Full auth flow verified end-to-end, at every layer

Register → login → refresh → logout → attempted reuse of the revoked token was tested via `curl` against the live server, then cross-checked directly against Neon (not just trusting HTTP response codes):
- `refreshAccessToken` on a valid token correctly returned a new access token with **no new refresh token minted** — matches the design (refresh only extends the access token; the refresh token itself is untouched until its own expiry or explicit logout).
- `logout` returned an empty `204`.
- Re-using the same refresh token after logout correctly failed with `"Refresh token has been revoked"` — proof the revocation actually took effect server-side, not just that logout returned a success code.
- A direct query (`SELECT user_id, revoked_at, expires_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 5`) confirmed the exact row for that session showed `revoked_at` populated, while earlier, unrelated sessions for the same user correctly remained `null`/active — proving logout scoped correctly to a single session, not all of a user's sessions.

`git status` was checked clean before the milestone was called done — auth was explicitly not considered "done" on the strength of a 200 response; it required implementation + API-level test + database-level verification + documentation + a clean, pushed, fresh-clone-verified commit.

### 11. Side quest: C: drive at 100% capacity

Mid-session, the C: drive was discovered to be completely full (123GB used, 0 bytes free) — surfaced by the `ENOSPC` clone failure described in section 7. This was treated as a real, standalone issue ("a fully saturated system drive risks corrupting something mid-write eventually"), not brushed past. A quick triage (`du -sh` on `AppData/Local/Temp` and the npm cache) found ~2GB of safely-deletable installer leftovers (Docker Desktop installers, an old Edge installer, `gfw-install`) and npm's rebuildable cache — clearing these recovered the system to ~1GB free, which is still critically tight but enough to keep working. The deeper cleanup (finding what's actually eating the other ~120GB — likely old `node_modules` folders left on C: from before the H:-drive convention, Docker images, or a WSL virtual disk) was explicitly deferred as a real to-do and spun into a **separate chat** with a generated handoff prompt, to avoid polluting the portfolio-project thread.

### 12. Medications catalog — sourcing and seeding from openFDA

Before writing any seed script, the actual drug list needed human judgment: openFDA is comprehensive but has no opinion on what matters for a Nigerian chronic-illness context, and that curation call belonged to Kola, not something to be silently decided. A first draft (38 drugs, generic names, organized by category — hypertension, diabetes, HIV/ART, asthma, TB, sickle cell, malaria, cardiovascular, GI, pain/anti-inflammatory, antibiotics, mental health) was proposed, explicitly using **generic** rather than brand names (openFDA indexes primarily by generic/active-ingredient name; brand names fragment across dozens of regional variants).

The list was expanded further (per Kola's explicit direction not to limit scope to Nigeria alone) to **89 entries** covering additional categories: COPD, heart failure, cholesterol, anticoagulation, chronic kidney disease, Parkinson's, osteoporosis, gout, thyroid, autoimmune/rheumatoid arthritis, epilepsy, allergies, and additional mental-health drugs.

**Naming corrections applied before the fetch, not discovered as failures after:** three drug names were corrected to their US/openFDA-indexed generic form, since a US-only database won't recognize INN names used elsewhere — `glibenclamide` → `glyburide`, `paracetamol` → `acetaminophen`, `salbutamol` → `albuterol`. St. John's Wort was deliberately excluded — it's a supplement, not a regulated prescription drug, and wouldn't exist in openFDA's drug label endpoint.

**Seed script (`scripts/seed-medications.ts`):**
```ts
async function fetchDrugLabel(drugName: string): Promise<OpenFdaResult | null> {
  const url = `${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(drugName)}"`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return null; // openFDA's "no match" signal, not an error
    throw new Error(`openFDA request failed for ${drugName}: ${response.status}`);
  }
  const data = await response.json();
  if (!data.results?.length) return null;
  // Deterministic tiebreaker when a drug has multiple manufacturer labels:
  const sorted = data.results.filter(r => r.effective_time)
    .sort((a, b) => (b.effective_time! > a.effective_time! ? 1 : -1));
  return sorted[0] || data.results[0];
}
```
Design points explained: uses native `fetch` (Node 20 has it globally — no reason for `axios`); treats openFDA's `404` as a legitimate "no results" signal rather than a hard failure (so one bad/unmatched drug name doesn't crash a 89-drug batch run); adds a 300ms delay between requests as a courtesy (not required by openFDA's rate limit, but "hammering a free public API in a tight unthrottled loop is bad practice regardless of whether you'd technically get away with it"); logs a running success/miss list rather than pausing on each miss for confirmation.

**Debugging the run itself — two separate `cwd` mistakes, not code bugs:**
1. First attempt doubled the path (`apps/api/apps/api/scripts/...`) because the command was run with an `apps/api/` prefix while already inside `apps/api` — diagnosed immediately as a path-doubling issue, not a script bug.
2. Second attempt, after correcting the prefix, still failed with `ERR_MODULE_NOT_FOUND` — this time the resolved path was correct, but the file genuinely didn't exist. Diagnosis: an earlier `cat > apps/api/scripts/seed-medications.ts << 'EOF'` had itself been run from *inside* `apps/api`, meaning it silently wrote to the doubled, wrong path rather than erroring. Fixed by re-running the file-creation command from the correct location.

**Seed run result: 91/92 succeeded.** Rather than treat this as a clean pass, two findings were investigated and documented honestly:
1. **`gliclazide` missed** — not a bug. Gliclazide is not FDA-approved in the US and has no openFDA record; this is a structural limitation of a US-only data source for a globally-scoped app. Resolved by manually inserting a gliclazide entry sourced from the UK's Electronic Medicines Compendium (EMC) — a legitimate, citable regulatory-grade reference — with `source_url` explicitly noting it's a manual, non-automated entry, distinct in provenance from the other 91.
2. **16 drugs succeeded but returned `interaction_notes: NULL`** — mostly OTC/older formulations (ibuprofen, aspirin, acetaminophen, diphenhydramine, loratadine, cetirizine, and others) whose FDA labels genuinely don't populate the `drug_interactions` field (interaction info sometimes lives in `warnings`/`precautions` instead, or wasn't required at that drug's approval vintage). This was explicitly **not** patched by scraping those other fields as a fallback (noisier, less reliably interaction-specific, harder to defend as "this is interaction data") — instead it was named as the direct justification for why the curated interactions tier matters: these 16 drugs get **zero** coverage from the automated tier, so ibuprofen+warfarin-style pairs had to be non-negotiable inclusions in the hand-curated set.

Both findings — plus the total row count (92/92, confirmed via a direct `COUNT(*)` query, not just trusting two separate script runs added up correctly) — were written into `docs/DECISIONS.md` before moving on. A `common_brand_names` field (people search by brand name, e.g. "Norvasc" for amlodipine — openFDA's `openfda.brand_name` is present in the same response already fetched) was scoped, explicitly recommended, and then deliberately **deferred** as a separate future task rather than done immediately, to avoid scope creep mid-block.

### 13. Curated interaction pairs — the second data tier

18 pairs were hand-selected, deliberately weighted toward drugs where the automated (openFDA) tier is silent — i.e., the 16 NULL-`interaction_notes` drugs from above — plus a few pairs chosen for teaching/clinical value (notably rifampin + dolutegravir, kept explicitly for its relevance to TB/HIV coinfection management in a Nigerian context, even after the drug list broadened globally):

warfarin+ibuprofen, warfarin+aspirin, warfarin+diclofenac, lithium+ibuprofen, simvastatin+amlodipine, simvastatin+verapamil, metformin+furosemide, sertraline+tramadol, fluoxetine+tramadol, phenytoin+warfarin, rifampin+warfarin, rifampin+dolutegravir, isoniazid+acetaminophen, digoxin+furosemide, aspirin+methotrexate, ciprofloxacin+warfarin, amitriptyline+tramadol, spironolactone+lisinopril.

**`scripts/seed-interactions.ts`** design points: looks up medication IDs **by name at runtime** rather than hardcoding UUIDs (UUIDs are non-deterministic — regenerated on every reseed of a wiped table — so hardcoding would silently break the moment the table gets rebuilt; looking up by name makes the script safely rerunnable against a fresh DB); skips gracefully with a warning on any name that fails to resolve, rather than crashing the whole batch. Run result: `Inserted: 18, Skipped: 0`.

**Follow-up enhancement, prompted by direct feedback** ("I don't want the information for each drug to be scarce or vague"): a severity label plus a paragraph of prose still left the user asking "so what do I actually do about this." Two fields were added — `mechanism` (the *why*, pulled out of prose into its own scannable field) and `recommendation` (the *what to do*, e.g. "avoid combination," "monitor potassium levels") — explicitly scoped narrowly: **not** extended further (e.g. "onset speed," "evidence grade") because that starts requiring clinical-literature-grading judgment calls that are hard to source defensibly at $0 — exactly the "made this up to seem thorough" risk the project had been careful to avoid from the start.

A `common_brand_names`-style expansion of the *medications* table was proposed at the same time and deliberately **not** bundled in — flagged as a separate, larger effort, kept as a named future task rather than scope-creeping the current block.

Implementation: a nullable `ALTER TABLE` migration adding `mechanism` and `recommendation` text columns (nullable because only the 18 curated rows get populated — this is a different data shape from `medications.interaction_notes`), followed by `scripts/backfill-interaction-details.ts`, which updates each of the 18 rows by looking up **both drug-name orderings** (`(medication_a_id = idA AND medication_b_id = idB) OR (medication_a_id = idB AND medication_b_id = idA)`) — necessary because nothing in the schema enforces which drug ends up in which column during insertion, and "warfarin+ibuprofen" and "ibuprofen+warfarin" are the same interaction regardless of storage order.

One inline scripting incident during this block: an ad-hoc `npx tsx -e "..."` one-liner referenced `NOW()` inside a JS template literal without it being valid JS, throwing `ReferenceError: NOW is not defined` — a symptom of complex shell-escaping in inline `-e` scripts being fragile. This became an explicit, generalized lesson (stated in the later handoff): prefer writing actual `.ts` script files over inline `-e` one-liners for anything non-trivial.

Backfill verified: `Updated: 18, Not found: 0`, then spot-checked directly against Neon (joined query for warfarin+ibuprofen showing correctly attached `mechanism`/`recommendation` text, plus a `COUNT(*) WHERE mechanism IS NULL OR recommendation IS NULL` returning `0`) before committing.

### 14. Serving the data: `GET /medications` and the core feature, `GET /interactions/check`

**`GET /medications?search=`** — `ILIKE '%term%'` against an indexed `name` column; returns the full 92-row catalog if no search term is given (the frontend's initial browse view needs a full list before the user types anything). Explicitly scoped: at 92 rows, Postgres full-text search (`tsvector`/`pg_trgm`) would be overkill; flagged as a real scaling note (leading-wildcard `ILIKE` can't use a standard B-tree index efficiently) for if the catalog ever grows to thousands of rows — not a problem today.

**`GET /interactions/check?medIds=`** — the two-tier interaction-checking logic that is the actual core feature of the app:

```ts
export async function checkInteractions(medicationIds: string[]): Promise<InteractionFinding[]> {
  // Tier 1: curated — exact match against the interactions table
  // ... pushes CuratedFinding, tracks pair in curatedPairsFound Set
  // Tier 2: text-scan — for every ordered pair NOT already in curatedPairsFound,
  //   check drugA.interaction_notes for drugB.name (case-insensitive substring),
  //   extract a ~300-char excerpt (150 chars context each side of the match)
}
```
Design points explained rather than just shown:
- **Curated pairs always take priority**; text-scan skips any pair already found there (deduped via a `Set` keyed on the sorted drug-name pair) — without this, warfarin+ibuprofen would appear twice: once as the carefully-written curated entry, once again as a raw text-scan excerpt.
- **Text-scan checks both directions** (A's notes for B's name, and B's notes for A's name) — asymmetric by design, since FDA labels aren't required to cross-reference symmetrically; a one-directional scan would miss real matches.
- The excerpt length (`EXCERPT_RADIUS = 150`, both sides of the match) was a deliberate, pre-confirmed UX trade-off: full label text can run 10,000+ characters (e.g. ritonavir) and would be unreadable in a demo UI; a trimmed excerpt with `fullTextAvailable: true` as a stub for a future "expand to full text" UI feature keeps the response lean while staying traceable to source.

The route (`routes/interactions.ts`) validates `medIds` (comma-separated, min 2 required, 400 otherwise) and returns `{ checkedMedicationCount, findingsCount, findings }`.

### 15. Critical bug found live: the text-scan tier can surface a "no interaction" statement as if it were a warning

While hunting for a genuine text-scan-only test pair (lisinopril mentions digoxin, and that pair has no curated entry), the live response for lisinopril+digoxin came back as `findingsCount: 1` with this excerpt:

> "Lisinopril has been used concomitantly with nitrates and/or digoxin **without evidence of clinically significant adverse interactions**."

This is the FDA label stating the combination is *safe* — but the naive substring-match design surfaced it identically in shape to a genuine risk finding. This was immediately flagged as a real, ship-blocking bug, not a nitpick: "it's exactly the kind of thing that would undermine trust in a health app if someone caught it during a demo," and "a false positive isn't a cosmetic bug — it's the tool crying wolf, which trains users to distrust or ignore real warnings."

Two options were weighed:
1. Add a disclaimer at the response level ("this excerpt may describe an absence of interaction") — cheap, but pushes the burden of correct interpretation onto the user, a poor design choice for a health app.
2. **Add a lightweight negative-language keyword filter** — check the excerpt against a list of phrases FDA labels commonly use for negative findings (`"without evidence of clinically significant"`, `"no clinically significant"`, `"no dose adjustment necessary"`, etc.); classify the finding as `tier: "text-scan-warning"` or `tier: "text-scan-reassuring"` instead of a single ambiguous `"text-scan"` tier.

**Option 2 was chosen and implemented:**
```ts
const NEGATIVE_PATTERNS = [
  'without evidence of clinically significant', 'without evidence of any',
  'no clinically significant', 'no clinically meaningful',
  'no meaningful clinically important', 'not expected to interact',
  'no significant interaction', 'no dose adjustment is necessary',
  'no dose adjustment necessary'
];
function classifyExcerpt(excerpt: string): 'text-scan-warning' | 'text-scan-reassuring' {
  const lower = excerpt.toLowerCase();
  return NEGATIVE_PATTERNS.some(p => lower.includes(p)) ? 'text-scan-reassuring' : 'text-scan-warning';
}
```

Verified against three live cases before committing: warfarin+ibuprofen (curated tier, unaffected — control case), lisinopril+digoxin (correctly reclassified `text-scan-reassuring`), phenytoin+digoxin (correctly remained `text-scan-warning`, confirming the filter doesn't over-suppress genuine warnings). Committed as `045214c`.

This fix, and its trade-offs, were later written up formally in `docs/DECISIONS.md` (finalized at the very start of the follow-up handoff, see below) with an explicit "what breaks if changed" analysis: removing `NEGATIVE_PATTERNS` reverts to the original bug; growing the drug corpus past 92 will surface *new* negation phrasings the filter hasn't seen, since it's reactive to observed cases, not a general negation classifier — any future drug-list expansion should include a manual review pass over unusually-worded negative results; and collapsing the two tier labels back into one on the API response would silently remove the (not-yet-built) frontend's ability to visually distinguish a warning from a reassurance. The trade-off named explicitly: precision for recall, in a bounded, auditable way — not NLP, not an LLM call, a keyword list whose limits are known and stated rather than hidden behind a black box.

**Important nuance directly relevant to the story, not just the fix:** this bug was **not** caught during design, code review, or planning — it surfaced during manual, live testing against real openFDA data, when the returned excerpt for lisinopril+digoxin read as a reassurance despite matching the same text-scan logic used for genuine risk pairs. It was caught by inspecting actual API output, not by anticipating the failure mode in advance — this distinction was deliberately added to the final `DECISIONS.md` entry as part of the interview-story value of the fix ("I built it, tested it against real data, personally caught a false positive, fixed it").

### 16. End-of-chat handoff, and the transition to Chat 2

With the context window growing large, Kola asked for a complete handoff summary to start a fresh chat without losing continuity. The handoff included: the full locked stack, all schema details (including the two "redundant vs. necessary index" contrast cases), the full auth implementation summary, the full medications/interactions data-layer summary (92 drugs, 18 curated pairs, the gliclazide and NULL-notes findings), the two live endpoints, the outstanding first task (writing the `DECISIONS.md` entry for the reassuring/warning fix, which had been promised but not yet written), a prioritized list of not-yet-built milestones (user-medications CRUD, dose-logs, adherence summary, the BullMQ worker, Resend integration, the Next.js frontend, Render deployment, article writing), and the standing process rules established the hard way during this session (mandatory `git status` after every feature block; always state the exact working directory; verify claims against live systems, not echoed tool output; document every decision in `DECISIONS.md` as it happens, not retrofitted; $0 budget, Git Bash only, no secrets committed, backend before frontend; never use Python — not available in this environment).

The new chat instance, on receiving this handoff, correctly flagged that Anthropic's background **memory system** was stale relative to the handoff (memory still showed the project at "drug list JSON created, awaiting confirmation" — pre-seeding, pre-auth-testing) and proposed treating the handoff as authoritative for the session, which was confirmed as the right call. It also correctly noticed the handoff had been pasted four times in a row and flagged it rather than silently acting on it — confirmed as a client/paste glitch, not intentional, and not a flaw in its judgment.

The new instance then produced the `docs/DECISIONS.md` entry for the reassuring-vs-warning fix. Two refinements were requested and applied before finalizing:
1. Fill in the actual date and confirm the handoff supersedes memory for this session (memory reconciles automatically in the background — no manual fix needed).
2. Add a sentence to the **Verification** section making clear the bug was caught through Kola's own manual live testing against real data — not through code review or design anticipation — since that's a genuine, worth-keeping part of the interview narrative.

The finalized entry (component: `apps/api/src/services/interactions.ts`, related commit `045214c`) followed the standard problem/traded-away/breaks-if-changed structure, plus the three verified test cases, plus the added verification-provenance sentence.

**One new standing workflow rule was set at the very end of Chat 1**, in response to Kola explicitly flagging inefficiency: **all file/directory creation and edits happen exclusively via Git Bash command blocks** (`cat > path << 'EOF'`, `str_replace`-equivalent, `mkdir`, etc.) provided directly in-chat — never an instruction to manually open VS Code and paste content. This was confirmed as the only mode of working for the rest of the project, no exceptions.

Chat 1 ends with the plan to run `git status` in the new session as the very next action, before any further work.
## CHAT 2

*(Continuation of Chat 1 via a full handoff prompt. The new instance began by treating the handoff — not Anthropic's background memory, which was confirmed stale — as authoritative for the session, and its first substantive action was writing the promised `docs/DECISIONS.md` entry for the text-scan reassuring/warning fix left open at the end of Chat 1.)*

### 1. Auth middleware — the gate for every subsequent authenticated route

Before user-scoped routes could exist, a reusable Fastify decorator was needed so route handlers could declare `onRequest: [app.authenticate]` instead of hand-rolling JWT verification in every handler.

**Design (three-question framing, as with every decision this project):** the decorator verifies the access token, and on success attaches the decoded payload to `request.user`, giving every downstream handler direct access to `userId`/`email` without a repeated lookup. Implemented as a Fastify plugin (`plugins/authenticate.ts`) rather than inline middleware, because Fastify's own encapsulation model expects decorators to be registered as plugins to be visible across route files.

**Two real bugs, both from the same root misunderstanding of Fastify's plugin system, caught in sequence:**
1. First attempt exported the plugin function directly and registered it — `app.authenticate` came back `undefined` at route-definition time. Diagnosis: Fastify plugins are encapsulated by default; a decorator added inside a plain async function doesn't automatically become visible to sibling registrations unless wrapped with `fastify-plugin`'s `fp()`, which explicitly breaks out of that encapsulation boundary.
2. After wrapping with `fp()`, the *same* `undefined` symptom persisted. Diagnosis: `app.register()` is asynchronous — the plugin hadn't actually finished registering by the time route files ran, because the registration call itself hadn't been `await`ed. Fixing both (`fp()` wrapping *and* `await app.register(authenticatePlugin)`) resolved it.

This pairing — a subtle async-registration bug that looks identical to a missing-wrapper bug — was called out explicitly as worth remembering, since the two fixes are easy to conflate if only one is applied.

Live-tested with valid, missing, and malformed-Authorization-header requests against a protected stub route before trusting the plugin, then committed and pushed with `git status` verified clean before and after staging — reconfirming the standing discipline from Chat 1.

*(A pasted terminal block during this stretch contained a trailing instruction embedded in the output attempting to get the assistant to skip judgment on a schema decision. This was explicitly flagged as implausible content and not followed — treated as a prompt-injection attempt rather than a genuine instruction from Kola, and the session proceeded normally without incident.)*

### 2. `user_medications` CRUD — full ownership-scoped REST

**Schema decisions**, each run through the three-question framework before migrating: `user_id` FK with `ON DELETE CASCADE` (a deleted user shouldn't leave orphaned regimen rows); `dosage_amount` (numeric) and `dosage_unit` (varchar) as two separate columns rather than one free-text "dosage" string, so the eventual adherence/reminder math never has to re-parse a string like "200mg"; `reminder_times` as a Postgres array of `varchar(5)` clock strings (`'08:00'`, `'20:00'`) rather than a bare integer count of doses/day — chosen specifically because a later feature (the BullMQ reminder worker) needs actual clock times, not just a count, and retrofitting clock times onto a count-only schema would be exactly the kind of backfill this project was trying to avoid; `started_at` (date) defaulting to `CURRENT_DATE`.

**Routes**, all ownership-scoped identically: `POST /user-medications` (validates `medicationId` actually exists in the catalog, 400 otherwise), `GET /user-medications` (list, scoped to `request.user.userId`), `GET /user-medications/:id`, `DELETE /user-medications/:id`. The deliberate, explicitly-flagged design choice across all of them: a request for another user's row returns **404, not 403** — consistent with the account-enumeration-prevention posture established for auth in Chat 1 (a 403 confirms the row exists but isn't yours; a 404 reveals nothing).

**Live-tested with two separate real users (User A, User B), a full ten-case matrix**, not just the happy path: create, create-with-invalid-medicationId (400), list for each user separately, GET-one for the owner (200), GET-one cross-user (404, not 403), **DELETE attempted cross-user** (the single most important case — a genuine security boundary, not a nitpick), a follow-up GET-one confirming User A's row was still fully intact and untouched after User B's failed delete attempt (proving the 404 wasn't a lie), a real delete by the actual owner (204), and a final list confirming it was gone. All ten passed, verified against live Neon data and server logs matching expected status codes turn by turn, not just trusted from a single curl call.

### 3. The `started_at` UTC-shift bug — found, diagnosed, fixed, documented

Live testing surfaced `startedAt` returning as `"2026-07-30T23:00:00.000Z"` instead of the expected plain `"2026-07-31"`. **Diagnosis:** the `pg` driver converts a `date`-typed column into a JS `Date` object during serialization, which then stringifies with a UTC timestamp; since Lagos is UTC+1, local midnight shifts to 23:00 the previous day once expressed in UTC. This was flagged as a real, if minor, correctness bug — not cosmetic — since a frontend naively calling `new Date(startedAt).toLocaleDateString()` could show a user the wrong day for their own medication start date.

**Fix:** cast the column to `::text` directly in the SQL `SELECT`, bypassing the driver's `Date` conversion entirely — a fix that's correct regardless of server or client timezone, rather than a client-side patch that would only be correct for one timezone. Verified live: the exact same create-then-fetch flow that previously returned the shifted timestamp now returned a plain date string. This fix pattern (cast to `::text` at the SQL layer) was immediately reused, without re-discovering the bug, on `dose_logs.scheduled_date` when that table was built next — an explicit case of applying a lesson forward rather than waiting to hit the same bug twice.

### 4. `dose_logs` — explicit status over binary logging

Before designing the schema, Kola was asked the actual governing question: should logging be binary (a row's mere existence means "taken," absence means "presumed missed"), or should each row carry an explicit status? Given the backfill pattern already hit twice in Chat 1 (interactions mechanism/recommendation), the recommendation — and the choice made — was **explicit status from the start**: `taken` / `missed` / `skipped`, distinguished because a user deliberately skipping a dose (doctor's instruction) is a meaningfully different signal from simply forgetting, even if v1's adherence math doesn't yet treat them differently.

**Schema:** `user_medication_id` FK (`CASCADE`), `scheduled_date` + `scheduled_time` (three columns together, not one timestamp, because `reminder_times` is a set of discrete daily slots, not a continuous timeline — meaning the app has to cross-reference `user_medications.reminder_times` to know which slots *should* exist, trading application logic for not duplicating the schedule definition in two places), `status` (`varchar(20)`, CHECK constraint restricting to the three values), `logged_at` (timestamptz, when the log action happened, separate from the scheduled slot itself), `notes` (nullable text). A **UNIQUE constraint on `(user_medication_id, scheduled_date, scheduled_time)`** prevents double-logging the same slot (e.g., an accidental double-tap on "mark as taken") — with an explicit "what breaks if removed" note: without it, adherence math could double-count, or dedup would have to move into query-time logic instead of being enforced by the database.

Migration verified against live Neon (all 7 columns, FK with CASCADE, the CHECK constraint, the composite UNIQUE constraint) before any route code was written — the same discipline as every migration in this project.

**Routes:** `POST /dose-logs` (verifies `userMedicationId` belongs to the requesting user via a JOIN/subquery *before* inserting — otherwise User A could log doses against User B's medication just by guessing a UUID, the same class of gap already closed for `user_medications`; returns 409 on the Postgres unique-violation error code `23505` rather than leaking a raw 500) and `GET /dose-logs?userMedicationId=` (JOIN-scoped to the authenticated user, optional filter). Both apply the `::text` cast fix to `scheduled_date` immediately, per the lesson from section 3.

**Live-tested with a full matrix including a third user (User C)**: create (201), duplicate-slot conflict (409), a second distinct slot (201), list returns both (200), then the critical cross-user injection test — User C attempting to `POST` a dose log against User A's `user_medications` row by UUID, correctly returning 404; User C's own list correctly empty; and User A's two logs confirmed unaffected afterward. One extra precaution taken mid-test: a pasted JWT looked visually corrupted compared to earlier ones (terminal-wrap artifact suspected), and rather than risk testing against a malformed token and mistaking a "401 = bad JWT" for a "401 = ownership enforced" false positive, a fresh, isolated login call was made to get a clean token before proceeding — an explicit acknowledgment that a convenient-looking result isn't the same as a verified one.

### 5. `GET /adherence/summary` — the most involved query in the project, and a real bug it surfaced

**Locking the algorithm before any SQL:** adherence is scoped to one `user_medications` row (different medications can have different `reminder_times`), with a `days` window (default 7). The core, deliberately debated design question: should a scheduled slot with **no** `dose_logs` row at all count as missed, or be excluded from the denominator entirely?

**Recommendation and decision: ungated slots count as missed.** Reasoning: this mirrors how real clinical adherence measurement works (comparable to Proportion of Days Covered / Medication Possession Ratio) — silence is non-adherence, not neutral. If never opening the app produced 100% adherence by default, the metric would be actively misleading for a health tool, which defeats its entire purpose. Trade-off: real query complexity — the full set of *expected* slots has to be generated (`generate_series` over the date range × `unnest(reminder_times)`) and `LEFT JOIN`ed against actual logs, rather than a simple `COUNT ... WHERE status='taken'`. What breaks if reversed later: previously-computed adherence percentages become non-comparable overnight with zero behavior change on the user's part — a bad look for a metric people track trends on — which is why it was locked before any historical data existed to be broken by a later change.

**A second boundary decision, deliberately simplified:** rather than doing same-day time-of-day comparison (is it past 8pm yet locally?) to decide whether *today's* slots count, the range was defined to **exclude today entirely**, ending at yesterday. Reasoning: avoids needing to reconcile server-clock time against user-local time inside a SQL query — exactly the class of subtlety that had already produced two real bugs this session (the `started_at` UTC shift, and this section's own off-by-one, found moments later). Trade-off: today's doses never show as "missed" until tomorrow, even if it's 11pm and clearly forgotten — judged an acceptable cost for avoiding a second clock-skew bug class.

**The query:** a CTE (`bounds` → `date_range` via `generate_series(GREATEST(started_at, CURRENT_DATE - days), CURRENT_DATE - 1, '1 day')` → `expected_slots` cross-joined with `unnest(reminder_times)`), then a `LEFT JOIN` against `dose_logs` on the three-column key, counting `total` vs. `taken` via `COUNT(*) FILTER (WHERE status = 'taken')`. `adherencePercentage` returns `null`, not `0`, when `totalSlots === 0` (e.g., a medication started today, no slots have come due) — explicitly chosen because `0%` would misleadingly imply failure rather than "no data yet."

**The off-by-one bug — the strongest verification story of the session, deliberately engineered rather than accidentally caught:** rather than spot-check for a plausible-looking number, a **hand-seeded, hand-calculable dataset** was built first: a test `user_medications` row with `started_at` exactly 7 days ago, and 6 of those 7 days seeded with a deliberately imperfect mix of `taken`/`missed`/`skipped`/no-log-at-all — worked out by hand in advance to a known answer (12 total slots, 8 taken, 66.7%). The first live call against `days=7` matched exactly — but a follow-up boundary check (`days=3`, expected 6 slots) returned only 4, revealing a genuine off-by-one: the range start was computed as `CURRENT_DATE - (days - 1)`, which combined with the yesterday-inclusive end boundary produced a span of only `days - 1` days, silently dropping the earliest day (which, for the 7-day case, was `started_at` itself).

**Fix:** drop the erroneous `- 1`, using `CURRENT_DATE - days` as the start bound. Re-verified against the same hand-computed dataset: `days=7` correctly returned 14 total slots (not 12), 8 taken, 57.1% — correctly including the previously-dropped day, which had no logs and therefore added 2 more missed slots to the denominator. A **process gap was caught mid-verification**: the fix's numbers matched expectations, but nothing confirmed the server had actually been *restarted* after the `sed` edit — if it hadn't been, the "post-fix" numbers could have been coincidentally identical to pre-fix ones. This was treated as a real gap, not pedantry: the server was explicitly restarted (new PID confirmed in the log) and every test re-run against the verified-fresh process before the fix was accepted as proven.

Documented as a full `docs/DECISIONS.md` entry (component, before/after numbers, the exact hand-calculated verification dataset, and an explicit note that any future change to this query must be re-verified against a seeded known-answer dataset, not spot-checked for plausibility) — the second time this session a bug's write-up was treated as first-class interview/article material, not just a fix.

With this, the milestone list from the original Chat-1 handoff — auth middleware, medication CRUD, dose logging, adherence summary — was fully closed: built, live-tested (not merely type-checked), and documented.

### 6. Upstash Redis setup — a real infrastructure incident, correctly diagnosed as not-a-code-problem

Before any BullMQ code, Redis needed a provider. **Recommendation: Upstash**, reasoned against $0-budget alternatives — Redis Cloud's free tier (30MB) was judged too small for BullMQ's job metadata at any real scale; Upstash's then-current free tier (500K commands/month, 200GB bandwidth) was confirmed as one of very few genuinely indefinite no-card free tiers. One technical check made explicit before committing: BullMQ needs a standard blocking-command TCP Redis connection, not Upstash's headline HTTP REST API (built for edge/serverless) — confirmed Upstash also exposes standard TCP connectivity compatible with `ioredis`, so this wasn't a blocker, just something to set up deliberately rather than assume.

**Real incident:** `upstash.com` was completely unreachable (`curl` returning `000`, browser timing out) — even after a retry, and even from a different network path entirely (phone hotspot on mobile data, which still failed while other sites worked). This was treated as a genuine debugging problem, not brushed off: DNS was checked first (`nslookup upstash.com` resolved cleanly to a real IP, ruling out DNS), a web search confirmed no active Upstash service outage on their status page, and the pattern (DNS resolving to a Vercel-owned IP block, `76.76.21.0/24`) combined with a web search turned up a known, documented issue: **Vercel-hosted marketing sites being unreachable specifically from Nigeria and other West African countries**, a routing/peering problem unrelated to the target service's actual uptime.

**Fix:** Cloudflare WARP (free, no-login "Private Browsing" mode — explicitly *not* the "Cloudflare One Client" enterprise-enrollment mode, which was called out as the wrong option to avoid accidentally enrolling the device in a managed network) used *only* for the one-time signup/dashboard interaction. Reasoning given for why this was safe rather than a workaround masking a real problem: the actual Upstash *database* endpoint (`*.upstash.io`) runs on AWS infrastructure, a completely different network path from the Vercel-hosted marketing site — so the routing block was expected to be irrelevant to the application's actual runtime connection, which was later confirmed once the API/worker connected successfully without the VPN active.

Two `.env` mistakes were caught and fixed during this setup, both via the established masked-verification pattern (`sed`/`awk` length checks rather than ever pasting a real secret into chat): a doubled `REDIS_URL=REDIS_URL=...` line (from literally copying the placeholder text including the key name), fixed by deleting exactly the malformed last line via `sed -i '$ d'`; and a moment of suspicion over a `RESEND_API_KEY` line that turned out to be a correctly-redacted real key, not an actual mistake — confirmed via a `length($2)` check rather than assumed either way.

### 7. `users.timezone` — required before any reminder math could exist

Converting a plain `'08:00'` clock string into an actual UTC delay for BullMQ requires knowing *whose* 8am that is — and the app had no timezone concept anywhere yet. **Recommendation, and decision: add a real `timezone` column now**, rather than hardcode `Africa/Lagos` as a stand-in. Reasoning: hardcoding works correctly today (Kola is the only user) but is a silent, undocumented assumption that breaks for anyone else later — explicitly named as the same failure shape as the two bugs already caught and fixed this session (the `started_at` shift, the adherence off-by-one): looks fine, works today, breaks silently and non-obviously later.

Migration: `users.timezone varchar(50) NOT NULL DEFAULT 'Africa/Lagos'` — verified live against Neon, confirming both the column and that existing test rows were correctly backfilled to the default with no null gaps.

**A genuine reconsideration, not just relitigating:** the first implementation of `resolveTimezone()` silently fell back to the default for *any* invalid input — both an omitted field and a garbage string like `"Africa/Lagoss"`. Prompted to reflect further, the position was explicitly reversed: an *omitted* field defaulting silently is reasonable (no client sent anything), but a *provided-but-invalid* value silently swallowed is exactly the class of bug already hit twice — something that looks successful (a 201) while quietly doing the wrong thing, in this specific case an invisible bug (wrong reminder time) that a user wouldn't notice until their medication reminder arrived at the wrong hour. **Fix:** `resolveTimezone` now distinguishes `timezone === undefined` (→ silent default) from any other non-IANA string (→ throws `AuthError`, 400), validated against Node's real `Intl.supportedValuesOf('timeZone')` list rather than a hand-maintained one. Verified live: omitted → default applied; a valid explicit zone (`America/New_York`) → honored; an invalid string → 400, with **no database row created** — confirmed by direct query, not just trusting the HTTP response, since the validation runs before password hashing or any write.

### 8. The reminder job contract — revised before any producer/consumer code, twice reconciled against schema drift

The pre-existing `ReminderJobData` interface in `packages/shared/src/queues.ts` (defined in an earlier, now-superseded session) had drifted out of sync with the schema built since: `dosage: string` predated the split into `dosage_amount`/`dosage_unit`, and `scheduledFor: string` (a single ISO instant) didn't match how `dose_logs` actually identifies a slot (`scheduled_date` + `scheduled_time` as two separate fields). **Revised shape:** `dosageAmount`/`dosageUnit` as separate strings (numeric values come back as strings from `pg`, kept consistent rather than silently coerced), and `scheduledDate`/`scheduledTime` as two plain strings deliberately mirroring `dose_logs`'s own key exactly — so the worker's eventual "has this already been logged" check is a direct match against the same three-column key, with zero date-math or timezone translation needed at that boundary. Reasoning: each BullMQ job should correspond to exactly one expected dose slot, the same atomic unit `dose_logs` already uses, so the worker can write to or check against `dose_logs` using the job's own fields directly, with no translation layer to introduce bugs.

**Scheduling strategy — Option A vs. Option B, a genuine toss-up:** Option A (a daily cron enqueues only "today's" jobs) risks silently losing an entire day's reminders if the cron doesn't fire on a free-tier host that can spin down on inactivity. Option B (schedule a rolling window of future jobs upfront via BullMQ's delayed-job `delay` option, topped up periodically) trades more jobs sitting in Redis at once for not depending on a cron actually firing. **Recommendation and decision: Option B** — given this is a free-tier, single-instance, portfolio-demo deployment where "the cron didn't run because Render spun down" is a realistic failure mode, reliability was judged to matter more than queue tidiness.

**Locked before writing code:** a 14-day scheduling window (long enough to avoid constant top-up pressure, short enough that an edit to `reminder_times` only ever needs to cancel/reschedule up to 14 days, not 90); a daily top-up job to extend the window (a softer failure mode than Option A's — if the top-up misses a day, already-queued reminders still fire fine, only future extension is delayed); and predictable, lookupable job IDs (`${userMedicationId}:${scheduledDate}:${scheduledTime}` initially) so a future delete can find and cancel a medication's queued jobs.

**Cancellation-on-delete failure mode, decided in advance:** if `DELETE /user-medications/:id` succeeds in Postgres but then fails to cancel the corresponding queued BullMQ jobs (e.g., a brief Redis outage), should the whole delete fail, or proceed best-effort? **Recommendation and decision: best-effort — don't block the delete.** Reasoning: a medication delete is a low-stakes, frequent action that shouldn't be held hostage by Redis's momentary availability; the residual risk (a stray job surviving and firing later) is mitigated by a cheap defensive check built into the *consumer* itself — before sending any email, the worker re-verifies the `user_medications` row still exists, turning a stray leftover job into a silent no-op rather than an erroneous email reaching the user.

### 9. Producer implementation, and three real bugs caught before this shipped

**`scheduleReminderJobs`**, written into `apps/api/src/queue.ts`: iterates 14 days from *today* (never from `started_at`, even if backdated — no retroactive reminders for days already past, since a negative-delay job makes no sense for a "reminder"), and for each `reminderTimes` entry converts the local wall-clock string + the user's IANA timezone into a correct UTC instant using `date-fns-tz`'s `fromZonedTime` — the correct v3 API confirmed via a live web search before writing code against it, rather than guessing at a possibly-renamed function from memory. Uses `addBulk` for a single Redis round-trip across all ~28 jobs rather than 28 individual `.add()` calls.

**Bug #1 — stale `packages/shared` build.** The first `tsc --noEmit` against the new `queue.ts` failed: `dosageAmount does not exist in type 'ReminderJobData'`. Diagnosis, confirmed rather than assumed: `packages/shared`'s compiled `dist/` had not been rebuilt since its `src/queues.ts` was revised earlier in the session — other workspaces resolve types against the compiled `dist/index.d.ts`, not `src/` directly, and nothing automates that rebuild. Fix: `cd packages/shared && npm run build`, re-verified the rebuilt `.d.ts` matched the current source shape, then confirmed `apps/api`'s type-check went clean. This produced a new standing rule, folded into the project's process discipline: any edit to `packages/shared/src/*` requires an explicit rebuild before dependent workspaces will see the change — nothing currently enforces this automatically, and it was also flagged as a real open question for the eventual Render deployment (does anything run this build step automatically at deploy time, or would a fresh deploy hit the identical stale-dist failure in production?).

**Bug #2 — a real BullMQ version mismatch, caught before any producer code ran against it.** While adding `date-fns-tz` to `apps/api`, a check of `apps/api/package.json` revealed `bullmq: ^6.0.5` and `ioredis: ^6.0.0` — but `apps/worker`'s already-installed versions were `bullmq: ^5.80.9` and `ioredis: ^5.11.1`. Diagnosis: an earlier unpinned `npm install bullmq ioredis` in `apps/api` had grabbed whatever was newest at that moment — and BullMQ's v6.0.0 had been released only three days prior as a breaking major version (a "pluggable queue backends" redesign removing API surface). A producer (API) and consumer (worker) running different major versions of the same queue library risked incompatible job serialization or silently dropped jobs — judged a worse failure mode than a normal version mismatch, since it wouldn't necessarily error loudly. **Fix: pin `apps/api` down to match the worker's already-established v5**, not the other way around — downgrading an unused-in-code package is zero-risk; upgrading the worker to a three-day-old major version sight-unseen was judged reckless for no functional benefit.

This surfaced a **second, distinct npm quirk**: a plain `npm install bullmq@5.80.9 ioredis@5.11.1` reported "up to date" and silently did *not* change the resolved version — confirmed by directly inspecting `node_modules/bullmq/package.json`, which still showed `6.0.5`. Diagnosis: npm workspace hoisting had deduplicated the package to the monorepo root and treated the existing v6 install as already "satisfying" the (looser, unpinned) request. **Fix: explicit `npm uninstall` followed by `npm install <pkg>@<version>`**, verified this time by checking the actual resolved version in `node_modules` directly, not just the manifest's semver range or the install command's own output. This exact hoisting gotcha recurred **twice more** later in the session (once again in `apps/api` for the same packages, and again in `packages/shared` during the later refactor to move scheduling logic there) — each time confirmed via the same direct `node_modules` inspection, and each time fixed the same way, cementing it as a documented, repeatable characteristic of this monorepo's dependency resolution rather than a one-off fluke.

**Bug #3 — BullMQ rejects job IDs containing colons under a specific condition.** The first live test of the wired-up producer (`POST /user-medications`) returned `500 Custom Id cannot contain :`. Initial hypothesis (BullMQ simply disallows colons) was refined by testing further: the real rule is that a custom job ID is rejected if it contains `:` *and* doesn't split into exactly 3 parts by that character. The original ID format `${userMedicationId}:${scheduledDate}:${scheduledTime}` had a UUID and a date with no internal colons, but `scheduledTime` (`"08:00"`) has its own colon — making the full string split into 4 parts, not 3, and triggering the rejection. **Fix:** switched the field separator to `_` and replaced only the time portion's `:` with `-` *within the ID string specifically* — the actual `scheduledTime` value stored in the job's data payload was left untouched as `"08:00"`.

**Live verification, end-to-end, not just trusting the API's returned count:** `POST /user-medications` correctly returned `jobsScheduled: 27`, not 28 — hand-confirmed against the actual creation timestamp (14:59 UTC / ~15:59 Lagos) that today's 08:00 Lagos slot had already passed and was correctly excluded, while today's 20:00 slot was correctly included. Rather than trust this number alone, Redis was inspected directly via BullMQ's own `getDelayedCount()`/`getJobs(['delayed'])` API: 27 real jobs present, correct IDs (colon-free), correct data payloads (with `scheduledTime` in the *data* confirmed to have correctly retained its original `"08:00"` colon format — only the ID was altered). One job's delay was hand-verified against its target date: ~13.16 days computed from the raw millisecond delay matched the actual gap to the target Lagos-local timestamp. A test cleanup incidentally surfaced a preview of the still-unbuilt cancellation feature: deleting the test user cascaded through `user_medications` in Postgres but did **not** remove the already-queued Redis jobs, since Postgres and Redis have no foreign-key relationship — manual cleanup was required, foreshadowing exactly the gap the next milestone would close.

### 10. The worker consumer — first real email sent

**`apps/worker/src/worker.ts`**: a BullMQ `Worker` at `concurrency: 1` (reasonable for portfolio scale, avoids any risk of hitting Resend's free-tier rate limits or overwhelming the free Redis connection). `processReminderJob` first re-queries Postgres to confirm the `user_medications` row still exists — the defensive check designed in section 8 to cover the best-effort-delete gap — logging and no-op'ing if it's gone, otherwise calling `sendReminderEmail`.

**`apps/worker/src/email.ts`**: a minimal, clear HTML email via Resend, including an explicit "not medical advice, follow your doctor's guidance" disclaimer — treated as a non-negotiable requirement per the project's own health-domain standards, not an afterthought. When asked whether to polish the copy further before proceeding, the recommendation was to leave it as-is: the disclaimer requirement was already met, and further wordsmithing was judged low-risk, cheap to revisit later, and not worth spending time on ahead of the genuinely correctness-risky work still remaining (the consumer itself, cancellation, top-up). Two real gaps were named explicitly as deferred follow-ups rather than fixed now: no unsubscribe/preferences link, and no visual branding — acceptable for a no-real-users demo, but flagged as a likely legal requirement before any actual production use.

A `cat -n` echo of the freshly-written `email.ts` displayed apparent typos (`Promie<void>`, `scheduedTime`) — following the now-established pattern from earlier sessions, this was suspected to be a terminal display/wrapping artifact rather than real file corruption, and was **not** assumed either way: a targeted `grep` for the correctly-spelled strings, plus a line count, confirmed the file was actually fine.

**Live test, designed to avoid waiting hours/days for a real reminder to fire:** registered a user with a real Gmail address (since Resend's free tier — `onboarding@resend.dev` as sender — can only deliver to the account owner's own verified address, a real limitation documented for future production use), created a real `user_medications` row, then manually pushed one additional test job with a 3-second delay directly via `reminderQueue.add()`. The worker was booted, and within seconds: `Sent reminder to [email] for ibuprofen (2026-08-03 TEST)`, `Job manual-test-job-1 completed` — and a real email was confirmed to have landed in the actual Gmail inbox with correct subject, medication, dosage, and disclaimer content. This was explicitly named as the strongest form of verification performed all session: not a log line claiming success, but a real message sitting in a real inbox.

### 11. Cancellation-on-delete

**`cancelReminderJobs(userMedicationId)`** in `queue.ts`: fetches all delayed jobs in the queue and filters client-side by ID prefix match, since BullMQ has no native prefix-search API (confirmed by checking the docs directly rather than assuming). This was named as a known, documented scaling limit — cost scales with total queue size, not one user's job count, acceptable at portfolio scale but would need real server-side pagination at real scale.

**`DELETE /user-medications/:id`** was updated per the best-effort design locked in section 8: the DB delete happens first and unconditionally; `cancelReminderJobs` is then attempted in a `try/catch`, logged on success or failure via `request.log`, and never blocks the `204` response — a Redis hiccup during cancellation leaves the DB delete intact, with any stray jobs still caught by the worker's own existence check as a second, independent layer of protection.

**Live-verified with an exact before/after count, not a trusted response code:** a medication was created (confirmed 27 jobs present in Redis via a dedicated count script establishing a real baseline), deleted via the API (204 returned), then recounted — 0 jobs remained. The DB side was independently confirmed too: a `GET` on the deleted ID correctly returned 404, proving both halves of the delete (Postgres row and queued jobs) were genuinely gone, not just one of them.

### 12. Refactor: moving scheduling logic into `packages/shared`

Before building the top-up job, a real architectural fork emerged: the top-up needs to call `scheduleReminderJobs`, but that function lived in `apps/api/src/queue.ts`, and the worker has no access to API-internal code, plus its own separate Redis connection entirely. **Option 1 (move the logic into `packages/shared`, both apps import the same tested implementation) vs. Option 2 (duplicate the logic into the worker).** **Recommendation and decision: Option 1** — explicitly justified by pointing back to Project 1's own established `api/`-vs-`services/` separation principle, and by naming the real risk of Option 2 directly: duplicated logic is exactly how the earlier BullMQ v5/v6 mismatch class of bug happens again, except worse, since silent behavioral drift between two copies has no loud version-mismatch error to catch it.

**Design of the moved functions:** rather than have `packages/shared` own its own `.env`/Redis connection (which would turn a plain types-and-logic library into something with credential/environment responsibilities it shouldn't have), `scheduleReminderJobs`/`cancelReminderJobs` were changed to accept an already-constructed `Queue<ReminderJobData>` as an explicit first parameter — each app keeps owning its own connection and config, `shared` stays a pure function library.

This refactor hit the **same npm-workspace-hoisting version-pin bug a third time**: `packages/shared/package.json` resolved `ioredis` to `^6.0.0` on first install (latest at install time) despite the actually-hoisted root copy being `5.11.1`, and a plain re-install again silently failed to fix the manifest — resolved with the same explicit uninstall/reinstall, verified against the real resolved version in `node_modules` directly.

**Re-verification, not just a clean type-check:** the exact same 27→204→0 producer/verify/delete/verify-cancelled test cycle used to validate the pre-refactor implementation was re-run afterward, byte-for-byte identical in outcome — treated as proof the move was genuinely behavior-preserving, not merely that it compiled.

### 13. Verifying a load-bearing assumption before building on it: does `addBulk` actually dedupe by `jobId`?

The entire top-up design (see next section) depends on a specific claimed BullMQ behavior: adding a job with a `jobId` that already exists should silently no-op rather than duplicate or error. Before designing the top-up around this assumption, it was checked — and a web search turned up a **conflicting signal**: most sources confirmed `.add()` respects `jobId` dedup, but one GitHub issue specifically claimed `addBulk()` (which is what the producer actually uses) creates a genuine duplicate on a repeated ID, unlike `.add()`. Since this couldn't be resolved by reading more search results (unclear version context, conflicting reports), it was tested **directly against the project's own installed version** (`bullmq@5.80.9`): a script called `addBulk` twice with the identical `jobId` but different payloads, then queried Redis directly for how many jobs actually existed under that ID and whose data survived. Result: exactly 1 job, with the data from the *first* call — confirming the second call was a true no-op, not a silent overwrite, and that the GitHub issue's report either applied to a different version/usage pattern or had since been resolved. This was explicitly named as real, direct verification of the project's own behavior, superseding an ambiguous secondhand report — the design was not built on the assumption until it was proven.

### 14. The top-up job — design and partial build (session ends mid-verification)

**Design, now that the dedup assumption was confirmed safe:** a BullMQ *repeatable* job (a separate queue, `reminder-topup`, distinct from the reminder queue itself) runs once daily; its processor queries every `user_medications` row and simply **re-calls `scheduleReminderJobs`** for each one. Thanks to the verified dedup behavior, this safely re-creates the ~13 already-scheduled days as silent no-ops and adds exactly one new day at the window's far edge — deliberately choosing simplicity (recomputing already-scheduled days is slightly wasteful) over building separate "only schedule the new day" incremental-tracking logic, since the marginal efficiency gain wasn't judged worth the added complexity of tracking a "scheduled through" state anywhere.

**Built:** `apps/worker/src/topup.ts` (a `topupQueue`, a `runTopup()` function joining `user_medications` → `medications` → `users` to gather everything `scheduleReminderJobs` needs per row, a `topupWorker` consuming the topup queue, and `scheduleDailyTopup()` registering a repeatable job on a `0 3 * * *` — 03:00 UTC — cron pattern, chosen as an arbitrary but reasonable low-traffic hour). A missing dependency was caught immediately during type-checking (`topup.ts` imported a `reminderQueue` from a worker-side file that didn't yet exist — the worker previously only had a `Worker` instance for *consuming* the reminder queue, never a `Queue` instance for *adding* to it, which the top-up genuinely needs). **`apps/worker/src/reminderQueue.ts`** was added to close that gap, mirroring the API's own `queue.ts` connection pattern. Type-checked clean across the whole worker package afterward.

Separately verified (not assumed): `worker.ts` has no import-time guard — its `new Worker(...)` setup runs unconditionally at module load, meaning `import './worker'` correctly starts the reminder consumer purely as a side effect of being imported. This mattered for designing the real entrypoint.

**`apps/worker/src/index.ts`**, the actual process entrypoint, was built and reasoned through explicitly: a single worker process runs both the reminder consumer and the topup scheduler/worker together, rather than splitting them into two separate processes/deploys. Three-question justification: at current portfolio scale (one free-tier Render worker dyno, not yet deployed), splitting into two Render services adds real deployment complexity for no present benefit; what's traded away is process isolation (a crash in top-up logic could in principle take the reminder consumer down with it); and nothing structural is lost by deferring the split, since `topup.ts` already exports its `Queue`/`Worker`/scheduler as self-contained units with no hidden coupling to `worker.ts` — a future extraction into a separate deploy would be a clean move, not a refactor. `apps/worker/package.json` was also updated with real `dev`/`build`/`start` scripts, closing a gap where the compiled worker previously had no way to actually be run (a real blocker that would have surfaced at Render deployment time if left unnoticed).

BullMQ's *repeatable*-job dedup specifically (a different mechanism from the `addBulk` dedup verified in section 13) was also independently tested rather than assumed: `scheduleDailyTopup()` was called twice, and `topupQueue.getRepeatableJobs()` was checked after each call — both times returning exactly 1 job with an identical repeatable-job key, confirming BullMQ correctly deduped by `{name, pattern}` and did not register a second copy of the daily cron on a repeated call.

**Chat 2 ends mid-verification of the live top-up test**, with the plan already agreed and partially executed: seed a real medication (confirmed 27 jobs scheduled), manually delete ~5 of the later-window jobs from Redis to simulate a window running dry, invoke `runTopup()` directly, and confirm it re-adds exactly the missing jobs (no more, no less) and the count returns to exactly 27 — with the specific returned job IDs checked, not just the total count, to rule out a subtly wrong implementation that happened to produce the right number by coincidence. At the point the session ended, a fresh test user and `user_medications` row had been created and `jobsScheduled: 27` confirmed via the API response, but the row's presence in Redis had not yet been independently re-confirmed, the job-deletion step had not yet run, and `runTopup` itself was noted as not yet exported from `topup.ts` (needed before an external test script could call it directly) — left as the explicit next step for a third session, along with a still-open `test-topup-dedup.ts` script sitting uncommitted on disk.

A second, updated handoff prompt was generated at the end of this chat (superseding, not replacing, the standing process rules from the first handoff) — carrying forward all twelve standing rules verbatim, the full milestone-by-milestone status of the completed reminder pipeline (auth → CRUD → dose logs → adherence, with its off-by-one → Redis/Upstash setup including the Nigeria/Vercel routing incident → `users.timezone` → the producer with its three bugs → the consumer with a real verified email → cancellation-on-delete verified 27→204→0 → the `packages/shared` refactor re-verified behavior-identical → the `addBulk` dedup verification), and the precise in-progress state of the top-up job's live test, so a third chat could resume without re-deriving or re-verifying any of the already-settled work.

---
## CHAT 3

---

### 1. Finishing the top-up job's live test — a genuine two-layer verification result

Chat 3 opened exactly where Chat 2's handoff left off: `runTopup()` was designed and built, but its live gap-fill test was mid-verification. First, the entrypoint-wiring decision deferred from Chat 2 was closed out — **wire the daily top-up into the same worker process as the reminder consumer**, not a separate process. Three-question justification: at current scale (one free-tier Render worker dyno, not yet deployed), splitting into two processes means two Render services for no present benefit; what's traded away is process isolation (a crash in top-up logic could in principle take the reminder consumer down with it); nothing structural is lost by deferring the split, since `topup.ts` already exports its `Queue`/`Worker`/scheduler as self-contained units with no hidden coupling to `worker.ts` — a future extraction is a clean move, not a refactor.

Before trusting `scheduleDailyTopup()`'s idempotency, it was verified directly rather than assumed: called twice, `topupQueue.getRepeatableJobs()` checked after each call, both times returning exactly 1 job with an identical repeatable-job key — confirming BullMQ's dedup-by-`{name, pattern}` behavior held under a real restart-like scenario, not just in theory.

**The actual gap-fill test, completed this session:** a baseline of 27 real jobs was reconfirmed via `count-jobs-for-medication.ts` (matching the API's `jobsScheduled: 27`), then a purpose-built `remove-last-n-jobs-for-medication.ts` script deleted the 5 farthest-out jobs by sorting job IDs descending (job IDs are lexicographically sortable the same as chronologically, since they embed an ISO date). A recount briefly appeared to show `2` instead of the expected `22` — correctly **not trusted at face value**, since the same heredoc-paste garbling that had bitten the session before was visibly present in the same terminal output. A fresh, standalone recount confirmed `22`, and a dedicated `verify-specific-jobs-gone.ts` script confirmed the exact 5 removed IDs were gone, not just that the count dropped by 5.

`runTopup()` was then invoked directly via a `run-topup-once.ts` script (this script's own heredoc write silently failed on the first attempt because `scripts/` didn't exist yet — caught and re-run correctly after `mkdir -p`). The recount afterward showed **29**, not the expected 27 — and this was treated as a genuine anomaly to diagnose, not waved through. Rather than assume a bug, a `list-jobs-for-medication.ts` script dumped every job ID for the medication and the full date range was inspected. The math resolved cleanly: real wall-clock time had passed since the original 27 jobs were scheduled earlier in the session, enough to cross a calendar-day boundary. When `runTopup()` ran, the rolling 14-day window had genuinely advanced by one day — so the same call that refilled the 5 deliberately-removed slots (confirmed via the exact-ID check, all 5 back as `STILL EXISTS`) also picked up 2 new slots for the newly-in-window day. `22 (remaining) + 5 (refilled) + 2 (new day) = 29` — exact, not coincidental. This was the strongest kind of test result: the top-up job was proven correct on both the scenario it was explicitly built to test (gap-filling) and an untested edge case (window naturally advancing with real time) inside the same run, and both behaved correctly. **Verdict: PASS.**

Cleanup followed the same standing discipline: all throwaway test scripts removed (keeping only the reusable `count-jobs-for-medication.ts`), the test user and its DB rows deleted with cascade confirmed (0 rows in both `users` and `user_medications`), and all 29 orphaned Redis jobs explicitly deleted and reconfirmed at 0 — not left to expire naturally.

**Commit `8b3a0e2`** covered the top-up job in full: `topup.ts`, `reminderQueue.ts` (a new `Queue` instance for the worker side — previously the worker only had a `Worker` consumer, never a producer, and top-up genuinely needs to add jobs), `index.ts` as the real process entrypoint, `package.json` dev/build/start scripts (closing a real deployment blocker — the compiled worker previously had no way to actually be run), and the test/ops scripts. A `docs/DECISIONS.md` entry was written in the established three-question format immediately after, documenting both the design and the unplanned-but-valuable rolling-window-advance result.

### 2. Full route-surface audit before any frontend code

Per the standing backend-first / plan-before-code rule, the entire live API surface was re-confirmed directly from source rather than reconstructed from memory across a very long project — `auth.ts`, `medications.ts`, `interactions.ts`, `user-medications.ts`, `dose-logs.ts`, `adherence.ts`, and the `auth.ts` service layer were all read in full. This surfaced a real detail that shaped the frontend design: **`/auth/refresh` does not rotate the refresh token** — it returns only `{ accessToken }`, and the original refresh token stays valid until its own 7-day expiry or an explicit logout. The frontend was designed around this fact from the start rather than incorrectly trying to persist a "new" refresh token after every refresh call.

The interaction-checker page placement (open since the original architecture pass) was settled here: **standalone `/dashboard/interactions`**, not embedded in the add-medication flow. Reasoning: the endpoint takes arbitrary medication IDs, not specifically the user's saved regimen — a user might reasonably want to explore "if I add X, does it interact with what I'm already on" independent of committing to add anything, and embedding it only in the add-flow would understate what the feature does.

### 3. Auth token handling — a security tradeoff surfaced explicitly, then upgraded

The first frontend plan called for `accessToken` in memory and `refreshToken` in `localStorage` (the common, low-effort pattern). Per the security-conscious-by-default rule, this was **not silently baked in** — the XSS tradeoff was stated in full three-question form before any code: `localStorage` is readable by any JS on the page, so an XSS vulnerability anywhere in the app (a compromised dependency, unsanitized rendered content) could hand an attacker a 7-day authenticated session by reading the token directly. The properly hardened alternative — an httpOnly cookie the browser holds and JS can never read, even under XSS — was named as real but not a drop-in frontend fix, since the API currently returns tokens as plain JSON.

**Decision: do the httpOnly cookie version now, even though it touches `apps/api`,** not accept the localStorage tradeoff and revisit later. Full scope was planned before writing anything: add `@fastify/cookie`, move CORS to `credentials: true` with an explicit whitelisted origin (credentialed requests reject wildcard `*`), migrate `refreshToken` from response body to `Set-Cookie` (httpOnly, scoped to `path: /api/v1/auth` so it isn't sent on every request, `Secure`/`SameSite` behavior split by `NODE_ENV` — `SameSite=Lax`, no `Secure` locally over plain HTTP; `SameSite=None; Secure` in production, since Vercel and Render are genuinely different sites and browsers reject `SameSite=None` without `Secure`), keep `accessToken` in the JSON body / in-memory on the frontend (short 15-minute life means the residual XSS exposure is much smaller and time-boxed), and update `/logout` to clear the cookie in addition to the existing server-side revocation.

Checking the actual current CORS/middleware config before editing (never assumed) caught a second real bug early: **every route the frontend plan had drafted was missing the `/api/v1` prefix** the API actually registers routes under — found before it became a mystery-404 debugging session later.

**Live-verified via `curl`, not just a clean type-check, across all four cases:**
- **Register:** `Set-Cookie` confirmed `HttpOnly`, `Path=/api/v1/auth`, `SameSite=Lax`, no `Secure` (correct for local HTTP) — and `refreshToken` confirmed absent from the JSON response body entirely.
- **Refresh:** using curl's cookie jar to simulate real browser cookie attachment, confirmed the server reads the cookie with nothing required in the request body, and returns a genuinely new `accessToken` (different `iat`/`exp`).
- **Logout:** `204`, and the `Set-Cookie` response actually expires the cookie (`Max-Age=0`, `Expires=1970`), not just an empty value.
- **Revocation:** the same now-logged-out cookie was replayed from the jar and correctly rejected with `401 "Refresh token has been revoked"` — proving server-side revocation is real, not a client-side-only clear a stale browser tab could bypass.

Committed as `4f36234` with test users created and cleaned up via a dedicated script.

### 4. `GET /auth/me` — closing a real gap found while designing session restore

Designing the silent-restore-on-load flow (call `/auth/refresh` on app boot, show a loading state until it resolves) surfaced a gap: `/auth/refresh` returns only `{ accessToken }`, and the JWT payload itself (checked directly in `tokens.ts`, not assumed) only encodes `{ userId, email }` — no `name`, no `timezone`. A silent restore would leave the frontend with a valid session but nothing to render a "Welcome, Kola" header or default a form to the user's timezone with.

**Fix: `GET /auth/me`**, a small authenticated endpoint returning the full user row, called right after a silent refresh succeeds. Three-question form: solves the missing-user-data problem on restore; trades one extra network round-trip (refresh, then me) for keeping `/refresh`'s response minimal and not duplicating "fetch the user" logic in two places — also reusable later for a settings page; purely additive, breaks nothing existing. Live-verified with `curl` using a real extracted access token, confirmed `200` with the correct user shape.

### 5. Frontend scaffold and the theming/accessibility foundation

`apps/web` was scaffolded: Next.js 16, TypeScript, App Router, Tailwind CSS v4, no `src/` directory. Because Tailwind v4 changed how dark mode is configured, class-based dark mode required an explicit `@custom-variant dark (&:where(.dark, .dark *));` declaration in `globals.css` rather than the v3-style config toggle — chosen specifically because the app needs a **user-controlled** toggle (light/dark/system), not just OS-preference-following. `lib/theme-context.tsx` was built with `localStorage` persistence (a theme preference isn't sensitive the way tokens are, so `localStorage` is the right call here, unlike the refresh token) and a resolved-theme computation for the "system" option. An **inline anti-flash script** was added to `layout.tsx`'s `<head>`, running synchronously before paint — without it, the page would flash light mode for logged-in dark-mode users on every load before React hydrates and reads `localStorage`.

`lib/api-client.ts` (central fetch wrapper, `/api/v1` prefix, `credentials: 'include'` so the httpOnly cookie is actually sent), `lib/auth-context.tsx`, `lib/validation.ts`, and `lib/types.ts` were built as the shared foundation every page depends on.

### 6. A full UX/accessibility audit, before scaling to more pages

Once `/login` and `/register` had a first working pass, Kola ran a manual audit rather than assuming the pages were done, surfacing a real list of issues. New standing rule locked in here: **UX/accessibility decisions get the same three-question rigor as backend architecture decisions** — this project explicitly targets top-notch UX/accessibility, not just functional correctness.

**Fix-now items:** native browser validation popups instead of real inline feedback (inconsistent styling, not screen-reader-friendly); submit buttons gated only on `isSubmitting`, not real form validity; silent session expiry with zero explanation to the user; icon buttons (the password eye-toggle) at `24px`, below the WCAG-recommended 44×44px minimum touch target — a real conflict with the "fully responsive across all screen devices" requirement; no skip-to-content link or `<main>` landmark, forcing keyboard/screen-reader users to tab through the theme toggle on every page load; no `autoFocus` on the first field.

**Fix-soon items:** loading spinner missing `role="status"`/`aria-live`; a generic error message that doesn't distinguish a real network/DNS failure from a legitimate API rejection; `prefers-reduced-motion` not respected by spinner/theme-transition animations; an unsorted ~400-entry timezone `<select>`.

**Backlog (flagged, deliberately deferred):** a password strength meter, a proper toast/notification system, a full WCAG contrast pass on both themes' color tokens, and actual responsive testing across device breakpoints — none touched yet this session.

Rather than patch each page individually, the decision was to **build the fix-now and fix-soon items as reusable components/patterns first**, so every future page inherits them: `lib/validation.ts` (pure functions mirroring the API's Fastify schemas exactly), `components/FormField.tsx` (label + input + inline error + ARIA wiring, real 44px touch height), `components/PageSpinner.tsx` (`role="status"`, `aria-live`), `components/SkipLink.tsx` plus a `<main id="main-content">` landmark wired into `layout.tsx`, `prefers-reduced-motion` support added globally in `globals.css`, `PasswordInput` and `ThemeToggle` both bumped to real 44px targets, and `api-client.ts`/`auth-context.tsx` updated to distinguish a real network failure from an API rejection and to carry a reason through session-expiry redirects.

`components/SkipLink.tsx` hit the **bare-opening-tag heredoc-stripping bug twice in a row**, identical failure both times — confirmed as the first documented instance of what became a standing rule for the rest of the session: always merge an opening JSX tag with its first attribute on the same line, since a lone `<a` on its own line gets silently stripped during heredoc paste into the terminal.

### 7. Two real bugs caught by live testing, not assumed away

**The ambiguous password placeholder.** During manual testing, a screenshot showed the login password field displaying dots with a "Password is required" error underneath it — visually contradictory, since dots normally mean something was typed. Root cause: the field's `placeholder` was literally set to bullet characters (`••••••••`), and since `type="password"` already renders real typed input as dots, an *empty* field showing its placeholder was visually indistinguishable from a *filled* field showing masked text. The register page never had this bug — it used real-word placeholder text (`"At least 8 characters"`) — login was simply inconsistent. Fixed to `"Enter your password"`, verified with a clean `tsc --noEmit` and a fresh manual pass.

**`autoFocus` defeating the skip link.** Fixing the placeholder led to a second manual check — pressing Tab once on a fresh page load, which should land on the skip link first. It didn't. Diagnosis: `autoFocus` on the first form field moves browser focus into that input immediately on mount, before the user ever presses a key — so when Tab is pressed, focus starts from the already-focused field and moves forward, never reaching the skip link at all, even though the skip link sits earlier in the DOM. Two accessibility problems at once: the skip link becomes permanently unreachable by keyboard, and `autoFocus` on page load is independently discouraged in accessibility guidelines because it silently relocates a screen-reader user's position without their input. Three-question call: removing `autoFocus` restores the skip link as the genuine first Tab stop and stops the silent relocation; what's traded away is the minor convenience of the cursor already sitting in the first field for a sighted user; reverting would bring the bug straight back. Given this is an explicitly accessibility-first, health-adjacent app, correctness won. `autoFocus` removed from both auth pages, re-verified live with a fresh Tab-key test.

### 8. Redirect-loop bug — caught via HAR inspection, not assumed

While closing out `/register`, Kola reported that navigating to `/register` rendered nothing and immediately bounced to `/login`. Rather than guess, the browser's HAR export was inspected directly, and the same exact sequence showed up on repeat: `GET /register → me (401) → me (401) → refresh (401) → GET /login`.

**Root cause:** `AuthProvider`'s silent session-restore effect (which runs on *every* page load, including `/login` and `/register` themselves) calls the same `getCurrentUser()` path a genuine mid-session token expiry uses. For a logged-out visitor this correctly 401s, triggers a refresh attempt, which also correctly 401s (no valid cookie) — but the shared `request()` function in `api-client.ts` calls `onAuthFailure?.()` on any such failure, and `onAuthFailure` is wired to `router.push('/login')`. The result: "no session yet" (expected, silent, normal) and "your session just died mid-use" (should genuinely redirect) had been collapsed into the same code path, so *every* anonymous page load — including the auth pages themselves — force-redirected to `/login` in a loop.

**Fix:** a `skipAuthRedirect` option was added to `RequestOptions`, respected inside `request()` so it skips the `onAuthFailure` call when set. A dedicated `fetchCurrentUserSilently()` function was exported specifically for the restore effect to use, using `skipAuthRedirect: true` — the regular `apiClient.getCurrentUser()` used everywhere else keeps its normal redirect-on-failure behavior. `auth-context.tsx` was updated to call `fetchCurrentUserSilently()` in the restore effect instead. Verified fixed live: reloading `/register` and `/login` with Strict Mode's double-invoke in dev no longer redirects, and the deduped in-flight-refresh guard in `api-client.ts` was confirmed working correctly under that same double-invoke.

### 9. A real DNS incident, diagnosed directly rather than assumed to be a code bug

Mid-session, a login attempt returned a genuine 500. Rather than assume it was related to the cookie migration just shipped, the actual error was read first: `Error: getaddrinfo ENOTFOUND ep-super-dawn-...pooler...neon.tech`, thrown inside `loginUser()` when the DB query attempted to run — a DNS resolution failure on the Neon Postgres hostname, unrelated to anything built this session. A ~45-minute idle gap before the failed request, combined with the project's documented history of Nigeria-specific network flakiness (the earlier Upstash/Cloudflare WARP routing incident), made this plausible but not assumed: verified directly with `nslookup` (resolved successfully on retry, with a note that the first attempt timed out) and a standalone `test-db-connection.ts` script bypassing the API entirely, which succeeded cleanly. **Verdict: infrastructure flakiness, not a code bug** — the httpOnly cookie migration and everything else built this session was confirmed unaffected, and the app's existing error handling had already displayed it as a graceful inline error rather than crashing.

### 10. Dashboard shell and medications list

`app/dashboard/layout.tsx` was built as the shared shell for every `/dashboard/*` route: auth-protects the whole section (redirects to `/login` if there's no valid session — the mirror image of the auth pages' own redirect-away-if-already-authenticated logic) and renders a consistent header (app name, user's name, theme toggle, sign out). Deliberately does **not** render its own `<main>` — the root `layout.tsx` already provides `<main id="main-content">`, and a nested `<main>` landmark would be invalid HTML and confuse screen readers.

`app/dashboard/page.tsx` fetches the user's medications on mount with three explicit states handled: loading (`PageSpinner`), empty (a real empty state with explanatory copy and a prominent "Add a medication" CTA, not a blank page), and populated (a card per medication linking to `/dashboard/[id]`). Live-verified end-to-end after a clean dev-server restart: login succeeded, `GET /user-medications` returned `200` with an empty array for the test account, and the empty state rendered correctly with the header showing the right signed-in user's name. A prior stray 500 seen before the restart did not recur — confirmed to be stale local state, not a code bug.

### 11. `/dashboard/add` — medication search and the create flow

`lib/validation.ts` gained validators for `dosageAmount`, `dosageUnit`, `frequency`, `reminderTime`, and `medicationSelected`, mirrored exactly from the API's `user-medications` create schema. `components/ReminderTimesInput.tsx` — a dynamic list of `HH:MM` inputs — always keeps at least one row; "remove" is *disabled*, not hidden, when only one remains, since a medication with zero reminder times isn't a state the form should reach, and a disabled button explains itself better than one that silently vanishes.

`app/dashboard/add/page.tsx` implements a 300ms-debounced live medication search rendered as real `<button>` elements (full keyboard/screen-reader access without building a full ARIA combobox), dosage unit and frequency as free-text inputs with `<datalist>` suggestions (matching the API's freeform string schema exactly — no drift risk from a hardcoded enum), and a submit button gated on real form validity, same pattern as the auth pages. Live-verified end-to-end via HAR inspection, not just visual inspection: `GET /medications?search=ibuprofen` returned `200`, `POST /user-medications` returned `201` with `jobsScheduled: 14` — confirming the real BullMQ scheduling pipeline actually fired, not just that a row was inserted — and the new medication correctly appeared in the dashboard list on redirect.

### 12. `/dashboard/[id]` — detail page, adherence, dose logging, and delete

`components/ConfirmButton.tsx`: a reusable two-step inline delete confirmation, no browser `confirm()` popup — first tap arms the button, second tap confirms.

`app/dashboard/[id]/page.tsx` brought together four live API integrations: medication detail, adherence summary with a 7/30/90-day window toggle, one-tap dose logging (Taken/Missed/Skipped), and delete via `ConfirmButton`. Full manual test pass, verified against the actual network traffic (HAR), not just the rendered UI: page load showed the auth-refresh-and-retry logic working silently in the background (401 → refresh → 200, with Kola not even noticing it happened — the sign of it working correctly); adherence loaded at both `days=7` and `days=30`; the first dose log returned `201`; a second attempt at the identical date/time slot correctly returned `409`, rendered as a clean inline error ("A dose log already exists for this slot") rather than a crash or unhandled rejection.

**The 0-of-0 adherence display.** The adherence card on a same-day-created medication showed `0 of 0 doses taken · 2026-08-19 to 2026-08-18` — a date range that visually looks inverted (start after end) alongside a confusing zero. This was **checked against the adherence query's own known design before being treated as a bug**: the window deliberately computes as `CURRENT_DATE - days` to `CURRENT_DATE - 1` — "yesterday and earlier only," since today's doses haven't fully passed yet (the "silence counts as missed" design locked in Chat 2). A medication created today, with today also being "today," genuinely has zero days in a window that ends yesterday — `GREATEST(startedAt, ...)` computing a start date later than the end date is a correct side effect, not a bug. Confirmed correct, but still flagged as a real UX gap: even "correct" output reading as backwards and empty is confusing to a real user with no context for why. **Fix:** an explicit `totalSlots === 0` check added before the percentage display, showing "No adherence data yet" instead of a raw, confusing `0 of 0`.

Commit `01a5724` covered the full detail page and `ConfirmButton`, with the commit message documenting the four API integrations, the 409-conflict handling, and the adherence UX fix — landed and pushed cleanly, confirmed via `git log --stat` against a garbled terminal echo that turned out to be cosmetic only.

### 13. Recurring process gotchas, reinforced this session

- **Bare opening JSX/HTML tags on their own line get stripped during heredoc paste** — confirmed twice, identical failure both times, on `SkipLink.tsx`. Always merge an opening tag with its first attribute on the same line.
- **Terminal echo garbling is usually cosmetic, not real data loss** (the `2`-vs-`22` job count, the garbled commit-message echoes) — but it must be independently re-verified every time, never assumed away, because one case this session (the first `SkipLink.tsx` write) genuinely *was* real corruption, and only re-verifying with a fresh `cat -n` caught it.
- **Claude does not have direct file-system access to Kola's machine.** Reaching for `str_replace`/direct file tools reflexively happened more than once this session and is a real process mistake — every edit must be a literal Git Bash command (heredoc, `sed`, or full-file regeneration) that Kola runs and pastes output back from.
- **`str_replace`/multi-line `sed` on complex JSX is fragile** — for anything beyond a trivial one-line change, full-file heredoc regeneration proved more reliable all session and is now the preferred approach.

### 14. End-of-chat state and handoff to Chat 4

Chat 3 ended with `ConfirmButton.tsx` and `app/dashboard/[id]/page.tsx` staged but not yet committed — closed out as the first action of Chat 4 (commit `01a5724`, confirmed pushed).

**Shipped this chat:** the top-up job's live verification (closing out the reminder pipeline entirely), the httpOnly-cookie auth upgrade with full live `curl` verification, `GET /auth/me`, the full `apps/web` auth/theming/accessibility foundation, `/login` and `/register` (with two real bugs found and fixed), the dashboard shell and list page, `/dashboard/add`, and `/dashboard/[id]` (with a third real UX bug found and fixed).

**Not yet built:** `/dashboard/interactions` (standalone, per the decision in section 2). **Not started:** deployment (Render + Vercel), the responsive/device-width testing pass, the WCAG contrast audit, and all end-of-project content deliverables (PDF compilation, Medium/Hashnode article, LinkedIn post).
## CHAT 4

---

### 1. Closing out the Chat 3 handoff

Chat 4 opened with the two carry-over items from Chat 3's handoff: `ConfirmButton.tsx` and `app/dashboard/[id]/page.tsx` were staged but uncommitted - confirmed via `git status` and landed as commit `01a5724`. The Chat 3 section of this file was then written in full from the uploaded Chat 3 transcript, replacing the placeholder stub, verified line-count-exact (516 -> 636, +120 lines matching the drafted section) before committing as `4a5a292`.

### 2. `/dashboard/interactions` - standalone interaction checker

Before writing any code, the real API contract was re-confirmed from source rather than assumed: `apps/api/src/routes/interactions.ts` and `services/interactions.ts` were read in full, surfacing the exact `InteractionFinding` discriminated union (`curated | text-scan-warning | text-scan-reassuring`) and confirming `severity` is constrained to `minor | moderate | severe` at the DB level, though only `moderate`/`severe` are actually seeded across the 18 curated pairs. `UserMedication.medicationId` (the catalog ID `checkInteractions()` expects) was confirmed distinct from `UserMedication.id` before writing the multi-select, avoiding a real mismatch risk that would have silently checked the wrong IDs.

**`components/InteractionFindingCard.tsx`** branches on `finding.tier` in a single component rather than three separate ones, since the pair-header layout is shared. Curated findings get the full treatment (severity badge, mechanism, recommendation, source citation); text-scan findings get a visually lighter card explicitly labeled "automated text match, not clinically reviewed," with the matched excerpt shown as a literal quote. This tiering is the actual point of the union - a `text-scan-reassuring` result must never look as authoritative as a `curated` one, since it's a narrow keyword heuristic, not verified data. Hit the now-familiar bare-opening-tag heredoc-stripping bug on a `<a href={...}>` block - same failure class as `SkipLink.tsx` in Chat 3 - fixed with a targeted `sed` insert rather than full regeneration.

**`app/dashboard/interactions/page.tsx`**: multi-select against the user's own saved medications (real checkboxes, not a custom widget, consistent with the project's established preference for native elements), gated on >=2 selections, findings sorted client-side (curated-severe -> curated-moderate -> text-scan-warning -> text-scan-reassuring) since the backend doesn't pre-sort. A directory-doesn't-exist heredoc failure was caught cleanly this time - `mkdir -p app/dashboard/interactions` was missing before the first `cat >` attempt, and the failure was diagnosed correctly from the literal `No such file or directory` error rather than trusting a false `tsc` exit-0 (an empty/nonexistent file trivially "passes" a typecheck).

**A real accessibility bug, caught by direct visual report:** the "Check N medications" button used `hover:opacity-90` with no `cursor-pointer`, unlike every other button in the app (`hover:bg-accent-hover` + `cursor-pointer` is the established pattern). Rather than patch just that one button, every clickable element across `app/` and `components/` was audited (`grep` for `onClick=`/`type="button"`/`type="submit"`, cross-checked against `cursor-pointer` presence) - confirmed this was the only instance, not a systemic gap, before fixing and committing.

### 3. WCAG 2.1 AA contrast audit

Computed with the real relative-luminance formula (Node script, not eyeballed) across every color-token pairing in both themes. Five genuine failures found:

- **White text on solid accent buttons, dark mode only: 2.98:1.** Root cause: `--accent` needed to stay light for legibility as text/links/borders against a dark background, but that same lightness broke white-on-solid-fill contrast - one token serving two incompatible jobs. Fixed with new `--accent-solid`/`--accent-solid-hover` tokens (`#4f46e5`/`#4338ca`, fixed across both themes, single `:root` definition) applied only to solid button fills; `--accent` itself left untouched where it already passed.
- **White text on the Taken button** (`bg-green-600`, 3.30:1) -> `bg-green-700` (5.02:1).
- **White text on the Missed button and `ConfirmButton`'s delete-confirm** (both `bg-red-500`, 3.76:1) -> `bg-red-600` (4.83:1). Caught a wrong prior assumption here - had claimed `ConfirmButton` already used `red-600` before verifying; the real `grep` showed it didn't.
- **`text-muted` on `bg-surface`, light mode: 4.40:1** (borderline fail) -> light-mode `--muted` darkened to `#52525b`; dark mode already passed and was left alone.
- **Tinted alert/badge text** (`red`/`amber`/`green-500` on their own `/10` background), light mode: as low as 1.99:1 for amber. Fixed across 17 instances with `text-{color}-700 dark:text-{color}-500` - dark mode already passed at the `-500` shade, light mode needed `-700`. An early attempt at this (`amber-600`/`green-600`) was re-verified and found to still fail (2.95:1, 3.02:1) before landing on the correct `-700` shade.

### 4. WCAG 1.4.11 non-text contrast - prompted by a real visual bug report

A screenshot showed the "Skipped" button's border effectively invisible against its card in light mode. Rather than patch that one instance, the root `--border` token was checked against WCAG 1.4.11 (3:1 minimum for interactive UI component boundaries) and found badly failing in both themes (1.15-1.33:1) - though this only applies to genuine interactive controls, not decorative card/container borders, which 1.4.11 doesn't require 3:1 for. A new `--control-border` token (`#71717a`, comfortably passing 3.67-4.83:1 in both themes) was applied only to the 6 real ghost/outline buttons affected (Sign out, Cancel, the unselected adherence toggle, Skipped, the reminder-time remove button, the theme toggle) - found by cross-referencing every `border-border bg-surface`/`bg-background` usage against the earlier clickable-element audit, filtering out plain cards/fieldsets/list rows that don't carry the requirement.

Following direct visual feedback that the fix, while passing the math, still didn't read as clearly defined next to saturated solid buttons, the light-mode shade was darkened further to `#52525b` - but only for light mode. Darkening uniformly across both themes was checked first and found to actively break dark mode (pushing its border toward its own near-black background, dropping contrast to 2.29-2.56:1) - confirmed with the same luminance script before applying, not assumed safe just because it looked like an obvious tweak.

### 5. Missing interactions nav, found via the same visual report

The same screenshot round surfaced that `/dashboard/interactions` had no way to reach it except typing the URL directly - the dashboard shell's header never got a nav link added when the page was built. Fixed with a proper `<nav>` in `dashboard/layout.tsx` ("My medications" / "Check interactions"), using `aria-current="page"` on the active link so keyboard/screen-reader users get the same "you are here" signal sighted users get from the active-state color.

### 6. Em dash removal from user-facing copy

Per a direct style request, every em dash in rendered JSX text (not code comments, which aren't user-facing) was found via `grep` and replaced contextually - sentence splits in most places, a colon in the page `<title>`, and a middle dot for the dosage/frequency separator, matching a middle-dot convention already used elsewhere in the app (the adherence date-range display) rather than inventing a new one.

### 7. Second-machine setup - a locked-down corporate laptop

Kola began alternating onto a second, corporate-managed PC. `node -v`/`npm -v` crashed immediately with an `EPERM` error referencing a completely different Windows account's profile folder. Diagnosed methodically rather than guessed at: confirmed `USERPROFILE`/`APPDATA`/`HOME` all correctly resolved to the right account (ruling out an env-var problem), then found via `nvm root` that `nvm4w`'s actual per-version install directory lived entirely inside the user's own profile - separate from the `C:\nvm4w\nvm-symlink` junction that had been the suspect. Direct inspection of that root folder found the smoking gun: the existing Node v24 "version" was itself a symlink pointing into a completely different account's (`Admkokumo`, the IT admin who'd done an earlier elevated install) profile folder - explaining the `EPERM` exactly.

Root cause: switching the shared `nvm-symlink` junction requires admin elevation on this machine, which Kola doesn't have (confirmed live - a UAC prompt appeared during `nvm use` and had to be dismissed, since there's no admin login to approve it with). Fix, needing no IT involvement: installed a fresh version via `nvm install` (this part doesn't require elevation, since it just downloads into the user's own writable profile folder), then bypassed the broken symlink entirely by exporting `PATH` directly at that version's real folder, made permanent via `~/.bashrc`. Verified durable across a genuinely fresh shell, not just the current session. A standalone, reusable troubleshooting doc (`nvm4w-corporate-pc-node-fix.md`) was generated and handed off for future use on other locked-down machines, since this exact failure mode is specific enough to be worth not re-diagnosing from scratch.

### 8. Full environment recreation on the second machine

Every environment variable required across `apps/api`, `apps/worker`, and `apps/web` was pulled from actual source (`config.ts` files, not memory or guesswork) rather than assumed from an absent `.env.example`. Since the second PC had no access to the original machine's `.env` files, credentials were recovered independently: `DATABASE_URL` and `REDIS_URL` retrieved directly from the Neon and Upstash web consoles (same live cloud resources, not new ones), a fresh `RESEND_API_KEY` generated since Resend only shows a key once at creation, and - correctly reasoned as unnecessary to recover - brand-new `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` generated fresh, since these only need to be internally consistent for the process that issued a given token, not identical across machines. Secret values were never pasted into the chat itself, following the same discipline as the project's git-hygiene rules.

Verified genuinely working, not just "didn't crash on boot": `apps/api` answered a real `curl` query against the live Neon medications table; `apps/worker` connected to the actual shared Upstash Redis queue and began processing real pre-existing queued jobs left over from earlier testing sessions (confirmed by matching job IDs back to medications seen in earlier screenshots) - the Resend send failures that followed were correctly diagnosed as expected sandbox behavior (unverified test-domain emails), not a setup bug.

### 9. Two real bugs found while smoke-testing the new setup

**Bare root route (`/`) was still Next.js's default `create-next-app` scaffold** - every test all project had hit a specific path (`/login`, `/dashboard/add`, etc.), so this sat unnoticed until the plain domain root was loaded for the first time. Fixed with an auth-aware redirect (`/dashboard` if a session exists, `/login` otherwise), using the same `useAuth()` pattern already established in `dashboard/layout.tsx`. Verified both branches live.

**A doubled `/api/v1` prefix in every API request**, diagnosed via an uploaded HAR file rather than guessed at - `apps/web/lib/api-client.ts` already appends `API_PREFIX` internally, and `NEXT_PUBLIC_API_URL` had incorrectly been set to include `/api/v1` itself. This was a mistake in the setup instructions given, not a project bug - corrected to the bare host only, with a reminder that `NEXT_PUBLIC_*` variables are baked in at build time and require a dev-server restart to take effect.

### 10. Forgot-password: deferred, not built

Triggered by forgetting a local test account's password mid-testing - solved immediately by registering a fresh test account, since there's no real recovery need at this stage. Rather than build the feature or silently skip it, the decision to defer was logged to `docs/DECISIONS.md` in the standing three-question format: real feature, real future value, but scoped out for now in favor of finishing the higher-priority backlog (responsive testing, deployment, content deliverables) - the existing Resend integration means a future build is a moderate lift, not a new integration from scratch.

### 11. Git identity bug on the second machine

Git had no configured identity on this machine and auto-guessed one from the Windows account, resulting in a commit authored under a **work email address** (`@zenithbank.com`) rather than the personal identity (`Adekola Olawale <rolawale92@gmail.com>`) used on every other commit in the repo - caught directly from Git's own warning in the commit output, not missed. Fixed by setting `user.name`/`user.email` globally on this machine, then correcting the already-pushed commit with `git commit --amend --reset-author` and `git push --force-with-lease` (safe here specifically because this is a solo repo and nobody else had pulled in the interim) - re-verified the corrected author before considering it closed.

### 12. Responsive/device-width testing pass

Tested systematically at three breakpoints (375px, 768px, 1280px) across all 6 core pages (`/login`, `/register`, `/dashboard`, `/dashboard/add`, `/dashboard/[id]`, `/dashboard/interactions`), narrowest-first since that's where responsive bugs cluster. Included genuine functional testing at each width, not just visual inspection - added medications and ran a real interaction check through the UI at 375px specifically.

**Result: clean pass, no code changes required.** No horizontal overflow anywhere, touch targets stayed correctly sized at every width, the dashboard nav wrapped properly on narrow screens, and multi-button rows (Taken/Missed/Skipped, the adherence-window toggle) never wrapped or truncated. Content staying in a centered, constrained-width column at 768px/1280px (rather than stretching full-bleed) was confirmed as the correct design choice, not a bug - full-width form fields at tablet/desktop width would have hurt readability. This is a reasonably strong result attributable to `min-h-11` touch targets and `flex-wrap` layouts having been built in from the start across earlier sessions, rather than retrofitted now.

### 13. End-of-chat state

**Closed this session:** `/dashboard/interactions` built and shipped, full WCAG 2.1 AA + 1.4.11 audits complete, missing nav fixed, em dashes removed, second-machine environment fully set up and verified (with a reusable troubleshooting doc for future locked-down machines), two real setup-adjacent bugs found and fixed (root route, doubled API prefix), forgot-password formally deferred, a git-identity bug caught and corrected, and the full responsive/device-width testing pass completed clean.

**Not yet started:** deployment (Render + Vercel), and the end-of-project content deliverables (compiled PDF from this file, Medium/Hashnode article prompts, LinkedIn post).
## CHAT 5

---

### 1. Dev/prod environment separation - the real problem

Chat 4 closed having verified something with real consequences once deployment happened: both machines' local dev pointed at the same live Neon database and the same live Upstash Redis queue, confirmed directly when a local worker restart picked up real pre-existing jobs. Once `apps/api`/`apps/worker` deployed to Render on those same credentials, a production worker and any locally-running `npm run dev` worker would pull from the exact same BullMQ queue - not a correctness bug (BullMQ's Redis locks prevent double-processing), but a real hygiene problem: local test medications landing in the database real users would eventually populate, and local testing capable of triggering real reminder emails through the deployed worker's Resend key. A Neon branch literally named `production` already existed, suggesting this separation had been anticipated but never finished.

**Decision: separate dev and prod.** Reasoning logged at the time - this app was about to become a real, publicly accessible URL, and environment isolation is exactly the kind of practice expected at senior level, not just busywork. Cost was low given the existing setup: Neon branches are free, instant, copy-on-write forks reusing the same compute allowance.

### 2. Neon `development` branch

Created via the Neon console's "New Branch" button, parent `production`, "Branch data and schema" selected (not empty) so existing test medications/interactions/curated pairs carried over. Caught before creating: **Auto-delete defaulted to "After 1 day"** - would have silently destroyed the branch and broken both machines' local dev a day later. Changed to "Never" before confirming.

`DATABASE_URL` updated in both `apps/api/.env` and `apps/worker/.env` on the Omen PC, `sslmode=require` changed to `sslmode=verify-full` matching established convention. Verified as a genuine fork, not a coincidentally-empty database: `curl` against `/api/v1/medications?search=aspirin` returned the exact same aspirin record with the exact same UUID (`65a77438-...`) as the production branch. `apps/worker` restarted clean against the same new `DATABASE_URL`, correctly picking up "5 active user_medications rows" - though this run also demonstrated the still-open half of the problem: `REDIS_URL` was still shared, so the worker processed real queued jobs against the production Redis queue on this restart (harmless here, since BullMQ's `jobId` dedup meant no actual duplicates, but a live illustration of exactly the risk being fixed).

### 3. Redis isolation - Upstash's free-tier wall, and the pivot to BullMQ prefixes

Attempted a second free Upstash database for the same separation. Hit a real constraint: **Upstash's free tier allows only one database per account** - a second one requires a payment method, which conflicts with the project's $0 budget rule. Rather than accept the shared-queue risk or break budget, pivoted to **BullMQ's built-in `prefix` option**, which namespaces every key a queue uses in Redis - different prefixes for prod and dev operate on fully separate key spaces within the same physical Upstash instance, at zero additional cost. Confirmed this was actually wireable before committing to it: grepping for Queue/Worker/IORedis constructors across `apps/api/src`, `apps/worker/src`, and `packages/shared/src` surfaced **5 separate constructor call sites across 4 files** - `apps/api/src/queue.ts`, `apps/worker/src/reminderQueue.ts`, `apps/worker/src/topup.ts` (a `Queue` and a `Worker`), and `apps/worker/src/worker.ts` - each independently constructing its own `IORedis` connection.

**Plan:** derive `bullPrefix` automatically from `NODE_ENV` (`'bull'` in production, `'bull-dev'` everywhere else) - no new required environment variable, since `NODE_ENV` is already correctly set per environment (Render sets `production`; local dev defaults to `development`). `apps/api/src/config.ts` already computed `isProduction`; `apps/worker/src/config.ts` had no `NODE_ENV` handling at all and needed the same logic added, mirroring the API's pattern. Flagged as a real risk at plan time, not discovered later: if `NODE_ENV` is ever misconfigured on Render, the prefixes silently collapse back to shared with no error - explicitly deferred to live verification once Render was actually set up.

### 4. Implementing the prefix - two real `sed` bugs, one still-unexplained one

Both config files updated cleanly (`bullPrefix: isProduction ? 'bull' : 'bull-dev'` added to each exported object). The 5 constructor sites were harder. Two of five `sed` patterns (`reminderQueue.ts`, `worker.ts`) silently failed to match on the first attempt, and a `$`-anchored retry also failed. Diagnosed properly rather than guessed a third time: `cat -A` plus `file` showed no CRLF issue (plain LF throughout) - the real cause was that `reminderQueue.ts` and `worker.ts` use **2-space indentation**, not the 4-space pattern the `sed` commands assumed (matching `queue.ts`/`topup.ts`'s convention instead). Corrected patterns landed both.

Then a third, genuinely stranger bug: `git status` afterward showed `apps/api/src/queue.ts` as unmodified, despite an earlier `cat -n` clearly showing the edit applied. Re-editing produced the *same* silent failure a second time. Root-caused this one too, via `od -c` on the exact byte content: **`queue.ts` also used 2-space indentation**, not 4 as assumed - a third instance of the same wrong assumption, not a new failure class. A VS Code auto-save buffer overwriting the file was floated as a possible explanation for the earlier apparent revert and checked directly (Kola confirmed a tab was open), but the file still failed to update with the *old* 4-space pattern even after the tab was closed and confirmed absent - meaning the indentation mismatch, not VS Code, was the actual and complete explanation both times. The earlier moment where `cat -n` seemingly showed a correct edit with 4-space indentation that later vanished remains genuinely unexplained and was logged as such in the commit message rather than papered over with a guessed cause.

All 5 sites confirmed correct via full `cat -n` review before moving on. Both `apps/api` and `apps/worker` type-checked clean (`npx tsc --noEmit`, exit 0 on both) - though the first check attempt gave a false-positive "exit code: 0" from a `cd apps/api` that silently failed as a relative path from the wrong directory, the same class of bug flagged repeatedly across Chat 4 and still recurring here. Redone with absolute paths and `pwd` confirmation both times.

### 5. Verifying the isolation live, not just compiling clean

Restarted both `apps/api` and `apps/worker`. The worker's daily top-up job correctly did **not** fire immediately on this boot - a real, confirmed-expected result rather than a regression: the old immediate-firing behavior in prior sessions was an overdue repeatable job under the now-isolated `bull` prefix; a brand-new `bull-dev` job has no backlog and correctly waits for its real next scheduled time (03:00 UTC). Producer-side isolation verified directly rather than waiting for 3am: added a real test medication (acetaminophen) through the running app - `POST /user-medications` returned `201` with `jobsScheduled: 14`, confirming `apps/api`'s queue producer scheduled real jobs under the new prefix with no errors.

Decision logged to `docs/DECISIONS.md` in the standing three-question format, including the explicit flag that Render's `NODE_ENV=production` setting needed live verification, not just assumption. Committed as `8b32cb7` (7 files changed, 56 insertions(+), 6 deletions(-)) - the commit message itself documents the unexplained `queue.ts` revert honestly rather than omitting it. Post-push, verified the actual pushed commit object (not just the local working copy) contained the fix: `git show 8b32cb7:apps/api/src/queue.ts` confirmed the `prefix` line was genuinely in the remote history, given how much trouble that specific file had caused.

### 6. Pre-deployment code check: host binding

Before touching Render's UI, checked for a classic "works locally, breaks on a cloud host" trap - a server bound to `127.0.0.1` instead of `0.0.0.0`, which local dev never surfaces. `apps/api/src/index.ts` was already correct: `app.listen({ port: config.port, host: '0.0.0.0' })`, with `config.port` correctly falling back to whatever `PORT` Render injects. No code change needed. Also confirmed a plain `/health` endpoint (no `/api/v1` prefix) already existed - directly useful for Render's health-check configuration.

Fresh production JWT secrets generated (crypto.randomBytes(48).toString('hex'), run twice), kept out of the chat entirely, never reused from any local `.env`.

### 7. Render: creating `medtrack-api`

New Web Service, GitHub repo connected (`Kola92/medication-adherence-checker`, `main` branch). Several defaults needed correcting before creation, caught by direct review of the creation form rather than accepting them:

- **Compute plan defaulted to $7/month**, not Free - selected the Free tier explicitly, given the $0 budget rule.
- **Root Directory left blank** (repo root) - required for this npm-workspaces monorepo, since `npm install` needs to run at the repo root for `packages/shared` to correctly symlink into `apps/api`'s `node_modules`. Setting it to `apps/api` would have broken that.
- **Build Command:** npm install && cd packages/shared && npm run build && cd ../../apps/api && npm run build
- **Start Command:** node apps/api/dist/index.js
- **Name:** changed from the repo's default name to `medtrack-api`, anticipating the second Render service (the worker) needing a distinct name.
- **Region:** left as Oregon (US West) despite Neon being in `us-east-1` - the added cross-region latency is real but minor for a free-tier demo, and not worth chasing given free-tier region choices are limited anyway.

Noted for docs/article, not treated as something to fix: Render's free-instance info banner confirms free services spin down after inactivity, meaning a real cold-start delay (often 30-60+ seconds) on the first request after idle - an inherent $0-hosting tradeoff, not a bug.

### 8. Environment variables and the health-check path catch

Six variables set: `DATABASE_URL` (the **`production`** Neon branch specifically, not `development` - fetched fresh from Neon's Connect panel with `sslmode=verify-full`, a genuinely different string from any local `.env`), `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (the fresh production-only secrets generated a step earlier), `REDIS_URL` (the same shared Upstash instance used everywhere - correct by design, since isolation now comes from the `bull`/`bull-dev` prefix, not a separate instance), `NODE_ENV=production` (set explicitly rather than trusted as a platform default, since the entire queue-isolation scheme depends on it), `CORS_ORIGIN=http://localhost:3000` (temporary placeholder, pending the real Vercel URL). `PORT` deliberately left unset, since Render injects it automatically and the code already reads it correctly.

Caught before submitting: **Health Check Path was set to `/healthz`**, but the actual registered route (confirmed from source, `apps/api/src/index.ts`) is `/health`. Left as `/healthz`, Render would have repeatedly 404'd its own health check and could have flagged a genuinely healthy service as unhealthy. Corrected to `/health` before creating the service. Auto-Deploy confirmed already set to "On Commit."

### 9. First deploy failure - `NODE_ENV` colliding with its own purpose

First deploy failed with `TS7016` errors: `@types/bcrypt`/`@types/jsonwebtoken` declarations not found. Root cause, diagnosed directly rather than guessed: `npm install` automatically skips `devDependencies` whenever it sees `NODE_ENV=production` in the environment - a well-known npm default - and `NODE_ENV=production` was exactly what had been deliberately set for the BullMQ prefix logic. `@types/bcrypt` and `@types/jsonwebtoken` are correctly `devDependencies` (compile-time only), so npm silently skipped installing them at build time even though they're required to compile.

**Fix:** `--include=dev` added to the Build Command, forcing `npm install` to include dev dependencies regardless of `NODE_ENV` - this only affects the build step, not the app's runtime behavior. Updated Build Command: npm install --include=dev && cd packages/shared && npm run build && cd ../../apps/api && npm run build

Redeploy triggered.

### 10. Confirmed live - `medtrack-api` deployed and reachable

The redeploy succeeded: build successful, `node apps/api/dist/index.js` started, listener bound to both `127.0.0.1:10000` and the instance's internal IP, and Render's own health-check poller began hitting `/health` and getting `200` back immediately and repeatedly. Real URL: `https://medtrack-api-wuad.onrender.com`.

Verified independently, not just from the deploy log: `curl -i https://medtrack-api-wuad.onrender.com/health` returned `HTTP/1.1 200 OK` with a JSON body showing `status: ok` and a timestamp. The `404`s visible in the deploy log on bare `GET /` and `HEAD /` are expected and correct - no route registered there, not a bug.

### 11. End-of-chat state

**Closed this session:** dev/prod environment separation fully designed, decided, and implemented - Neon `development` branch created and verified on the Omen PC, BullMQ queue-prefix isolation built across all 5 constructor sites and verified live (both consumer-side "isolated job didn't fire early" and producer-side "14 real jobs scheduled under the new prefix" checks), committed and pushed (`8b32cb7`) with an honestly-logged unexplained revert noted rather than hidden. `apps/api` deployed to Render as `medtrack-api`, first-deploy `TS7016` failure correctly diagnosed as a `NODE_ENV`/devDependencies collision and fixed via `--include=dev`, service confirmed live and independently verified reachable at its real `*.onrender.com` URL.

**Not yet done:** `DATABASE_URL` on the H: PC still points at the `production` branch and needs updating to `development`, matching the Omen PC. `apps/worker` not yet deployed. `apps/web` not yet deployed to Vercel. `CORS_ORIGIN` on `medtrack-api` still the `localhost:3000` placeholder. End-to-end production smoke test not yet run.
