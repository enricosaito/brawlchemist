import "server-only"

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
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

/**
 * Latest official Brawlhalla patch notes, newest first. Returns null only when
 * the CMS posts call is unreachable (vs. an empty list); a failed media lookup
 * just yields cards without banners.
 */
export async function getPatchNotes(opts?: {
  limit?: number
}): Promise<PatchNote[] | null> {
  const limit = opts?.limit ?? 24

  const postsUrl = new URL(POSTS_URL)
  postsUrl.searchParams.set("categories", String(PATCH_NOTES_CATEGORY))
  postsUrl.searchParams.set("per_page", String(limit))
  postsUrl.searchParams.set(
    "_fields",
    "id,date_gmt,link,title,excerpt,featured_media",
  )

  let posts: WpPost[]
  try {
    const res = await fetch(postsUrl.toString(), { next: { revalidate: REVALIDATE } })
    if (!res.ok) return null
    posts = (await res.json()) as WpPost[]
  } catch {
    return null
  }
  if (!Array.isArray(posts)) return null

  // Batch the featured images in one call; best-effort (no banners on failure).
  const mediaIds = [...new Set(posts.map((p) => p.featured_media).filter(Boolean))]
  const mediaById = new Map<number, WpMedia>()
  if (mediaIds.length > 0) {
    const mediaUrl = new URL(MEDIA_URL)
    mediaUrl.searchParams.set("include", mediaIds.join(","))
    mediaUrl.searchParams.set("per_page", String(mediaIds.length))
    mediaUrl.searchParams.set("_fields", "id,source_url,media_details")
    try {
      const res = await fetch(mediaUrl.toString(), {
        next: { revalidate: REVALIDATE },
      })
      if (res.ok) {
        const media = (await res.json()) as WpMedia[]
        if (Array.isArray(media)) {
          for (const m of media) mediaById.set(m.id, m)
        }
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
}
