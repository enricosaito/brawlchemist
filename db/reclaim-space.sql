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
-- WHERE TO RUN IT — this matters, and step 2 below cannot go in the dashboard:
--
--   Step 1 (the DELETE) runs fine in the Supabase SQL editor.
--
--   Step 2 (VACUUM FULL) does NOT. The SQL editor wraps whatever you submit in
--   an explicit transaction, and VACUUM refuses to run inside one:
--     ERROR: 25001: VACUUM cannot run inside a transaction block
--   It also can't go through the :6543 transaction pooler, which caps
--   statements at 2 minutes. It needs a plain session connection — psql, or
--   the :5432 session pooler — where it is its own implicit transaction and
--   statement_timeout can be lifted with SET.
--
-- Recorded outcome of running exactly this, 2026-09-11:
--   before: fetch_log 396 MB, database 657 MB
--   deleted 1,148,138 rows, kept 451,269
--   VACUUM FULL: 18 seconds
--   after:  fetch_log 107 MB, database 368 MB
--
-- 107 MB is the floor for rows that still carry a raw User-Agent. As the
-- 14-day window turns over onto compact client labels it settles far lower,
-- and the sync-valhallan cron holds it there.

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
-- RUN THIS FROM psql OR THE :5432 SESSION POOLER, NOT THE DASHBOARD EDITOR.
-- See the note at the top: the editor's transaction wrapper makes it fail with
-- "VACUUM cannot run inside a transaction block".
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

-- Alternative that DOES work in the dashboard SQL editor, if you don't care
-- about keeping the last 14 days: TRUNCATE is transaction-safe, needs no
-- rewrite and no temporary disk, and reclaims everything instantly by swapping
-- in a fresh empty file. The log's value is forward-looking (confirming the
-- crawler changes are working), so this is a perfectly reasonable choice.
--
--   TRUNCATE fetch_log;

-- ===========================================================================
-- 2026-09-15 — drop the dead user_agent column
-- ===========================================================================
-- `client` replaced the raw User-Agent on 2026-09-11 and nothing has written
-- user_agent since. But 311,658 of 368,364 rows still carried one, averaging
-- 124 bytes — ~47 MB of a 110 MB table, on a database sitting at 455 MB of a
-- 500 MB quota.
--
-- Those rows would have aged out of the 14-day window around 2026-09-24 on
-- their own. Waiting wouldn't have reclaimed the space though: DELETE only
-- marks tuples dead, and a dropped column is only truly gone once the table is
-- rewritten. So: drop, then rewrite.
--
-- Run on the SESSION pooler (:5432 / DATABASE_URL_UNPOOLED) or the dashboard
-- SQL editor. The transaction pooler caps statements at 2 minutes.

-- DROP COLUMN is instant — it only flips attisdropped; the bytes stay in the
-- heap until the rewrite below.
ALTER TABLE fetch_log DROP COLUMN IF EXISTS user_agent;

-- The rewrite is what actually frees the ~47 MB. ACCESS EXCLUSIVE for the
-- duration; fetch_log writes are deferred telemetry in a try/catch, so the
-- worst case is a few dropped log rows.
VACUUM FULL fetch_log;
ANALYZE fetch_log;

SELECT
  pg_size_pretty(pg_total_relation_size('fetch_log')) AS fetch_log,
  pg_size_pretty(pg_database_size(current_database())) AS database_total;

-- ===========================================================================
-- 2026-09-15 — bio/legends/links become verified-pro only
-- ===========================================================================
-- Those three fields put free text and outbound links on a public page, so
-- they now stay with the accounts we've actually vetted. The gate is enforced
-- on read and on write, so nothing here is required for correctness — stored
-- rows simply stop rendering. This clears the bios anyway: free text we will
-- never display again is not worth keeping.
--
-- Favourite legends and social links are deliberately left in place. They're
-- constrained values (roster ids, https URLs against an allow-list) rather
-- than free text, so they carry no moderation risk while hidden, and they come
-- straight back if a player is later verified.

UPDATE user_customizations c
   SET bio = NULL, updated_at = now()
  FROM (SELECT brawlhalla_id FROM profiles
         WHERE coalesce(pro_tier, case when is_pro then 'pro' else 'none' end)
               <> 'none') p
 WHERE c.bio IS NOT NULL
   AND c.brawlhalla_id <> p.brawlhalla_id;
