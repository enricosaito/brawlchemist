import "server-only"

import { and, eq, isNotNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { players } from "@/lib/db/schema"
import { getPlayerRankedJson, getPlayersByIds } from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"

/**
 * Suggested Favorites — who else is worth tracking, derived from the one player
 * the viewer has already told us about: themselves.
 *
 * Three questions rather than one ranked list, because "who should I follow"
 * has three different honest answers and a single blended score would hide
 * which one applied. A named reason is also the difference between a
 * recommendation and a list of strangers.
 *
 * Every group is bounded to three and every read is bounded by construction:
 * the pro set is the profiles map we already cache, the main-legend query is a
 * three-row index scan, and the teammates come out of the viewer's own stored
 * ranked payload. Nothing here scans `players` (cardinal constraint #6) and
 * nothing spends Brawlhalla API budget (#1) — it is all data we hold.
 *
 * Fails open group by group: a source that throws contributes nothing and the
 * others still render.
 */

export const SUGGESTIONS_PER_GROUP = 3

export interface SuggestionGroup {
  key: "region" | "main" | "teammates"
  label: string
  /** The one line that says why these people and not others. */
  reason: string
  ids: number[]
}

/**
 * The viewer's own facts, read once and shared by the three groups.
 *
 * Their region and main come off the scalar columns; the teams need the stored
 * ranked payload, which is one row's jsonb — the same read the profile page
 * makes, and the only place here that touches a blob.
 */
async function selfFacts(selfId: number): Promise<{
  region: string | null
  mainLegendId: number | null
  teammateIds: number[]
}> {
  const [row, ranked] = await Promise.all([
    getPlayersByIds([selfId], { includeRankedJson: false, withRegion: true })
      .then((m) => m.get(selfId) ?? null)
      .catch(() => null),
    getPlayerRankedJson(selfId).catch(() => null),
  ])

  // Teams are already the shape the profile renders, so the ordering is the
  // one a player recognises: their best team first.
  const teams = Array.isArray(ranked?.["2v2"]) ? ranked["2v2"] : []
  const teammateIds = [...teams]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .map((t) =>
      t.brawlhalla_id_one === selfId
        ? t.brawlhalla_id_two
        : t.brawlhalla_id_one,
    )
    // The API returns self-teams and zero ids among the real rows; the profile
    // page filters the same junk before rendering teams.
    .filter((id) => Number.isInteger(id) && id > 0 && id !== selfId)

  return {
    region: row?.region ?? ranked?.region ?? null,
    mainLegendId: row?.topLegendId ?? null,
    teammateIds: [...new Set(teammateIds)],
  }
}

/**
 * Verified pros in a region, best first. Reads the cached profiles map.
 *
 * Returns candidates rather than the final three — the cross-group dedupe runs
 * after this, and trimming here would cost the group a slot every time one of
 * its picks also qualified under an earlier heading.
 */
async function prosInRegion(
  region: string,
  skip: (id: number) => boolean,
): Promise<number[]> {
  const profiles = await getProfilesMap()
  const proIds = [...profiles]
    .filter(([, p]) => p.verified)
    .map(([id]) => id)
    .filter((id) => !skip(id))
  if (proIds.length === 0) return []

  // A narrow read of at most the pro set — a couple of hundred rows by primary
  // key, no ranked_json. Region and rating both come back as scalars, so the
  // filter and the sort happen on values already in hand.
  const rows = await getPlayersByIds(proIds, {
    includeRankedJson: false,
    withRegion: true,
  })
  return [...rows.values()]
    .filter((p) => p.region === region && p.rating != null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .map((p) => p.brawlhallaId)
}

/**
 * Best-rated players on a given main.
 *
 * `top_legend_id` is the pre-computed main, and `players_top_legend_rating_idx`
 * is `(top_legend_id, rating DESC NULLS LAST)` — so this walks three index
 * entries and stops.
 *
 * The `nulls last` is load-bearing, not decoration. `ORDER BY rating DESC`
 * means NULLS FIRST by default, which does not match the index and drops the
 * planner onto a bitmap heap scan: measured 1.9s against 0.05ms for the same
 * three rows. Same family of trap as wrapping the column in coalesce().
 */
async function topOnMain(
  legendId: number,
  selfId: number,
  skip: (id: number) => boolean,
): Promise<number[]> {
  const rows = await db()
    .select({ brawlhallaId: players.brawlhallaId })
    .from(players)
    .where(
      and(
        eq(players.topLegendId, legendId),
        isNotNull(players.rating),
        ne(players.brawlhallaId, selfId),
      ),
    )
    .orderBy(sql`${players.rating} desc nulls last`)
    // Over-fetch so the already-favorited and the cross-group duplicates can be
    // filtered out without a second round trip. Still a handful of index
    // entries — the index makes the depth free.
    .limit(SUGGESTIONS_PER_GROUP + 12)
  return rows.map((r) => r.brawlhallaId).filter((id) => !skip(id))
}

/**
 * Build the three groups. `exclude` is everyone already on the list (and the
 * viewer), so a suggestion is never someone they already track.
 *
 * Returns only non-empty groups: a headed section with nothing under it reads
 * as breakage, and "no pros in your region" is not worth a row of its own.
 */
export async function getSuggestedFavorites(
  selfId: number,
  exclude: Iterable<number>,
): Promise<SuggestionGroup[]> {
  const skipSet = new Set(exclude)
  skipSet.add(selfId)
  const skip = (id: number) => skipSet.has(id)

  let facts: Awaited<ReturnType<typeof selfFacts>>
  try {
    facts = await selfFacts(selfId)
  } catch (err) {
    console.error("[suggestions] self lookup failed:", err)
    return []
  }

  const [region, main, teammates] = await Promise.all([
    facts.region
      ? prosInRegion(facts.region, skip).catch((err) => {
          console.error("[suggestions] pros-in-region failed:", err)
          return [] as number[]
        })
      : Promise.resolve([] as number[]),
    facts.mainLegendId != null
      ? topOnMain(facts.mainLegendId, selfId, skip).catch((err) => {
          console.error("[suggestions] top-on-main failed:", err)
          return [] as number[]
        })
      : Promise.resolve([] as number[]),
    Promise.resolve(facts.teammateIds.filter((id) => !skip(id))),
  ])

  // Deduped across groups in order, so the same player can't appear twice under
  // two different reasons — the first reason wins, and the order below is how
  // strong a reason it is.
  const seen = new Set<number>()
  const dedupe = (ids: number[]) => {
    const out: number[] = []
    for (const id of ids) {
      if (out.length >= SUGGESTIONS_PER_GROUP) break
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    return out
  }

  const groups: SuggestionGroup[] = [
    {
      key: "teammates",
      label: "Your 2v2 teammates",
      reason: "People you actually queue with",
      ids: dedupe(teammates),
    },
    {
      key: "main",
      label: `Best on your main`,
      reason: "Top rated players with the same main legend",
      ids: dedupe(main),
    },
    {
      key: "region",
      label: facts.region ? `Pros in ${facts.region}` : "Pros in your region",
      reason: "Verified pros on your ladder",
      ids: dedupe(region),
    },
  ]

  return groups.filter((g) => g.ids.length > 0)
}
