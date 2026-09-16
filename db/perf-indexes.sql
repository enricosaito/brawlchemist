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

-- 5. Best players on a given main ------------------------------------------
-- Serves Suggested Favorites on /favorites: "highest rated players who main
-- the same legend as you". Without it that is a sequential scan of the whole
-- players table (measured: 25k buffers, 3.3s) for three rows, which is
-- cardinal constraint #6 on a render path. players_rating_idx cannot help --
-- filtering on top_legend_id while ordering by rating walks the entire rating
-- index for a rare main.
CREATE INDEX IF NOT EXISTS players_top_legend_rating_idx
  ON players (top_legend_id, rating DESC NULLS LAST);

ANALYZE players;
ANALYZE guilds;
ANALYZE fetch_log;

-- 5. One-time fetch_log reclaim -------------------------------------------
-- Moved to db/reclaim-space.sql, which has to run AFTER `npm run db:push`
-- adds the fetch_log.client column.
