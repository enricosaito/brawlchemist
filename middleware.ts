import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

/**
 * Edge enforcement of the crawl policy declared in app/robots.ts plus Supabase
 * auth-session refresh. robots.txt is advisory; this middleware returns a hard
 * 403 for AI training crawlers and aggressive SEO scrapers, so /ranked never
 * fires from one of their profile link follows. For everyone else it rotates a
 * stale auth cookie so sessions survive across navigations.
 *
 * Keep `BLOCKED_BOTS` in sync with `BLOCKED_USER_AGENTS` in app/robots.ts.
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

export async function middleware(req: NextRequest) {
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
  return updateSession(req, NextResponse.next({ request: req }))
}

export const config = {
  // Apply to user-facing pages. Skip api routes, the admin tree, _next assets,
  // and well-known static files (robots.txt, favicon.ico, sitemap.xml, etc.).
  matcher: [
    "/((?!api|_next|admin|monitoring|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
}
