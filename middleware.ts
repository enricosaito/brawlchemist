import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Edge enforcement of the crawl policy declared in app/robots.ts. robots.txt
 * is advisory; this middleware returns a hard 403 for AI training crawlers and
 * aggressive SEO scrapers, so /ranked never fires from one of their profile
 * link follows.
 *
 * Keep in sync with `BLOCKED_USER_AGENTS` in app/robots.ts.
 */
const BLOCKED_BOTS = [
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
  // Aggressive SEO scrapers
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

export function middleware(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? ""
  if (BLOCKED_BOTS.some((name) => ua.includes(name))) {
    return new NextResponse(
      "AI crawlers and bulk scrapers are not permitted on Brawlchemist.",
      {
        status: 403,
        headers: { "X-Robots-Tag": "noindex, nofollow" },
      },
    )
  }
  return NextResponse.next()
}

export const config = {
  // Apply to user-facing pages. Skip api routes, the admin tree, _next assets,
  // and well-known static files (robots.txt, favicon.ico, sitemap.xml, etc.).
  matcher: [
    "/((?!api|_next|admin|monitoring|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
}
