import {
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
