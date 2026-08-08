## Database: Neon Postgres (pooled connection, sslmode=verify-full)

**What problem does this solve?**
Free-tier Postgres with no hard expiry (unlike Render's 90-day free DB
deletion), avoiding silent data loss on a portfolio project that needs
to stay demoable indefinitely. Pooled connection host (`-pooler` suffix)
avoids exhausting Neon's free-tier direct-connection cap under concurrent
request load.

**What was traded away?**
Cross-provider latency (DB on Neon/AWS us-east-1, API deploying to Render)
instead of same-provider colocation. Also: Neon free tier scales compute
to zero on inactivity — first query after idle pays a cold-start penalty
of a few seconds. Mitigate by warming the DB before live demos.

**What breaks if you change it?**
Switching to the non-pooled host reintroduces the connection-exhaustion
risk under concurrent load. Downgrading sslmode from verify-full to
require/prefer (pg-connection-string's current aliasing) will silently
adopt weaker guarantees in pg v9 / pg-connection-string v3 per the
library's own deprecation warning — pin explicitly, don't rely on the
alias.

## Note: redundant index on users.email

The `UNIQUE` constraint on `users.email` already creates a backing index
automatically in Postgres. The migration also explicitly creates
`users_email_index`, which is redundant — harmless, but not necessary.
Left in place rather than migrated away, since a migration whose sole
purpose is removing a no-op index isn't worth the history noise. Future
migrations should rely on UNIQUE's implicit index and skip the explicit
createIndex call for uniqueness cases.

## Measured latency: Lagos to Neon (us-east-1)

Real-world round trip measured at ~1.5-1.8s per DB query from local dev
in Lagos to Neon's us-east-1 instance. This is steady-state network
latency, not just cold-start — confirmed by testing 3+ consecutive
requests after the initial cold-start call and seeing the number plateau
rather than continue dropping toward zero.

Consequence: registerUser was refactored from 2 queries (existence check
+ insert) to 1 atomic query (INSERT ... ON CONFLICT DO NOTHING RETURNING)
to cut one round trip on the register path, and — more importantly —
to close a race condition where concurrent registration attempts with
the same email could both pass the old check-then-insert sequence before
either completed.

Accepted tradeoff: total auth latency (register: ~2 round trips + bcrypt,
login/refresh: ~1 round trip + bcrypt) sits around 1.5-2.5s. Not fast,
but consistent with the Neon no-expiry tradeoff already documented above.
If this becomes a real UX problem later, the fix is deploying the API
closer to Neon's region (Render supports region selection) rather than
further query optimization — the bottleneck is network distance, not
query design.

## Interaction data model: text-scan + curated pairs, not full pairwise matrix

**What problem does this solve?**
openFDA (and every free drug data API) provides per-drug free-text
interaction warnings, not structured pairwise interaction pairs with
severity ratings. A full pairwise matrix (2,415 possible pairs across
70 drugs) authoritatively graded for severity does not exist at $0 —
that data is what DrugBank/Lexicomp charge for. Claiming otherwise
would mean fabricating clinical severity ratings, which is a real
liability for a health app, not a portfolio shortcut worth taking.

**What was traded away?**
Two-tier system instead of one clean table: (1) medications.interaction_notes
holds raw FDA label text per drug, checked at request time via text-scan
— broad coverage, no severity grading, full traceability to source.
(2) interactions table holds ~15-20 hand-curated, well-documented pairs
(warfarin+NSAIDs, statins+grapefruit family, MAOIs+SSRIs, etc.) with real
severity + citations — narrow coverage, high confidence, showcase-quality.
Neither tier alone is sufficient; together they're honest about what's
verified vs. what's a broad safety-net scan.

**What breaks if you change it?**
Populating interactions.severity for all 2,415 possible pairs without
per-pair verification reintroduces the exact fabrication risk this
design avoids. If a future paid data source (DrugBank API) is added,
is_curated distinguishes provenance rather than silently mixing verified
and unverified severity ratings in the same table.

## openFDA seed results: gliclazide gap + 16 drugs with no interaction_notes

**What problem does this solve / what happened?**
91/92 drugs in the seed list succeeded against openFDA. Two findings
worth documenting rather than treating as silent gaps:

1. **Gliclazide** is not FDA-approved in the United States and has no
   openFDA label record — this is a real limitation of relying on a
   US-only regulatory source for a global-scope app. It was manually
   added with interaction_notes sourced from the UK's Electronic
   Medicines Compendium (EMC) instead, with source_url explicitly
   noting this entry is manually curated, not an automated openFDA pull.

2. **16 drugs** (mostly OTC/older formulations — ibuprofen, aspirin,
   acetaminophen, diphenhydramine, loratadine, cetirizine, and others)
   returned a successful openFDA match but with no drug_interactions
   field populated in their label. This is not a script bug — some FDA
   labels genuinely don't populate this field, with interaction info
   sometimes living elsewhere in the label (warnings/precautions) or
   simply not required at the drug's approval vintage.

**What was traded away?**
Coverage completeness for source purity. Rather than scraping warnings/
precautions text as a fallback (noisier, less reliably interaction-specific,
harder to defend as "this is interaction data"), these 16 drugs simply
have no automated interaction_notes and rely entirely on the curated
interactions table (Option B) for any interaction coverage.

**What breaks if you change it?**
This is precisely why several curated pairs (ibuprofen+warfarin,
NSAIDs+lithium, etc.) are non-negotiable inclusions in the curated
interactions table — the automated text-scan tier is silent for these
drugs, so the safety-net value of the app for common OTC drugs depends
entirely on the curated tier, not the openFDA tier.

## Decision: Distinguish reassuring vs. warning matches in text-scan tier

**Date:** 2026-07-29
**Component:** `apps/api/src/services/interactions.ts`

### What problem does this solve?
The tier-2 text-scan matches a target drug's name inside another drug's raw
`interaction_notes` and surfaces an excerpt as a potential interaction. But FDA
label language sometimes uses that exact pattern to say the opposite — e.g.
lisinopril's label states digoxin can be co-administered "without evidence of
clinically significant adverse interactions." A naive substring match
surfaced this as if it were a risk warning, identical in shape to a genuine
one. In a medication-safety tool, a false positive isn't a cosmetic bug —
it's the tool crying wolf, which trains users to distrust or ignore real
warnings. This needed fixing before the tier could be trusted at all.

### What was traded away?
Precision for recall, in a bounded, explicit way. `NEGATIVE_PATTERNS` is a
keyword list (phrases like "without evidence of clinically significant,"
"no dose adjustment necessary") — not NLP, not sentiment analysis, not an
LLM call. It will not catch every negation phrasing an FDA label could use;
it only catches phrasings we've actually seen in the 92-drug corpus. That's
a deliberate scope limit, not an oversight — building a general negation
classifier is out of proportion to a $0-budget, 92-drug demo, and a keyword
filter is auditable in a way a black-box classifier isn't (relevant for a
health-adjacent tool where "why did it say this" needs a real answer).

