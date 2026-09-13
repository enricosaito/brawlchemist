import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * players — one row per Brawlhalla player we've ever enriched.
 *
 * Data here comes from `/player/{id}/ranked` (current ranked-season stats).
 * `ranked_json` keeps the full payload as jsonb because the API occasionally
 * renames fields and we'd rather keep older snapshots parseable than blow up
 * on schema drift. `top_legend_id` is the player's most-played legend in this
 * ranked season — pre-computed so the leaderboard join stays cheap.
 *
 * Lifetime stats (from /player/{id}/stats) will land in a sibling column /
 * table once player profile pages need them.
 */
export const players = pgTable("players", {
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  username: text("username").notNull(),
  /** Single legend with the most games played in the current ranked season. */
  topLegendId: integer("top_legend_id"),
  rankedJson: jsonb("ranked_json"),
  /** Lightweight ladder snapshot from the search-index harvest (leaderboard
   * walk): the player's 1v1 rating and region. Kept separate from rankedJson
   * so name-only rows are searchable with rating/region shown, without a full
   * /player/{id}/ranked fetch and without affecting the Valhallan aggregation
   * (which keys off ranked_json). Both null until harvested. */
  /**
   * Season 1v1 rating, lifted out of ranked_json by upsertPlayerRanked.
   *
   * Exists so ordering never has to touch the blob: sorting on a ranked_json
   * expression detoasts the whole ~200MB column and measured 95s on the
   * username search. ladder_rating was meant to serve this role, but only the
   * search-index harvest writes it and nothing calls that harvest — it was
   * null for all 91,088 rows, which left search results in physical order.
   */
  rating: integer("rating"),
  ladderRating: integer("ladder_rating"),
  ladderRegion: text("ladder_region"),
  /** The player's guild, discovered via GetPlayerGuild. `guildId` is null when
   * they have no guild; `guildCheckedAt` records the last lookup so the guild
   * discovery cron can skip recently-checked players. */
  guildId: integer("guild_id"),
  guildName: text("guild_name"),
  guildCheckedAt: timestamp("guild_checked_at", { withTimezone: true }),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
},
  (t) => [
    // DECLARED HERE ON PURPOSE. These are performance indexes, not schema
    // decoration, and drizzle-kit push reconciles the database down to this
    // file — anything it cannot see here, it DROPS. Created out-of-band once
    // and silently removed by the next push, which took the username search
    // from ~400ms back to the 95s it used to be.
    //
    // Trigram GIN: /api/search/players and /search match usernames with
    // ILIKE %q% across ~90k rows, which no btree can serve. Requires the
    // pg_trgm extension (see db/perf-indexes.sql).
    index("players_username_trgm_idx").using(
      "gin",
      sql`${t.username} gin_trgm_ops`,
    ),
    // Both search paths order by this scalar rather than a ranked_json
    // expression — see the note in lib/sync/players.ts.
    index("players_ladder_rating_idx").on(t.ladderRating.desc().nullsLast()),
    // Search orders by this; see the column comment.
    index("players_rating_idx").on(t.rating.desc().nullsLast()),
  ],
)

export type PlayerRow = typeof players.$inferSelect
export type PlayerInsert = typeof players.$inferInsert

/**
 * profiles — per-player presentation data keyed by brawlhalla id: verified-pro
 * status (+ display handle), favorite skin, and esports accolades. Today these
 * are admin-curated (no API source) through the /admin page; `userId` reserves
 * the link to a future auth owner so a player can eventually claim their own
 * profile. Read everywhere a `PlayerPreview` is consumed.
 */
