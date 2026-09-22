import "server-only"

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { cronControls, players } from "@/lib/db/schema"
import {
  API_REGIONS,
  getRankedLeaderboard,
  type ApiGameMode,
  type ApiRegion,
} from "@/lib/brawlhalla-api"
import { TIER_FLOOR } from "@/lib/tier"

/**
 * Making the middle of the ladder findable in search, without fetching it.
 *
 * Search reads `players`, so a player we have never stored simply cannot be
 * found — and we only store people someone has already looked up or who ranked
 * high enough for a cron to sweep. That leaves the entire middle of the ladder
 * invisible: measured, we hold 41,537 players at Platinum or above out of a
 * population several times that.
 *
 * The leaderboard is what makes this affordable. It returns fifty players per
 * request carrying id, username, rating, region and tier — everything a search
 * result needs — against `/ranked`, which costs one request per player. That
 * is a ~60x better ratio, and it is the only reason a six-figure index is
 * reachable inside a 180-per-15-minutes budget at all.
 *
 * **Nothing here fetches a player.** The rows written are deliberately thin:
 * no `ranked_json`, because that blob is what makes `players` the largest
 * table in the database, and the profile page fetches live on the first visit
 * anyway. A name and a rough rating is the whole product — it can be months
 * stale and still do its job.
 */

/** The floor we walk down to. Platinum, per TIER_FLOOR. */
const FLOOR = TIER_FLOOR.Platinum

/**
 * The ceiling we refuse to write above, and it is not arbitrary.
 *
 * The Valhallan aggregations are defined as `players.rating >= 2300` and read
 * `ranked_json->>'region'` and `->>'games'` off that pool. A thin row landing
 * inside it would join as a null-region, null-games member and quietly skew
 * every legend and weapon statistic on /meta-picks. `getSmurfMap` draws its
 * candidates from the same threshold.
 *
 * So the walk passes over the top of the ladder without recording it. Those
 * players are the ones we already have — they are what every existing cron
 * sweeps — and the ones we do not are reached by `discoverValhallanIds`.
 */
const POOL_CEILING = 2300

/** Pages per invocation. Ten requests against a budget the cron spends one of. */
const PAGES_PER_RUN = 10

const MODES: ApiGameMode[] = ["1v1", "2v2"]
/** "ALL" is a mixed-region view of ladders we walk individually. */
const REGIONS = API_REGIONS.filter((r) => r !== "ALL") as ApiRegion[]

export interface HarvestCursor {
  mode: ApiGameMode
  region: ApiRegion
  page: number
  /** Set once every ladder has been walked; the job then costs nothing. */
  done?: boolean
}

const START: HarvestCursor = { mode: MODES[0], region: REGIONS[0], page: 1 }

function parseCursor(raw: string | null): HarvestCursor {
  if (!raw) return START
  try {
    const c = JSON.parse(raw) as Partial<HarvestCursor>
    if (c.done) return { ...START, done: true }
    const mode = MODES.includes(c.mode as ApiGameMode)
      ? (c.mode as ApiGameMode)
      : START.mode
    const region = REGIONS.includes(c.region as ApiRegion)
      ? (c.region as ApiRegion)
      : START.region
    const page = Number.isInteger(c.page) && c.page! > 0 ? c.page! : 1
    return { mode, region, page }
  } catch {
    // A cursor we cannot read is worth less than starting over: the walk is
    // idempotent, so the cost of a restart is requests, never correctness.
    return START
  }
}

/** The next ladder after this one, or `done` when there are no more. */
function advanceLadder(c: HarvestCursor): HarvestCursor {
  const ri = REGIONS.indexOf(c.region)
  if (ri < REGIONS.length - 1) {
    return { mode: c.mode, region: REGIONS[ri + 1], page: 1 }
  }
  const mi = MODES.indexOf(c.mode)
  if (mi < MODES.length - 1) {
    return { mode: MODES[mi + 1], region: REGIONS[0], page: 1 }
  }
  return { ...START, done: true }
}

async function readCursor(key: string): Promise<HarvestCursor> {
  const [row] = await db()
    .select({ cursor: cronControls.cursor })
    .from(cronControls)
    .where(eq(cronControls.key, key))
    .limit(1)
  return parseCursor(row?.cursor ?? null)
}

