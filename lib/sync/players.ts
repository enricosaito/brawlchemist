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

// Every players column except the heavy `ranked_json` blob. Selecting these
// alone (rankedJson synthesized as null) serves callers that only need the
// scalar fields — username, top legend, ladder snapshot — without dragging the
// full ranked payload over the wire.
const PLAYER_SCALAR_COLUMNS = {
  brawlhallaId: players.brawlhallaId,
  username: players.username,
  topLegendId: players.topLegendId,
  ladderRating: players.ladderRating,
  ladderRegion: players.ladderRegion,
  guildId: players.guildId,
  guildName: players.guildName,
  guildCheckedAt: players.guildCheckedAt,
  lastSynced: players.lastSynced,
}

/**
 * Bulk-load cached rows for a list of brawlhalla IDs. Used to enrich rankings
 * and teammate cards without ever calling the upstream API.
 *
 * `includeRankedJson` (default true) controls whether the full `ranked_json`
 * payload is pulled. List/teammate views that only render the main legend pass
 * `false` to skip the blob — `ranked_json` is the single biggest column in the
 * table, so omitting it on those hot, high-fan-out paths is most of the DB
 * egress win. Callers that read legends (best-legends columns, podiums) keep
 * the default.
 */
export async function getPlayersByIds(
  ids: number[],
  opts: { includeRankedJson?: boolean } = {},
): Promise<Map<number, PlayerRow>> {
  if (ids.length === 0) return new Map()
  const includeRankedJson = opts.includeRankedJson ?? true
  const rows = await db()
    .select(
      includeRankedJson
        ? { ...PLAYER_SCALAR_COLUMNS, rankedJson: players.rankedJson }
        : PLAYER_SCALAR_COLUMNS,
    )
    .from(players)
    .where(inArray(players.brawlhallaId, ids))
  return new Map(
    rows.map((r) => [
      r.brawlhallaId,
      ("rankedJson" in r ? r : { ...r, rankedJson: null }) as PlayerRow,
    ]),
  )
}

export interface PlayerSuggestion {
  id: number
  username: string
  topLegendId: number | null
  rating: number | null
  region: string | null
}

/**
 * Username typeahead suggestions. Same matching/ordering as
 * searchPlayersByUsername, but projects only the five fields the dropdown
 * renders — rating/region are pulled straight out of `ranked_json` as scalars
 * instead of returning the whole payload per row, which the live (per-keystroke)
 * dropdown was doing.
 */
export async function searchPlayerSuggestions(
  query: string,
  limit = 8,
): Promise<PlayerSuggestion[]> {
  const q = query.trim()
  if (!q) return []
  return db()
    .select({
      id: players.brawlhallaId,
      username: players.username,
      topLegendId: players.topLegendId,
      rating: sql<number | null>`(${players.rankedJson}->>'rating')::int`,
      region: sql<string | null>`${players.rankedJson}->>'region'`,
    })
    .from(players)
    .where(ilike(players.username, `%${q}%`))
    .orderBy(
      sql`coalesce((${players.rankedJson}->>'rating')::int, ${players.ladderRating}) desc nulls last`,
    )
    .limit(limit)
}
