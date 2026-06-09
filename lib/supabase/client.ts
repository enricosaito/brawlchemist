"use client"

import { createBrowserClient } from "@supabase/ssr"

/**
 * Supabase browser client — used by client components that kick off auth flows
 * (e.g. the "Sign in with Discord" button calls signInWithOAuth). Shares the
 * same cookie session the server client reads.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
