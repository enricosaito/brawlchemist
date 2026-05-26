import "server-only"

import { sql } from "drizzle-orm"
import {
  API_REGIONS,
  type ApiRegion,
  getRankedLeaderboard,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players } from "@/lib/db/schema"

/**
 * Search index — makes the broad Diamond+ population searchable by name.
 *
 * The Brawlhalla API has no name-search endpoint, so search only finds players
 * already in our `players` table. Fully syncing every Diamond (~15k) via
 * /player/{id}/ranked would be ~15k calls; instead we walk the 1v1 ranked
 * leaderboard (50 ids + names + rating per call) and upsert lightweight
 * name-only rows — ~50x cheaper. Full stats are filled lazily the first time
 * someone opens the player's profile.
 *
 * The upsert is deliberately conservative: it only ever writes username +
 * ladder snapshot, never `ranked_json` / `top_legend_id` / `last_synced`, so a
 * fully-synced profile is never clobbered. New rows get an epoch `last_synced`
 * sentinel so the stats-sync path still treats them as stale (never mistakes a
 * name-only row for a freshly-synced one).
 */

// Every region except "ALL" (which returns mixed-region entries we'd already
// see under each specific region).
export const HARVEST_REGIONS: ApiRegion[] = API_REGIONS.filter(
  (r) => r !== "ALL",
) as ApiRegion[]

const PAGE_SIZE = 50
// Safety bound. ~32 Diamond+ pages per region in practice; 60 leaves headroom
// while capping worst-case API spend if a ladder is unusually deep.
const MAX_PAGES = 60

/** Diamond and above — the bands we index for search. */
function isDiamondPlus(tier: string | null): boolean {
  if (!tier) return false
  const base = tier.split(" ")[0]
  return base === "Diamond" || base === "Valhallan"
}

interface LadderRow {
  brawlhallaId: number
  username: string
  ladderRating: number | null
  ladderRegion: string
}

/** Upsert name-only rows in batches, touching only username + ladder columns. */
async function bulkUpsertLadder(rows: LadderRow[]): Promise<number> {
  const BATCH = 500
  let written = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((r) => ({
      brawlhallaId: r.brawlhallaId,
      username: r.username,
      ladderRating: r.ladderRating,
      ladderRegion: r.ladderRegion,
      // Epoch sentinel — "never stats-synced", so the stats-sync path still
      // picks this player up if/when needed.
      lastSynced: new Date(0),
    }))
    await db()
      .insert(players)
      .values(chunk)
      .onConflictDoUpdate({
        target: players.brawlhallaId,
        set: {
          username: sql`excluded.username`,
          ladderRating: sql`excluded.ladder_rating`,
          ladderRegion: sql`excluded.ladder_region`,
        },
      })
    written += chunk.length
  }
  return written
}

export interface HarvestResult {
  region: ApiRegion
  pages: number
  harvested: number
}

/**
 * Walk one region's 1v1 ranked ladder from the top, collecting every Diamond+
 * player's id/username/rating, and upsert them. Stops as soon as a page drops
 * below Diamond (the ladder is rating-sorted) or pagination is exhausted.
 */
export async function harvestRegion(
  region: ApiRegion,
  opts: { maxPages?: number; throttleMs?: number } = {},
): Promise<HarvestResult> {
  const maxPages = opts.maxPages ?? MAX_PAGES
  const throttleMs = opts.throttleMs ?? 400
  const rows: LadderRow[] = []
  let pages = 0

  for (let page = 1; page <= maxPages; page++) {
    const lb = await getRankedLeaderboard({
      gameMode: "1v1",
      region,
      page,
      maxResults: PAGE_SIZE,
    })
    if (!lb.ok) break
    pages++

    const rankings = lb.data.rankings
    const diamondPlus = rankings.filter((r) => isDiamondPlus(r.tier))
    for (const entry of diamondPlus) {
      const p = entry.players[0]
      if (!p?.id || !p.username) continue
      rows.push({
        brawlhallaId: p.id,
        username: p.username,
        ladderRating: entry.rating ?? null,
        ladderRegion: entry.region ?? region,
      })
    }

    // The ladder is rating-sorted, so the first page that contains any
    // sub-Diamond entry is the bottom of the Diamond band — stop there.
    if (diamondPlus.length < rankings.length || page >= lb.data.total_pages) {
      break
    }
    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs))
  }

  const harvested = rows.length > 0 ? await bulkUpsertLadder(rows) : 0
  return { region, pages, harvested }
}

/**
 * Pick which region to harvest on a given tick, rotating through all regions
 * so a periodic cron covers the whole ladder over time.
 */
export function regionForTick(now: Date, bucketMs: number): ApiRegion {
  const tickIndex = Math.floor(now.getTime() / bucketMs)
  return HARVEST_REGIONS[tickIndex % HARVEST_REGIONS.length]
}
