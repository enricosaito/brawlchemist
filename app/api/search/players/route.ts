import {
  getPlayerSuggestionsByIds,
  searchPlayerSuggestions,
  type PlayerSuggestion,
} from "@/lib/sync/players"
import { getProfilesMap } from "@/lib/sync/profiles"
import { getFlairMap } from "@/lib/sync/customizations"
import { getSmurfIds } from "@/lib/sync/smurf"
import { getValhallanIds } from "@/lib/sync/valhallan-cutoff"
import { tierFromRating } from "@/lib/tier"
import { slugForLegendId } from "@/lib/legends-roster"
import { kindFromVerified, type VerifiedKind } from "@/lib/profile/verified"

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
    const verifiedKindById = new Map<number, VerifiedKind>()
    for (const [id, profile] of profiles) {
      if (!profile.verified) continue
      verifiedKindById.set(id, kindFromVerified(profile.verified))
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

    // Tier + flair for the rows we're actually returning.
    //
    // Both are cached app-wide and shared with /live and the leaderboards, so
    // a warm process pays nothing per keystroke — and both fail open, because
    // a helm or a badge is never worth a 500 on the search box. Valhallan has
    // to come from ladder membership rather than a rating threshold; below it
    // the bands are fixed (see lib/tier.ts).
    const [valhallan, flairs, smurfs] = await Promise.all([
      getValhallanIds("1v1")
        .then((ids) => new Set(ids))
        .catch((err) => {
          console.error("[api/search/players] valhallan ids failed:", err)
          return new Set<number>()
        }),
      getFlairMap().catch((err) => {
        console.error("[api/search/players] flair map failed:", err)
        return new Map<number, string>()
      }),
      getSmurfIds().catch((err) => {
        console.error("[api/search/players] smurf ids failed:", err)
        return new Set<number>()
      }),
    ])

    const results = ordered.slice(0, LIMIT).map((p) => ({
      id: p.id,
      username: p.username,
      legendSlug: p.topLegendId ? slugForLegendId(p.topLegendId) : null,
      rating: p.rating,
      region: p.region,
      /**
       * Which check to draw, not whether to — the dropdown runs the same
       * `VerifiedMark` contract as every other surface. `tier` below is the
       * *ladder* tier and a different question entirely.
       */
      verifiedKind: verifiedKindById.get(p.id) ?? "none",
      /** Curated handle, when there is one — the dropdown leads with it. */
      handle: handleById.get(p.id) ?? null,
      tier: tierFromRating(p.rating, valhallan.has(p.id)),
      /**
       * The raw selection plus the facts entitlement is derived from, not a
       * resolved flair — FlairMark runs the same rule here as on the profile,
       * so the dropdown can't show a badge the profile wouldn't. Undefined for
       * the ~everyone who has neither, which keeps the payload small.
       */
      flairId: flairs.get(p.id) ?? null,
      esportsTitles: profiles.get(p.id)?.esportsTitles,
      developer: profiles.get(p.id)?.developer,
      // Omitted rather than false for everyone else — this is a handful of
      // players out of ~90k, and the payload is a keystroke's worth of JSON.
      smurf: smurfs.has(p.id) || undefined,
    }))
    return Response.json({ results }, { headers })
  } catch (err) {
    console.error("[api/search/players] failed:", err)
    return Response.json({ results: [], error: "search_failed" }, { status: 500, headers })
  }
}
