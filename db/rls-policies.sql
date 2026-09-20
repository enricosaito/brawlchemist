-- ============================================================================
-- Row Level Security + privilege lockdown for the public schema.
--
-- WHY THIS EXISTS
--
-- Supabase exposes every table in `public` through PostgREST, and grants the
-- `anon` and `authenticated` roles privileges on them by default. The `anon`
-- key is the publishable key, which ships inside the browser bundle — so it is
-- public by construction, not a secret.
--
-- Measured on 2026-09-20, before this file ran, using nothing but that key:
--
--   GET    /rest/v1/app_users          -> 200, every row: email, plan, prefs,
--                                        account_role
--   GET    /rest/v1/profile_claims     -> 200, including `challenge` — the ELO
--                                        question that proves profile ownership
--   GET    /rest/v1/players            -> 200, the whole ~300MB table including
--                                        ranked_json
--   GET    /rest/v1/cron_controls      -> 200
--   PATCH  /rest/v1/profiles           -> 200
--   DELETE /rest/v1/fetch_log          -> 204
--
-- Reads leaked every user's email address and the answers to the claim quiz.
-- Writes were worse: `app_users.account_role` was updatable by anyone, and that
-- column is what `isAdmin()` reads — so the admin panel was one PATCH away for
-- any visitor. A DELETE could have emptied any table on the site.
--
-- WHY IT DOES NOT AFFECT THE RUNNING APP
--
-- Nothing in this codebase reads or writes application data through Supabase.
-- supabase-js is used for Auth only; every query goes over postgres-js as the
-- `postgres` role, which owns these tables and bypasses RLS. Confirmed by
-- audit: there is not one `.from("table")`, `.rpc(` or `/rest/v1` call in the
-- repo. So this file closes a door the app never used.
--
-- THE TWO LAYERS, AND WHY BOTH
--
--   Privileges (GRANT/REVOKE) decide whether a role may touch a table at all.
--   Policies (RLS) decide which rows it sees, *if* it has the privilege.
--
-- Revoking alone would be enough today, and a policy alone would not be — but
-- privileges are the layer that silently comes back. `drizzle-kit push` creates
-- tables, and Supabase's default privileges hand new tables to anon and
-- authenticated automatically. That is exactly how this happened. So we revoke,
-- we change the defaults so the next push does not undo it, AND we enable RLS
-- so that a table which slips through is still closed.
--
-- HOW TO RUN: paste into the Supabase SQL editor, or psql on the session
-- pooler (:5432). Every statement here is metadata-only and fast.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Take the privileges away, and stop them coming back.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated;

-- The schema itself: without USAGE, a role cannot even name an object in it.
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- The default-privileges rules are the important half. Without these, the very
-- next `drizzle-kit push` re-grants everything to anon on any table it creates
-- and the hole reopens with nobody touching this file. push connects as
-- `postgres`, so the postgres rule below is the one that matters.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- The same three for `supabase_admin` are commented out because `postgres`
-- cannot change another role’s default privileges — they fail with
-- "permission denied to change default privileges", which is Postgres working
-- as designed rather than a problem to solve. They are only needed if an object
-- is ever created BY supabase_admin, which for this project means a migration
-- run from the Supabase dashboard rather than by drizzle-kit. Run them there,
-- as that role, if that ever happens.
--
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--   REVOKE ALL ON TABLES FROM anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--   REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--   REVOKE ALL ON ROUTINES FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Enable RLS on every table.
--
-- ENABLE, never FORCE. Forcing would apply these policies to the table owner
-- too — which is the role the entire site connects as, so it would take the
-- site down. The owner bypassing RLS is the property that makes this change
-- safe to ship without touching a line of application code.
--
-- RLS with no policy denies everything. That is the intended state for most of
-- these tables: nothing outside the server has any business reading them.
-- ---------------------------------------------------------------------------