### What breaks if you change it?
- If `NEGATIVE_PATTERNS` is removed: tier-2 reverts to conflating "no
  interaction" language with "warning" language — the original bug.
- If the corpus grows past the current 92 drugs: new negation phrasings
  will slip through undetected until manually found — this filter doesn't
  generalize, it's reactive to observed cases. Any future drug-list
  expansion should include a manual review pass over unusually-worded
  negative results.
- If `tier: "text-scan-reassuring"` and `tier: "text-scan-warning"` are
  collapsed back into one `tier: "text-scan"` value on the API response:
  the frontend (not yet built) loses the ability to visually distinguish
  the two, and the original ambiguity returns for the end user, not just
  internally.

### Verification
This issue was not caught during design or code review — it surfaced during
manual live testing against real openFDA data (lisinopril+digoxin), when the
returned excerpt read as a reassurance rather than a warning despite matching
the same text-scan logic as genuine risk pairs. Caught by inspecting actual
API output, not by anticipating the failure mode in advance.

Three cases checked against live data:
- warfarin + ibuprofen → curated tier, unaffected by this change (control)
- lisinopril + digoxin → correctly reclassified `text-scan-reassuring`
- phenytoin + digoxin → correctly remained `text-scan-warning`

**Related commit:** `045214c`

## Decision: Off-by-one in adherence summary date range

