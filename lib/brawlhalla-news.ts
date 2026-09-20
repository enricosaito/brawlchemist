import "server-only"

import { unstable_cache } from "next/cache"
import { failOpen } from "@/lib/sync/fail-open"

/**
 * Official Brawlhalla news — the headless WordPress that powers
 * brawlhalla.com/news, at cms.brawlhalla.com/wp-json/wp/v2. It's a public,
 * keyless WP REST API (the same one the site's own frontend calls), so this is
 * a structured data source, NOT web scraping.
 *
 * Patch notes have their own category (id 15), so we filter by category rather
 * than guessing from titles — and the links point at the official
 * brawlhalla.com article, not a third party.
 *
 * Two calls keep the payload small: a slim posts list (no `content` body) plus
 * one batched `/media` lookup for the featured images. Embedding the media
 * inline (`_embed`) would balloon the response ~20x.
 */

const POSTS_URL = "https://cms.brawlhalla.com/wp-json/wp/v2/posts"
const MEDIA_URL = "https://cms.brawlhalla.com/wp-json/wp/v2/media"
const PATCH_NOTES_CATEGORY = 15
const REVALIDATE = 3600 // 1h — fresh on patch day without hammering the CMS.

// WP renders titles/excerpts with HTML entities (&#038;, &#8211;, &#8217;…).
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
}
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(
      /&([a-z]+);/gi,
      (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m
    )
}

// Strip the excerpt's HTML, decode entities, drop WP's trailing "[…]" teaser.
function toExcerpt(html: string, max = 220): string {
  let text = decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\[(?:…|\.\.\.)\]\s*$/, "")
  if (text.length > max) {
    text = text.slice(0, max).replace(/\s+\S*$/, "") + "…"
  }
  return text
}

interface WpMediaSize {
  source_url: string
}
interface WpMedia {
  id: number
  source_url?: string
  media_details?: { sizes?: Record<string, WpMediaSize> }
}
interface WpPost {
  id: number
  date_gmt: string
  link: string
  title: { rendered: string }
  excerpt: { rendered: string }
  featured_media: number
}

// Prefer the 1024-wide "large" render; fall back through the other sizes.
function pickImage(m: WpMedia | undefined): string | null {
  if (!m) return null
  const sizes = m.media_details?.sizes
  return (
    sizes?.large?.source_url ??
    sizes?.medium_large?.source_url ??
    sizes?.full?.source_url ??
    m.source_url ??
    null
  )
}

/** A Brawlhalla patch note, from the official CMS. */
export interface PatchNote {
  id: number
  title: string
  /** Dotted version pulled from the title, e.g. "10.07" (null if absent). */
  version: string | null
  /** Link to the official article on brawlhalla.com. */
  url: string
  /** UNIX seconds (from the post's GMT timestamp). */
  date: number
  /** Featured banner image URL, or null when the post had none. */
  image: string | null
  excerpt: string
}

/** Upper bound on any one CMS call. See cmsJson. */
const NEWS_TIMEOUT_MS = 15_000

/**
 * One CMS call with a deadline that actually holds.
 *
 * These used to be `fetch(url, { next: { revalidate } })`, and that is the one
 * shape whose timeout Next will not honour. When the fetch cache holds a stale
 * entry, Next's patched fetch revalidates it in the foreground and **strips the
 * abort signal on purpose** (patch-fetch: "don't pass through signal when
 * revalidating"), then registers the fetch in `pendingRevalidates`, which
 * static generation awaits before it will finish the page. So a CMS that
 * accepted the connection and went silent — measured: connects in 0.14s, never
 * answers — held `/patch-notes` for the full 60s budget three times over and
 * failed the deploy, with a 15s signal attached the whole time. Racing the
 * promise against a timer did not help either: the page's own promise resolved
 * and the build still waited on the one it could not see.
 *
 * `cache: "no-store"` takes the call out of that layer entirely, so the signal
 * reaches undici and aborts at the deadline (measured: 5001ms for a 5s
 * signal). The hour of caching then belongs to `unstable_cache` below, where a
 * thrown error is not stored.
 */
async function cmsJson<T>(url: URL): Promise<T> {
  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(NEWS_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`CMS ${res.status} for ${url.pathname}`)
  return (await res.json()) as T
}

const readPatchNotes = unstable_cache(
  async (limit: number): Promise<PatchNote[]> => {
    const postsUrl = new URL(POSTS_URL)
    postsUrl.searchParams.set("categories", String(PATCH_NOTES_CATEGORY))
    postsUrl.searchParams.set("per_page", String(limit))
    postsUrl.searchParams.set(
      "_fields",
      "id,date_gmt,link,title,excerpt,featured_media"
    )
    // Throws on failure, deliberately: a null stored here would be served as
    // "no patch notes" for an hour (cardinal constraint #5). The fallback lives
    // in getPatchNotes, outside the cache.
    const posts = await cmsJson<WpPost[]>(postsUrl)
    if (!Array.isArray(posts)) throw new Error("CMS posts: not an array")

    // Batch the featured images in one call; best-effort (no banners on
    // failure). Cards without banners for an hour is a lesser harm than no
    // cards, so this is the one failure that is allowed to be cached.
    const mediaIds = [
      ...new Set(posts.map((p) => p.featured_media).filter(Boolean)),
    ]
    const mediaById = new Map<number, WpMedia>()
    if (mediaIds.length > 0) {
      const mediaUrl = new URL(MEDIA_URL)
      mediaUrl.searchParams.set("include", mediaIds.join(","))
      mediaUrl.searchParams.set("per_page", String(mediaIds.length))
      mediaUrl.searchParams.set("_fields", "id,source_url,media_details")
      try {
        const media = await cmsJson<WpMedia[]>(mediaUrl)
        if (Array.isArray(media)) {
          for (const m of media) mediaById.set(m.id, m)
        }
      } catch {
        // leave banners empty
      }
    }

    return posts.map((p) => {
      const title = decodeEntities(p.title.rendered)
      // date_gmt has no zone suffix; it's UTC, so append Z before parsing.
      const date = Math.floor(new Date(`${p.date_gmt}Z`).getTime() / 1000)
      return {
        id: p.id,
        title,
        version: title.match(/\b(\d+\.\d+)\b/)?.[1] ?? null,
        url: p.link,
        date,
        image: pickImage(mediaById.get(p.featured_media)),
        excerpt: toExcerpt(p.excerpt.rendered),
      }
    })
  },
  ["patch-notes"],
  { revalidate: REVALIDATE }
)

/**
 * Latest official Brawlhalla patch notes, newest first. Returns null only when
 * the CMS posts call is unreachable (vs. an empty list); a failed media lookup
 * just yields cards without banners.
 *
 * Cached for an hour, and the failure is handled out here so it is never what
 * gets cached; `failOpen` also keeps a dead CMS from costing every render its
 * 15s deadline.
 */
export async function getPatchNotes(opts?: {
  limit?: number
}): Promise<PatchNote[] | null> {
  const limit = opts?.limit ?? 24
  return failOpen<PatchNote[] | null>(
    `[patch-notes ${limit}]`,
    () => readPatchNotes(limit),
    null
  )
}
