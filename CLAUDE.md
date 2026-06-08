# Brawlchemist

Brawlhalla stats platform (dpm.lol / op.gg style). Next.js 16 App Router, React 19, Tailwind v4, Drizzle + postgres-js on Supabase (free tier), deployed on Vercel.

## Commands

- Dev: `npx next dev --turbopack -p 3137` (background) — poll with Invoke-WebRequest until 200
- Typecheck: `npx tsc --noEmit` (run before every commit)
- Schema: `npm run db:push` (drizzle-kit push straight to prod Supabase — NO migration files; run deliberately), `npm run db:studio`
- PowerShell 5.1 quirk: commit messages / PR bodies containing `"` get mangled as inline args — ALWAYS `git commit -F <file>` and `gh pr create --body-file <file>`
- `gh pr create` sometimes claims the branch isn't pushed — retry with explicit `--head <branch>`

## Cardinal constraints (override convenience every time)

1. **Brawlhalla API: 180 req/15min, fully budgeted.** New features must NOT add API calls. Piggyback existing fetch paths; read from our own DB/caches. `upsertPlayerRanked()` (lib/sync/players.ts) is the single chokepoint where every fresh `/ranked` payload lands (profile views + crons) — snapshot-style features hook there.
2. **Supabase free tier: egress matters.** Never `SELECT *` on tables with jsonb. Select narrow columns; `getPlayersByIds(ids, { includeRankedJson: false })` for anything that doesn't read legends.
3. **Everything fails open.** Enrichment lookups (profiles map, players cache, CM, esports) degrade to plain rendering — never take down a page.

## Data architecture

- `players` — PK brawlhalla_id; `ranked_json` (full GetPlayerRanked, drift-safe jsonb), `top_legend_id` (pre-computed main), ladder snapshot scalars, guild fields, `last_synced`
- `profiles` — admin-curated verified pros (handle, favorite skin); `getProfilesMap()` cached 300s, tag "profiles"
- `live_ranked` — top-500 per queue, diffed every 5 min; session anchors give eloDiff/rankDiff at read time; powers /live + daily movers
- `ranked_snapshots` — rating history; written by `maybeInsertSnapshot` inside `upsertPlayerRanked` (deduped on unchanged rating+games); 180d prune in sync-valhallan cron; chart on profile Overview
- Crons (vercel.ts; pause toggles in cron_controls via /admin): sync-leaderboard */5, sync-live */5, sync-valhallan daily 6AM
- Profile page = DB-first read-through (15-min fresh) with 429 fallback to stale cache; upsert only on `source === "api"`

## External APIs

### Brawlhalla dev API (lib/brawlhalla-api.ts) — key: BRAWLHALLA_API_KEY
- Regions: `["ALL","BRZ","US-E","US-W","EU","SEA","AUS","JPS","SA","ME"]`; main three ladders US-E/EU/BRZ
- Modes: 1v1, 2v2, solo_2v2, 3v3 (3v3 is SOLO queue — single-player rows; ladder tops out Diamond, no Valhallans)
- **API never returns "Valhallan"** — Diamond starts at 2000; Valhallan = regional top-N derived via `getValhallanCutoff` + `isValhallan(rating, cutoff, wins)` (lib/tier.ts). `TIER_FLOOR` has the static tier bands.
- Tier strings carry division suffixes ("Gold 3") — strip via `toTier`

### brawltools esports API (lib/brawltools-api.ts) — keyless, "personal use only"
- `gameMode` is an INTEGER (1|2), unlike the dev API's strings
- `/v2/pr`: regions strictly NA/EU/SA/SEA/MENA, NO "ALL" (400); `playerId` is the ESPORTS id
- **`GET /v2/player/{playerId}` is the reverse bridge** esports id → `brawlhallaId` (nullable!); `/v2/player/bhId/{id}` goes the other way (404 = not a tracked competitor)
- `/v2/event`: `isOfficial=false` means INCLUDE community (returns everything) — there is NO community-only param, filter client-side; `nextToken` = startTime cursor; a year-mode is ~30–100 events (drain ≤4 pages)
- No per-tournament placements/details endpoint (placements are per-player only)

### Challengermode GraphQL (lib/challengermode-api.ts) — key: CHALLENGERMODE_REFRESH_KEY
- Auth: POST `/mk1/v1/auth/access_keys` {refreshKey} → ~1h bearer; single-flight memoized
- Endpoint `https://publicapi.challengermode.com/graphql`; scalar is `UUID!` (not `Uuid!`)
- **brawltools event id == CM tournamentId for host "CM" events** (SGG-era ≤2021 history is not on CM)
- `tournament(tournamentId:){ links { overviewUrl banner(size: MEDIUM){url} thumbnail(size: MEDIUM){url} } attendance { confirmedLineupCount } state }` — image fields REQUIRE the size arg
- POST isn't cached by Next fetch cache → wrap in `unstable_cache`; key must also be in Vercel project env

## Design system

- Dark glass: cards `rounded-2xl border border-border/60 bg-card/50-60 backdrop-blur-sm`, rows `bg-card/40`
- Type: `font-display` headings; data is `font-mono tabular-nums`; micro-labels `font-mono text-[10px] uppercase tracking-wider text-muted-foreground`
- Tier colors: `text-tier-*` tokens + `TIER_TEXT_COLOR` map (components/site/primitives.tsx); positive/negative tokens for deltas
- Filter tabs: Links (server-rendered searchParams state) in `rounded-md border bg-muted/40 p-1`, active `bg-card text-foreground shadow-[0_0_0_1px_oklch(1_0_0_/_0.06)]` — see /tournaments, /power-rankings
- Provenance chips ("Via Brawltools", "Updated <date>") ride the right end of filter rows, not heroes
- Hover affordances: slide-in glass panel (`-translate-x-full` → `group-hover/row:translate-x-0`, gradient + backdrop-blur, `motion-reduce:transition-none`) on home cards; pink Valhallan glow (`hover:border-tier-valhallan/60`) on podium/live cards; art bleeding from card right edge uses absolute Image + `maskImage: linear-gradient(to left, ...)`
- Shared components: `DataTable`/`ColDef`, `PlayerLink` (falls back to plain text on null id, prefetch={false}), `LegendChip`, `RankIcon`, `RegionPill`, `Delta`, `PageHero` (inner pages; homepage is its own launcher layout)
- Page-enter animation lives in `app/template.tsx` (remounts per route, not per query change) — tab/filter links use `scroll={false}` where viewport should hold
- Pros: verified handle + BadgeCheck replaces in-game name (table rows hover-swap to IGN; podium/home/live do NOT swap); blue "Pro Player" tag

## Workflow

- Feature branch → PR → `gh pr merge --squash --delete-branch` (auto-syncs local main). Direct push to main ONLY when Enrico explicitly says so
- Verify before shipping: tsc + dev server + headless Chrome screenshot (kill chrome first, fresh `--user-data-dir`, retry once on failure); count DOM matches carefully — the RSC payload doubles naive regex counts
- Enrico treats Claude as a senior product designer: lead with design rationale, ship polished details (tooltips, empty states, reduced-motion)
