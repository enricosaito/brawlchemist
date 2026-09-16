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
 * It also gates the signed-in-only routes, and that gate has to live here
 * rather than in the pages. A page's `redirect()` only becomes a real 307 while
 * the response has not started; a route with a `loading.tsx` streams its shell
 * first, so the redirect degrades to a client-side navigation and the route
 * answers 200 with a shell to anything that doesn't run JavaScript. /favorites
 * has a loading.tsx and /account does not, which is the entire reason one of
 * them redirected and the other didn't.
 *
 * Here the decision is made before a byte is rendered, so every gated route
 * answers the same way regardless of what boundaries it has. The in-page checks
 * stay as defence in depth — they cost nothing and they are what protects a
 * route someone forgets to list below.
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

/**
 * Routes that mean nothing signed out. Prefixes, so nested routes are covered.
 *
 * /admin is deliberately absent: it needs a *role*, which needs a database read
 * that has no business in middleware, and `requireAdmin` already fails closed
 * and redirects. It is also excluded from the matcher below.
 */
const SIGNED_IN_ONLY = ["/account", "/claim", "/favorites"]

function isProtected(pathname: string): boolean {
  return SIGNED_IN_ONLY.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

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
  const { response, signedIn } = await updateSession(
    req,
    NextResponse.next({ request: req }),
  )

  const { pathname, search } = req.nextUrl
  if (!signedIn && isProtected(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    // Carry the query string too, so ?id=… on /claim survives the round trip.
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    const redirected = NextResponse.redirect(url)
    // Carry over whatever the refresh set — usually the *clearing* of a stale
    // auth cookie, which is exactly the thing you don't want to drop on the
    // response that sends someone to sign in again.
    for (const cookie of response.cookies.getAll()) {
      redirected.cookies.set(cookie)
    }
    return redirected
  }

  return response
}

export const config = {
  // Apply to user-facing pages. Skip api routes, the admin tree, _next assets,
  // and well-known static files (robots.txt, favicon.ico, sitemap.xml, etc.).
  matcher: [
    "/((?!api|_next|admin|monitoring|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
}