**Date:** 2026-08-01
**Component:** `apps/api/src/routes/adherence.ts`

### What problem does this solve?
`GET /adherence/summary?days=N` is meant to compute adherence over the last
N days (excluding today, since a slot that hasn't occurred yet shouldn't
count against the user). The initial implementation computed the range
start as `CURRENT_DATE - (N - 1)`, which combined with the "end at
yesterday" boundary produced a range spanning only N-1 days, not N. A
request for `days=7` returned 6 days of data. This was caught by seeding
a hand-calculable dataset (known total slots, known taken count, known
expected percentage) and comparing the endpoint's output against that
independently-computed answer, rather than just checking for a 200 and a
plausible-looking number.

### What was traded away?
Nothing — this was a straight bug fix, not a design tradeoff. The fix
removes the erroneous `- 1` so the range start is `CURRENT_DATE - N`,
giving exactly N days ending yesterday.

### What breaks if you change it?
If the `- 1` is reintroduced (e.g. during a future refactor of this query),
every adherence percentage silently understates the requested window by
one day, with no error or obviously wrong output - the bug only surfaces
by comparing against a hand-computed expected value, not from casual
testing. Any future changes to this query should be re-verified against a
seeded dataset with a known answer, not just spot-checked for
plausibility.

### Verification
Seeded 6 days of dose_logs for a test user_medications row (started_at =
7 days ago), with a deliberate gap on one day (no logs at all, which
should count as missed slots per the confirmed "ungated slots count as
missed" adherence design) and a mix of taken/missed/skipped statuses on
the other days. Hand-calculated expected result: 12 total slots, 8 taken,
66.7%.

- Before fix: `days=7` returned totalSlots=12 (should be 14) - silently
  dropped the started_at day from the range.
- After fix: `days=7` returned totalSlots=14, takenSlots=8, 57.1% -
  correctly includes the started_at day, which had no logs and
  therefore added 2 more missed slots to both total and denominator.
- `days=3` cross-checked by hand against the actual seeded rows for
  07-29 through 07-31: 6 slots, 5 taken, 83.3% - matched exactly.
- Confirmed the fix was tested against a freshly restarted server
  process (new pid), not a stale process from before the sed edit.

## Reminder Top-Up Job: Rolling Re-Schedule + Single-Process Worker Wiring

### What problem does this solve?
The reminder producer schedules a rolling 14-day window of BullMQ delayed
jobs at creation time. Without a top-up mechanism, that window is static
- users who keep a medication active past 14 days would simply stop
getting reminders once the originally-scheduled jobs ran out, with no
error or signal that anything was wrong. `runTopup()` re-calls
`scheduleReminderJobs()` for every `user_medications` row on a daily
schedule, relying on BullMQ's confirmed `jobId` dedup (see the `addBulk`
verification below) so the window keeps sliding forward automatically.

A second, separate problem this addresses: `apps/worker` previously had
no real entrypoint - the reminder consumer (`worker.ts`) was run directly
via `npx tsx src/worker.ts` all session, with no `start`/`build` script,
which was a hard blocker for Render deployment. `apps/worker/src/index.ts`
is now the real entrypoint, importing `worker.ts` for its side-effect
(starts the reminder consumer) and calling `scheduleDailyTopup()` on
startup, so a single process runs both the reminder consumer and the
topup scheduler/worker together.