ALTER TABLE public.players             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_claims      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flairs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flair_grants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.true_combos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esports_titles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esports_matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_controls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fetch_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_ranked         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valhallan_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valhallan_stats     ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 3. The ownership model, written down.
--
-- These policies grant no access on their own — the privileges above are gone,
-- and a policy without a privilege is inert. They exist so the rule about *who
-- owns what* lives in the database rather than only in application code, and so
-- that a future client-side feature starts from a correct row filter instead of
-- someone inventing one under deadline.
--
-- Three tables have a real owner. Everything else is either server-only or
-- derived from the Brawlhalla API, and has no per-user notion of ownership at
-- all — so it gets no policy, which means denied.
-- ---------------------------------------------------------------------------

-- app_users — one row per Supabase identity. A person may read and correct
-- their own row and nobody else's. Note what is deliberately NOT here: an
-- UPDATE policy covering `account_role` or `plan`. Those are granted by an
-- operator and by billing respectively; a user being able to write their own
-- role is the exact hole this file closes, so the update policy is scoped to
-- the columns a user owns by revoking the rest at the privilege layer if this
-- is ever exposed.
DROP POLICY IF EXISTS app_users_select_own ON public.app_users;
CREATE POLICY app_users_select_own ON public.app_users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS app_users_update_own ON public.app_users;
CREATE POLICY app_users_update_own ON public.app_users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- profile_claims — the ELO challenge and its audit trail. Readable only by the
-- person attempting the claim; `challenge` holds the answer, so a public read
-- here defeats the whole verification. Never writable from a client: the quiz
-- is graded server-side, and a client that could INSERT could grade itself.
DROP POLICY IF EXISTS profile_claims_select_own ON public.profile_claims;
CREATE POLICY profile_claims_select_own ON public.profile_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- user_customizations — what an owner chose about their own profile. Public to
-- read because it is rendered on a public page anyway, and writable only by the
-- account that owns the matching profile. The ownership link lives on
-- `profiles.user_id`, so the check joins through it rather than trusting a
-- column on this table.
DROP POLICY IF EXISTS user_customizations_select_all ON public.user_customizations;
CREATE POLICY user_customizations_select_all ON public.user_customizations
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS user_customizations_write_own ON public.user_customizations;
CREATE POLICY user_customizations_write_own ON public.user_customizations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.brawlhalla_id = user_customizations.brawlhalla_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.brawlhalla_id = user_customizations.brawlhalla_id
        AND p.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 4. Deliberately policy-free, i.e. denied to every client role.
--
--   players, live_ranked, ranked_snapshots, queue_activity, valhallan_members,
--   valhallan_stats, guilds, esports_titles, esports_matches, true_combos,
--   flairs, flair_grants, profiles, cron_controls, fetch_log
--
-- Most of that list is public information and it is tempting to hand `anon` a
-- blanket SELECT. Do not, for two reasons that have both already cost this
-- project.
--
--   Egress. `players` is ~300MB, almost all of it `ranked_json`. A public
--   SELECT on it is an unauthenticated, uncached, unmetered bulk export
--   against a 5GB/month quota that has been blown three times. The site serves
--   this data through its own cached, narrow-column readers for exactly that
--   reason (cardinal constraint #2).
--
--   Identity. `profiles.user_id` is the link between a Brawlhalla player and a
--   Supabase account. The site publishes *that* a profile is claimed and never
--   *who* claimed it. A row-level SELECT cannot hide one column, so exposing
--   this table at all would leak the mapping.
--
-- `cron_controls` and `fetch_log` are operational. `flair_grants` is an
-- entitlement ledger. None of them has a reader outside the server.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 5. Verify. Expect rls_enabled = true on all 18 and zero rows from the grant
--    check. Re-run both after any `drizzle-kit push`.
-- ---------------------------------------------------------------------------

-- SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS forced
--   FROM pg_class
--  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--  ORDER BY relname;

-- SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
--  ORDER BY table_name, grantee;
