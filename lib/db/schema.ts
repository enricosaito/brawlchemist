import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

/**
 * players — one row per Brawlhalla player we've ever enriched.
 *
 * `stats_json` is the raw GetPlayerStats payload as jsonb. We don't enforce a
 * structural type at the DB layer because the API occasionally renames fields
 * and we'd rather keep older payloads parseable than blow up on a schema drift.
 * Hot fields (level, totals, main legends) are denormalized for fast joins
 * against leaderboard responses.
 */
export const players = pgTable("players", {
  brawlhallaId: integer("brawlhalla_id").primaryKey(),
  username: text("username").notNull(),
  level: integer("level"),
  totalGames: integer("total_games"),
  totalWins: integer("total_wins"),
  /** Top-3 legend IDs sorted by games played, descending. */
  mainLegendIds: integer("main_legend_ids").array(),
  statsJson: jsonb("stats_json"),
  lastSynced: timestamp("last_synced", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type PlayerRow = typeof players.$inferSelect
export type PlayerInsert = typeof players.$inferInsert
