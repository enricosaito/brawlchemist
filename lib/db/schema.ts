import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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
})

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
  /** Future auth owner — the Supabase `auth.users` id of whoever claims this
   * player. Null = unclaimed (the current admin-curated state). Unique so one
   * auth user owns at most one profile. No FK yet (auth isn't wired up); the
   * column just reserves the link, so "claim your player" becomes a populate. */
  userId: uuid("user_id").unique(),
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
})

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
  userAgent: text("user_agent"),
  referer: text("referer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type FetchLogRow = typeof fetchLog.$inferSelect
