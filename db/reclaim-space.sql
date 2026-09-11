-- One-time database-size reclaim.
--
-- The project was at 615 MB against a 500 MB free-tier quota. Where it sat:
--
--   fetch_log         362 MB   1,599,414 rows   <- 59% of the whole quota
--   players           200 MB      90,583 rows
--   ranked_snapshots   24 MB     209,147 rows
--   guilds             12 MB      18,575 rows
--   live_ranked       6.4 MB       1,152 rows
--
-- fetch_log is page-view telemetry, and the raw User-Agent string was 79% of
-- every row (~125 of ~160 bytes) at ~15,110 rows/day with no retention. The
-- code side of the fix stores a ~10-byte client label instead and trims to a
-- 14-day window, which lands the table around 25 MB and holds it there.
--
-- This file clears the existing backlog. `players` is deliberately left alone:
-- once fetch_log is dealt with the total is ~278 MB, so there's no reason to
-- go anywhere near the data the profile pages and Valhallan aggregations read.
--
-- ORDER OF OPERATIONS — the column has to exist first:
--   1. npm run db:push          (adds fetch_log.client)
--   2. deploy                   (writers start using it)
--   3. this file, in the Supabase SQL editor
--
-- Run it in the dashboard SQL editor, not through DATABASE_URL: Supavisor's
-- transaction pooler caps statements at 2 minutes and VACUUM FULL on a 362 MB
-- table will exceed that.

-- 1. Drop everything outside the retention window ------------------------
-- `id` is a serial and `created_at` defaults to now(), so the two are
-- monotonic together and this runs off the primary key. Do NOT rewrite it as
-- `WHERE id IN (SELECT ... LIMIT n)` — Postgres hashes the subquery and
-- sequentially scans the whole table per batch (a 50k batch was observed still
-- running after 24 minutes).
DO $$
DECLARE
  boundary bigint;
  lo       bigint;
  hi       bigint;
  removed  bigint := 0;
BEGIN
  SELECT id INTO boundary
  FROM fetch_log
  WHERE created_at < now() - interval '14 days'
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

-- 2. Actually return the space to the OS ----------------------------------
-- This is the step that moves Supabase's "Database Size" number. A plain
-- VACUUM only marks the pages reusable by future inserts — the file on disk
-- stays exactly as large, so the quota would not budge.
--
-- VACUUM FULL rewrites the table. It takes an ACCESS EXCLUSIVE lock for the
-- duration (a minute or two here) and needs roughly the finished table's size
-- free while it runs. Writes to fetch_log block during it; they're deferred
-- telemetry wrapped in try/catch, so the worst case is a few dropped log rows.
VACUUM FULL fetch_log;
ANALYZE fetch_log;

-- 3. Confirm ---------------------------------------------------------------
SELECT
  pg_size_pretty(pg_total_relation_size('fetch_log')) AS fetch_log,
  pg_size_pretty(pg_database_size(current_database())) AS database_total;

-- Faster alternative to steps 1-2, if you don't care about keeping the last
-- 14 days: TRUNCATE reclaims everything instantly with no rewrite and no
-- temporary disk requirement. The log's value is forward-looking (confirming
-- the crawler changes are working), so this is a perfectly reasonable choice.
--
--   TRUNCATE fetch_log;
