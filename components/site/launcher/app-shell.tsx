"use client"

import { usePathname } from "next/navigation"
import type { SessionUser } from "@/lib/auth/session"
import { FavoritesProvider } from "../favorites-provider"
import type { ClaimedProfile } from "./account-control"
import { BackgroundMusic } from "./background-music"
import { SidebarNav } from "./sidebar-nav"
import { VideoBackground } from "./video-background"

/**
 * AppShell — the persistent launcher chrome. Living in the root layout, it
 * stays mounted across client navigations, so the starfield video and the
 * background music play continuously and the nav rail never reloads — every
 * route just swaps the content in the right two-thirds (SPA feel on Next).
 *
 * Admin is a separate area: no game rail, no music, no video — it renders
 * full-bleed. Switching in/out of /admin is the only time the shell mounts or
 * unmounts.
 */
export function AppShell({
  children,
  user,
  claimed,
  favoriteIds,
}: {
  children: React.ReactNode
  user: SessionUser | null
  claimed: ClaimedProfile | null
  favoriteIds: number[]
}) {
  const pathname = usePathname()
  const loggedIn = !!user

  if (pathname?.startsWith("/admin")) {
    return (
      <FavoritesProvider
      initialIds={favoriteIds}
      loggedIn={loggedIn}
      selfId={claimed?.id ?? null}
    >
        {children}
      </FavoritesProvider>
    )
  }

  return (
    <FavoritesProvider
      initialIds={favoriteIds}
      loggedIn={loggedIn}
      selfId={claimed?.id ?? null}
    >
      <VideoBackground />
      <BackgroundMusic />
      <div className="relative min-h-svh md:grid md:grid-cols-[clamp(280px,30%,420px)_minmax(0,1fr)]">
        <SidebarNav user={user} claimed={claimed} />
        <div className="min-w-0">{children}</div>
      </div>
    </FavoritesProvider>
  )
}
