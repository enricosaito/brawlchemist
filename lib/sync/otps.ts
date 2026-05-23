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
}

/**
 * Players whose this-season main legend (top_legend_id) matches the
 * provided id. Optional region filter. Sorted by current rating desc.
 *
 * This is the data source for the OTPs leaderboard page — every row in
 * the result represents a Valhallan-tier-discovered player who plays
 * the chosen legend more than any other this season.
 */
export async function getOtpsForLegend(opts: {
  legendId: number
  region?: string | null
  limit?: number
}): Promise<OtpPlayer[]> {
  const limit = opts.limit ?? 50
  const region = opts.region ?? null
  const result = await db().execute(sql`
    SELECT
      brawlhalla_id,
      username,
      top_legend_id,
      (ranked_json->>'rating')::int AS rating,
      (ranked_json->>'peak_rating')::int AS peak_rating,
      ranked_json->>'region' AS region,
      ranked_json->>'tier' AS tier,
      (ranked_json->>'wins')::int AS wins,
      (ranked_json->>'games')::int AS games
    FROM players
    WHERE top_legend_id = ${opts.legendId}
      AND (${region}::text IS NULL OR ranked_json->>'region' = ${region})
    ORDER BY (ranked_json->>'rating')::int DESC NULLS LAST
    LIMIT ${limit}
  `)
  return result.rows as unknown as OtpPlayer[]
}
