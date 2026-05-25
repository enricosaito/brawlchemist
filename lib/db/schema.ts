import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
 * player_overrides — editable, admin-curated presentation data layered on top
 * of a player by brawlhalla id: verified-pro status (+ display handle),
 * favorite skin, and esports accolades. These have no API source, so they're
 * maintained by hand through the /admin page (and were previously hardcoded in
 * lib/player-previews.ts). Read everywhere a `PlayerPreview` is consumed.
 */
export const playerOverrides = pgTable("player_overrides", {
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  /** Verified pro — shows the PRO badge. */
  pro: boolean("pro").notNull().default(false),
  /** Optional handle shown next to the PRO badge (e.g. "Kyna"). */
  handle: text("handle"),
  /** Favorite skin shape: { src, name } | null. */
  favoriteSkin: jsonb("favorite_skin"),
  /** Championship titles as a string[] (jsonb), e.g. ["2v2 World Champion '24"]. */
  achievements: jsonb("achievements"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type PlayerOverrideRow = typeof playerOverrides.$inferSelect
export type PlayerOverrideInsert = typeof playerOverrides.$inferInsert

/**
 * guilds — one row per guild we've discovered (via the player pool / profile
 * views). The Brawlhalla API has no "list guilds" endpoint, so this table *is*
 * our guild leaderboard: rows are ordered by the API's official `rank`.
 *
 * `stats_json` / `members_json` keep the full GetGuildStats payload and the
 * GetGuildMembers snapshot as jsonb (drift-safe, like players.ranked_json). xp
 * values use bigint — a large guild's lifetime XP can exceed the int4 ceiling.
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
  /** GetGuildMembers snapshot: GuildMember[]. */
  membersJson: jsonb("members_json"),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type GuildRow = typeof guilds.$inferSelect
export type GuildInsert = typeof guilds.$inferInsert