export const profiles = pgTable("profiles", {
  /** The Brawlhalla player this profile describes. Natural identity, and every
   * consumer joins on it, so it stays the primary key. */
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  /** Verified pro — shows the PRO badge. */
  isPro: boolean("is_pro").notNull().default(false),
  /** Optional handle shown next to the PRO badge (e.g. "Kyna"). */
  handle: text("handle"),
  /** Favorite skin shape: { src, name } | null. */
  favoriteSkin: jsonb("favorite_skin"),
  /** Championship titles as a string[] (jsonb), e.g. ["2v2 World Champion '24"]. */
  achievements: jsonb("achievements"),
  /** Auth owner — the Supabase `auth.users` id of whoever claimed this player
   * via the ELO challenge (or an admin/CM assignment). Null = unclaimed (the
   * original admin-curated state). Unique so one auth user owns at most one
   * profile. No FK (auth.users lives in a different schema and we connect with a
   * service role); the link is enforced in app code. */
  userId: uuid("user_id").unique(),
  /** When this player was first claimed by `userId` (null = unclaimed). */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  /** How ownership was established: 'quiz' (ELO challenge) | 'cm' | 'admin'. */
  claimMethod: text("claim_method"),
  /** When ownership reached verified trust (today: same instant as claimedAt for
   * the quiz path; reserved so a stronger tier can diverge later). */
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type ProfileRow = typeof profiles.$inferSelect
export type ProfileInsert = typeof profiles.$inferInsert

/**
 * profile_claims — the "prove it's you" verification ledger for player claims.
 *
 * A logged-in user proves ownership of a Brawlhalla ID by answering the exact
 * season ranked rating of one of their *mid-to-least-played* legends — a value
 * that lives in our stored `players.ranked_json` but is never rendered on the
 * public page, so it's known to the account owner but not to onlookers. The
 * challenge is generated and graded entirely from our own DB, so claims add
 * ZERO Brawlhalla API calls.
 *
 * One row per (userId, brawlhallaId): `challenge` holds the server-only answer,
 * `attempts` counts wrong tries inside a rolling 24h window (createdAt = window
 * start), and a partial-unique index guarantees a single verified owner per
 * player. Ownership itself lives on `profiles.userId`; this table is the
 * in-flight state + audit trail.
 */
export const profileClaims = pgTable(
  "profile_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Claimant — a Supabase `auth.users` id. */
    userId: uuid("user_id").notNull(),
    brawlhallaId: integer("brawlhalla_id").notNull(),
    /** 'pending' | 'verified' | 'revoked'. */
    status: text("status").notNull().default("pending"),
    /** 'quiz' | 'cm' | 'admin'. */
    method: text("method").notNull().default("quiz"),
    /** SERVER-ONLY — never sent to the client: { legendId, legendName,
     * correctRating }. Only the legend name leaves the server (the question). */
    challenge: jsonb("challenge"),
    /** Wrong answers inside the current 24h window. */
    attempts: integer("attempts").notNull().default(0),
    /** When the current challenge stops accepting answers (regenerate to renew). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("profile_claims_user_player_idx").on(t.userId, t.brawlhallaId),
    index("profile_claims_player_status_idx").on(t.brawlhallaId, t.status),
    uniqueIndex("profile_claims_one_verified_idx")
      .on(t.brawlhallaId)
      .where(sql`${t.status} = 'verified'`),
  ],
)

export type ProfileClaimRow = typeof profileClaims.$inferSelect
export type ProfileClaimInsert = typeof profileClaims.$inferInsert

/**
 * app_users — our application row mirroring a Supabase `auth.users` identity,
 * created on first sign-in. Holds per-account preferences (favorite legends,
 * default region/mode, UI settings) and the plan flag for future premium gating.
 * Exists independently of any profile claim — a signed-in user may never claim a
 * player and still have prefs here. `id` equals the auth user id (no FK: auth
 * lives in another schema and we connect with a service role).
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey(),
  /** Mirror of the auth email, for admin lookups (auth.users isn't joinable here). */
  email: text("email"),
  /** 'free' | 'premium' — entitlement gate for future paid features. */
  plan: text("plan").notNull().default("free"),
  /** Viewer prefs: { favoriteLegendIds, defaultRegion, defaultMode, ... }. */
  prefs: jsonb("prefs"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type AppUserRow = typeof appUsers.$inferSelect
export type AppUserInsert = typeof appUsers.$inferInsert

/**
 * user_customizations — the public-facing customization a verified owner sets on
 * their claimed profile, keyed 1:1 by brawlhalla id. Kept separate from
 * `profiles` so admin pro-curation (isPro, achievements, favoriteSkin) and
 * user-set fields never overwrite each other. Ownership is enforced in app code
 * via `profiles.userId` — only the owner can write this row. Read fails open on
 * the public profile (no customization → plain rendering).
 */
export const userCustomizations = pgTable("user_customizations", {
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  /** Short freeform bio (length-capped; rendered as plain text). */
  bio: text("bio"),
  /** Allow-listed social links: [{ kind, url }] (https only). */
  socialLinks: jsonb("social_links"),
  /** Up to a few legend ids the owner wants to highlight. */
  favoriteLegendIds: jsonb("favorite_legend_ids"),
  /** Chosen header banner preset id (see lib/profile/banners.ts). Null = the
   * default copper→mystic wash. Validated against the preset allow-list on
   * read/write — an unknown id falls back to the default, never a broken
   * surface. */
  bannerId: text("banner_id"),
  /** Chosen flair id (see lib/profile/flair.ts), or the literal "none" to fly
   * nothing. Null means never chosen, which renders the best flair the player
   * has earned — a selection is a preference, not the entitlement, and the
   * entitlement is always derived. Unknown ids fall back the same way. */
  flairId: text("flair_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type UserCustomizationRow = typeof userCustomizations.$inferSelect
export type UserCustomizationInsert = typeof userCustomizations.$inferInsert

/**
 * guilds — one row per guild we've discovered (via the player pool / profile
 * views). The Brawlhalla API has no "list guilds" endpoint, so this table *is*
 * our guild leaderboard: rows are ordered by the API's official `rank`.
 *
 * `stats_json` keeps the full GetGuildStats payload as jsonb (drift-safe, like
 * players.ranked_json). We don't store member rosters — the detail page reads
 * live stats only. xp values use bigint — a large guild's lifetime XP can
 * exceed the int4 ceiling.
 */
export const guilds = pgTable("guilds", {
  guildId: integer("guild_id").primaryKey(),
  name: text("name").notNull(),
  /** Official global guild rank (lower is better). Null when unranked. */
  rank: integer("rank"),
  xp: bigint("xp", { mode: "number" }),
  legacyXp: bigint("legacy_xp", { mode: "number" }),
  /** Weekly guild points (resets weekly). */
  guildPoints: bigint("guild_points", { mode: "number" }),
  memberCount: integer("member_count"),
  /** Guild creation date — UNIX seconds. */
  createDate: integer("create_date"),
  /** Tags as a string[] (jsonb). */
  tags: jsonb("tags"),
  isRecruiting: boolean("is_recruiting"),
  notice: text("notice"),
  discordInviteCode: text("discord_invite_code"),
  /** Full GetGuildStats payload. */
  statsJson: jsonb("stats_json"),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
},
  // Matches getGuildLeaderboard ORDER BY exactly. Without it /guilds sorted
  // 18.5k rows unaided and once failed the production build outright.
  (t) => [index("guilds_rank_xp_idx").on(t.rank.asc().nullsLast(), t.xp.desc())],
)

export type GuildRow = typeof guilds.$inferSelect
export type GuildInsert = typeof guilds.$inferInsert

/**
 * Guild leaderboard list shape: every column except the heavy `stats_json`
 * blob, which the list view never renders (the guild detail page loads it
 * separately via getGuildById). Keeping it out of the leaderboard read
 * collapses the per-row payload — that query runs for up to 200 guilds and
 * re-runs on every cache refresh, so the blob was a large chunk of our egress.
 */
export type GuildListRow = Omit<GuildRow, "statsJson">


/**
 * cron_controls — admin pause switches for the scheduled sync jobs. Each cron
 * route checks its key here before doing any API work, so a single toggle in
 * /admin can stop a job that's eating the Brawlhalla API rate limit (which is
 * shared with on-demand profile fetches). A missing row means "not paused", so
 * the table only holds keys that have ever been toggled.
 */
export const cronControls = pgTable("cron_controls", {
  /** Matches the route segment under app/api/cron/<key>. */
  key: text("key").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type CronControlRow = typeof cronControls.$inferSelect

/**
 * fetch_log — diagnostic record of every /ranked call our profile surface
 * considers (page render, OG image, admin save). Captures the request's
 * user-agent and referer so /admin can see who is hitting which profiles and
 * why rows appear in the pool. Pruned manually via the "Clear log" button.
 */
export const fetchLog = pgTable("fetch_log", {
  id: serial("id").primaryKey(),
  brawlhallaId: integer("brawlhalla_id").notNull(),
  /** Where the fetch happened: "page-view" | "og-image" | "admin-save". */
  source: text("source").notNull(),
  /** Outcome: "cached" (read-through hit, no API), "synced" (API ok, upserted),
   *  "failed" (API errored — `apiStatus` carries the HTTP status). */
  result: text("result").notNull(),
  apiStatus: integer("api_status"),
  /**
   * Short client label from clientLabel() — "bingbot", "googlebot", "human", …
   *
   * Replaces storing the raw User-Agent. At ~125 bytes the UA string was 79%
   * of every row and drove this table to 362 MB (59% of the 500 MB quota) for
   * data only ever read as "which crawler is this". `userAgent` is kept
   * nullable so existing rows stay readable, but nothing writes it any more —
   * it can be dropped once the retention window has rolled over.
   */
  client: text("client"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
},
  // Serves the rolling retention prune in the sync-valhallan cron.
  (t) => [index("fetch_log_created_at_idx").on(t.createdAt.desc())],
)

export type FetchLogRow = typeof fetchLog.$inferSelect

/**
 * live_ranked — rolling snapshot of the top ~500 ladder entries per queue, used
 * to power the /live "ranked queue" page. One row per leaderboard entry (a
 * player in 1v1, a team in 2v2), keyed by `queue:entityKey`.
 *
 * The Brawlhalla API has no "who's playing right now" endpoint, so we derive it:
 * a cron polls the ALL ladder every few minutes and diffs each entry against its
 * stored snapshot. A rising `games` count means the entry played since the last
 * poll → we stamp `last_active_at`. `session_start_*` capture the rating/rank at
 * the moment an active streak began (reset after a gap), so the page can show
 * the ELO/rank gained this session (eloDiff/rankDiff are computed at read time).
 */
export const liveRanked = pgTable(
  "live_ranked",
  {
    /** `${queue}:${sortedPlayerIds}` — natural identity across polls. */
    id: text("id").primaryKey(),
    /** "1v1" | "2v2". */
    queue: text("queue").notNull(),
    /** Entry region from the ALL ladder (e.g. "us-e"); null if the API omits it. */
    region: text("region"),
    rank: integer("rank").notNull(),
    rating: integer("rating").notNull(),
    /** wins + losses; null when the API returned them null. Activity signal. */
    games: integer("games"),
    /** Entry members: [{ id, name }] — 1 for 1v1, 2 for 2v2. */
    players: jsonb("players").notNull(),
    /** Rating/rank when the current active streak began. */
    sessionStartRating: integer("session_start_rating").notNull(),
    sessionStartRank: integer("session_start_rank").notNull(),
    /** Last poll at which this entry's game count rose. Null = never seen active. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("live_ranked_queue_active_idx").on(t.queue, t.lastActiveAt)],
)

export type LiveRankedRow = typeof liveRanked.$inferSelect
export type LiveRankedInsert = typeof liveRanked.$inferInsert

/**
 * ranked_snapshots — a player's 1v1 rating over time, powering the profile's
 * rating-history chart. Rows are piggybacked onto upsertPlayerRanked (the
 * single point where every fresh /ranked payload lands: profile views,
 * sync-leaderboard, sync-valhallan), so history accrues at ZERO extra API
 * cost. Writes dedupe on unchanged (rating, games) — storage stays
 * proportional to actual matches played, not to traffic.
 *
 * The composite PK doubles as the read index (`WHERE brawlhalla_id ORDER BY
 * taken_at`). No tier column (derivable from rating + cutoffs at read time)
 * and no peak column (max of the series). Pruned to 180 days by the daily
 * sync-valhallan cron.
 */
/**
 * queue_activity — hourly rollup of how busy the ranked queue is.
 *
 * Answers "when do people actually play". Costs ZERO Brawlhalla API calls:
 * syncLiveQueue already diffs each entry's game count every five minutes to
 * decide who's active, so the number was being computed and thrown away. This
 * table just keeps it (cardinal constraint #1 — piggyback the existing path).
 *
 * One row per (queue, region, hour). `samples` is the number of polls that
 * contributed, and it's incremented for every region the poll SAW, not just
 * ones with activity — otherwise a dead hour would look like a missing hour
 * rather than a quiet one, and the average would be wrong.
 *
 * ~432 rows/day at current region coverage, pruned to 180 days by the daily
 * cron: single-digit MB, forever.
 *
 * Caveat worth remembering when reading it: this measures the players we
 * TRACK (the top-N ladder the live cron polls), not the whole playerbase.
 */
export const queueActivity = pgTable(
  "queue_activity",
  {
    /** "1v1" | "2v2". */
    queue: text("queue").notNull(),
    /** Ladder region the entries belong to, uppercased. */
    region: text("region").notNull(),
    /** Hour-truncated, stored UTC. */
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    /** Polls that reported on this (queue, region) during the hour. */
    samples: integer("samples").notNull().default(0),
    /** Entries observed finishing a match, summed across those polls. */
    active: integer("active").notNull().default(0),
    /** Matches played (sum of game-count deltas) across those polls. */
    matches: integer("matches").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.queue, t.region, t.bucket] })],
)

export type QueueActivityRow = typeof queueActivity.$inferSelect

export const rankedSnapshots = pgTable(
  "ranked_snapshots",
  {
    brawlhallaId: integer("brawlhalla_id").notNull(),
    rating: integer("rating").notNull(),
    /** wins + losses at snapshot time — dedupe key + "played since" signal. */
    games: integer("games").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.brawlhallaId, t.takenAt] })],
)

export type RankedSnapshotRow = typeof rankedSnapshots.$inferSelect
