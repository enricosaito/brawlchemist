import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export interface OtpPlayer {
  brawlhalla_id: number
  username: string
  top_legend_id: number
  rating: number | null
  peak_rating: number | null
  region: string | null
  tier: string | null
  wins: number | null
  games: number | null
  /** Games the player played on the queried legend this season. */
  legend_games: number | null
  /** Wins the player has on the queried legend this season. */
  legend_wins: number | null
}

/**
 * Players whose this-season main legend (top_legend_id) matches the
 * provided id. Optional region filter. Sorted by current rating desc.
 *
 * Also pulls the player's per-legend games/wins for the queried legend
 * out of ranked_json so the page can show a player-pick-rate column
 * (legend_games / total_games).
 */
export async function getOtpsForLegend(opts: {
  legendId: number
  region?: string | null
  limit?: number
}): Promise<OtpPlayer[]> {
  const limit = opts.limit ?? 50
  const region = opts.region ?? null
  // Hard floor on per-legend pick rate. Players who happen to top-rank
  // this legend with very few games on them aren't really "OTPs".
  const MIN_PICK_RATE = 0.2
  const result = await db().execute(sql`
    WITH candidates AS (
      SELECT
        p.brawlhalla_id,
        p.username,
        p.top_legend_id,
        (p.ranked_json->>'rating')::int AS rating,
        (p.ranked_json->>'peak_rating')::int AS peak_rating,
        p.ranked_json->>'region' AS region,
        p.ranked_json->>'tier' AS tier,
        (p.ranked_json->>'wins')::int AS wins,
        (p.ranked_json->>'games')::int AS games,
        (
          SELECT (l->>'games')::int
          FROM jsonb_array_elements(p.ranked_json->'legends') l
          WHERE (l->>'legend_id')::int = ${opts.legendId}
          LIMIT 1
        ) AS legend_games,
        (
          SELECT (l->>'wins')::int
          FROM jsonb_array_elements(p.ranked_json->'legends') l
          WHERE (l->>'legend_id')::int = ${opts.legendId}
          LIMIT 1
        ) AS legend_wins
      FROM players p
      WHERE p.top_legend_id = ${opts.legendId}
        AND (${region}::text IS NULL OR p.ranked_json->>'region' = ${region})
    )
    SELECT *
    FROM candidates
    WHERE games IS NOT NULL
      AND games > 0
      AND legend_games IS NOT NULL
      AND (legend_games::float / games) >= ${MIN_PICK_RATE}
    ORDER BY rating DESC NULLS LAST
    LIMIT ${limit}
  `)
  return result.rows as unknown as OtpPlayer[]
}
