import {
  getPlayerSuggestionsByIds,
  searchPlayerSuggestions,
  type PlayerSuggestion,
} from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import { slugForLegendId } from "@/lib/legends-roster"

// Always dynamic — this reads the query string and the live DB.
export const dynamic = "force-dynamic"

const LIMIT = 8

/**
 * Typeahead search over usernames *and* verified pro handles.
 *
 * Backed entirely by our local `players` table (the Brawlhalla API has no
 * name-search endpoint), so this never adds load to the upstream API.
 *
 * Pro handles are not a column on `players` — they live in `profiles`, which
 * is already loaded here as the cached `getProfilesMap()` (a few hundred rows,
 * in memory, shared app-wide). So handle matching is a scan of that map rather
 * than a second query or a join: the only extra database work is one id lookup
 * for pros the username pass didn't already return, and only when a handle
 * actually matched.
 *
 * Pro hits are listed first. Someone typing a competitor's handle is looking
 * for that player specifically, and their in-game name often shares a
 * substring with unrelated accounts.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  const headers = { "Cache-Control": "no-store" }

  if (q.length < 2) return Response.json({ results: [] }, { headers })

  try {
    const [byUsername, profiles] = await Promise.all([
      searchPlayerSuggestions(q, LIMIT),
      getProfilesMap(),
    ])

    const needle = q.toLowerCase()
    const proIds = new Set<number>()
    const handleById = new Map<number, string>()
    const handleMatchIds: number[] = []
    // Only a handle that *starts with* the query leads the list. A substring
    // hit anywhere is too weak to promote on: "an" matches six handles, and
    // letting them all jump the queue buries higher-rated players behind pros
    // the searcher wasn't looking for. Those still appear — just in rating
    // order with everyone else.
    const leadIds = new Set<number>()
    for (const [id, profile] of profiles) {
      if (!profile.verified) continue
      // Pro status and having a handle are separate: a verified pro with no
      // handle set still gets the badge, just nothing to match or lead with.
      proIds.add(id)
      const handle = profile.verified.handle
      if (!handle) continue
      handleById.set(id, handle)
      const lowered = handle.toLowerCase()
      if (!lowered.includes(needle)) continue
      handleMatchIds.push(id)
      if (lowered.startsWith(needle)) leadIds.add(id)
    }

    // Only fetch the handle matches the username pass missed.
    const seen = new Set(byUsername.map((p) => p.id))
    const extraIds = handleMatchIds.filter((id) => !seen.has(id))
    const byHandle = extraIds.length
      ? await getPlayerSuggestionsByIds(extraIds.slice(0, LIMIT))
      : []

    // Pros whose handle matched lead, then the username results in their own
    // rating order. Deduped by id, since a pro can satisfy both.
    const merged: PlayerSuggestion[] = []
    const emitted = new Set<number>()
    for (const p of [...byHandle, ...byUsername]) {
      if (emitted.has(p.id)) continue
      emitted.add(p.id)
      merged.push(p)
    }

    // Prefix-matched pros lead; the rest fall back to rating order. Both
    // sources already arrive rating-sorted, but they're two separate queries,
    // so the tail has to be re-sorted to interleave them.
    const ordered = [
      ...merged.filter((p) => leadIds.has(p.id)),
      ...merged
        .filter((p) => !leadIds.has(p.id))
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
    ]

    const results = ordered.slice(0, LIMIT).map((p) => ({
      id: p.id,
      username: p.username,
      legendSlug: p.topLegendId ? slugForLegendId(p.topLegendId) : null,
      rating: p.rating,
      region: p.region,
      pro: proIds.has(p.id),
      /** Verified pro handle, when there is one — the dropdown leads with it. */
      handle: handleById.get(p.id) ?? null,
    }))
    return Response.json({ results }, { headers })
  } catch (err) {
    console.error("[api/search/players] failed:", err)
    return Response.json({ results: [], error: "search_failed" }, { status: 500, headers })
  }
}