### What was traded away?
Choosing a re-schedule-everything-daily approach over tracking explicit
"scheduled through" state per medication: simpler, no new DB column, no
risk of that tracking state drifting out of sync with what's actually in
Redis. Traded away: it's less efficient at scale (every active medication
gets a full `scheduleReminderJobs()` call every day, even though ~13 of
14 days are guaranteed no-ops) - acceptable at portfolio scale, would
need reconsideration at real user volume.

Choosing single-process worker wiring over separate processes for the
reminder consumer and the topup scheduler/worker: at portfolio scale (one
Render free-tier worker dyno, not yet deployed), splitting into two
processes means two Render services for no current benefit. Traded away:
process isolation - a crash in topup logic could take the reminder
consumer down with it, and vice versa. Accepted because this is a
portfolio project, not a system with an on-call rotation.

### What breaks if you change it?
If `scheduleReminderJobs()`'s jobId format ever changes (the
`{userMedicationId}_{scheduledDate}_{scheduledTime-with-dash}` scheme),
the dedup this whole design relies on breaks silently - old jobs and new
jobs would no longer collide on the same ID, and every daily top-up would
start creating true duplicates instead of no-ops. Any change to that ID
scheme needs to be re-verified against `getJobs(['delayed'])` counts
before shipping, the same way the original format was verified.

Splitting the single worker process into separate processes later is a
clean extraction, not a refactor - `topup.ts` already exports its
Queue/Worker/scheduler as standalone units with no hidden coupling to
`worker.ts`. This is the intended scaling boundary if reminder delivery
and top-up ever need independent deploys/restarts.

### Verification

**BullMQ `addBulk` jobId dedup** (unblocks the whole top-up design):
conflicting GitHub issue claimed `addBulk` might not dedupe by `jobId`
the way `.add()` does. Tested directly against the installed version
(`bullmq@5.80.9`): called `addBulk` twice with the same `jobId` but
different payloads, confirmed only 1 job existed in Redis afterward and
its data matched the FIRST call, not the second - genuinely ignored, not
overwritten.

**BullMQ repeatable-job dedup** (`apps/worker/scripts/test-topup-dedup.ts`):
called `scheduleDailyTopup()` twice, checked `topupQueue.getRepeatableJobs()`
after each call. Result: 1 job both times, identical `key`
(`3b4d34c8d0fe60c3ce393ef5a39d8483`) - confirmed BullMQ deduped by
`{name, pattern}` and did not create a duplicate on the second call, so
calling `scheduleDailyTopup()` on every worker process restart is safe.

**Full top-up cycle, live**: seeded a real `user_medications` row (27
jobs scheduled, hand-verified). Removed the 5 farthest-out jobs by exact
ID (simulating a partially-drained window). Recounted: 22. Called
`runTopup()` directly (not via the queue - the exported function itself).
Recounted: 29, not the expected 27. Diagnosed via a full sorted job
listing rather than assumed: real wall-clock time had passed between job
creation and the topup run, enough to cross a day boundary, so the
rolling 14-day window advanced by one day between the two steps. This
simultaneously (a) refilled the 5 removed slots, now back inside the
shifted window, and (b) added 2 new slots for the day newly entering the
window - 22 + 5 + 2 = 29, exactly. Confirmed via exact-ID lookup (not
just count) that the 5 originally-removed jobs specifically came back.
No duplicates, no stray dates in the full listing.

This test ended up exercising two behaviors in one run - intended
(gap-fill) and unplanned (window-advance) - both correct, which is a
stronger result than the originally planned test alone would have given.

**Cleanup verified**: DB cascade-delete on test user confirmed (`users`
and `user_medications` both 0 rows post-delete, checked directly, not
assumed from the delete query's own `RETURNING` clause). All 29 orphaned
Redis jobs explicitly removed (BullMQ jobs aren't foreign-keyed to
Postgres, so the DB cascade does not touch them) and reconfirmed at 0.
