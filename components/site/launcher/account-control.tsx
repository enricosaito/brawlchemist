"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, UserRound } from "lucide-react"
import { signOutAction } from "@/app/auth/actions"
import type { SessionUser } from "@/lib/auth/session"

/**
 * Account control for the launcher rail/drawer. Signed-out: a "Sign in" link
 * carrying the current path as `next` so auth returns the user where they were.
 * Signed-in: avatar + name (links to the user's own profile, or /account until
 * they've claimed one) with a sign-out button (server action).
 */
export function AccountControl({
  user,
  claimedId,
}: {
  user: SessionUser | null
  claimedId: number | null
}) {
  const pathname = usePathname() ?? "/"

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-card/30 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-md transition-colors hover:border-pink/50 hover:bg-card/55 hover:text-foreground"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-muted/40">
          <UserRound className="size-4" />
        </span>
        Sign in
      </Link>
    )
  }

  const label = user.name ?? user.email ?? "Account"
  const profileHref = claimedId != null ? `/player/${claimedId}` : "/account"

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/30 px-3 py-2.5 backdrop-blur-md">
      <Link
        href={profileHref}
        className="group flex min-w-0 flex-1 items-center gap-3"
        title={claimedId != null ? "Your profile" : "Your account"}
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
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground group-hover:text-copper">
          {label}
        </span>
      </Link>
      <form action={signOutAction}>
        <input type="hidden" name="next" value={pathname} />
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  )
}
