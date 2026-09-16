import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Refresh the Supabase auth session on navigation. Without this, an expired
 * access token can't be rotated from a read-only Server Component (cookie writes
 * aren't allowed there), so sessions would silently drop. Returns the response
 * carrying any refreshed auth cookies, plus whether the request is signed in.
 *
 * `signedIn` is free: the refresh already has to read the claims, and it used
 * to throw the answer away. Handing it back is what lets the middleware gate
 * signed-in-only routes before a byte is rendered.
 *
 * No-op (and never throws) when Supabase env isn't configured, so the site keeps
 * serving anonymously — which also means every gated route sends you to /login,
 * the same answer the pages themselves give.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ response: NextResponse; signedIn: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { response, signedIn: false }

  let res = response
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        res = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options)
        }
      },
    },
  })

  let signedIn = false
  try {
    // Touching the session triggers a refresh when the access token is stale.
    const { data, error } = await supabase.auth.getClaims()
    signedIn = !error && !!data?.claims?.sub
  } catch {
    // Fail open — return whatever response we have. Closed for the gate,
    // though: an unreadable session is not a signed-in one, and the worst
    // outcome is a sign-in page for someone who was already signed in.
  }
  return { response: res, signedIn }
}