async function writeCursor(key: string, c: HarvestCursor): Promise<void> {
  const value = JSON.stringify(c)
  await db()
    .insert(cronControls)
    .values({ key, cursor: value })
    .onConflictDoUpdate({
      target: cronControls.key,
      set: { cursor: value, updatedAt: new Date() },
    })
}

/**
 * **The sentinel that keeps these rows honest.**
 *
 * A row with a null `ranked_json` and a *fresh* `last_synced` already means
 * something in this codebase: `recordUnrankedPlayer` writes exactly that shape
 * to record "the API says this player is unranked, stop asking", and
 * `loadRanked` has a branch reading it. Harvesting thin rows with a current
 * timestamp would therefore tell the profile page that a hundred thousand
 * Platinum players are unranked, and it would serve that instead of fetching
 * them — the feature would silently break every profile it created.
 *
 * Dating them to the epoch inverts it: `isFresh` is false forever, so the
 * first visit always fetches live and upserts the real payload over the top.
 * Nothing in the app re-syncs by oldest `last_synced`, so an ancient date
 * attracts no background work either.
 */
const NEVER_SYNCED = new Date(0)

export interface HarvestResult {
  mode: ApiGameMode
  region: ApiRegion
  fromPage: number
  pagesWalked: number
  seen: number
  inserted: number
  finishedLadder: boolean
  done: boolean
}

/**
 * Walk a few pages of one ladder and record the players we do not have.
 *
 * Stops a ladder as soon as a page's lowest rating falls under Platinum, which
 * is what bounds the whole job: the ladders run far past it, and everything
 * below is not what this is for.
 */
export async function harvestSearchIndex(key: string): Promise<HarvestResult> {
  const start = await readCursor(key)
  if (start.done) {
    return {
      mode: start.mode,
      region: start.region,
      fromPage: start.page,
      pagesWalked: 0,
      seen: 0,
      inserted: 0,
      finishedLadder: false,
      done: true,
    }
  }

  let page = start.page
  let seen = 0
  let inserted = 0
  let finishedLadder = false

  for (let i = 0; i < PAGES_PER_RUN; i++) {
    const res = await getRankedLeaderboard({
      gameMode: start.mode,
      region: start.region,
      page,
      maxResults: 50,
    })
    // A 429 or an upstream blip ends the run where it stands. The cursor is
    // not advanced past the page we failed on, so the next tick retries it —
    // the same shape `discoverValhallanIds` uses, and the reason this job can
    // never half-skip a ladder.
    if (!res.ok) break
    const rows = res.data.rankings ?? []
    if (rows.length === 0) {
      finishedLadder = true
      break
    }

    const batch = rows
      .filter(
        (r) =>
          typeof r.rating === "number" &&
          r.rating >= FLOOR &&
          r.rating < POOL_CEILING &&
          r.players?.[0]?.id
      )
      .map((r) => ({
        brawlhallaId: r.players[0].id,
        username: r.players[0].username ?? "",
        rating: r.rating,
        lastSynced: NEVER_SYNCED,
      }))
    seen += rows.length

    if (batch.length > 0) {
      // Never touch a row we already hold. An existing player has a real
      // payload, a repaired username and a live rating; a leaderboard snapshot
      // is strictly worse than all three, and overwriting would also move
      // `last_synced` backwards and re-fetch them on the next view.
      const out = await db()
        .insert(players)
        .values(batch)
        .onConflictDoNothing({ target: players.brawlhallaId })
        .returning({ id: players.brawlhallaId })
      inserted += out.length
    }

    const lowest = rows[rows.length - 1]?.rating
    page++
    if (typeof lowest === "number" && lowest < FLOOR) {
      finishedLadder = true
      break
    }
  }

  const next = finishedLadder
    ? advanceLadder(start)
    : { mode: start.mode, region: start.region, page }
  await writeCursor(key, next)

  return {
    mode: start.mode,
    region: start.region,
    fromPage: start.page,
    pagesWalked: page - start.page,
    seen,
    inserted,
    finishedLadder,
    done: next.done === true,
  }
}

/** How far the sweep has got, for /admin. */
export async function harvestProgress(key: string): Promise<HarvestCursor> {
  return readCursor(key)
}

/** Start the sweep over — the ladders drift, so this is how a re-run begins. */
export async function resetHarvest(key: string): Promise<void> {
  await writeCursor(key, START)
}

/** Rows this job has created, identified by the sentinel it dates them with. */
export async function harvestedCount(): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(eq(players.lastSynced, NEVER_SYNCED))
  return row?.n ?? 0
}
