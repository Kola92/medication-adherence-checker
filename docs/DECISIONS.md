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
