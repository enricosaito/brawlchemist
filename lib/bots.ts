/**
 * Crawler detection.
 *
 * Two different policies key off this file, and they are NOT the same list:
 *
 *   - `BLOCKED_BOTS` in middleware.ts — AI trainers and bulk SEO scrapers that
 *     get a hard 403. They contribute nothing and cost everything.
 *   - `isCrawler()` here — legitimate search/social crawlers we *want* indexing
 *     the site, but which must never trigger a live Brawlhalla API fetch.
 *
 * The second policy exists because of what the traffic actually looks like. A
 * sample of profile views showed 53% coming from crawlers, and almost all of
 * them resolved as "synced" rather than "cached" — i.e. each one missed the
 * 15-minute freshness window, spent one of the 180/15min API calls, and wrote
 * the result back. Bingbot alone was 42% of profile views, walking ~90k player
 * pages. Real visitors were left hitting the 429 fallback.
 *
 * So crawlers get a full, indexable page built from whatever `ranked_json` we
 * already hold, at any age. They keep every bit of their SEO value and stop
 * competing with humans for the API budget.
 */

/**
 * Matched case-insensitively against the User-Agent. Substrings, because every
 * one of these ships a long UA string with the token embedded.
 */
const CRAWLER_TOKENS = [
  // Search engines
  "googlebot",
  "bingbot",
  "slurp", // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "petalbot", // Huawei/Petal Search
  "sogou",
  "exabot",
  "applebot",
  "seznambot",
  "naver",
  // Link unfurlers — one-shot fetches, same reasoning applies
  "facebookexternalhit",
  "twitterbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "linkedinbot",
  "embedly",
  "redditbot",
  // Uptime / preview services
  "pingdom",
  "uptimerobot",
  "lighthouse",
  "headlesschrome",
]

/**
 * True when the User-Agent belongs to a crawler that should be served from our
 * own cache only. Anything unrecognised is treated as a human — false
 * positives here would silently serve stale data to real visitors, which is a
 * worse failure than an occasional bot getting a fresh fetch.
 *
 * The trailing generic check catches the long tail of self-identifying bots
 * ("…bot/1.0", "…crawler", "…spider"); those are exactly the clients that
 * should not be spending API budget either.
 */
export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  if (CRAWLER_TOKENS.some((t) => ua.includes(t))) return true
  return (
    ua.includes("bot/") ||
    ua.includes("bot;") ||
    ua.endsWith("bot") ||
    ua.includes("crawler") ||
    ua.includes("spider")
  )
}
