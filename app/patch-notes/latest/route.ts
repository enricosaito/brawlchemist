import { redirect } from "next/navigation"
import { getPatchNotes } from "@/lib/brawlhalla-news"

/**
 * Bounce to the newest official patch note.
 *
 * Exists so the homepage hero can link straight to the article without paying
 * for it. The hero renders outside the page's Suspense boundaries on purpose —
 * the launcher shell paints on the first frame while the data cards stream in —
 * so resolving the article URL there would put a CMS round trip in front of the
 * most important paint on the site, to fill in an href almost nobody clicks.
 *
 * Resolving on click instead costs nothing up front, and the destination is
 * always the current patch rather than whatever was true at build time.
 *
 * Falls back to the index when the CMS is unreachable: a reader who wanted the
 * patch notes lands on the patch notes, one click from the same article.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  // getPatchNotes caches its CMS fetch for an hour, so the common case is a
  // cache hit and this is a redirect with no upstream call behind it.
  const notes = await getPatchNotes({ limit: 1 })
  redirect(notes?.[0]?.url ?? "/patch-notes")
}
