import "server-only"

import { and, gt, inArray, sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import {
  isApiRegion,
  normalizeApiRegion,
  type ApiRegion,
  type RankedEntry,
} from "@/lib/brawlhalla-api"
import { db } from "@/lib/db"
import { liveRanked, players } from "@/lib/db/schema"
import { listProfiles } from "@/lib/sync/profiles"
import {
  getValhallanCutoff,
  getValhallanIds,
} from "@/lib/sync/valhallan-cutoff"
import { isValhallan, tierFromRating } from "@/lib/tier"
import { isCompetitive } from "@/lib/profile/verified"

/**
 * A live row has to be at most this old to count as "on the ladder now".
 *
 * The sync-live cron polls the top ten pages of the global 1v1 ladder every
 * five minutes and rotates the deep pages (down to ~2,320 rating) on a
 * thirty-minute cycle, so anything the ladder currently ranks is rewritten at
 * least twice an hour. Two hours therefore means "seen this hour, allowing a
 * missed tick" — and it is what keeps a pro who dropped off the ladder from
 * lingering on this board with a rating the ladder no longer shows. Rows older
 * than seven days are pruned outright; this window is the honest version of
 * that for a surface called *live*.
 */
const LIVE_WINDOW = sql`now() - interval '2 hours'`

/**
 * Verified competitors as leaderboard rows, ranked by their standing on the
 * live 1v1 ladder.
 *
 * **The rating comes from `live_ranked`, not from the stored /ranked payload,
 * and the season reset is why.** The board used to read each pro's cached
 * `ranked_json`, and that looked like a freshness problem a re-sync would fix.
 * It is not: `/player/{id}/ranked` keeps answering with LAST season's standing
 * until the player's first ranked match of the new one. Measured on
 * 2026-09-28, five days into Season 42: a pro re-synced the day before still
 * read 2,746 with 544 games, and the stored top of the board was 2,868 with
 * 1,583 games — Season 41 numbers, freshly fetched. Meanwhile the leaderboard
 * endpoint had already moved on (the same board's #5 read 2,685 stored against
 * 2,202 live), so the card called "Live Rankings" disagreed with the ladder
 * one click away.
 *
 * The leaderboard is the only source that knows which season it is, and we
 * already hold its top ~2,250 entries, refreshed every five minutes, in
 * `live_ranked`. So the board is: every competitive pro with a fresh row on
 * that ladder, ordered by that row's rating. A pro who has not played this
 * season is not on the ladder and is therefore not on the board — which is
 * what a ranking means, and is exactly what the full leaderboard does with
 * them. Costs no Brawlhalla API budget: one primary-key `IN` on the live table
 * (`1v1:<id>` is the row key) and one narrow projection on `players`.
 *
 * Wins and losses still come from the stored payload, because the ladder rows
 * carry only a games count. They are used only when that payload is provably
 * this season's: a season's game count only ever rises, so a stored `games`
 * above the live one is last season's blob, and the row shows no record
 * rather than a wrong one. It fills in as pros are viewed (the profile page's
 * fifteen-minute read-through) and as the leaderboard cron re-syncs the top
 * thirty of each region.
 *
 * `region` of "ALL" keeps every region; a specific region filters by the live
 * row's region (the ALL ladder reports it in lower case, and Japan as "JPS" —
 * `normalizeApiRegion` folds both). Valhallan is ladder membership, not a
 * rating band, so it is read from the daily roster ∪ hourly cutoff exactly as
 * before. Cached 5 min, tagged `profiles` so editing a pro in /admin busts this
 * board too.
 */
async function fetchProLeaderboard(region: ApiRegion): Promise<RankedEntry[]> {
  const overrides = await listProfiles()
  // Competitors only. "Verified" now covers creators and developers too, and a
  // streamer has no business on a board that ranks ladder rating.
  const proIds = overrides
    .filter((o) => isCompetitive(o.verifiedKind))
    .map((o) => o.brawlhallaId)
  if (proIds.length === 0) return []

  // The live ladder's rows for these pros. `1v1:<id>` is the primary key, so
  // this is an index lookup per id, not a scan of the table.
  const liveRows = await db()
    .select({
      id: liveRanked.id,
      rating: liveRanked.rating,
      rank: liveRanked.rank,
      games: liveRanked.games,
      region: liveRanked.region,
      players: liveRanked.players,
    })
    .from(liveRanked)
    .where(
      and(
        inArray(
          liveRanked.id,
          proIds.map((id) => `1v1:${id}`),
        ),
        gt(liveRanked.updatedAt, LIVE_WINDOW),
      ),
    )

  interface LiveStanding {
    id: number
    name: string
    rating: number
    rank: number
    games: number | null
    region: ApiRegion | null
  }
  const live: LiveStanding[] = []
  for (const r of liveRows) {
    const member = (r.players as { id: number; name: string }[])[0]
    if (!member) continue
    const reg = normalizeApiRegion(r.region)
    live.push({
      id: member.id,
      name: member.name,
      rating: r.rating,
      rank: r.rank,
      games: r.games,
      region: reg && reg !== "ALL" && isApiRegion(reg) ? reg : null,
    })
  }

  const inScope =
    region === "ALL" ? live : live.filter((d) => d.region === region)
  if (inScope.length === 0) return []

  // Season record, from the stored payload, for the rows on the board only.
  // Three ints projected out of `ranked_json` for at most ~120 rows reached by
  // primary key — the index narrows first, so only those rows are detoasted
  // and only the ints cross the wire (constraint #2), never the blob.
  const storedRows = await db()
    .select({
      brawlhallaId: players.brawlhallaId,
      wins: sql<number | null>`(${players.rankedJson}->>'wins')::int`,
      games: sql<number | null>`(${players.rankedJson}->>'games')::int`,
      peak: sql<number | null>`(${players.rankedJson}->>'peak_rating')::int`,
    })
    .from(players)
    .where(
      inArray(
        players.brawlhallaId,
        inScope.map((d) => d.id),
      ),
    )
  const stored = new Map(storedRows.map((r) => [r.brawlhallaId, r]))

  // Region cutoffs distinguish Valhallan from Diamond. For "ALL" we need every
  // region present; for a single region, just that one.
  const regionsNeeded: ApiRegion[] =
    region === "ALL"
      ? [
          ...new Set(
            inScope
              .map((d) => d.region)
              .filter((r): r is ApiRegion => r !== null),
          ),
        ]
      : [region]
  const cutoffByRegion = new Map<string, number>()
  // Ids the live ladder calls Valhallan, across every region. The union rather
  // than just `regionsNeeded` because a pro's ladder region is where they
  // mostly play, not the only ladder they can rank on. Ladder membership
  // settles it without another API call.
  const [idList] = await Promise.all([
    getValhallanIds("1v1"),
    ...regionsNeeded.map(async (r) => {
      const c = await getValhallanCutoff("1v1", r)
      if (c) cutoffByRegion.set(r, c.rating)
    }),
  ])
  const valhallanIds = new Set(idList)

  return [...inScope]
    // Ladder rating, then ladder rank — two pros on one rating keep the order
    // the ladder gave them rather than an arbitrary one.
    .sort((a, b) => b.rating - a.rating || a.rank - b.rank)
    .map((d, i): RankedEntry => {
      const s = stored.get(d.id)
      // This season's payload iff its game count has not overtaken the
      // ladder's. A count can only rise within a season, so a stored 1,583
      // against a live 34 is last season, whatever `last_synced` says.
      const sameSeason =
        !!s &&
        s.games != null &&
        d.games != null &&
        s.games <= d.games
      const wins = sameSeason ? (s.wins ?? null) : null
      const losses =
        sameSeason && s.games != null && s.wins != null
          ? Math.max(0, s.games - s.wins)
          : null
      const cutoff = d.region ? (cutoffByRegion.get(d.region) ?? null) : null
      const valhallan =
        valhallanIds.has(d.id) || isValhallan(d.rating, cutoff, wins)
      return {
        players: [{ id: d.id, username: d.name }],
        best_rating: sameSeason ? (s.peak ?? null) : null,
        rank: i + 1,
        rating: d.rating,
        wins,
        losses,
        region: d.region,
        tier: tierFromRating(d.rating, valhallan) ?? "Tin",
      }
    })
}

export const getProLeaderboard = unstable_cache(
  fetchProLeaderboard,
  ["pro-leaderboard-live"],
  { tags: ["profiles"], revalidate: 300 },
)
