import {
  skinLegends,
  skinsForLegend,
  skinIconUrl,
  skinArtUrl,
} from "@/lib/skins"

/**
 * One legend's skins, for the favorite-skin picker.
 *
 * A route rather than props so the ~50KB catalogue never reaches the client
 * bundle: the picker asks for the legend it is showing and gets a dozen rows.
 * The data is a static file, so this touches neither the database nor the
 * Brawlhalla API — it is a lookup that happens to live behind a URL.
 */
// Dynamic because the answer depends on ?legend=. The data behind it is a
// static file, so the cost is a map lookup; the cache header is what keeps it
// from being recomputed per keystroke.
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  const legend = new URL(req.url).searchParams.get("legend")?.trim() ?? ""
  // No legend named: the picker is asking which legends it can offer.
  if (!legend) {
    return Response.json(
      { legends: skinLegends() },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    )
  }
  const skins = skinsForLegend(legend)
  return Response.json(
    {
      skins: skins.map((s) => ({
        name: s.name,
        icon: skinIconUrl(s, 96),
        art: skinArtUrl(s, 400),
      })),
    },
    // Immutable for the request's life but cheap to refresh: the catalogue only
    // changes when someone reruns the sync script and redeploys.
    { headers: { "Cache-Control": "public, max-age=3600" } }
  )
}
