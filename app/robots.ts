import type { MetadataRoute } from "next"

/**
 * User-agent substrings of AI training crawlers and aggressive SEO bots we
 * don't want walking the site. They follow profile links from leaderboard
 * pagination and saturate the Brawlhalla 180/15min rate limit — robots.txt
 * disallows them (advisory) and middleware.ts enforces a 403 at the edge.
 *
 * Kept in sync with the BLOCKED_BOTS list in middleware.ts.
 */
export const BLOCKED_USER_AGENTS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  // Other AI / training
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
  "Cohere-AI",
  // Aggressive SEO scrapers — high volume, no value to us
  "DataForSeoBot",
  "MJ12bot",
  "AhrefsBot",
  "SemrushBot",
  // Misc
  "Diffbot",
  "DuckAssistBot",
  "ImagesiftBot",
  "Omgilibot",
  "FriendlyCrawler",
  "YouBot",
]

/**
 * Crawl policy.
 *
 * - Player profiles stay crawlable by *search* bots (Googlebot, Bingbot) — they
 *   are the most SEO-valuable content.
 * - /api endpoints and the per-player opengraph-image route are blocked for
 *   everyone — they burn the Brawlhalla rate limit for zero indexing value.
 * - AI training crawlers and aggressive SEO scrapers are disallowed entirely.
 *   They were following leaderboard pagination 140+ pages deep, firing
 *   /ranked for every linked profile.
 *
 * robots.txt is advisory; middleware.ts enforces a 403 at the edge.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/player/*/opengraph-image"],
      },
      {
        userAgent: BLOCKED_USER_AGENTS,
        disallow: "/",
      },
    ],
  }
}
