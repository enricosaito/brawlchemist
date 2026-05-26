import type { MetadataRoute } from "next"

/**
 * Crawl policy.
 *
 * Player profiles stay crawlable — they're our most SEO-valuable content. But
 * two route families burn the Brawlhalla API rate limit for zero indexing value
 * and are blocked here:
 *   - the /api endpoints, which are internal and never content
 *   - the per-player opengraph-image route, a social-embed image. Scrapers
 *     (Discord, X, Slack) fetch the referenced og:image directly and ignore
 *     robots, so blocking it only stops wasteful search-bot crawls.
 *
 * NOTE: robots.txt is advisory — only well-behaved crawlers honor it. Abusive
 * bots walking thousands of distinct profiles need hard rate-limiting (Vercel
 * BotID / WAF) on /player/*, which is configured outside the codebase.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/player/*/opengraph-image"],
      },
    ],
  }
}
