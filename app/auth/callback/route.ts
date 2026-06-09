import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ensureAppUser } from "@/lib/auth/users"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * OAuth / magic-link callback. Both the Discord flow and the email magic link
 * land here with a `?code=` (PKCE). We exchange it for a session (which sets the
 * auth cookies on the response), provision the app_users row, then redirect to
 * `next` (defaults to home). On error, bounce to /login with a flag.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const user = data.user
  if (user) await ensureAppUser(user.id, user.email ?? null)

  // Honor the forwarded host behind Vercel's proxy so we don't redirect to the
  // internal origin in production.
  const forwardedHost = req.headers.get("x-forwarded-host")
  const isLocal = process.env.NODE_ENV === "development"
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`
  return NextResponse.redirect(`${base}${next}`)
}
