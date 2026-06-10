"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BadgeCheck, LogOut, Star, UserRound } from "lucide-react"
import { signOutAction } from "@/app/auth/actions"
import type { SessionUser } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

/** The Brawlhalla identity linked to the account, if claimed. */
export interface ClaimedProfile {
  id: number
  /** Pro handle when verified, otherwise the in-game username. */
  name: string | null
  isPro: boolean
}

// Shared glass + hover/active treatment, echoing the nav buttons (same font,
// hover, and selected effects) at the account control's own smaller size.
const NAV_LOOK =
  "group flex items-center gap-3 rounded-2xl border border-white/10 bg-card/30 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground"

/**
 * Account control for the launcher rail/drawer. Signed-out: a "Sign in" link
 * carrying the current path as `next`. Signed-in: avatar + the user's claimed
 * Brawlhalla identity (pro handle / username, falling back to the Discord name
 * until a profile is linked), linking to their own profile, plus a sign-out
 * button. Styled to share the nav buttons' font, hover, and selected effects.
 */
export function AccountControl({
  user,
  claimed,
}: {
  user: SessionUser | null
  claimed: ClaimedProfile | null
}) {
  const pathname = usePathname() ?? "/"

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        data-active={pathname.startsWith("/login")}
        className={NAV_LOOK}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-muted/40">
          <UserRound className="size-4" />
        </span>
        Sign in
      </Link>
    )
  }

  // Prefer the claimed Brawlhalla identity; fall back to the Discord display
  // name (or email) until a profile is linked.
  const label = claimed?.name ?? user.name ?? user.email ?? "Account"
  const profileHref = claimed ? `/player/${claimed.id}` : "/account"
  const active = claimed
    ? pathname.startsWith(`/player/${claimed.id}`) ||
      pathname.startsWith("/account")
    : pathname.startsWith("/account")

  return (
    <div className="flex items-stretch gap-2">
      <Link
        href={profileHref}
        data-active={active}
        title={claimed ? "Your profile" : "Your account"}
        className={cn(NAV_LOOK, "min-w-0 flex-1")}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Discord CDN host, no optimizer needed
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pink/20 text-sm font-semibold text-foreground">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate normal-case">{label}</span>
        {claimed?.isPro && <BadgeCheck className="size-4 shrink-0 text-mystic" />}
      </Link>
      <Link
        href="/favorites"
        data-active={pathname.startsWith("/favorites")}
        aria-label="Favorites"
        title="Favorites"
        className="flex w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground data-[active=true]:border-pink/60 data-[active=true]:bg-gradient-to-r data-[active=true]:from-pink/25 data-[active=true]:to-pink/10 data-[active=true]:text-foreground"
      >
        <Star className="size-4" />
      </Link>
      <form action={signOutAction} className="flex">
        <input type="hidden" name="next" value={pathname} />
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-card/30 text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  )
}
