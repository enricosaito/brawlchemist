import "server-only"

import { and, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm"
import {
  getRankedLeaderboard,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { liveRanked, type LiveRankedInsert } from "@/lib/db/schema"
import {
  recordQueueActivity,
  type ActivityTally,
} from "@/lib/sync/queue-activity"

/** Queues we track a live feed for. 2v2 entries are teams (two players). */
export const LIVE_QUEUES = ["1v1", "2v2"] as const
export type LiveQueue = (typeof LIVE_QUEUES)[number]

export function isLiveQueue(v: string | undefined): v is LiveQueue {
  return !!v && (LIVE_QUEUES as readonly string[]).includes(v)
}

// Top 500 = 10 pages of 50. We always poll the global ("ALL") ladder and keep
// each entry's region so the page can filter by region without extra calls.
/** Entries not seen in a poll for this long are dropped (see step 6). */
const STALE_ENTRY_MS = 7 * 24 * 60 * 60 * 1000

const PAGES = 10
const PAGE_SIZE = 50

/**
 * The "ALL" ladder is two concatenated lists, not one sorted one.
 *
 * Measured on 1v1: ranks 1-1098 descend 2,919 -> 1,499 and are the game's
 * Valhallan roster (most rows carry tier "Valhallan", including ones down at
 * 1,908 — the label survives falling out of the top-N). Rank 1099 then jumps
 * back up to 2,637 and a second, ordinary ladder descends from there.
 *
 * So polling pages 1-10 does not mean "the top 500 players". It means the top
 * 500 of the Valhallan roster, and it misses the second list entirely — a
 * 2,500-rated Diamond who never made the roster sits around rank 1,100 and
 * has never appeared on /live. That is the gap this tier closes.
 */
const DEEP_PAGES: Record<LiveQueue, [number, number]> = {
  // Pages 11-22 finish the roster, 23-45 walk the ordinary ladder from 2,637
  // down to roughly 2,320.
  "1v1": [11, 45],
  // 2v2's roster is shorter, so its second list starts earlier.
  "2v2": [11, 25],
}

/** How long a full sweep of the deep range should take. */
const DEEP_CYCLE_MS = 30 * 60 * 1000
/** The cron's own period — how often syncLiveQueue runs (vercel.ts). */
const TICK_MS = 5 * 60 * 1000

/**
 * The slice of deep pages this tick should fetch.
 *
 * Deep pages rotate rather than all being fetched every tick: the whole point
 * is that below the top a 30-minute refresh is enough, and fetching them at
 * the fast cadence would cost more than the entire API budget. The tick index
 * comes off the wall clock rather than a stored cursor so a missed or retried
 * run doesn't shift the phase.
 */
function deepPagesForTick(queue: LiveQueue, now: number): number[] {
  const [from, to] = DEEP_PAGES[queue]
  const all = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (all.length === 0) return []
  const ticksPerCycle = Math.max(1, Math.round(DEEP_CYCLE_MS / TICK_MS))
  const perTick = Math.ceil(all.length / ticksPerCycle)
  const tick = Math.floor(now / TICK_MS)
  const start = (tick * perTick) % all.length
  // Wraps, so the slice is always `perTick` long even at the end of the range.
  return Array.from(
    { length: perTick },
    (_, i) => all[(start + i) % all.length],
  )
}

/**
 * Ladder rank above which an entry is polled on the fast tier.
 *
 * Doubles as the read-side marker for which cadence last touched a row: a row
 * carries the rank it had when it was polled, so `rank <= FAST_RANK_MAX` is
 * exactly "this row's activity is fresh to within a tick". /live uses it to
 * decide what may claim to be in queue right now.
 */
export const FAST_RANK_MAX = PAGES * PAGE_SIZE

/**
 * How recently an entry must have played to appear on /live at all.
 *
 * Deliberately wider than IN_QUEUE_MS: the page shows a 20-minute tail of
 * activity so the grid has something in it, and marks only the most recent
 * poll's worth as actually in queue. Widening this costs nothing upstream —
 * it's a read-side filter over rows the cron already wrote.
 */
export const ACTIVE_WINDOW_MS = 20 * 60 * 1000

/**
 * The same window for deep-tier entries, which are polled every DEEP_CYCLE_MS
 * rather than every tick.
 *
 * It has to be wider than the poll cycle or the tier would visibly pulse: a
 * deep entry marked active at its poll would fall out of a 20-minute window
 * ten minutes before the next poll could renew it, so the lower half of the
 * grid would empty and refill on a 30-minute sawtooth. Slightly wider than the
 * cycle means an entry stays until its own next poll either renews it or
 * doesn't. The cost is honest and stated in the UI: for these rows "active"
 * means within the last half hour, not the last twenty minutes.
 */
export const DEEP_ACTIVE_WINDOW_MS = 35 * 60 * 1000

/**
 * How recently an entry must have played to count as *in queue right now*.
 *
 * The live cron polls every 5 minutes and stamps every entry it sees play with
 * that tick's timestamp, so activity arrives in 5-minute clusters and this
 * threshold selects exactly the newest cluster. If the cron is late or paused
 * the newest cluster ages past it and nothing is marked — which is the honest
 * outcome, not a bug: we genuinely don't know that anyone is still queueing.
 */
export const IN_QUEUE_MS = 5 * 60 * 1000
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
 * The player's 1v1 ladder position, IF they're in the live top ~500 (the only
 * reliable source — the per-player /ranked payload rarely carries a usable
 * global_rank). A direct PK hit on `1v1:${id}`, zero API. Null = not top 500.
 * Fails open.
 */
export async function getLadderPosition(brawlhallaId: number): Promise<{
  rank: number
  region: string | null
  /** Position among entries from the same region, or null if region unknown. */
  regionRank: number | null
} | null> {
  try {
    const [row] = await db()
      .select({
        rank: liveRanked.rank,
        region: liveRanked.region,
        // `rank` is the position on the ALL ladder, which is the only board we
        // poll — there is no per-region rank to read. Derive it by counting the
        // same region's entries ahead of this one. The correlated subquery
        // stays server-side (no extra egress) and the snapshot is ~600 rows per
        // queue, so it costs nothing worth optimising.
        // Outer columns written out in full — see getLiveQueue for why
        // interpolating them here silently returns 1 for every row.
        regionRank: sql<number | null>`
          case when live_ranked.region is null then null else (
            select count(*) + 1 from live_ranked l2
            where l2.queue = live_ranked.queue
              and upper(l2.region) = upper(live_ranked.region)
              and l2.rank < live_ranked.rank
          ) end`,
      })
      .from(liveRanked)
      .where(eq(liveRanked.id, `1v1:${brawlhallaId}`))
      .limit(1)
    return row
      ? { rank: row.rank, region: row.region, regionRank: row.regionRank }
      : null
  } catch (err) {
    console.error("[live] ladder position lookup failed:", err)
    return null
  }
}

/**
 * Poll one queue's top-500 global ladder and reconcile it against the stored
 * snapshot, computing activity + session deltas. Returns a small summary.
 */
export async function syncLiveQueue(queue: LiveQueue): Promise<{
  queue: LiveQueue
  fetched: number
  active: number
  /** Pages requested this tick: the fast tier plus this tick's deep slice. */
  pages: number
  pagesFailed: number
  pruned: number
}> {
  const now = new Date()

  // 1. Fetch the fast tier (pages 1..PAGES, every tick) plus this tick's slice
  //    of the deep tier. Deep pages are a rotation, so each is refreshed about
  //    every DEEP_CYCLE_MS rather than every tick — see deepPagesForTick.
  const fastPages = Array.from({ length: PAGES }, (_, i) => i + 1)
  const deepPages = deepPagesForTick(queue, now.getTime())
  const pageNumbers = [...fastPages, ...deepPages]
  const pages = await Promise.all(
    pageNumbers.map((page) =>
      getRankedLeaderboard({
        gameMode: queue,
        region: "ALL",
        page,
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
    return { queue, fetched: 0, active: 0, pages: pageNumbers.length, pagesFailed, pruned: 0 }
  }

  // 2. Resolve the polled entries to their stable ids first, so step 3 can ask
  //    the database for exactly those rows and nothing else.
  interface Polled {
    entry: RankedEntry
    id: string
    players: LivePlayer[]
  }
  const polled: Polled[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const players: LivePlayer[] = entry.players.map((p) => ({
      id: p.id,
      name: p.username,
    }))
    if (players.length === 0) continue
    const id = entityKey(queue, players)
    if (seen.has(id)) continue // de-dupe overlap across page boundaries
    seen.add(id)
    polled.push({ entry, id, players })
  }

  // 3. Load the previous snapshot for JUST the polled ids, JUST the columns we
  //    reconcile against.
  //
  //    This was `select().from(liveRanked).where(eq(queue))` — every column of
  //    every row for the queue, every 5 minutes, for both queues. It was by a
  //    wide margin the single largest consumer of Supabase egress:
  //    pg_stat_statements attributed 180,063,192 returned rows to it (~16 GB on
  //    the wire at ~91 bytes/row). Two separate wastes stacked up. The table
  //    holds thousands of entries per queue while a tick only polls
  //    PAGES * PAGE_SIZE of them, and `prevById` is only ever read via
  //    `.get(id)` for an id in the current poll — so the rest was fetched and
  //    discarded. And the `players` jsonb (over half the row's wire size) is
  //    always taken from the fresh API payload, never from the stored copy.
  const previous =
    polled.length === 0
      ? []
      : await db()
          .select({
            id: liveRanked.id,
            rank: liveRanked.rank,
            rating: liveRanked.rating,
            games: liveRanked.games,
            lastActiveAt: liveRanked.lastActiveAt,
            sessionStartRating: liveRanked.sessionStartRating,
            sessionStartRank: liveRanked.sessionStartRank,
          })
          .from(liveRanked)
          .where(inArray(liveRanked.id, polled.map((p) => p.id)))
  const prevById = new Map(previous.map((r) => [r.id, r]))

  // 4. Reconcile each entry into an insert row.
  const rows: LiveRankedInsert[] = []
  let active = 0
  // Activity rollup, folded in as we go. Every region the poll SAW gets a
  // sample, whether or not anyone in it played — see recordQueueActivity.
  const regionsSeen = new Set<string>()
  const tallies = new Map<string, ActivityTally>()

  for (const { entry, id, players } of polled) {
    const prev = prevById.get(id)
    const regionKey = (entry.region ?? "UNK").toUpperCase()
    regionsSeen.add(regionKey)
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
      const slot = tallies.get(regionKey) ?? { active: 0, matches: 0 }
      slot.active += 1
      // Game-count delta = matches finished since the previous poll. Guarded
      // against the counter going backwards (a season reset or a bad payload).
      if (games != null && prev.games != null && games > prev.games) {
        slot.matches += games - prev.games
      }
      tallies.set(regionKey, slot)
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

  // 5. Batch upsert.
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

  // 6. Fold this poll into the hourly activity rollup. Zero API cost — the
  //    numbers were already computed above to decide who's active.
  await recordQueueActivity(queue, regionsSeen, tallies, now)

  // 7. Prune entries that fell out of the polled window a long time ago.
  //     Nothing reads them: the live feed looks at a 10-minute activity window
  //     and the movers at 24 hours. Without this the table only ever grows,
  //     which is how it came to hold several thousand rows per queue while a
  //     tick polls PAGES * PAGE_SIZE.
  let pruned = 0
  try {
    const res = await db()
      .delete(liveRanked)
      .where(
        and(
          eq(liveRanked.queue, queue),
          lt(liveRanked.updatedAt, new Date(Date.now() - STALE_ENTRY_MS)),
        ),
      )
    pruned = res.count ?? 0
  } catch (err) {
    console.error("[live] stale prune failed:", err)
  }

  return {
    queue,
    fetched: rows.length,
    active,
    pages: pageNumbers.length,
    pagesFailed,
    pruned,
  }
}

export interface LiveRow {
  id: string
  rank: number
  rating: number
  eloDiff: number
  rankDiff: number
  region: string | null
  /**
   * Position within `region`. Only populated when the feed was read scoped to
   * a single region — on the ALL view there is no regional context to show.
   */
  regionRank: number | null
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
  const deepCutoff = new Date(Date.now() - DEEP_ACTIVE_WINDOW_MS)

  const conds = [
    eq(liveRanked.queue, queue),
    // Each tier is judged against its own poll cadence. A single cutoff would
    // either drop deep rows between their 30-minute polls or let fast rows
    // linger half an hour after they stopped playing.
    or(
      and(
        lte(liveRanked.rank, FAST_RANK_MAX),
        gte(liveRanked.lastActiveAt, cutoff),
      ),
      and(
        gt(liveRanked.rank, FAST_RANK_MAX),
        gte(liveRanked.lastActiveAt, deepCutoff),
      ),
    )!,
  ]
  if (region && region.toUpperCase() !== "ALL") {
    conds.push(sql`upper(${liveRanked.region}) = ${region.toUpperCase()}`)
  }

  const scoped = !!region && region.toUpperCase() !== "ALL"

  let rows
  try {
    rows = await db()
      .select({
        id: liveRanked.id,
        rank: liveRanked.rank,
        rating: liveRanked.rating,
        sessionStartRating: liveRanked.sessionStartRating,
        sessionStartRank: liveRanked.sessionStartRank,
        region: liveRanked.region,
        players: liveRanked.players,
        lastActiveAt: liveRanked.lastActiveAt,
        // Only worth computing when the view is scoped to one region — on ALL
        // the card shows the global number and this would be 200 correlated
        // counts thrown away. See getLadderPosition for why it's derived.
        // The outer columns are written out in full rather than interpolated:
        // drizzle renders `${liveRanked.rank}` as a bare `"rank"`, which inside
        // this subquery binds to l2 — making the test `l2.rank < l2.rank` and
        // handing every row a regional rank of 1.
        regionRank: scoped
          ? sql<number | null>`(
              select count(*) + 1 from live_ranked l2
              where l2.queue = live_ranked.queue
                and upper(l2.region) = upper(live_ranked.region)
                and l2.rank < live_ranked.rank
            )`
          : sql<number | null>`null::int`,
      })
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
    regionRank: r.regionRank,
    players: (r.players as LivePlayer[]) ?? [],
    // lastActiveAt is non-null here (gte filter excludes nulls).
    lastActiveAt: r.lastActiveAt as Date,
  }))
}

/** Movers window — entries whose latest session happened within the last day. */
const MOVERS_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Today's biggest climbers and droppers for a queue: entries active in the
 * last 24h, ranked by their latest session's ELO delta. The delta covers one
 * session (anchors reset after a 10-minute idle gap), so this reads as "the
 * biggest single-session swings today" — which is the interesting story
 * anyway. Same table the live feed reads; zero API cost.
 */
export async function getDailyMovers(opts: {
  queue: LiveQueue
  region?: string | null
  limit?: number
  /** Skip the losers query entirely when the caller only renders climbers. */
  gainersOnly?: boolean
}): Promise<{ gainers: LiveRow[]; losers: LiveRow[] }> {
  const { queue, region, limit = 5, gainersOnly = false } = opts
  const cutoff = new Date(Date.now() - MOVERS_WINDOW_MS)

  const conds = [
    eq(liveRanked.queue, queue),
    gte(liveRanked.lastActiveAt, cutoff),
  ]
  if (region && region.toUpperCase() !== "ALL") {
    conds.push(sql`upper(${liveRanked.region}) = ${region.toUpperCase()}`)
  }

  // The page shows five names per column, so ORDER BY + LIMIT belongs in SQL.
  // This used to be an unbounded `select()` over every entry active in the
  // last 24h — every column of every row dragged over the wire (on a
  // force-dynamic page that each viewer re-fetches every 45s) just to sort
  // in JS and keep ten of them.
  const eloDiff = sql`${liveRanked.rating} - ${liveRanked.sessionStartRating}`
  const columns = {
    id: liveRanked.id,
    rank: liveRanked.rank,
    rating: liveRanked.rating,
    sessionStartRating: liveRanked.sessionStartRating,
    sessionStartRank: liveRanked.sessionStartRank,
    region: liveRanked.region,
    players: liveRanked.players,
    lastActiveAt: liveRanked.lastActiveAt,
  }
  const movers = (direction: "gain" | "loss") =>
    db()
      .select(columns)
      .from(liveRanked)
      .where(
        and(...conds, direction === "gain" ? sql`${eloDiff} > 0` : sql`${eloDiff} < 0`),
      )
      .orderBy(direction === "gain" ? sql`${eloDiff} desc` : sql`${eloDiff} asc`)
      .limit(limit)

  let gainerRows: Awaited<ReturnType<typeof movers>> = []
  let loserRows: Awaited<ReturnType<typeof movers>> = []
  try {
    ;[gainerRows, loserRows] = await Promise.all([
      movers("gain"),
      gainersOnly ? Promise.resolve([]) : movers("loss"),
    ])
  } catch (err) {
    console.error("[live] movers read failed:", err)
    return { gainers: [], losers: [] }
  }

  const toRow = (r: (typeof gainerRows)[number]): LiveRow => ({
    id: r.id,
    rank: r.rank,
    rating: r.rating,
    eloDiff: r.rating - r.sessionStartRating,
    rankDiff: r.sessionStartRank - r.rank,
    region: r.region,
    // The movers ticker never renders a rank, so there's nothing to derive.
    regionRank: null,
    players: (r.players as LivePlayer[]) ?? [],
    lastActiveAt: r.lastActiveAt as Date,
  })

  return { gainers: gainerRows.map(toRow), losers: loserRows.map(toRow) }
}


