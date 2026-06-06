import "server-only"

import { and, desc, eq, gte, sql } from "drizzle-orm"
import {
  getRankedLeaderboard,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { liveRanked, type LiveRankedInsert } from "@/lib/db/schema"

/** Queues we track a live feed for. 2v2 entries are teams (two players). */
export const LIVE_QUEUES = ["1v1", "2v2"] as const
export type LiveQueue = (typeof LIVE_QUEUES)[number]

export function isLiveQueue(v: string | undefined): v is LiveQueue {
  return !!v && (LIVE_QUEUES as readonly string[]).includes(v)
}

// Top 500 = 10 pages of 50. We always poll the global ("ALL") ladder and keep
// each entry's region so the page can filter by region without extra calls.
const PAGES = 10
const PAGE_SIZE = 50

/** How recently an entry must have played to count as "live". */
export const ACTIVE_WINDOW_MS = 10 * 60 * 1000
/** A gap longer than this starts a fresh session (resets eloDiff/rankDiff). */
const SESSION_GAP_MS = 10 * 60 * 1000
/** Upsert batch size — keeps each statement well under any param ceiling. */
const UPSERT_CHUNK = 150

export interface LivePlayer {
  id: number
  name: string
}

function gamesOf(entry: RankedEntry): number | null {
  if (typeof entry.wins === "number" && typeof entry.losses === "number") {
    return entry.wins + entry.losses
  }
  return null
}

/** Stable identity for an entry across polls: queue + sorted member ids. */
function entityKey(queue: LiveQueue, players: LivePlayer[]): string {
  const ids = players
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join("-")
  return `${queue}:${ids}`
}

/**
 * Poll one queue's top-500 global ladder and reconcile it against the stored
 * snapshot, computing activity + session deltas. Returns a small summary.
 */
export async function syncLiveQueue(queue: LiveQueue): Promise<{
  queue: LiveQueue
  fetched: number
  active: number
  pagesFailed: number
}> {
  const now = new Date()

  // 1. Fetch the top PAGES pages of the ALL ladder.
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      getRankedLeaderboard({
        gameMode: queue,
        region: "ALL",
        page: i + 1,
        maxResults: PAGE_SIZE,
      }),
    ),
  )

  const entries: RankedEntry[] = []
  let pagesFailed = 0
  for (const res of pages) {
    if (res.ok) entries.push(...res.data.rankings)
    else pagesFailed++
  }
  if (entries.length === 0) {
    return { queue, fetched: 0, active: 0, pagesFailed }
  }

  // 2. Load the existing snapshot for this queue, keyed by id.
  const existing = await db()
    .select()
    .from(liveRanked)
    .where(eq(liveRanked.queue, queue))
  const prevById = new Map(existing.map((r) => [r.id, r]))

  // 3. Reconcile each entry into an insert row.
  const rows: LiveRankedInsert[] = []
  const seen = new Set<string>()
  let active = 0

  for (const entry of entries) {
    const players: LivePlayer[] = entry.players.map((p) => ({
      id: p.id,
      name: p.username,
    }))
    if (players.length === 0) continue
    const id = entityKey(queue, players)
    if (seen.has(id)) continue // de-dupe overlap across page boundaries
    seen.add(id)

    const prev = prevById.get(id)
    const rating = entry.rating ?? prev?.rating ?? 0
    const rank = entry.rank
    const games = gamesOf(entry)

    let lastActiveAt = prev?.lastActiveAt ?? null
    let sessionStartRating = prev?.sessionStartRating ?? rating
    let sessionStartRank = prev?.sessionStartRank ?? rank

    // Activity = a rising game count (a finished ranked match) since last poll,
    // or, if games is unavailable, a changed rating.
    const played =
      !!prev &&
      ((games != null && prev.games != null && games > prev.games) ||
        (games == null && entry.rating != null && prev.rating !== rating))

    if (played && prev) {
      const idleGap = lastActiveAt
        ? now.getTime() - lastActiveAt.getTime()
        : Infinity
      if (idleGap > SESSION_GAP_MS) {
        // New session — anchor deltas to where they were before this match.
        sessionStartRating = prev.rating
        sessionStartRank = prev.rank
      }
      lastActiveAt = now
      active++
    }

    rows.push({
      id,
      queue,
      region: entry.region ?? null,
      rank,
      rating,
      games,
      players,
      sessionStartRating,
      sessionStartRank,
      lastActiveAt,
      updatedAt: now,
    })
  }

  // 4. Batch upsert.
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    await db()
      .insert(liveRanked)
      .values(chunk)
      .onConflictDoUpdate({
        target: liveRanked.id,
        set: {
          region: sql`excluded.region`,
          rank: sql`excluded.rank`,
          rating: sql`excluded.rating`,
          games: sql`excluded.games`,
          players: sql`excluded.players`,
          sessionStartRating: sql`excluded.session_start_rating`,
          sessionStartRank: sql`excluded.session_start_rank`,
          lastActiveAt: sql`excluded.last_active_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  return { queue, fetched: rows.length, active, pagesFailed }
}

export interface LiveRow {
  id: string
  rank: number
  rating: number
  eloDiff: number
  rankDiff: number
  region: string | null
  players: LivePlayer[]
  lastActiveAt: Date
}

/**
 * Read the live feed for a queue: entries that played within the active window,
 * most-recently-active first. `region` filters the global snapshot (case-
 * insensitive); pass null/"ALL" for everyone.
 */
export async function getLiveQueue(opts: {
  queue: LiveQueue
  region?: string | null
  limit?: number
}): Promise<LiveRow[]> {
  const { queue, region, limit = 200 } = opts
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS)

  const conds = [
    eq(liveRanked.queue, queue),
    gte(liveRanked.lastActiveAt, cutoff),
  ]
  if (region && region.toUpperCase() !== "ALL") {
    conds.push(sql`upper(${liveRanked.region}) = ${region.toUpperCase()}`)
  }

  let rows
  try {
    rows = await db()
      .select()
      .from(liveRanked)
      .where(and(...conds))
      .orderBy(desc(liveRanked.lastActiveAt), desc(liveRanked.rating))
      .limit(limit)
  } catch (err) {
    console.error("[live] read failed:", err)
    return []
  }

  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    rating: r.rating,
    eloDiff: r.rating - r.sessionStartRating,
    rankDiff: r.sessionStartRank - r.rank, // climbing (rank ↓) → positive
    region: r.region,
    players: (r.players as LivePlayer[]) ?? [],
    // lastActiveAt is non-null here (gte filter excludes nulls).
    lastActiveAt: r.lastActiveAt as Date,
  }))
}

/** Count of currently-live entries for a queue (for the nav/header badge). */
export async function getLiveCount(queue: LiveQueue): Promise<number> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS)
  try {
    const [row] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(liveRanked)
      .where(
        and(
          eq(liveRanked.queue, queue),
          gte(liveRanked.lastActiveAt, cutoff),
        ),
      )
    return row?.n ?? 0
  } catch {
    return 0
  }
}
