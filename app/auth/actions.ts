"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Reconstruct the request origin (works in dev and behind Vercel's proxy). */
async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3137"
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/**
 * Start the Discord OAuth flow. signInWithOAuth (server-side, @supabase/ssr)
 * stashes the PKCE verifier in a cookie and returns the provider URL we redirect
 * the browser to; Discord sends the user back to /auth/callback.
 */
export async function signInWithDiscordAction(formData: FormData) {
  const next = (formData.get("next") as string) || "/"
  const origin = await requestOrigin()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error || !data.url) redirect("/login?error=discord")
  redirect(data.url)
}

/** Send a one-time magic link to the given email. */
export async function sendMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim()
  const next = (formData.get("next") as string) || "/"
  if (!email) redirect("/login?error=email")
  const origin = await requestOrigin()
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error) redirect("/login?error=email")
  redirect("/login?sent=1")
}

/** Sign out and return to the previous area (home by default). */
export async function signOutAction(formData: FormData) {
  const next = (formData.get("next") as string) || "/"
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect(next)
}
