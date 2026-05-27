import { searchPlayerSuggestions } from "@/lib/sync/players"
import { getOverridesMap } from "@/lib/sync/player-overrides"
import { slugForLegendId } from "@/lib/legends-roster"

// Always dynamic — this reads the query string and the live DB.
export const dynamic = "force-dynamic"

/**
 * Typeahead username search. Backed entirely by our local `players` table
 * (the Brawlhalla API has no name-search endpoint), so this never adds load
 * to the upstream API. Capped + min-length guarded for the live dropdown.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  const headers = { "Cache-Control": "no-store" }

  if (q.length < 2) return Response.json({ results: [] }, { headers })

  try {
    const [rows, overrides] = await Promise.all([
      searchPlayerSuggestions(q, 8),
      getOverridesMap(),
    ])
    const results = rows.map((p) => ({
      id: p.id,
      username: p.username,
      legendSlug: p.topLegendId ? slugForLegendId(p.topLegendId) : null,
      rating: p.rating,
      region: p.region,
      pro: !!overrides.get(p.id)?.verified,
    }))
    return Response.json({ results }, { headers })
  } catch (err) {
    console.error("[api/search/players] failed:", err)
    return Response.json({ results: [], error: "search_failed" }, { status: 500, headers })
  }
}
