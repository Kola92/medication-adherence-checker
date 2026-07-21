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
