import "server-only"

import { eq, ilike, inArray, sql } from "drizzle-orm"
import {
  getPlayerRanked,
  type PlayerRanked,
  type PlayerRankedLegend,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players, type PlayerRow } from "@/lib/db/schema"

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function topRankedLegendId(legends: PlayerRankedLegend[]): number | null {
  const played = legends.filter(
    (l) => typeof l.games === "number" && l.games > 0,
  )
  if (played.length === 0) return null
  played.sort((a, b) => b.games - a.games)
  return played[0].legend_id
}

function isFresh(row: PlayerRow, ttlMs: number): boolean {
  return Date.now() - row.lastSynced.getTime() < ttlMs
}

/**
 * Upsert an already-fetched GetPlayerRanked payload into the players table.
 * Shared by the background sync and the profile page (which fetches the live
 * payload anyway, so it can populate the pool for free on every view).
 */
export async function upsertPlayerRanked(ranked: PlayerRanked): Promise<void> {
  const topLegendId = topRankedLegendId(ranked.legends ?? [])
  await db()
    .insert(players)
    .values({
      brawlhallaId: ranked.brawlhalla_id,
      username: ranked.name,
      topLegendId,
      rankedJson: ranked,
      lastSynced: new Date(),
    })
    .onConflictDoUpdate({
      target: players.brawlhallaId,
      set: {
        username: ranked.name,
        topLegendId,
        rankedJson: ranked,
        lastSynced: new Date(),
      },
    })
}

export interface SyncOutcome {
  status: "synced" | "fresh" | "failed"
  brawlhallaId: number
  error?: string
}

/**
 * Fetch GetPlayerRanked and upsert. Returns `fresh` (no API call made) when
 * the existing row was synced within `ttlMs`, `synced` on successful upsert,
 * or `failed` if the API call errored.
 */
export async function syncPlayer(
  brawlhallaId: number,
  opts: { ttlMs?: number; force?: boolean } = {},
): Promise<SyncOutcome> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS

  if (!opts.force) {
    const existing = await db()
      .select()
      .from(players)
      .where(eq(players.brawlhallaId, brawlhallaId))
      .limit(1)
    if (existing[0] && isFresh(existing[0], ttlMs)) {
      return { status: "fresh", brawlhallaId }
    }
  }

  const result = await getPlayerRanked(brawlhallaId)
  if (!result.ok) {
    return { status: "failed", brawlhallaId, error: result.error }
  }

  await upsertPlayerRanked(result.data)

  return { status: "synced", brawlhallaId }
}

/**
 * Sync many players with a small inter-request delay to stay polite to the
 * Brawlhalla rate limit (180 req / 15 min ≈ 12 req/min). 5 seconds between
 * calls = ~12/min sustained, but most calls short-circuit on `fresh`.
 */
export async function syncManyPlayers(
  ids: number[],
  opts: { ttlMs?: number; delayMs?: number; force?: boolean } = {},
): Promise<SyncOutcome[]> {
  const delayMs = opts.delayMs ?? 5000
  const outcomes: SyncOutcome[] = []
  for (let i = 0; i < ids.length; i++) {
    const outcome = await syncPlayer(ids[i], {
      ttlMs: opts.ttlMs,
      force: opts.force,
    })
    outcomes.push(outcome)
    // Only pay the rate-limit delay when we actually hit the API.
    if (outcome.status === "synced" && i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return outcomes
}

/**
 * Search the local player pool by username (case-insensitive substring).
 *
 * The Brawlhalla API has no name-search endpoint, so this only finds players
 * we've already synced — via leaderboard/OTP enrichment or someone viewing
 * their profile. Ranked higher-rating first so the strongest matches lead.
 */
export async function searchPlayersByUsername(
  query: string,
  limit = 20,
): Promise<PlayerRow[]> {
  const q = query.trim()
  if (!q) return []
  return db()
    .select()
    .from(players)
    .where(ilike(players.username, `%${q}%`))
    // Rank by the best rating we have: the full ranked-season rating when the
    // profile's been synced, else the lightweight ladder snapshot from the
    // search-index harvest. Fully-synced, higher-rated players surface first.
    .orderBy(
      sql`coalesce((${players.rankedJson}->>'rating')::int, ${players.ladderRating}) desc nulls last`,
    )
    .limit(limit)
}

/**
 * Bulk-load cached rows for a list of brawlhalla IDs. Used by the leaderboard
 * page to enrich rankings without ever calling the upstream API.
 */
export async function getPlayersByIds(
  ids: number[],
): Promise<Map<number, PlayerRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db()
    .select()
    .from(players)
    .where(inArray(players.brawlhallaId, ids))
  return new Map(rows.map((r) => [r.brawlhallaId, r]))
}
