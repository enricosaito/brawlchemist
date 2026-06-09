import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

/**
 * Supabase server client bound to the request's cookie jar. Used in Server
 * Components, Route Handlers and Server Actions to read the session and run
 * auth flows. Reads the project URL + publishable key (Supabase's newer
 * replacement for the anon key) from NEXT_PUBLIC_SUPABASE_* env.
 *
 * `setAll` is wrapped in try/catch: cookie writes are only allowed from Route
 * Handlers / Server Actions. When this client is used inside a Server Component
 * (read-only render), the write throws and we swallow it — middleware
 * (updateSession) is what actually refreshes the auth cookies on navigation.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component — safe to ignore (see above).
          }
        },
      },
    },
  )
}

/** True when Supabase auth env is configured. Lets callers fail open. */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}
