-- Performance indexes + one-time fetch_log backfill prune.
--
-- HOW TO RUN: paste into the Supabase dashboard SQL editor (Database → SQL
-- editor). Do NOT run this through the app's DATABASE_URL — Supavisor's
-- transaction pooler (:6543) enforces a 2-minute statement_timeout that it
-- will not let you raise, and every statement below exceeded it while the
-- instance was loaded. The SQL editor connects as `postgres` directly.
--
-- WHEN TO RUN: after deploying the Valhallan aggregation caching (the commit
-- that added VALHALLAN_STATS_TAG). Until that ships, every homepage request
-- runs two full scans of `players` that detoast the ~200 MB ranked_json
-- column, and the instance has no headroom to build an index — an ANALYZE of
-- the 18k-row `guilds` table was measured timing out at 226s in that state.
--
-- CREATE INDEX CONCURRENTLY is deliberately NOT used: through Supavisor it
-- returned success while leaving every index `indisvalid = false` and 0 bytes.
-- These are plain builds — they briefly take an ACCESS EXCLUSIVE lock, which
-- is fine for a site this size and fails loudly instead of silently.

-- 1. Username typeahead ---------------------------------------------------
-- /api/search/players and /search run `username ILIKE '%q%'` against ~90k
-- rows with no usable index. Measured at 95s+ per keystroke against prod.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS players_username_trgm_idx
  ON players USING gin (username gin_trgm_ops);

-- 2. Search / list ordering ------------------------------------------------
-- Both search paths now ORDER BY this column instead of a ranked_json
-- expression (which detoasted the blob for every matched row).
CREATE INDEX IF NOT EXISTS players_ladder_rating_idx
  ON players (ladder_rating DESC NULLS LAST);

-- 3. Guild leaderboard -----------------------------------------------------
-- Matches getGuildLeaderboard's ORDER BY exactly. Without it /guilds sorts
-- 18.5k rows unaided and used to fail the production build with a Postgres
-- statement timeout.
CREATE INDEX IF NOT EXISTS guilds_rank_xp_idx
  ON guilds (rank ASC NULLS LAST, xp DESC);

-- 4. fetch_log retention ---------------------------------------------------
-- Serves the rolling prune in the sync-valhallan cron.
CREATE INDEX IF NOT EXISTS fetch_log_created_at_idx
  ON fetch_log (created_at DESC);

ANALYZE players;
ANALYZE guilds;
ANALYZE fetch_log;

-- 5. One-time fetch_log backfill prune ------------------------------------
-- fetch_log had no retention and reached ~1.6M rows / 361 MB — roughly 72% of
-- the 500 MB free-tier quota, for a table only /admin reads. The cron keeps it
-- trimmed from here on; this clears the existing backlog.
--
-- `id` is a serial and `created_at` defaults to now(), so the two are
-- monotonic together and the delete can run off the primary key. Do NOT
-- rewrite this as `WHERE id IN (SELECT ... LIMIT n)` — Postgres hashes the
-- subquery and sequentially scans the whole table for every batch (observed:
-- a single 50k batch still running after 24 minutes).
--
-- Run the DO block repeatedly until it reports 0 deleted, then VACUUM.
DO $$
DECLARE
  boundary bigint;
  lo       bigint;
  hi       bigint;
  removed  bigint := 0;
BEGIN
  SELECT id INTO boundary
  FROM fetch_log
  WHERE created_at < now() - interval '30 days'
  ORDER BY created_at DESC
  LIMIT 1;

  IF boundary IS NULL THEN
    RAISE NOTICE 'nothing older than the retention window';
    RETURN;
  END IF;

  SELECT min(id) INTO lo FROM fetch_log;

  WHILE lo <= boundary LOOP
    hi := least(lo + 100000 - 1, boundary);
    DELETE FROM fetch_log WHERE id >= lo AND id <= hi;
    GET DIAGNOSTICS removed = ROW_COUNT;
    RAISE NOTICE 'ids %-%: % rows', lo, hi, removed;
    lo := hi + 1;
  END LOOP;
END $$;

-- Reclaims the dead tuples for reuse. VACUUM FULL would return the disk to the
-- OS but takes an exclusive lock for the duration — only worth it if the
-- 500 MB quota is actually binding.
VACUUM (ANALYZE) fetch_log;
