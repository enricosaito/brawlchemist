import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Refresh the Supabase auth session on navigation. Without this, an expired
 * access token can't be rotated from a read-only Server Component (cookie writes
 * aren't allowed there), so sessions would silently drop. Returns the response
 * carrying any refreshed auth cookies.
 *
 * No-op (and never throws) when Supabase env isn't configured, so the site keeps
 * serving anonymously.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return response

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

  try {
    // Touching the session triggers a refresh when the access token is stale.
    await supabase.auth.getClaims()
  } catch {
    // Fail open — return whatever response we have.
  }
  return res
}
