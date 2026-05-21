import "server-only"

import { eq, inArray } from "drizzle-orm"
import {
  getPlayerStats,
  type PlayerStats,
  type PlayerStatsLegend,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { players, type PlayerRow } from "@/lib/db/schema"

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function topLegendIds(legendsList: PlayerStatsLegend[], n: number): number[] {
  return [...legendsList]
    .filter((l) => typeof l.games === "number" && l.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, n)
    .map((l) => l.legend_id)
}

function isFresh(row: PlayerRow, ttlMs: number): boolean {
  return Date.now() - row.lastSynced.getTime() < ttlMs
}

export interface SyncOutcome {
  status: "synced" | "fresh" | "failed"
  brawlhallaId: number
  error?: string
}

/**
 * Fetch GetPlayerStats and upsert. Returns `fresh` (no API call made) when the
 * existing row was synced within `ttlMs`, `synced` on successful upsert, or
 * `failed` if the API call errored.
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

  const result = await getPlayerStats(brawlhallaId)
  if (!result.ok) {
    return { status: "failed", brawlhallaId, error: result.error }
  }

  const stats: PlayerStats = result.data
  const mainLegendIds = topLegendIds(stats.legends ?? [], 3)

  await db()
    .insert(players)
    .values({
      brawlhallaId: stats.brawlhalla_id,
      username: stats.name,
      level: stats.level ?? null,
      totalGames: stats.games ?? null,
      totalWins: stats.wins ?? null,
      mainLegendIds,
      statsJson: stats,
      lastSynced: new Date(),
    })
    .onConflictDoUpdate({
      target: players.brawlhallaId,
      set: {
        username: stats.name,
        level: stats.level ?? null,
        totalGames: stats.games ?? null,
        totalWins: stats.wins ?? null,
        mainLegendIds,
        statsJson: stats,
        lastSynced: new Date(),
      },
    })

  return { status: "synced", brawlhallaId }
}

/**
 * Sync many players with a small inter-request delay to stay polite to the
 * Brawlhalla rate limit (180 req / 15 min ≈ 12 req/min). 5 seconds between
 * calls = ~12/min sustained, but most calls short-circuit on `fresh`.
 */
export async function syncManyPlayers(
  ids: number[],
  opts: { ttlMs?: number; delayMs?: number } = {},
): Promise<SyncOutcome[]> {
  const delayMs = opts.delayMs ?? 5000
  const outcomes: SyncOutcome[] = []
  for (let i = 0; i < ids.length; i++) {
    const outcome = await syncPlayer(ids[i], { ttlMs: opts.ttlMs })
    outcomes.push(outcome)
    // Only pay the rate-limit delay when we actually hit the API.
    if (outcome.status === "synced" && i < ids.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  return outcomes
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

