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
